(function () {
    const MQTT_WS_URL = 'wss://broker.emqx.io:8084/mqtt';
    const MQTT_TOPIC = 'salesianos/robot/iban/step_capture';
    const MQTT_RUN_ID = 'mqtt_live';
    const MQTT_RUN_ID_PREFIX = 'run_mqtt_';      // prefijo para runs persistidos por snapshot
    const PROGRAM_NAME_STORAGE_KEY = 'fp_program_name';
    const PROGRAM_NAME_SIM_STORAGE_KEY = 'robotProgramNameForSimulation';
    const MQTT_BROKER_STORAGE_KEY = 'fp_mqtt_broker_url';
    const MQTT_TOPIC_STORAGE_KEY = 'fp_mqtt_topic';

    const mqttSnapshotExecutionState = new Map();

    // Getter: obtener URL del broker (localStorage con fallback a constante)
    function getMqttBrokerUrl() {
        try {
            const stored = localStorage.getItem(MQTT_BROKER_STORAGE_KEY);
            return stored ? String(stored).trim() : MQTT_WS_URL;
        } catch (e) {
            return MQTT_WS_URL;
        }
    }

    // Getter: obtener topic (localStorage con fallback a constante)
    function getMqttTopic() {
        try {
            const stored = localStorage.getItem(MQTT_TOPIC_STORAGE_KEY);
            return stored ? String(stored).trim() : MQTT_TOPIC;
        } catch (e) {
            return MQTT_TOPIC;
        }
    }

    // Notificar cambios de estado MQTT a la UI (con fallback a DOM directo)
    function notifyMqttUiStatus(info = {}) {
        const payload = {
            status: info.status || 'unknown',
            clientId: info.clientId || '',
            brokerUrl: getMqttBrokerUrl(),
            topic: getMqttTopic(),
            error: info.error || '',
            timestamp: Date.now()
        };

        // Intentar llamar SimulatorAPI si está disponible
        if (typeof window?.SimulatorAPI?.setMqttConnectionStatus === 'function') {
            try {
                window.SimulatorAPI.setMqttConnectionStatus(payload);
                return;
            } catch (e) {
                // Fallthrough a render directo
            }
        }

        // Fallback: renderizar directamente en DOM si SimulatorAPI no disponible
        try {
            let indicator = document.getElementById('mqttStatusIndicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'mqttStatusIndicator';
                indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#f0f0f0;padding:8px 12px;border-radius:4px;font-size:12px;z-index:9999;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                document.body.appendChild(indicator);
            }

            const statusEmoji = {
                'disconnected': '🔴',
                'connecting': '🟠',
                'connected': '🟢',
                'subscribed': '🟢',
                'offline': '⚫',
                'error': '❌',
                'reconnecting': '🟡'
            }[payload.status] || '⚪';

            const tooltip = [
                `Status: ${payload.status}`,
                payload.clientId ? `ClientId: ${payload.clientId}` : '',
                `Broker: ${payload.brokerUrl}`,
                `Topic: ${payload.topic}`,
                payload.error ? `Error: ${payload.error}` : ''
            ].filter(Boolean).join('\n');

            indicator.textContent = `MQTT: ${statusEmoji} ${payload.status}`;
            indicator.title = tooltip;
        } catch (e) {
            // Silently fail if DOM not ready
        }
    }

    function sanitizeRunToken(value, fallback = 'na') {
        const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
        return normalized || fallback;
    }

    function formatCompactTimestamp(ts) {
        const dateObj = Number.isFinite(Number(ts)) ? new Date(Number(ts)) : new Date();
        if (!Number.isFinite(dateObj.getTime())) {
            return String(Date.now());
        }
        const pad2 = (value) => String(value).padStart(2, '0');
        const pad3 = (value) => String(value).padStart(3, '0');
        const y = dateObj.getFullYear();
        const m = pad2(dateObj.getMonth() + 1);
        const d = pad2(dateObj.getDate());
        const hh = pad2(dateObj.getHours());
        const mm = pad2(dateObj.getMinutes());
        const ss = pad2(dateObj.getSeconds());
        const ms = pad3(dateObj.getMilliseconds());
        return `${y}${m}${d}${hh}${mm}${ss}${ms}`;
    }

    function createExecutionId(baseTimestamp, eventCounter) {
        const compactTs = formatCompactTimestamp(baseTimestamp);
        const counterPart = Number.isFinite(Number(eventCounter)) ? `_${Number(eventCounter)}` : '';
        return `exec_${compactTs}${counterPart}`;
    }

    function computeMqttRunId(snapshotShort, executionId) {
        const shortToken = Number.isFinite(Number(snapshotShort))
            ? String(Number(snapshotShort) & 0xFFFF)
            : 'na';
        return `${MQTT_RUN_ID_PREFIX}${sanitizeRunToken(shortToken)}_${sanitizeRunToken(executionId, 'exec')}`;
    }

    function getSnapshotExecutionState(snapshotId) {
        const key = String(snapshotId || '');
        const existing = mqttSnapshotExecutionState.get(key);
        if (existing) return existing;
        const initial = {
            last_event_counter: null,
            active_execution_id: null,
            active_run_id: null,
            has_events: false
        };
        mqttSnapshotExecutionState.set(key, initial);
        return initial;
    }

    function detectNewExecution(state, eventCounterNum) {
        if (!state || !state.active_run_id || !state.active_execution_id) {
            return { isNewExecution: true, reason: 'no_active_execution' };
        }

        const hasCounter = Number.isFinite(eventCounterNum);
        if (!hasCounter) {
            return { isNewExecution: false, reason: 'missing_event_counter' };
        }

        const lastCounter = Number.isFinite(state.last_event_counter)
            ? Number(state.last_event_counter)
            : null;

        if (lastCounter !== null && eventCounterNum < lastCounter) {
            console.log('[MQTT RUN] detected reset event_counter < previous -> new execution');
            return { isNewExecution: true, reason: 'counter_reset' };
        }

        if (eventCounterNum === 1 && state.has_events) {
            return { isNewExecution: true, reason: 'counter_restart' };
        }

        return { isNewExecution: false, reason: 'reuse_active' };
    }

    function refreshComparisonIfPossible(api) {
        if (typeof api?.compareSteps === 'function' && typeof api?.renderComparisonTable === 'function') {
            const comparison = api.compareSteps();
            api.renderComparisonTable(comparison);
        }
    }

    function clearActualResultsInMemory(api) {
        if (typeof api?.clearActualResults === 'function') {
            api.clearActualResults();
            return;
        }
        const actual = api?.getActualResults?.();
        if (Array.isArray(actual)) {
            actual.length = 0;
        }
    }

    let mqttClient = null;

    // [FASE 1] Helper: obtener snapshot_id del contexto actual de compilación
    function getCurrentSnapshotId() {
        const api = window.SimulatorAPI;
        if (typeof api?.getProgramSnapshotId === 'function') {
            const snapshotId = api.getProgramSnapshotId();
            return snapshotId || null;
        }
        return null;
    }

    function formatProgramTimestamp(dateObj) {
        const pad2 = (value) => String(value).padStart(2, '0');
        const y = dateObj.getFullYear();
        const m = pad2(dateObj.getMonth() + 1);
        const d = pad2(dateObj.getDate());
        const hh = pad2(dateObj.getHours());
        const mm = pad2(dateObj.getMinutes());
        return `${y}${m}${d}_${hh}${mm}`;
    }

    function buildDefaultProgramName() {
        return `Programa_${formatProgramTimestamp(new Date())}`;
    }

    function getActiveProgramName(incomingName) {
        const incoming = String(incomingName || '').trim();
        if (incoming) {
            localStorage.setItem(PROGRAM_NAME_SIM_STORAGE_KEY, incoming);
            localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, incoming);
            return incoming;
        }

        const storedSim = String(localStorage.getItem(PROGRAM_NAME_SIM_STORAGE_KEY) || '').trim();
        const storedMain = String(localStorage.getItem(PROGRAM_NAME_STORAGE_KEY) || '').trim();
        const resolved = storedSim || storedMain || buildDefaultProgramName();

        localStorage.setItem(PROGRAM_NAME_SIM_STORAGE_KEY, resolved);
        localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, resolved);
        return resolved;
    }

    function extractSnapshotProgramName(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return '';
        return String(
            snapshot.program_name
            || snapshot.programName
            || snapshot.meta?.program_name
            || ''
        ).trim();
    }

    // [v3] Un run MQTT/socket por ejecución real del snapshot.
    // Devuelve el run_id activo y si se creó nueva ejecución.
    async function ensureMqttRunForSnapshotExecution(snapshotId, snapshotShort, eventCounter, timestamp, programName, sourceType = 'mqtt', snapshotObj = null) {
        if (typeof window.getRun !== 'function' || typeof window.saveRun !== 'function') return null;

        const state = getSnapshotExecutionState(snapshotId);
        const eventCounterNum = Number(eventCounter);
        const hasEventCounter = Number.isFinite(eventCounterNum);
        const detection = detectNewExecution(state, eventCounterNum);
        const shouldCreateExecution = detection.isNewExecution;
        const explicitProgramName = String(programName || '').trim();
        let snapshotProgramName = extractSnapshotProgramName(snapshotObj);
        if (!snapshotProgramName && snapshotId && typeof window.getSnapshot === 'function') {
            const persistedSnapshot = await window.getSnapshot(snapshotId).catch(() => null);
            snapshotProgramName = extractSnapshotProgramName(persistedSnapshot);
        }
        const resolvedProgramName = explicitProgramName || snapshotProgramName || 'Sin nombre';

        if (shouldCreateExecution) {
            const executionId = createExecutionId(timestamp, hasEventCounter ? eventCounterNum : null);
            const runId = computeMqttRunId(snapshotShort, executionId);

            await window.saveRun({
                run_id: runId,
                snapshot_id: snapshotId,
                snapshot_short: Number.isFinite(Number(snapshotShort)) ? (Number(snapshotShort) & 0xFFFF) : null,
                execution_id: executionId,
                program_name: resolvedProgramName,
                source: sourceType,
                started_at: Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now(),
                ended_at: null,
                status: 'running',
                last_event_counter: hasEventCounter ? eventCounterNum : null,
                resultsByStep: {},
                meta: {
                    program_name: resolvedProgramName,
                    snapshot_short: Number.isFinite(Number(snapshotShort)) ? (Number(snapshotShort) & 0xFFFF) : null,
                    execution_id: executionId,
                    source: sourceType
                }
            });

            state.active_execution_id = executionId;
            state.active_run_id = runId;
            state.last_event_counter = hasEventCounter ? eventCounterNum : state.last_event_counter;
            state.has_events = true;

            console.log(`[MQTT RUN] new execution snapshot=${snapshotId} short=${snapshotShort ?? 'null'} execution=${executionId} run=${runId}`);
            console.log(`[MQTT RUN] program_name=${resolvedProgramName} run=${runId}`);
            return {
                runId,
                executionId,
                isNewExecution: true,
                state,
                reason: detection.reason
            };
        }

        const runId = state.active_run_id;
        const existing = runId ? await window.getRun(runId).catch(() => null) : null;
        if (!existing) {
            state.active_execution_id = null;
            state.active_run_id = null;
            state.has_events = false;
            return ensureMqttRunForSnapshotExecution(snapshotId, snapshotShort, eventCounter, timestamp, programName, sourceType, snapshotObj);
        }

        if (!String(existing.program_name || '').trim()) {
            existing.program_name = resolvedProgramName;
            existing.meta = { ...(existing.meta || {}), program_name: resolvedProgramName };
        }

        if (hasEventCounter) {
            state.last_event_counter = eventCounterNum;
            existing.last_event_counter = eventCounterNum;
            await window.saveRun(existing).catch(() => {});
            console.log(`[MQTT RUN] reuse execution run=${runId} event_counter=${eventCounterNum}`);
        } else {
            console.log(`[MQTT RUN] reuse execution run=${runId} event_counter=missing`);
        }
        console.log(`[MQTT RUN] program_name=${existing.program_name || resolvedProgramName} run=${runId}`);
        state.has_events = true;

        return {
            runId,
            executionId: state.active_execution_id,
            isNewExecution: false,
            state,
            reason: detection.reason
        };
    }

    function adaptMqttStepCapture(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const tcp = raw.tcp_position_mm;
        if (!tcp || typeof tcp !== 'object') return null;

        const x = Number(tcp.x);
        const y = Number(tcp.y);
        const z = Number(tcp.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

        const stepId = Number(raw.step_id);
        if (!Number.isFinite(stepId)) return null;

        const ts = Date.parse(raw.timestamp);
        if (!Number.isFinite(ts)) return null;

        const mqttSnapshotId = String(raw.snapshot_id || '').trim() || null;
        const parsedSnapshotShort = Number(raw.snapshot_short);
        const mqttSnapshotShort = Number.isFinite(parsedSnapshotShort)
            ? (parsedSnapshotShort & 0xFFFF)
            : null;
        const parsedEventCounter = Number(raw.event_counter);
        const eventCounter = Number.isFinite(parsedEventCounter)
            ? parsedEventCounter
            : null;
        const sourceType = String(raw.source || '').trim().toLowerCase() === 'socket' ? 'socket' : 'mqtt';

        const incomingProgramName = String(raw.program_name || '').trim();

        return {
            source: 'mqtt',
            run_id: MQTT_RUN_ID,
            step_id: stepId,
            mqtt_snapshot_id: mqttSnapshotId,
            mqtt_snapshot_short: mqttSnapshotShort,
            event_counter: eventCounter,
            telemetry_source: sourceType,
            snapshot_id: mqttSnapshotId,
            program_snapshot_id: mqttSnapshotId,
            pose: {
                x,
                y,
                z,
                rx: null,
                ry: null,
                rz: null
            },
            timestamp: ts,
            frame: 'WORLD',
            meta: {
                event_counter: eventCounter,
                source: sourceType,
                ...(incomingProgramName ? { program_name: incomingProgramName } : {})
            }
        };
    }

    async function getMqttSnapshotById(snapshotId) {
        if (!snapshotId || typeof window.getSnapshot !== 'function') return null;
        try {
            const snapshot = await window.getSnapshot(snapshotId);
            return snapshot || null;
        } catch (error) {
            console.warn('[telemetry] error consultando snapshot_id MQTT en IndexedDB:', error);
            return null;
        }
    }

    // Notifica validación fallida o warning de snapshot_id
    function notifyMqttValidationFailure(reason, details = {}) {
        const shortId = (id) => id ? String(id).slice(0, 8) + '...' : '(ninguno)';
        const msgParts = [];

        switch (reason) {
            case 'MQTT_MISSING_SNAPSHOT':
                msgParts.push(
                    `⚠️ Paso MQTT descartado: mensaje sin snapshot_id verificable.`,
                    `${details.message || 'No se permite comparación fiable sin snapshot_id.'}`
                );
                break;
            case 'MQTT_UNKNOWN_SNAPSHOT':
                msgParts.push(
                    `⚠️ Paso MQTT descartado: snapshot_id desconocido en IndexedDB.`,
                    `MQTT snapshot: ${shortId(details.mqttSnapshotId)}`
                );
                break;
            case 'MQTT_OTHER_PROGRAM_WARNING':
                msgParts.push(
                    `⚠️ Telemetría de otro programa (aceptada).`,
                    `Programa abierto: ${shortId(details.currentSnapshotId)} | MQTT: ${shortId(details.mqttSnapshotId)}`,
                    details.mqttProgramName ? `Programa MQTT: "${details.mqttProgramName}"` : ''
                );
                break;
            default:
                msgParts.push(`[telemetry] validación fallida: ${reason}`);
        }

        console.warn(`[telemetry] ${msgParts.join(' ')}`);
        // Hook opcional: SimulatorAPI puede interceptar para mostrar aviso en UI
        window.SimulatorAPI?.onMqttValidationFailure?.({ reason, details });
    }

    async function pushMqttResultToSimulator(adapted) {
        if (!adapted || typeof adapted !== 'object') return;

        let mqttSnapshotId = adapted?.mqtt_snapshot_id || null;
        const mqttSnapshotShort = Number.isFinite(Number(adapted?.mqtt_snapshot_short))
            ? (Number(adapted.mqtt_snapshot_short) & 0xFFFF)
            : null;

        if (!mqttSnapshotId && mqttSnapshotShort !== null && typeof window.resolveSnapshotByShort === 'function') {
            const resolvedSnapshot = await window.resolveSnapshotByShort(mqttSnapshotShort).catch((error) => {
                console.warn('[telemetry] error resolviendo snapshot_short en IndexedDB:', error);
                return null;
            });

            if (resolvedSnapshot) {
                const resolvedSnapshotId = resolvedSnapshot.snapshot_id || resolvedSnapshot.program_snapshot_id || null;
                if (resolvedSnapshotId) {
                    mqttSnapshotId = resolvedSnapshotId;
                    adapted.mqtt_snapshot_id = resolvedSnapshotId;
                    adapted.snapshot_id = resolvedSnapshotId;
                    adapted.program_snapshot_id = resolvedSnapshotId;
                    if (resolvedSnapshot.program_name) {
                        adapted.meta = adapted.meta || {};
                        if (!adapted.meta.program_name) {
                            adapted.meta.program_name = resolvedSnapshot.program_name;
                        }
                    }
                    console.log(`[TELEMETRY SNAPSHOT] resolved short=${mqttSnapshotShort} -> snapshot_id=${resolvedSnapshotId}`);
                }
            } else {
                console.warn(`[TELEMETRY SNAPSHOT] unknown short=${mqttSnapshotShort}`);
            }
        }

        // [E] Sin snapshot_id no hay comparación fiable — bloqueo
        if (!mqttSnapshotId) {
            if (mqttSnapshotShort !== null) {
                notifyMqttValidationFailure('MQTT_UNKNOWN_SNAPSHOT', {
                    mqttSnapshotId: null,
                    mqttSnapshotShort
                });
            } else {
                notifyMqttValidationFailure('MQTT_MISSING_SNAPSHOT', {
                    message: 'Mensaje MQTT sin snapshot_id verificable'
                });
            }
            return;
        }

        // [D] Snapshot desconocido en IndexedDB — bloqueo
        const mqttSnapshot = await getMqttSnapshotById(mqttSnapshotId);
        if (!mqttSnapshot) {
            notifyMqttValidationFailure('MQTT_UNKNOWN_SNAPSHOT', { mqttSnapshotId });
            return;
        }

        const snapshotProgramName = extractSnapshotProgramName(mqttSnapshot);
        adapted.meta = adapted.meta || {};
        if (!String(adapted.meta.program_name || '').trim() && snapshotProgramName) {
            adapted.meta.program_name = snapshotProgramName;
        }

        // [B] Snapshot conocido pero distinto del programa abierto — warning, NO bloqueo
        const api = window.SimulatorAPI;
        const currentSnapshotId = typeof api?.getProgramSnapshotId === 'function'
            ? api.getProgramSnapshotId()
            : null;
        if (currentSnapshotId && mqttSnapshotId !== currentSnapshotId) {
            notifyMqttValidationFailure('MQTT_OTHER_PROGRAM_WARNING', {
                mqttSnapshotId,
                currentSnapshotId,
                mqttProgramName: mqttSnapshot.program_name || mqttSnapshot.meta?.program_name || null
            });
            // No return: se acepta el mensaje igualmente
        }

        const eventCounter = Number.isFinite(Number(adapted?.event_counter)) ? Number(adapted.event_counter) : null;
        const sourceType = (adapted?.telemetry_source === 'socket') ? 'socket' : 'mqtt';

        // [A/C] Obtener o crear run MQTT/socket por ejecución real para este snapshot_id
        const runCtx = await ensureMqttRunForSnapshotExecution(
            mqttSnapshotId,
            mqttSnapshotShort,
            eventCounter,
            adapted?.timestamp,
            adapted?.meta?.program_name,
            sourceType,
            mqttSnapshot
        );
        const runId = runCtx?.runId || null;
        if (!runId) {
            console.warn('[telemetry] No se pudo obtener/crear run MQTT. IDB no disponible.');
            return;
        }

        if (runCtx?.isNewExecution) {
            if (typeof api?.setActiveMqttRunId === 'function') {
                api.setActiveMqttRunId(runId);
            }
            clearActualResultsInMemory(api);
            refreshComparisonIfPossible(api);
        }

        // Persistir step en IDB
        if (typeof window.upsertRunStepResult === 'function') {
            window.upsertRunStepResult(runId, {
                step_id: adapted.step_id,
                pose: adapted.pose,
                timestamp: adapted.timestamp,
                source: sourceType,
                meta: {
                    ...(adapted.meta || {}),
                    snapshot_id: mqttSnapshotId,
                    snapshot_short: mqttSnapshotShort,
                    event_counter: eventCounter,
                    execution_id: runCtx?.executionId || null,
                    telemetry_source: sourceType
                }
            }).catch((error) => {
                console.warn('[telemetry] persist mqtt run error:', error);
            });
        }

        // [C] Mantener run activo en SimulatorAPI
        if (typeof api?.setActiveMqttRunId === 'function') {
            api.setActiveMqttRunId(runId);
        }

        // Actualizar tabla de comparación en memoria
        const actual = api?.getActualResults?.();
        if (!Array.isArray(actual)) {
            console.warn('[telemetry] SimulatorAPI.getActualResults no disponible');
            return;
        }

        const planned = api?.getPlannedSteps?.();
        if (Array.isArray(planned)) {
            const validIds = new Set(planned.map((s) => s?.step_id));
            if (!validIds.has(adapted.step_id)) {
                console.warn('[telemetry] step_id fuera del plan actual:', adapted.step_id);
                return;
            }
        }

        const idx = actual.findIndex((item) => item && item.step_id === adapted.step_id);
        if (idx >= 0) {
            actual[idx] = adapted;
        } else {
            actual.push(adapted);
        }

        if (typeof api?.compareSteps === 'function' && typeof api?.renderComparisonTable === 'function') {
            const comparison = api.compareSteps();
            api.renderComparisonTable(comparison);
        }
    }

    function connectMqttTelemetry() {
        if (mqttClient) return mqttClient;

        if (!window.mqtt || typeof window.mqtt.connect !== 'function') {
            console.warn('[telemetry] mqtt.js no está cargado');
            return null;
        }

        // Generar clientId único por sesión
        const clientId = 'telemetry_' + Math.random().toString(16).slice(2) + '_' + Date.now();
        const brokerUrl = getMqttBrokerUrl();
        const topic = getMqttTopic();
        console.log(`[MQTT] connecting url=${brokerUrl} clientId=${clientId}`);
        notifyMqttUiStatus({ status: 'connecting', clientId, brokerUrl, topic });

        try {
            mqttClient = window.mqtt.connect(brokerUrl, {
                keepalive: 30,
                reconnectPeriod: 2000,
                clean: true,
                clientId: clientId
            });
        } catch (error) {
            console.error('[telemetry] Error al crear cliente MQTT:', error);
            notifyMqttUiStatus({ status: 'error', clientId, error: error?.message || String(error), brokerUrl, topic });
            return null;
        }

        mqttClient.on('connect', () => {
            console.log('[MQTT] connected');
            notifyMqttUiStatus({ status: 'connected', clientId, brokerUrl, topic });
            mqttClient.subscribe(topic, { qos: 0 }, (err, granted) => {
                if (err) {
                    console.error('[telemetry] Error en subscribe:', err);
                    notifyMqttUiStatus({ status: 'error', clientId, error: err?.message || String(err), brokerUrl, topic });
                } else {
                    // granted puede ser array de topics
                    const qos = (Array.isArray(granted) && granted[0]?.qos !== undefined) ? granted[0].qos : 0;
                    console.log(`[MQTT] subscribed topic=${topic} qos=${qos}`);
                    notifyMqttUiStatus({ status: 'subscribed', clientId, brokerUrl, topic });
                }
            });
        });

        mqttClient.on('message', (_topic, payload) => {
            try {
                const text = payload?.toString?.() ?? '';
                const raw = JSON.parse(text);
                console.log('[MQTT RAW]', raw);
                const adapted = adaptMqttStepCapture(raw);
                if (!adapted) return;
                pushMqttResultToSimulator(adapted);
            } catch (error) {
                console.error('[telemetry] Error parseando mensaje MQTT:', error);
            }
        });

        mqttClient.on('error', (error) => {
            console.error('[telemetry] Error de conexión MQTT:', error);
            notifyMqttUiStatus({ status: 'error', clientId, error: error?.message || String(error), brokerUrl, topic });
        });

        mqttClient.on('offline', () => {
            console.log('[MQTT] offline');
            notifyMqttUiStatus({ status: 'offline', clientId, brokerUrl, topic });
        });

        mqttClient.on('reconnect', () => {
            console.log('[MQTT] reconnecting');
            notifyMqttUiStatus({ status: 'reconnecting', clientId, brokerUrl, topic });
        });

        return mqttClient;
    }

    // DEBUG/DEV ONLY: Ingesta manual de payload MQTT sin broker.
    async function debugIngestMqttPayload(rawPayload) {
        const adapted = adaptMqttStepCapture(rawPayload);
        if (!adapted) {
            console.warn('[TELEMETRY DEBUG] adaptMqttStepCapture devolvió null');
            return { adapted: null };
        }
        await pushMqttResultToSimulator(adapted);
        return { adapted };
    }

    // DEBUG/DEV ONLY: Test manual para snapshot_short (válido, desconocido, missing).
    async function debugRunSnapshotShortManualTest(options = {}) {
        const listSnapshotsFn = (typeof window.listSnapshots === 'function') ? window.listSnapshots : null;
        let shortExistente = Number(options.shortExistente);
        let snapshotEsperado = null;
        const cases = [];

        function createCase(name) {
            const c = { name, ok: true, checks: [] };
            cases.push(c);
            return c;
        }

        function addCheck(caseRef, name, pass, detail = '') {
            const check = { name, pass: Boolean(pass) };
            if (detail) check.detail = detail;
            caseRef.checks.push(check);
            if (!check.pass) {
                caseRef.ok = false;
            }
            return check;
        }

        function printSummary(result) {
            console.log('[TELEMETRY DEBUG TEST] SUMMARY');
            result.cases.forEach((testCase) => {
                testCase.checks.forEach((check) => {
                    if (check.pass) {
                        console.log(`PASS ${check.name}`);
                    } else {
                        console.log(`FAIL ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
                    }
                });
            });
        }

        if (!Number.isFinite(shortExistente) && listSnapshotsFn) {
            const snapshots = await listSnapshotsFn().catch(() => []);
            const first = Array.isArray(snapshots)
                ? snapshots.find(s => s && Number.isFinite(Number(s.snapshot_short)))
                : null;
            if (first) {
                shortExistente = Number(first.snapshot_short) & 0xFFFF;
                snapshotEsperado = first.snapshot_id || first.program_snapshot_id || null;
            }
        }

        if (!Number.isFinite(shortExistente)) {
            const missingSetupCase = createCase('existing_short');
            addCheck(
                missingSetupCase,
                'existing short available for manual test',
                false,
                'no snapshot_short encontrado; usa { shortExistente }'
            );
            console.warn('[TELEMETRY DEBUG] No hay snapshot_short existente. Pasa { shortExistente } manualmente.');
            const result = {
                ok: false,
                reason: 'MISSING_EXISTING_SHORT',
                cases
            };
            printSummary(result);
            return result;
        }

        const baseRaw = {
            timestamp: options.timestamp || '2026-05-07T12:30:15.000Z',
            step_id: Number.isFinite(Number(options.stepId)) ? Number(options.stepId) : 0,
            event_counter: 1,
            tcp_position_mm: {
                x: 0.0,
                y: 300.0,
                z: 150.0
            }
        };

        const originalResolve = window.resolveSnapshotByShort;
        const resolveCalls = [];
        if (typeof originalResolve === 'function') {
            window.resolveSnapshotByShort = async function (snapshotShort) {
                resolveCalls.push(Number(snapshotShort));
                return originalResolve(snapshotShort);
            };
        }

        const validationEvents = [];
        const originalSimulatorAPI = window.SimulatorAPI;
        const simulatorApiPatched = {
            ...(originalSimulatorAPI || {})
        };
        const originalValidationHook = simulatorApiPatched.onMqttValidationFailure;
        simulatorApiPatched.onMqttValidationFailure = (event) => {
            validationEvents.push(event);
            if (typeof originalValidationHook === 'function') {
                originalValidationHook(event);
            }
        };
        if (typeof simulatorApiPatched.getActualResults !== 'function') {
            const debugActualResults = [];
            simulatorApiPatched.getActualResults = () => debugActualResults;
        }
        if (typeof simulatorApiPatched.getPlannedSteps !== 'function') {
            simulatorApiPatched.getPlannedSteps = () => null;
        }
        if (typeof simulatorApiPatched.setActiveMqttRunId !== 'function') {
            simulatorApiPatched.setActiveMqttRunId = () => {};
        }
        window.SimulatorAPI = simulatorApiPatched;

        try {
            const existingCase = createCase('existing_short');
            console.log(`[TELEMETRY DEBUG] Caso 1: snapshot_short existente=${shortExistente}`);
            const rawOk = { ...baseRaw, snapshot_short: shortExistente };
            const adaptedOk = adaptMqttStepCapture(rawOk);
            console.log('[TELEMETRY DEBUG] check#1 mqtt_snapshot_short:', adaptedOk?.mqtt_snapshot_short);
            await pushMqttResultToSimulator(adaptedOk);

            const resolvedSnapshotId = adaptedOk?.mqtt_snapshot_id || null;
            const normalizedSnapshotId = adaptedOk?.snapshot_id || null;
            const normalizedProgramSnapshotId = adaptedOk?.program_snapshot_id || null;
            const runId = (resolvedSnapshotId && typeof window.listRunsBySnapshot === 'function')
                ? (await window.listRunsBySnapshot(resolvedSnapshotId).catch(() => []) || [])
                    .filter(run => typeof run?.run_id === 'string' && run.run_id.startsWith(MQTT_RUN_ID_PREFIX))
                    .sort((a, b) => (b?.started_at || 0) - (a?.started_at || 0))[0]?.run_id
                : null;
            const persistedRun = (runId && typeof window.getRun === 'function')
                ? await window.getRun(runId).catch(() => null)
                : null;

            console.log('[TELEMETRY DEBUG] check#2 resolveSnapshotByShort called:', resolveCalls.length > 0, resolveCalls);
            console.log('[TELEMETRY DEBUG] check#3 normalized ids:', {
                mqtt_snapshot_id: resolvedSnapshotId,
                snapshot_id: normalizedSnapshotId,
                program_snapshot_id: normalizedProgramSnapshotId,
                expected_snapshot_id: snapshotEsperado
            });
            if (persistedRun) {
                console.log('[TELEMETRY DEBUG] check#3 associated run snapshot_id:', persistedRun.snapshot_id);
            } else {
                console.log('[TELEMETRY DEBUG] check#3 association note: run no disponible o no persistido en esta sesión.');
            }

            addCheck(
                existingCase,
                'existing short preserves mqtt_snapshot_short',
                Number(adaptedOk?.mqtt_snapshot_short) === (shortExistente & 0xFFFF),
                `expected ${(shortExistente & 0xFFFF)}, got ${adaptedOk?.mqtt_snapshot_short ?? 'null'}`
            );
            addCheck(
                existingCase,
                'existing short triggers resolveSnapshotByShort',
                resolveCalls.includes(shortExistente & 0xFFFF),
                `resolve calls: [${resolveCalls.join(', ')}]`
            );
            addCheck(
                existingCase,
                'existing short resolves snapshot_id',
                Boolean(resolvedSnapshotId),
                `expected ${snapshotEsperado ?? '(known snapshot_id)'}, got ${resolvedSnapshotId ?? 'null'}`
            );
            addCheck(
                existingCase,
                'existing short fills normalized snapshot identifiers',
                Boolean(adaptedOk?.mqtt_snapshot_id && adaptedOk?.snapshot_id && adaptedOk?.program_snapshot_id),
                `mqtt_snapshot_id=${adaptedOk?.mqtt_snapshot_id ?? 'null'}, snapshot_id=${adaptedOk?.snapshot_id ?? 'null'}, program_snapshot_id=${adaptedOk?.program_snapshot_id ?? 'null'}`
            );
            if (snapshotEsperado) {
                addCheck(
                    existingCase,
                    'existing short maps to expected snapshot_id',
                    resolvedSnapshotId === snapshotEsperado,
                    `expected ${snapshotEsperado}, got ${resolvedSnapshotId ?? 'null'}`
                );
            }
            addCheck(
                existingCase,
                'existing short associates telemetry with resolved snapshot run',
                Boolean(!resolvedSnapshotId || !persistedRun || persistedRun.snapshot_id === resolvedSnapshotId),
                persistedRun
                    ? `run snapshot_id=${persistedRun.snapshot_id ?? 'null'}, resolved=${resolvedSnapshotId ?? 'null'}`
                    : 'run no disponible para verificación estricta'
            );

            let shortDesconocido = Number(options.shortDesconocido);
            if (!Number.isFinite(shortDesconocido)) {
                shortDesconocido = ((shortExistente + 1) & 0xFFFF);
                if (shortDesconocido === shortExistente) {
                    shortDesconocido = ((shortExistente + 7) & 0xFFFF);
                }
            }

            const unknownCase = createCase('unknown_short');
            console.log(`[TELEMETRY DEBUG] Caso 2: snapshot_short desconocido=${shortDesconocido}`);
            const rawUnknown = { ...baseRaw, snapshot_short: shortDesconocido };
            const adaptedUnknown = adaptMqttStepCapture(rawUnknown);
            await pushMqttResultToSimulator(adaptedUnknown);
            const hasUnknownValidation = validationEvents.some(e => e?.reason === 'MQTT_UNKNOWN_SNAPSHOT');
            console.log('[TELEMETRY DEBUG] check#4 blocked unknown snapshot:', hasUnknownValidation);
            addCheck(
                unknownCase,
                'unknown short blocked with MQTT_UNKNOWN_SNAPSHOT',
                hasUnknownValidation,
                `validation events: ${validationEvents.map(e => e?.reason).filter(Boolean).join(', ') || '(none)'}`
            );

            const missingCase = createCase('missing_snapshot');
            console.log('[TELEMETRY DEBUG] Caso 3: missing snapshot_id y snapshot_short');
            const rawMissing = { ...baseRaw };
            const adaptedMissing = adaptMqttStepCapture(rawMissing);
            await pushMqttResultToSimulator(adaptedMissing);
            const hasMissingValidation = validationEvents.some(e => e?.reason === 'MQTT_MISSING_SNAPSHOT');
            console.log('[TELEMETRY DEBUG] check#5 missing snapshot blocked:', hasMissingValidation);
            addCheck(
                missingCase,
                'missing snapshot blocked with MQTT_MISSING_SNAPSHOT',
                hasMissingValidation,
                `validation events: ${validationEvents.map(e => e?.reason).filter(Boolean).join(', ') || '(none)'}`
            );

            const result = {
                ok: cases.every(c => c.ok),
                cases
            };
            printSummary(result);
            return result;
        } finally {
            if (typeof originalResolve === 'function') {
                window.resolveSnapshotByShort = originalResolve;
            }
            window.SimulatorAPI = originalSimulatorAPI;
        }
    }

    // DEBUG/DEV ONLY: Verifica separación de runs por ejecución real (event_counter) para un mismo snapshot_short.
    async function debugRunExecutionSplitTest(options = {}) {
        const snapshotShortRaw = Number(options.snapshot_short);
        const snapshotShort = Number.isFinite(snapshotShortRaw) ? (snapshotShortRaw & 0xFFFF) : null;
        const cases = [];

        function addCase(name, pass, detail = '') {
            const entry = { name, pass: Boolean(pass) };
            if (detail) entry.detail = detail;
            cases.push(entry);
            return entry;
        }

        function printSummary() {
            console.log('[TELEMETRY EXECUTION TEST] SUMMARY');
            cases.forEach((item) => {
                if (item.pass) {
                    console.log(`PASS ${item.name}`);
                } else {
                    console.log(`FAIL ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
                }
            });
        }

        if (!Number.isFinite(snapshotShort)) {
            addCase('snapshot_short exists in IndexedDB', false, 'snapshot_short inválido o ausente en options');
            printSummary();
            return {
                ok: false,
                firstRunId: null,
                secondRunId: null,
                cases
            };
        }

        if (typeof window.resolveSnapshotByShort !== 'function') {
            addCase('snapshot_short exists in IndexedDB', false, 'resolveSnapshotByShort no está disponible');
            printSummary();
            return {
                ok: false,
                firstRunId: null,
                secondRunId: null,
                cases
            };
        }

        const resolvedSnapshot = await window.resolveSnapshotByShort(snapshotShort).catch(() => null);
        const resolvedSnapshotId = resolvedSnapshot?.snapshot_id || resolvedSnapshot?.program_snapshot_id || null;
        if (!resolvedSnapshotId) {
            addCase('snapshot_short exists in IndexedDB', false, `snapshot_short=${snapshotShort} no encontrado`);
            printSummary();
            return {
                ok: false,
                firstRunId: null,
                secondRunId: null,
                cases
            };
        }

        addCase('snapshot_short exists in IndexedDB', true, `snapshot_id=${resolvedSnapshotId}`);

        const validationEvents = [];
        const runIdsByPayload = [];
        const isolatedActualResults = [];
        let activeRunId = null;

        const originalSimulatorAPI = window.SimulatorAPI;
        const patchedSimulatorAPI = {
            ...(originalSimulatorAPI || {})
        };

        const originalValidationHook = patchedSimulatorAPI.onMqttValidationFailure;
        patchedSimulatorAPI.onMqttValidationFailure = (event) => {
            validationEvents.push(event);
            if (typeof originalValidationHook === 'function') {
                originalValidationHook(event);
            }
        };

        patchedSimulatorAPI.setActiveMqttRunId = (runId) => {
            activeRunId = runId || null;
        };
        patchedSimulatorAPI.getActiveMqttRunId = () => activeRunId;
        patchedSimulatorAPI.getActualResults = () => isolatedActualResults;
        patchedSimulatorAPI.getPlannedSteps = () => null;
        patchedSimulatorAPI.compareSteps = () => [];
        patchedSimulatorAPI.renderComparisonTable = () => {};

        window.SimulatorAPI = patchedSimulatorAPI;

        const snapshotState = getSnapshotExecutionState(resolvedSnapshotId);
        snapshotState.last_event_counter = null;
        snapshotState.active_execution_id = null;
        snapshotState.active_run_id = null;
        snapshotState.has_events = false;

        const sequence = [
            { event_counter: 1, step_id: 0 },
            { event_counter: 2, step_id: 1 },
            { event_counter: 3, step_id: 2 },
            { event_counter: 1, step_id: 0 },
            { event_counter: 2, step_id: 1 },
            { event_counter: 3, step_id: 2 }
        ];

        try {
            for (let i = 0; i < sequence.length; i += 1) {
                const item = sequence[i];
                const payload = {
                    timestamp: new Date(Date.now() + i).toISOString(),
                    snapshot_short: snapshotShort,
                    step_id: item.step_id,
                    event_counter: item.event_counter,
                    tcp_position_mm: {
                        x: 100 + i,
                        y: 200 + i,
                        z: 300 + i
                    }
                };

                await debugIngestMqttPayload(payload);
                runIdsByPayload.push(activeRunId);
            }
        } finally {
            window.SimulatorAPI = originalSimulatorAPI;
        }

        const firstRunId = runIdsByPayload[0] || null;
        const secondRunId = runIdsByPayload[3] || null;

        const firstSequenceSameRun = Boolean(
            firstRunId
            && runIdsByPayload[0] === firstRunId
            && runIdsByPayload[1] === firstRunId
            && runIdsByPayload[2] === firstRunId
        );

        const secondSequenceSameRun = Boolean(
            secondRunId
            && runIdsByPayload[3] === secondRunId
            && runIdsByPayload[4] === secondRunId
            && runIdsByPayload[5] === secondRunId
        );

        const secondIsDifferent = Boolean(
            firstRunId
            && secondRunId
            && firstRunId !== secondRunId
        );

        const hasSnapshotBlock = validationEvents.some((event) => {
            const reason = event?.reason;
            return reason === 'MQTT_UNKNOWN_SNAPSHOT' || reason === 'MQTT_MISSING_SNAPSHOT';
        });

        addCase(
            'first execution uses one run',
            firstSequenceSameRun,
            `runs=[${runIdsByPayload.slice(0, 3).map(v => v || 'null').join(', ')}]`
        );
        addCase(
            'second execution uses one run',
            secondSequenceSameRun,
            `runs=[${runIdsByPayload.slice(3, 6).map(v => v || 'null').join(', ')}]`
        );
        addCase(
            'second execution creates a different run',
            secondIsDifferent,
            `firstRunId=${firstRunId || 'null'} secondRunId=${secondRunId || 'null'}`
        );
        addCase(
            'reset event_counter=1 detected as new execution',
            secondIsDifferent,
            `event_counter sequence=1,2,3,1,2,3`
        );
        addCase(
            'no block for known snapshot_short',
            !hasSnapshotBlock,
            `validationReasons=${validationEvents.map(v => v?.reason).filter(Boolean).join(', ') || '(none)'}`
        );

        const ok = cases.every(item => item.pass);
        printSummary();

        return {
            ok,
            firstRunId,
            secondRunId,
            cases
        };
    }

    window.TelemetryAPI = {
        connectMqttTelemetry,
        debugIngestMqttPayload,
        debugRunSnapshotShortManualTest,
        debugRunExecutionSplitTest
    };
})();
