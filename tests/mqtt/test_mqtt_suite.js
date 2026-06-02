(function () {
    async function runMqttSuite(options = {}) {
        const tests = window.MqttTests || {};
        const includeMissingSnapshot = options.includeMissingSnapshot !== false;
        const queue = [
            tests.testMqttUnknownSnapshot,
            tests.testMqttOtherProgram,
            includeMissingSnapshot ? tests.testMqttMissingSnapshot : null
        ].filter(Boolean);

        const results = [];
        for (const runTest of queue) {
            try {
                const result = await runTest();
                results.push(result);
            } catch (error) {
                results.push({
                    ok: false,
                    name: runTest?.name || 'UNKNOWN_TEST',
                    details: String(error?.message || error)
                });
            }
        }

        const table = results.map((result) => ({
            test: result.name,
            status: result.ok ? 'PASS' : 'FAIL',
            details: typeof result.details === 'string' ? result.details : JSON.stringify(result.details)
        }));

        console.log('=== MQTT TEST SUITE ===');
        console.table(table);

        const passed = results.filter((result) => result.ok).length;
        const total = results.length;
        const ok = passed === total;
        console.log(`[MQTT SUITE] ${ok ? 'PASS' : 'FAIL'} ${passed}/${total}`);

        return { ok, name: 'MQTT_SUITE', details: { passed, total }, results };
    }

    window.runMqttSuite = runMqttSuite;
})();
