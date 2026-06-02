(function () {
    async function testIdbCleanupValidation() {
        const name = 'IDB_CLEANUP_VALIDATION';
        try {
            if (typeof window.idbPreviewCleanupPlan !== 'function') {
                return { ok: false, name, details: 'window.idbPreviewCleanupPlan no disponible' };
            }

            const helpers = window.TestHelpers;
            let seeded = null;
            if (helpers) {
                const programName = helpers.createTestProgramName(name);
                const snapshotId = helpers.createTestSnapshotId(name);
                const runId = helpers.createTestRunId(name);
                await helpers.createFakeSnapshot(snapshotId, programName);
                await helpers.createFakeRun(runId, snapshotId, programName);
                seeded = { runId, snapshotId, programName };
            }

            const plan = await window.idbPreviewCleanupPlan({ keepRecentSnapshots: 10 });
            const ok = Boolean(plan && Array.isArray(plan.runsToDelete) && Array.isArray(plan.snapshotsToDelete));
            return {
                ok,
                name,
                details: ok
                    ? {
                        runsCandidates: plan.runsToDelete.length,
                        snapshotsCandidates: plan.snapshotsToDelete.length,
                        seededRunId: seeded?.runId || null,
                        seededSnapshotId: seeded?.snapshotId || null,
                        seededProgramName: seeded?.programName || null
                    }
                    : 'Plan inválido'
            };
        } catch (error) {
            return { ok: false, name, details: String(error?.message || error) };
        }
    }

    window.IdbTests = window.IdbTests || {};
    window.IdbTests.testIdbCleanupValidation = testIdbCleanupValidation;
})();
