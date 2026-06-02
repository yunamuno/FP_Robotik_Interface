(function () {
    async function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve(src);
            script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
            document.body.appendChild(script);
        });
    }

    async function bootstrapTests() {
        const isDebug = localStorage.getItem('fp_debug') === 'true';
        if (!isDebug) return;

        const scripts = [
            'tests/utils/test_helpers.js',
            'tests/utils/test_cleanup.js',
            'tests/mqtt/test_mqtt_unknown_snapshot.js',
            'tests/mqtt/test_mqtt_other_program.js',
            'tests/mqtt/test_mqtt_missing_snapshot.js',
            'tests/mqtt/test_mqtt_suite.js',
            'tests/idb/test_cleanup_validation.js',
            'tests/comparison/test_compare_persisted_run.js',
            'tests/test_suite.js'
        ];

        for (const src of scripts) {
            await loadScript(src);
        }

        console.log('[tests] bootstrap cargado. Usa: await TestSuite.runMqttSuite()');
    }

    bootstrapTests().catch((error) => {
        console.warn('[tests] bootstrap error:', error);
    });
})();
