(function () {
    async function testMqttUnknownSnapshot() {
        const name = 'MQTT_UNKNOWN_SNAPSHOT';
        try {
            const helpers = window.TestHelpers;
            if (!helpers) throw new Error('TestHelpers no disponible');

            const testProgram = helpers.createTestProgramName(name);
            const snapKnown = helpers.createTestSnapshotId('known_snapshot');
            await helpers.createFakeSnapshot(snapKnown, testProgram);
            const knownRunId = 'run_mqtt_' + snapKnown.slice(0, 16);
            await helpers.createFakeRun(knownRunId, snapKnown, testProgram);

            const warnings = helpers.captureWarnings();
            const ui = helpers.captureValidationFailures();

            // snapshot_id que NO existe en IDB → debe ser bloqueado
            const unknownSnapId = helpers.createTestSnapshotId('missing_snapshot');

            try {
                await helpers.publishMqtt({
                    step_id: 1,
                    tcp_position_mm: { x: 100, y: 200, z: 300 },
                    timestamp: helpers.nowIso(),
                    program_name: testProgram,
                    snapshot_id: unknownSnapId
                });
                await helpers.delay(250);
            } finally {
                helpers.restoreHooks(warnings, ui);
            }

            // El run del snapshot conocido NO debe haber recibido steps
            const knownRunAfter = await window.getRun(knownRunId);
            const knownRunStepCount = Object.keys(knownRunAfter?.resultsByStep || {}).length;

            // No debe haberse creado un run para el snapshot desconocido
            const unknownRunId = 'run_mqtt_' + unknownSnapId.slice(0, 16);
            const unknownRunAfter = await window.getRun(unknownRunId);

            const reasonHit = ui.events.some((e) => e?.reason === 'MQTT_UNKNOWN_SNAPSHOT') ||
                warnings.messages.some((line) =>
                    line.includes('MQTT_UNKNOWN_SNAPSHOT') || line.includes('snapshot_id desconocido')
                );
            const noNewRun = !unknownRunAfter;
            const noContam = knownRunStepCount === 0;

            return {
                ok: Boolean(reasonHit && noNewRun && noContam),
                name,
                details: {
                    reasonHit,
                    noNewRun,
                    noContam,
                    knownRunStepCount,
                    unknownRunCreated: !!unknownRunAfter
                }
            };
        } catch (error) {
            return { ok: false, name, details: String(error?.message || error) };
        }
    }

    window.MqttTests = window.MqttTests || {};
    window.MqttTests.testMqttUnknownSnapshot = testMqttUnknownSnapshot;
})();
