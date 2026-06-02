(function () {
    async function testMqttOtherProgram() {
        const name = 'MQTT_OTHER_PROGRAM';
        try {
            const helpers = window.TestHelpers;
            if (!helpers) throw new Error('TestHelpers no disponible');

            const programA = helpers.createTestProgramName('mqtt_other_program_a');
            const programB = helpers.createTestProgramName('mqtt_other_program_b');
            const snapA = helpers.createTestSnapshotId('program_a');
            const snapB = helpers.createTestSnapshotId('program_b');
            // Ambos snapshots deben existir en IDB para que el mensaje sea aceptado
            await helpers.createFakeSnapshot(snapA, programA);
            await helpers.createFakeSnapshot(snapB, programB);
            // Crear run para snapA (simula programa abierto en UI)
            await helpers.createFakeRun(
                'run_mqtt_' + snapA.slice(0, 16),
                snapA,
                programA
            );

            const warnings = helpers.captureWarnings();
            const ui = helpers.captureValidationFailures();

            try {
                // Enviar MQTT con snapB mientras el programa abierto es snapA
                await helpers.publishMqtt({
                    step_id: 1,
                    tcp_position_mm: { x: 110, y: 210, z: 310 },
                    timestamp: helpers.nowIso(),
                    program_name: programB,
                    snapshot_id: snapB
                });
                await helpers.delay(350);
            } finally {
                helpers.restoreHooks(warnings, ui);
            }

            // v2: MQTT_OTHER_PROGRAM es warning (no bloqueo)
            // El mensaje debe aceptarse: se crea run para snapB
            const warningHit = ui.events.some((e) =>
                e?.reason === 'MQTT_OTHER_PROGRAM_WARNING' || e?.reason === 'MQTT_OTHER_PROGRAM'
            ) || warnings.messages.some((line) =>
                line.includes('MQTT_OTHER_PROGRAM') || line.includes('otro programa') || line.includes('aceptada')
            );

            // El run del snapA NO debe estar contaminado con steps de snapB
            const runA = await window.getRun('run_mqtt_' + snapA.slice(0, 16));
            const runASteps = Object.keys(runA?.resultsByStep || {});
            const runAUncontaminated = runASteps.length === 0;

            // El run del snapB debe haber sido creado (accepted)
            const runB = await window.getRun('run_mqtt_' + snapB.slice(0, 16));
            const runBCreated = !!runB;

            return {
                ok: Boolean(warningHit && runAUncontaminated && runBCreated),
                name,
                details: {
                    warningHit,
                    runAUncontaminated,
                    runBCreated,
                    runAStepCount: runASteps.length,
                    runBStepCount: Object.keys(runB?.resultsByStep || {}).length
                }
            };
        } catch (error) {
            return { ok: false, name, details: String(error?.message || error) };
        }
    }

    window.MqttTests = window.MqttTests || {};
    window.MqttTests.testMqttOtherProgram = testMqttOtherProgram;
})();
