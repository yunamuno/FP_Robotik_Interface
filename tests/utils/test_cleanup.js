(function () {
    const TEST_ID_PREFIXES = ['t_', 'test_', 'tmp_test_'];
    const TEST_PROGRAM_PREFIXES = ['TEST_', 'TMP_TEST_'];

    function startsWithAny(value, prefixes) {
        const text = String(value || '').trim();
        if (!text) return false;
        return prefixes.some((prefix) => text.startsWith(prefix));
    }

    function isTestId(value) {
        return startsWithAny(value, TEST_ID_PREFIXES);
    }

    function isTestProgramName(value) {
        return startsWithAny(value, TEST_PROGRAM_PREFIXES);
    }

    function buildCandidateDescriptor(kind, item, keyField, nameField) {
        const idValue = String(item?.[keyField] || '').trim();
        const programName = String(item?.[nameField] || item?.meta?.program_name || '').trim();

        const reasons = [];
        if (isTestId(idValue)) reasons.push('id_prefix');
        if (isTestProgramName(programName)) reasons.push('program_name_prefix');

        if (reasons.length === 0) return null;

        return {
            kind,
            id: idValue,
            program_name: programName || null,
            reasons
        };
    }

    async function previewTestArtifacts() {
        const runs = typeof window.listRuns === 'function' ? await window.listRuns() : [];
        const snapshots = typeof window.listSnapshots === 'function' ? await window.listSnapshots() : [];

        const runCandidates = (Array.isArray(runs) ? runs : [])
            .map((run) => buildCandidateDescriptor('run', run, 'run_id', 'program_name'))
            .filter(Boolean);

        const snapshotCandidates = (Array.isArray(snapshots) ? snapshots : [])
            .map((snapshot) => buildCandidateDescriptor('snapshot', snapshot, 'snapshot_id', 'program_name'))
            .filter(Boolean);

        return {
            runs: runCandidates,
            snapshots: snapshotCandidates,
            totalRuns: runCandidates.length,
            totalSnapshots: snapshotCandidates.length
        };
    }

    async function deleteByIds(storeName, ids) {
        const db = await window.idbInit?.();
        if (!db) {
            throw new Error('window.idbInit no disponible para cleanup de tests');
        }

        if (!Array.isArray(ids) || ids.length === 0) {
            return { deleted: 0, skipped: [] };
        }

        const skipped = [];

        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            for (const id of ids) {
                try {
                    store.delete(id);
                } catch (error) {
                    skipped.push({ store: storeName, id, error: String(error?.message || error) });
                }
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error(`Error eliminando en store ${storeName}`));
            tx.onabort = () => reject(tx.error || new Error(`Transacción abortada en store ${storeName}`));
        });

        return {
            deleted: ids.length - skipped.length,
            skipped
        };
    }

    async function cleanupTestArtifacts({ dryRun = true } = {}) {
        const preview = await previewTestArtifacts();

        if (dryRun) {
            return {
                dryRun: true,
                runsDeleted: 0,
                snapshotsDeleted: 0,
                skipped: [],
                preview
            };
        }

        const runIds = preview.runs
            .map((run) => run.id)
            .filter((id) => isTestId(id));

        const snapshotIds = preview.snapshots
            .map((snapshot) => snapshot.id)
            .filter((id) => isTestId(id));

        const runDeletion = await deleteByIds('runs', runIds);
        const snapshotDeletion = await deleteByIds('snapshots', snapshotIds);

        const skipped = [
            ...runDeletion.skipped,
            ...snapshotDeletion.skipped,
            ...preview.runs
                .filter((run) => !isTestId(run.id) && run.reasons.includes('program_name_prefix'))
                .map((run) => ({
                    store: 'runs',
                    id: run.id,
                    reason: 'program_name_prefix_only_not_deleted'
                })),
            ...preview.snapshots
                .filter((snapshot) => !isTestId(snapshot.id) && snapshot.reasons.includes('program_name_prefix'))
                .map((snapshot) => ({
                    store: 'snapshots',
                    id: snapshot.id,
                    reason: 'program_name_prefix_only_not_deleted'
                }))
        ];

        return {
            dryRun: false,
            runsDeleted: runDeletion.deleted,
            snapshotsDeleted: snapshotDeletion.deleted,
            skipped,
            preview
        };
    }

    window.TestCleanup = {
        isTestId,
        previewTestArtifacts,
        cleanupTestArtifacts
    };
})();
