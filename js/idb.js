// IndexedDB helper para persistencia local incremental (FP - didáctico)
// DB: fp_robotik_db (v1)
// Stores: program_snapshots, runs, results

// IDB initialization starting

const IDB_DB_NAME = 'fp_robotik_db';
const IDB_DB_VERSION = 3;

let idbDbPromise = null;

function computeSnapshotShortIdPure(text) {
    let hash = 0;
    const str = String(text || '');
    for (let i = 0; i < str.length; i++) {
        hash = ((hash * 31) + str.charCodeAt(i)) & 0xFFFF;
    }
    return hash;
}

function idbComputeSnapshotShortId(text) {
    if (typeof window !== 'undefined' && typeof window.computeSnapshotShortId === 'function') {
        return window.computeSnapshotShortId(text);
    }
    return computeSnapshotShortIdPure(text);
}

function isFpDebugEnabled() {
    try {
        if (typeof window !== 'undefined' && window.fp_debug === true) return true;
        return String(localStorage.getItem('fp_debug') || '').trim().toLowerCase() === 'true';
    } catch (error) {
        return false;
    }
}

if (isFpDebugEnabled()) {
    try {
        const idbSources = [...document.scripts]
            .map(script => script?.src || '')
            .filter(src => src.includes('idb'));
        console.debug('[IDB SOURCE]', idbSources);
    } catch (error) {
        console.debug('[IDB SOURCE] unavailable');
    }
}

function normalizeSnapshotShort(snapshotId, snapshotShort) {
    const n = Number(snapshotShort);
    if (Number.isFinite(n) && n > 0 && n <= 65535) return n;

    const normalizedId = String(snapshotId || '').trim();
    if (normalizedId) {
        const fn = (typeof window !== 'undefined')
            ? (window.computeSnapshotShortId || window.computeSnapshotShortIdPure || computeSnapshotShortIdPure)
            : computeSnapshotShortIdPure;
        if (typeof fn === 'function') {
            const computed = Number(fn(normalizedId));
            if (Number.isFinite(computed) && computed > 0 && computed <= 65535) {
                return computed;
            }
        }
    }

    return null;
}

if (typeof window !== 'undefined') {
    if (!window.computeSnapshotShortIdPure) {
        window.computeSnapshotShortIdPure = computeSnapshotShortIdPure;
    }
    if (!window.computeSnapshotShortId) {
        window.computeSnapshotShortId = computeSnapshotShortIdPure;
    }
}

function normalizeSnapshotWithShort(snapshot, idKey) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const snapshotProgramName = String(
        snapshot.program_name
        || snapshot.programName
        || snapshot.meta?.program_name
        || ''
    ).trim();

    const withProgramName = {
        ...snapshot,
        ...(snapshotProgramName ? { program_name: snapshotProgramName } : {})
    };

    const snapshotId = String(
        snapshot[idKey]
        || withProgramName.snapshot_id
        || withProgramName.program_snapshot_id
        || ''
    ).trim();

    const oldShortRaw = withProgramName.snapshot_short;
    const oldShortNum = Number(oldShortRaw);
    const oldShortValid = Number.isFinite(oldShortNum) && oldShortNum > 0 && oldShortNum <= 65535;
    const normalizedShort = normalizeSnapshotShort(snapshotId, oldShortRaw);

    if (!oldShortValid && Number.isFinite(normalizedShort)) {
        if (isFpDebugEnabled()) {
            console.debug(`[SNAPSHOT SHORT] id=${snapshotId || '-'} old=${String(oldShortRaw)} new=${normalizedShort}`);
        }
    }

    const normalizedIdentity = snapshotId
        ? {
            [idKey]: snapshotId,
            ...(withProgramName.snapshot_id
                ? { snapshot_id: withProgramName.snapshot_id }
                : (idKey === 'snapshot_id' ? { snapshot_id: snapshotId } : {})),
            ...(withProgramName.program_snapshot_id
                ? { program_snapshot_id: withProgramName.program_snapshot_id }
                : (idKey === 'program_snapshot_id' ? { program_snapshot_id: snapshotId } : {}))
        }
        : {};

    return {
        ...withProgramName,
        ...normalizedIdentity,
        snapshot_short: Number.isFinite(normalizedShort) ? normalizedShort : null
    };
}

function snapshotRecencyValue(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    const candidates = [
        snapshot.updated_at,
        snapshot.updatedAt,
        snapshot.created_at,
        snapshot.createdAt,
        snapshot.startedAt,
        snapshot.timestamp
    ];
    for (const candidate of candidates) {
        const num = Number(candidate);
        if (Number.isFinite(num)) return num;
    }
    return 0;
}

if (localStorage.getItem('fp_debug') === 'true') console.log('[IDB LOAD] middle');

/**
 * Inicializa y devuelve la instancia de IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function idbInit() {
    if (idbDbPromise) return idbDbPromise;

    idbDbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
            reject(new Error('IndexedDB no está disponible en este navegador.'));
            return;
        }

        const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Store: program_snapshots
            if (!db.objectStoreNames.contains('program_snapshots')) {
                db.createObjectStore('program_snapshots', { keyPath: 'program_snapshot_id' });
            }

            // Store: runs
            if (!db.objectStoreNames.contains('runs')) {
                db.createObjectStore('runs', { keyPath: 'run_id' });
            }

            // Store: snapshots
            if (!db.objectStoreNames.contains('snapshots')) {
                db.createObjectStore('snapshots', { keyPath: 'snapshot_id' });
            }

            // Store: results (autoIncrement)
            if (!db.objectStoreNames.contains('results')) {
                const resultsStore = db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
                resultsStore.createIndex('by_run', 'run_id', { unique: false });
                resultsStore.createIndex('by_run_step', ['run_id', 'step_id'], { unique: false });
                resultsStore.createIndex('by_snapshot', 'program_snapshot_id', { unique: false });
                resultsStore.createIndex('by_run_type', ['run_id', 'step_type'], { unique: false });
            } else {
                const resultsStore = request.transaction.objectStore('results');
                if (!resultsStore.indexNames.contains('by_run_type')) {
                    resultsStore.createIndex('by_run_type', ['run_id', 'step_type'], { unique: false });
                }
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Error abriendo IndexedDB.'));
    });

    return idbDbPromise;
}

/**
 * Guarda un snapshot del programa compilado.
 * @param {Object} snapshotObj
 */
async function idbSaveSnapshot(snapshotObj) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('program_snapshots', 'readwrite');
            const store = tx.objectStore('program_snapshots');
            const snapshotId = String(snapshotObj?.program_snapshot_id || snapshotObj?.snapshot_id || '').trim();
            const normalizedSnapshotShort = normalizeSnapshotShort(snapshotId, snapshotObj?.snapshot_short);
            const oldShortRaw = snapshotObj?.snapshot_short;
            const oldShortNum = Number(oldShortRaw);
            const oldShortValid = Number.isFinite(oldShortNum) && oldShortNum > 0 && oldShortNum <= 65535;
            if (!oldShortValid && Number.isFinite(normalizedSnapshotShort)) {
                if (isFpDebugEnabled()) {
                    console.debug(`[SNAPSHOT SHORT] id=${snapshotId || '-'} old=${String(oldShortRaw)} new=${normalizedSnapshotShort}`);
                }
            }

            const normalized = normalizeSnapshotWithShort({
                ...snapshotObj,
                source: snapshotObj.source || 'sim',
                ...(snapshotId ? { program_snapshot_id: snapshotId } : {}),
                snapshot_short: Number.isFinite(normalizedSnapshotShort) ? normalizedSnapshotShort : null
            }, 'program_snapshot_id');
            store.put(normalized);
            console.log(`[SNAPSHOT SAVE] id=${normalized?.program_snapshot_id || '-'} short=${normalized?.snapshot_short ?? '-'} program_name=${normalized?.program_name || 'Sin nombre'}`);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error guardando snapshot.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Guarda un snapshot compilado en store dedicado.
 * @param {Object} snapshot
 * @returns {Promise<boolean>}
 */
async function saveSnapshot(snapshot) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('snapshots', 'readwrite');
            const store = tx.objectStore('snapshots');
            const snapshotId = String(snapshot?.snapshot_id || snapshot?.program_snapshot_id || '').trim();
            const normalizedSnapshotShort = normalizeSnapshotShort(snapshotId, snapshot?.snapshot_short);
            const oldShortRaw = snapshot?.snapshot_short;
            const oldShortNum = Number(oldShortRaw);
            const oldShortValid = Number.isFinite(oldShortNum) && oldShortNum > 0 && oldShortNum <= 65535;
            if (!oldShortValid && Number.isFinite(normalizedSnapshotShort)) {
                if (isFpDebugEnabled()) {
                    console.debug(`[SNAPSHOT SHORT] id=${snapshotId || '-'} old=${String(oldShortRaw)} new=${normalizedSnapshotShort}`);
                }
            }

            const normalized = normalizeSnapshotWithShort({
                ...snapshot,
                ...(snapshotId ? { snapshot_id: snapshotId } : {}),
                snapshot_short: Number.isFinite(normalizedSnapshotShort) ? normalizedSnapshotShort : null
            }, 'snapshot_id');
            store.put(normalized);
            console.log(`[SNAPSHOT SAVE] id=${normalized?.snapshot_id || '-'} short=${normalized?.snapshot_short ?? '-'} program_name=${normalized?.program_name || 'Sin nombre'}`);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error guardando snapshot en snapshots.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Obtiene un snapshot del store snapshots por id.
 * @param {string} snapshotId
 * @returns {Promise<Object|null>}
 */
async function getSnapshot(snapshotId) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('snapshots', 'readonly');
            const store = tx.objectStore('snapshots');
            const request = store.get(snapshotId);
            request.onsuccess = () => {
                const normalized = normalizeSnapshotWithShort(request.result || null, 'snapshot_id');
                resolve(normalized);
            };
            request.onerror = () => reject(request.error || new Error('Error leyendo snapshot de snapshots.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Lista snapshots del store snapshots.
 * @returns {Promise<Array>}
 */
async function listSnapshots() {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('snapshots', 'readonly');
            const store = tx.objectStore('snapshots');
            const request = store.getAll();
            request.onsuccess = () => {
                const normalizedList = (request.result || []).map(s => normalizeSnapshotWithShort(s, 'snapshot_id'));
                resolve(normalizedList);
            };
            request.onerror = () => reject(request.error || new Error('Error listando snapshots.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Guarda el inicio de un run.
 * @param {Object} runObj
 */
async function idbSaveRunStart(runObj) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readwrite');
            const store = tx.objectStore('runs');
            store.put({ ...runObj, source: runObj.source || 'sim' });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error guardando run.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Actualiza metadata de un run (fin, cancelación, etc.).
 * @param {Object} runObj
 */
async function idbUpdateRun(runObj) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readwrite');
            const store = tx.objectStore('runs');
            store.put(runObj);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error actualizando run.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Guarda un run completo.
 * @param {Object} run
 * @returns {Promise<boolean>}
 */
async function saveRun(run) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readwrite');
            const store = tx.objectStore('runs');
            store.put(run);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error guardando run.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Obtiene un run por id.
 * @param {string} runId
 * @returns {Promise<Object|null>}
 */
async function getRun(runId) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readonly');
            const store = tx.objectStore('runs');
            const request = store.get(runId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Error leyendo run.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Lista todos los runs.
 * @returns {Promise<Array>}
 */
async function listRuns() {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readonly');
            const store = tx.objectStore('runs');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('Error listando runs.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Lista runs por snapshot_id.
 * @param {string} snapshotId
 * @returns {Promise<Array>}
 */
async function listRunsBySnapshot(snapshotId) {
    try {
        const runs = await listRuns();
        return runs.filter(run => run && run.snapshot_id === snapshotId);
    } catch (error) {
        throw error;
    }
}

/**
 * Inserta/actualiza el resultado por step dentro de un run.
 * @param {string} runId
 * @param {Object} stepResult
 * @returns {Promise<boolean>}
 */
async function upsertRunStepResult(runId, stepResult) {
    try {
        const run = await getRun(runId);
        if (!run) {
            throw new Error('Run no encontrado.');
        }

        if (!run.resultsByStep || typeof run.resultsByStep !== 'object') {
            run.resultsByStep = {};
        }

        run.resultsByStep[stepResult.step_id] = stepResult;
        return saveRun(run);
    } catch (error) {
        throw error;
    }
}

/**
 * Guarda un resultado incremental (1 registro por step).
 * @param {Object} resultObj
 */
async function idbAddResult(resultObj) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('results', 'readwrite');
            const store = tx.objectStore('results');
            store.add(resultObj);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error guardando result.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Obtiene todos los resultados de un run.
 * @param {string} run_id
 * @returns {Promise<Array>}
 */
async function idbGetResultsByRun(run_id) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('results', 'readonly');
            const store = tx.objectStore('results');
            const index = store.index('by_run');
            const request = index.getAll(run_id);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error || new Error('Error leyendo results.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Obtiene resultados de un run filtrados por tipo (usa índice si existe).
 * @param {string} run_id
 * @param {string} step_type
 * @returns {Promise<Array>}
 */
async function idbGetResultsByRunAndType(run_id, step_type) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('results', 'readonly');
            const store = tx.objectStore('results');
            let index;
            try {
                index = store.index('by_run_type');
            } catch (error) {
                index = null;
            }

            if (index) {
                const range = IDBKeyRange.only([run_id, step_type]);
                const request = index.getAll(range);
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error || new Error('Error leyendo results por tipo.'));
                return;
            }

            // Fallback si no existe el índice
            idbGetResultsByRun(run_id)
                .then((all) => resolve(all.filter(r => r.step_type === step_type)))
                .catch(reject);
        });
    } catch (error) {
        const all = await idbGetResultsByRun(run_id);
        return all.filter(r => r.step_type === step_type);
    }
}

/**
 * Obtiene resultados de un run filtrados por phase (fallback en memoria).
 * @param {string} run_id
 * @param {string} phase
 * @returns {Promise<Array>}
 */
async function idbGetResultsByRunAndPhase(run_id, phase) {
    try {
        const all = await idbGetResultsByRun(run_id);
        return all.filter(r => r.phase === phase);
    } catch (error) {
        throw error;
    }
}

/**
 * Obtiene un run por id.
 * @param {string} run_id
 * @returns {Promise<Object|null>}
 */
async function idbGetRun(run_id) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readonly');
            const store = tx.objectStore('runs');
            const request = store.get(run_id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('Error leyendo run.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Obtiene un snapshot por id.
 * @param {string} program_snapshot_id
 * @returns {Promise<Object|null>}
 */
async function idbGetSnapshot(program_snapshot_id) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('program_snapshots', 'readonly');
            const store = tx.objectStore('program_snapshots');
            const request = store.get(program_snapshot_id);
            request.onsuccess = () => resolve(normalizeSnapshotWithShort(request.result || null, 'program_snapshot_id'));
            request.onerror = () => reject(request.error || new Error('Error leyendo snapshot.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Resuelve snapshot por snapshot_short en store snapshots.
 * Si hay varias coincidencias, prioriza activo y luego reciente.
 * @param {number|string} snapshotShort
 * @returns {Promise<Object|null>}
 */
async function resolveSnapshotByShort(snapshotShort) {
    const shortNum = Number(snapshotShort);
    if (!Number.isFinite(shortNum)) return null;

    const snapshots = await listSnapshots();
    const matches = snapshots.filter(s => Number(s?.snapshot_short) === shortNum);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    const sorted = matches.slice().sort((a, b) => {
        const aActive = a?.is_active === true || a?.active === true || a?.isActive === true;
        const bActive = b?.is_active === true || b?.active === true || b?.isActive === true;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return snapshotRecencyValue(b) - snapshotRecencyValue(a);
    });

    return sorted[0] || null;
}

function normalizeProgramNameForMatch(name) {
    return String(name || '').trim().toLowerCase();
}

function getSnapshotPlannedStepsCount(snapshot) {
    if (Array.isArray(snapshot?.plannedSteps)) return snapshot.plannedSteps.length;
    const count = Number(snapshot?.plannedSteps_count);
    return Number.isFinite(count) && count >= 0 ? count : null;
}

/**
 * Resuelve snapshot por snapshot_short aplicando contexto opcional.
 * Si se proveen program_name y plannedSteps_count, prioriza coincidencia exacta.
 * @param {number|string} snapshotShort
 * @param {Object} [context]
 * @param {string} [context.program_name]
 * @param {number} [context.plannedSteps_count]
 * @returns {Promise<Object|null>}
 */
async function resolveSnapshotByShortWithContext(snapshotShort, context = {}) {
    const shortNum = Number(snapshotShort);
    if (!Number.isFinite(shortNum) || shortNum <= 0) return null;

    const snapshots = await listSnapshots();
    const matches = (Array.isArray(snapshots) ? snapshots : [])
        .filter(s => Number(s?.snapshot_short) === (shortNum & 0xFFFF));

    if (matches.length === 0) return null;
    if (matches.length === 1 && !context) return matches[0];

    const targetProgramName = normalizeProgramNameForMatch(context?.program_name);
    const rawPlannedCount = Number(context?.plannedSteps_count);
    const hasPlannedCount = Number.isFinite(rawPlannedCount) && rawPlannedCount >= 0;
    const targetPlannedCount = hasPlannedCount ? rawPlannedCount : null;

    const strictMatches = matches.filter((snapshot) => {
        const snapshotProgramName = normalizeProgramNameForMatch(snapshot?.program_name);
        const snapshotPlannedCount = getSnapshotPlannedStepsCount(snapshot);

        const programNameOk = targetProgramName
            ? snapshotProgramName === targetProgramName
            : true;
        const plannedCountOk = hasPlannedCount
            ? snapshotPlannedCount === targetPlannedCount
            : true;

        return programNameOk && plannedCountOk;
    });

    const candidates = strictMatches.length > 0 ? strictMatches : matches;

    const sorted = candidates.slice().sort((a, b) => {
        const aActive = a?.is_active === true || a?.active === true || a?.isActive === true;
        const bActive = b?.is_active === true || b?.active === true || b?.isActive === true;
        if (aActive !== bActive) return aActive ? -1 : 1;
        return snapshotRecencyValue(b) - snapshotRecencyValue(a);
    });

    return sorted[0] || null;
}

/**
 * Carga un bundle completo del run.
 * @param {string} run_id
 * @returns {Promise<{run: Object, snapshot: Object|null, results: Array} | null>}
 */
async function idbLoadRunBundle(run_id) {
    try {
        const run = await idbGetRun(run_id);
        if (!run) return null;
        const snapshot = await idbGetSnapshot(run.program_snapshot_id);
        const results = await idbGetResultsByRun(run_id);
        return { run, snapshot, results };
    } catch (error) {
        throw error;
    }
}

/**
 * Limpia toda la base de datos (solo debug).
 */
async function idbClearAll() {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['program_snapshots', 'runs', 'results'], 'readwrite');
            tx.objectStore('program_snapshots').clear();
            tx.objectStore('runs').clear();
            tx.objectStore('results').clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error || new Error('Error limpiando DB.'));
        });
    } catch (error) {
        throw error;
    }
}

/**
 * Lista runs guardados (limit opcional).
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function idbListRuns(limit = 10) {
    try {
        const db = await idbInit();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readonly');
            const store = tx.objectStore('runs');
            const request = store.getAll();
            request.onsuccess = () => {
                const allRuns = request.result || [];
                const sortedRuns = allRuns
                    .slice()
                    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
                resolve(sortedRuns.slice(0, Math.max(0, limit)));
            };
            request.onerror = () => reject(request.error || new Error('Error listando runs.'));
        });
    } catch (error) {
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Utilidades de limpieza conservadora de históricos (fase 1)
// ---------------------------------------------------------------------------

/**
 * Determina qué elementos son candidatos a limpieza sin borrar nada.
 * @param {object} [opts]
 * @param {number} [opts.keepRecentSnapshots=10] - Número de snapshots recientes a conservar siempre.
 * @returns {Promise<{runsToDelete: object[], snapshotsToDelete: object[], summary: string}>}
 */
async function idbPreviewCleanupPlan({ keepRecentSnapshots = 10 } = {}) {
    const db = await idbInit();

    // ── 1. Leer todos los runs ──────────────────────────────────────────────
    const allRuns = await new Promise((resolve, reject) => {
        const tx = db.transaction('runs', 'readonly');
        const req = tx.objectStore('runs').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    // Runs prescindibles: empieza por "run_", no por "run_sim_", no por "run_mqtt_",
    // y no tiene resultsByStep útil.
    const runsToDelete = allRuns.filter(run => {
        const id = String(run.run_id || '');
        if (!id.startsWith('run_')) return false;
        if (id.startsWith('run_sim_')) return false;
        if (id.startsWith('run_mqtt_')) return false;
        const hasResults = run.resultsByStep && Object.keys(run.resultsByStep).length > 0;
        return !hasResults;
    });

    // IDs de runs canónicos que sobreviven → snapshot_ids referenciados
    const canonicalRuns = allRuns.filter(run => {
        const id = String(run.run_id || '');
        return id.startsWith('run_sim_') || id.startsWith('run_mqtt_');
    });
    const referencedSnapshotIds = new Set(
        canonicalRuns.map(r => r.snapshot_id).filter(Boolean)
    );

    // ── 2. Leer todos los snapshots ────────────────────────────────────────
    const allSnapshots = await new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readonly');
        const req = tx.objectStore('snapshots').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    // Ordenar por created_at descendente para identificar los N más recientes
    const sortedSnapshots = allSnapshots
        .slice()
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const recentSnapshotIds = new Set(
        sortedSnapshots.slice(0, Math.max(0, keepRecentSnapshots)).map(s => s.snapshot_id)
    );

    // Huérfanos: no referenciados por ningún run canónico y fuera de los N recientes
    const snapshotsToDelete = allSnapshots.filter(snap => {
        const id = snap.snapshot_id;
        if (referencedSnapshotIds.has(id)) return false;
        if (recentSnapshotIds.has(id)) return false;
        return true;
    });

    const summary = [
        `=== idbPreviewCleanupPlan ===`,
        `Runs totales: ${allRuns.length}  →  candidatos a borrar: ${runsToDelete.length}`,
        `Snapshots totales: ${allSnapshots.length}  →  candidatos a borrar: ${snapshotsToDelete.length}`,
        `  (referenciados por runs canónicos: ${referencedSnapshotIds.size}, conservados por recencia [≤${keepRecentSnapshots}]: ${recentSnapshotIds.size})`,
        runsToDelete.length
            ? `Runs candidatos:\n${runsToDelete.map(r => `  • ${r.run_id}`).join('\n')}`
            : `Runs candidatos: ninguno`,
        snapshotsToDelete.length
            ? `Snapshots candidatos:\n${snapshotsToDelete.map(s => `  • ${s.snapshot_id}`).join('\n')}`
            : `Snapshots candidatos: ninguno`,
    ].join('\n');

    console.info(summary);
    return { runsToDelete, snapshotsToDelete, summary };
}

/**
 * Limpieza conservadora de históricos en IndexedDB.
 * Con dryRun=true (defecto) no borra nada; devuelve el plan.
 * Con dryRun=false ejecuta la limpieza real.
 * @param {object} [opts]
 * @param {number} [opts.keepRecentSnapshots=10]
 * @param {boolean} [opts.dryRun=true]
 * @returns {Promise<{runsDeleted: number, snapshotsDeleted: number, dryRun: boolean, plan: object}>}
 */
async function idbCleanupPersistedHistory({ keepRecentSnapshots = 10, dryRun = true } = {}) {
    const plan = await idbPreviewCleanupPlan({ keepRecentSnapshots });

    if (dryRun) {
        console.info('[idbCleanupPersistedHistory] dryRun=true → sin cambios.');
        return { runsDeleted: 0, snapshotsDeleted: 0, dryRun: true, plan };
    }

    const db = await idbInit();
    let runsDeleted = 0;
    let snapshotsDeleted = 0;

    // ── Borrar runs prescindibles ──────────────────────────────────────────
    if (plan.runsToDelete.length > 0) {
        await new Promise((resolve, reject) => {
            const tx = db.transaction('runs', 'readwrite');
            const store = tx.objectStore('runs');
            let pending = plan.runsToDelete.length;
            for (const run of plan.runsToDelete) {
                const req = store.delete(run.run_id);
                req.onsuccess = () => { runsDeleted += 1; pending -= 1; if (pending === 0) resolve(); };
                req.onerror = () => reject(req.error);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ── Borrar snapshots huérfanos ─────────────────────────────────────────
    if (plan.snapshotsToDelete.length > 0) {
        await new Promise((resolve, reject) => {
            const tx = db.transaction('snapshots', 'readwrite');
            const store = tx.objectStore('snapshots');
            let pending = plan.snapshotsToDelete.length;
            for (const snap of plan.snapshotsToDelete) {
                const req = store.delete(snap.snapshot_id);
                req.onsuccess = () => { snapshotsDeleted += 1; pending -= 1; if (pending === 0) resolve(); };
                req.onerror = () => reject(req.error);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    console.info(
        `[idbCleanupPersistedHistory] Limpieza completada → runs borrados: ${runsDeleted}, snapshots borrados: ${snapshotsDeleted}`
    );
    return { runsDeleted, snapshotsDeleted, dryRun: false, plan };
}

if (localStorage.getItem('fp_debug') === 'true') console.log('[IDB LOAD] before exports');

// Exponer en window para consumo desde simulator.js u otras capas
if (typeof window !== 'undefined') {
    if (localStorage.getItem('fp_debug') === 'true') console.log('[IDB LOAD] inside exports');

    if (typeof idbInit === 'function') window.idbInit = idbInit;
    if (typeof idbSaveSnapshot === 'function') window.idbSaveSnapshot = idbSaveSnapshot;
    if (typeof idbSaveRunStart === 'function') window.idbSaveRunStart = idbSaveRunStart;
    if (typeof idbUpdateRun === 'function') window.idbUpdateRun = idbUpdateRun;
    if (typeof idbAddResult === 'function') window.idbAddResult = idbAddResult;
    if (typeof idbGetResultsByRun === 'function') window.idbGetResultsByRun = idbGetResultsByRun;
    if (typeof idbGetResultsByRunAndType === 'function') window.idbGetResultsByRunAndType = idbGetResultsByRunAndType;
    if (typeof idbGetResultsByRunAndPhase === 'function') window.idbGetResultsByRunAndPhase = idbGetResultsByRunAndPhase;
    if (typeof idbGetRun === 'function') window.idbGetRun = idbGetRun;
    if (typeof idbGetSnapshot === 'function') window.idbGetSnapshot = idbGetSnapshot;
    if (typeof idbLoadRunBundle === 'function') window.idbLoadRunBundle = idbLoadRunBundle;
    if (typeof idbClearAll === 'function') window.idbClearAll = idbClearAll;
    if (typeof idbListRuns === 'function') window.idbListRuns = idbListRuns;

    if (typeof saveSnapshot === 'function') window.saveSnapshot = saveSnapshot;
    if (typeof getSnapshot === 'function') window.getSnapshot = getSnapshot;
    if (typeof listSnapshots === 'function') window.listSnapshots = listSnapshots;
    if (typeof resolveSnapshotByShort === 'function') window.resolveSnapshotByShort = resolveSnapshotByShort;
    if (typeof resolveSnapshotByShortWithContext === 'function') window.resolveSnapshotByShortWithContext = resolveSnapshotByShortWithContext;

    if (typeof saveRun === 'function') window.saveRun = saveRun;
    if (typeof getRun === 'function') window.getRun = getRun;
    if (typeof listRuns === 'function') window.listRuns = listRuns;
    if (typeof listRunsBySnapshot === 'function') window.listRunsBySnapshot = listRunsBySnapshot;
    if (typeof upsertRunStepResult === 'function') window.upsertRunStepResult = upsertRunStepResult;
    if (typeof idbPreviewCleanupPlan === 'function') window.idbPreviewCleanupPlan = idbPreviewCleanupPlan;
    if (typeof idbCleanupPersistedHistory === 'function') window.idbCleanupPersistedHistory = idbCleanupPersistedHistory;

    console.log('[IDB EXPORTS]', {
        saveSnapshot: typeof window.saveSnapshot,
        getSnapshot: typeof window.getSnapshot,
        listSnapshots: typeof window.listSnapshots,
        resolveSnapshotByShort: typeof window.resolveSnapshotByShort
    });

    if (localStorage.getItem('fp_debug') === 'true') console.log('[IDB LOAD] after exports');
}

// IDB initialization complete
