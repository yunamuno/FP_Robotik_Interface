(function () {
    async function testMqttMissingSnapshot() {
        const name = 'MQTT_MISSING_SNAPSHOT';
        try {
            const helpers = window.TestHelpers;
            if (!helpers) throw new Error('TestHelpers no disponible');

            const testProgram = helpers.createTestProgramName(name);
            const snapA = await helpers.createFakeSnapshot(helpers.createTestSnapshotId('known_snapshot'), testProgram);
            await helpers.createFakeRun('run_mqtt_live', snapA, testProgram);

            const before = await helpers.getRunSnapshot('run_mqtt_live');
            const warnings = helpers.captureWarnings();
            const ui = helpers.captureValidationFailures();

            try {
                await helpers.publishMqtt({
                    step_id: 1,
                    tcp_position_mm: { x: 120, y: 220, z: 320 },
                    timestamp: helpers.nowIso(),
                    program_name: testProgram
                });
                await helpers.delay(250);
            } finally {
                helpers.restoreHooks(warnings, ui);
            }

            const after = await helpers.getRunSnapshot('run_mqtt_live');
            const reasonHit = ui.events.some((event) => event?.reason === 'MQTT_MISSING_SNAPSHOT') ||
                warnings.messages.some((line) => line.includes('MQTT_MISSING_SNAPSHOT') || line.includes('sin snapshot_id'));
            const noContam = before === after;

            return {
                ok: Boolean(reasonHit && noContam),
                name,
                details: {
                    reasonHit,
                    noContam,
                    before,
                    after
                }
            };
        } catch (error) {
            return { ok: false, name, details: String(error?.message || error) };
        }
    }

    window.MqttTests = window.MqttTests || {};
    window.MqttTests.testMqttMissingSnapshot = testMqttMissingSnapshot;
})();
