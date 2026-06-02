(function () {
    async function runIdbSuite() {
        const test = window.IdbTests?.testIdbCleanupValidation;
        if (!test) {
            return { ok: false, name: 'IDB_SUITE', details: 'Test IDB no cargado', results: [] };
        }
        const result = await test();
        console.log('=== IDB TEST SUITE ===');
        console.table([{ test: result.name, status: result.ok ? 'PASS' : 'FAIL', details: JSON.stringify(result.details) }]);
        return { ok: result.ok, name: 'IDB_SUITE', details: result.details, results: [result] };
    }

    async function runComparisonSuite(options = {}) {
        const test = window.ComparisonTests?.testComparePersistedRun;
        if (!test) {
            return { ok: false, name: 'COMPARISON_SUITE', details: 'Test comparación no cargado', results: [] };
        }
        const runId = options.runId || 'run_mqtt_live';
        const isolated = options.isolated !== false;
        const result = await test(runId, { isolated });
        console.log('=== COMPARISON TEST SUITE ===');
        console.table([{ test: result.name, status: result.ok ? 'PASS' : 'FAIL', details: JSON.stringify(result.details) }]);
        return { ok: result.ok, name: 'COMPARISON_SUITE', details: result.details, results: [result] };
    }

    async function runAllSuites() {
        const mqtt = typeof window.runMqttSuite === 'function'
            ? await window.runMqttSuite()
            : { ok: false, name: 'MQTT_SUITE', details: 'No cargada', results: [] };
        const idb = await runIdbSuite();
        const comparison = await runComparisonSuite();

        const suites = [mqtt, idb, comparison];
        const passed = suites.filter((suite) => suite.ok).length;
        const total = suites.length;
        const ok = passed === total;

        console.log('=== TEST SUITES SUMMARY ===');
        console.table(suites.map((suite) => ({ suite: suite.name, status: suite.ok ? 'PASS' : 'FAIL', details: JSON.stringify(suite.details) })));
        console.log(`[TEST SUITES] ${ok ? 'PASS' : 'FAIL'} ${passed}/${total}`);

        return { ok, name: 'ALL_SUITES', details: { passed, total }, suites };
    }

    async function previewCleanup() {
        if (!window.TestCleanup?.previewTestArtifacts) {
            return { ok: false, name: 'PREVIEW_CLEANUP', details: 'TestCleanup.previewTestArtifacts no disponible' };
        }
        const preview = await window.TestCleanup.previewTestArtifacts();
        console.log('=== TEST ARTIFACTS PREVIEW ===');
        console.table([
            { type: 'runs', count: preview.totalRuns },
            { type: 'snapshots', count: preview.totalSnapshots }
        ]);
        return { ok: true, name: 'PREVIEW_CLEANUP', details: preview };
    }

    async function cleanupTestsDry() {
        if (!window.TestCleanup?.cleanupTestArtifacts) {
            return { ok: false, name: 'CLEANUP_TESTS_DRY', details: 'TestCleanup.cleanupTestArtifacts no disponible' };
        }
        const result = await window.TestCleanup.cleanupTestArtifacts({ dryRun: true });
        console.log('=== TEST CLEANUP DRY RUN ===');
        console.table([
            { metric: 'runs candidates', value: result.preview.totalRuns },
            { metric: 'snapshots candidates', value: result.preview.totalSnapshots }
        ]);
        return { ok: true, name: 'CLEANUP_TESTS_DRY', details: result };
    }

    async function cleanupTests() {
        if (!window.TestCleanup?.cleanupTestArtifacts) {
            return { ok: false, name: 'CLEANUP_TESTS', details: 'TestCleanup.cleanupTestArtifacts no disponible' };
        }
        const result = await window.TestCleanup.cleanupTestArtifacts({ dryRun: false });
        const ok = (result.runsDeleted + result.snapshotsDeleted) >= 0;
        console.log('=== TEST CLEANUP EXECUTION ===');
        console.table([
            { metric: 'runsDeleted', value: result.runsDeleted },
            { metric: 'snapshotsDeleted', value: result.snapshotsDeleted },
            { metric: 'skipped', value: Array.isArray(result.skipped) ? result.skipped.length : 0 }
        ]);
        return { ok, name: 'CLEANUP_TESTS', details: result };
    }

    window.TestSuite = window.TestSuite || {};
    window.TestSuite.runMqttSuite = window.runMqttSuite;
    window.TestSuite.runIdbSuite = runIdbSuite;
    window.TestSuite.runComparisonSuite = runComparisonSuite;
    window.TestSuite.runAllSuites = runAllSuites;
    window.TestSuite.previewCleanup = previewCleanup;
    window.TestSuite.cleanupTestsDry = cleanupTestsDry;
    window.TestSuite.cleanupTests = cleanupTests;
})();
