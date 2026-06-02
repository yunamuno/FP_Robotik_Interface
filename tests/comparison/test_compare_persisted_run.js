(function () {
    async function ensureTestRunForComparison(testName) {
        const helpers = window.TestHelpers;
        if (!helpers) {
            throw new Error('TestHelpers no disponible para modo aislado de comparación');
        }

        const programName = helpers.createTestProgramName(testName);
        const snapshotId = helpers.createTestSnapshotId(testName);
        const runId = helpers.createTestRunId(testName);

        await helpers.createFakeSnapshot(snapshotId, programName);
        await helpers.createFakeRun(runId, snapshotId, programName);

        return { runId, snapshotId, programName };
    }

    async function testComparePersistedRun(runId = 'run_mqtt_live', options = {}) {
        const name = 'COMPARE_PERSISTED_RUN';
        try {
            if (typeof window.SimulatorAPI?.comparePersistedRun !== 'function') {
                return { ok: false, name, details: 'SimulatorAPI.comparePersistedRun no disponible' };
            }

            let targetRunId = runId;
            let seeded = null;
            const isolated = Boolean(options?.isolated);
            if (isolated) {
                seeded = await ensureTestRunForComparison(name);
                targetRunId = seeded.runId;
            }

            const result = await window.SimulatorAPI.comparePersistedRun(targetRunId);
            const ok = Boolean(result?.run && Array.isArray(result?.comparison));
            return {
                ok,
                name,
                details: ok
                    ? {
                        runId: result.run?.run_id,
                        comparedSteps: result.comparison.length,
                        isolated,
                        seededRunId: seeded?.runId || null,
                        seededSnapshotId: seeded?.snapshotId || null,
                        seededProgramName: seeded?.programName || null
                    }
                    : 'Resultado inválido'
            };
        } catch (error) {
            return { ok: false, name, details: String(error?.message || error) };
        }
    }

    window.ComparisonTests = window.ComparisonTests || {};
    window.ComparisonTests.testComparePersistedRun = testComparePersistedRun;
})();
