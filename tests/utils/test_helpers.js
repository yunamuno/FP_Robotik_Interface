(function () {
    const DEFAULT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
    const DEFAULT_TOPIC = 'salesianos/robot/iban/step_capture';

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function uid(prefix = 't') {
        const rand = Math.random().toString(36).slice(2, 8);
        return `${prefix}_${Date.now()}_${rand}`;
    }

    function sanitizeSegment(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function createTestSnapshotId(name = '') {
        const segment = sanitizeSegment(name);
        return segment ? `t_snap_${segment}_${uid('id')}` : `t_snap_${uid('id')}`;
    }

    function createTestRunId(name = '') {
        const segment = sanitizeSegment(name);
        return segment ? `t_run_${segment}_${uid('id')}` : `t_run_${uid('id')}`;
    }

    function createTestProgramName(name = '') {
        const segment = sanitizeSegment(name).toUpperCase();
        return segment ? `TEST_${segment}` : 'TEST_GENERIC';
    }

    function nowIso() {
        return new Date().toISOString();
    }

    async function publishMqtt(payload, options = {}) {
        const brokerUrl = options.brokerUrl || DEFAULT_BROKER_URL;
        const topic = options.topic || DEFAULT_TOPIC;
        const settleMs = Number.isFinite(options.settleMs) ? options.settleMs : 400;

        if (!window.mqtt?.connect) {
            throw new Error('mqtt.js no disponible en window.mqtt');
        }

        const client = window.mqtt.connect(brokerUrl, { clean: true, reconnectPeriod: 0 });

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error('Timeout conectando MQTT')), 5000);
            client.on('connect', () => {
                clearTimeout(timeoutId);
                resolve();
            });
            client.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });

        await new Promise((resolve, reject) => {
            client.publish(topic, JSON.stringify(payload), {}, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        await delay(settleMs);
        client.end(true);
    }

    async function getRunSnapshot(runId = 'run_mqtt_live') {
        if (typeof window.getRun !== 'function') {
            throw new Error('window.getRun no disponible');
        }
        const run = await window.getRun(runId);
        return run?.snapshot_id || run?.program_snapshot_id || null;
    }

    async function createFakeSnapshot(snapshotId, programName = 'TEST_GENERIC') {
        if (typeof window.saveSnapshot !== 'function') {
            throw new Error('window.saveSnapshot no disponible');
        }
        const id = snapshotId || createTestSnapshotId();
        await window.saveSnapshot({
            snapshot_id: id,
            created_at: Date.now(),
            plannedSteps: [
                { step_id: 1, target_pose: { x: 0, y: 0, z: 0 }, meta: {} }
            ],
            meta: { program_name: programName }
        });
        return id;
    }

    async function createFakeRun(runId = 'run_mqtt_live', snapshotId = null, programName = 'TEST_MQTT_TEST_RUN') {
        if (typeof window.saveRun !== 'function') {
            throw new Error('window.saveRun no disponible');
        }
        await window.saveRun({
            run_id: runId,
            snapshot_id: snapshotId,
            program_name: programName,
            source: 'mqtt',
            started_at: Date.now(),
            ended_at: null,
            status: 'running',
            resultsByStep: {},
            meta: { program_name: programName }
        });
        return runId;
    }

    function captureWarnings() {
        const messages = [];
        const originalWarn = console.warn;
        console.warn = (...args) => {
            messages.push(args.map((arg) => String(arg)).join(' '));
            originalWarn.apply(console, args);
        };
        return {
            messages,
            restore() {
                console.warn = originalWarn;
            }
        };
    }

    function captureValidationFailures() {
        const events = [];
        const originalHook = window.SimulatorAPI?.onMqttValidationFailure;
        if (window.SimulatorAPI) {
            window.SimulatorAPI.onMqttValidationFailure = async (payload) => {
                events.push(payload);
                if (typeof originalHook === 'function') {
                    try {
                        await originalHook(payload);
                    } catch (error) {
                        console.warn('[tests] error en hook original onMqttValidationFailure:', error);
                    }
                }
            };
        }
        return {
            events,
            restore() {
                if (window.SimulatorAPI) {
                    window.SimulatorAPI.onMqttValidationFailure = originalHook;
                }
            }
        };
    }

    function restoreHooks(...hookHandles) {
        for (const handle of hookHandles) {
            if (handle && typeof handle.restore === 'function') {
                try {
                    handle.restore();
                } catch (error) {
                    console.warn('[tests] error restaurando hook:', error);
                }
            }
        }
    }

    window.TestHelpers = {
        delay,
        uid,
        createTestSnapshotId,
        createTestRunId,
        createTestProgramName,
        nowIso,
        publishMqtt,
        getRunSnapshot,
        createFakeSnapshot,
        createFakeRun,
        captureWarnings,
        captureValidationFailures,
        restoreHooks
    };
})();
