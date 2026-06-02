const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function loadIntoContext(context, filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, context, { filename: filePath });
}

function createRuntimeContext(logEntries) {
  const runs = new Map();
  const snapshots = new Map([
    ['snap_test_mqtt_step', {
      snapshot_id: 'snap_test_mqtt_step',
      snapshot_short: 5846,
      program_name: 'Programa MQTT Test'
    }]
  ]);
  const actualResults = [];

  const capture = (level) => (...args) => {
    logEntries.push({ level, args });
  };

  const context = {
    console: {
      log: capture('log'),
      debug: capture('debug'),
      warn: capture('warn'),
      error: capture('error')
    },
    Math,
    JSON,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    localStorage: {
      _data: {},
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
      },
      setItem(key, value) {
        this._data[key] = String(value);
      },
      removeItem(key) {
        delete this._data[key];
      }
    },
    document: {
      getElementById() {
        return null;
      }
    },
    __runs: runs,
    __snapshots: snapshots,
    __actualResults: actualResults
  };

  context.window = context;
  context.global = context;
  context.globalThis = context;

  context.getSnapshot = async (snapshotId) => snapshots.get(snapshotId) || null;
  context.resolveSnapshotByShort = async (snapshotShort) => {
    return Array.from(snapshots.values()).find((snapshot) => Number(snapshot.snapshot_short) === Number(snapshotShort)) || null;
  };
  context.saveRun = async (run) => {
    runs.set(run.run_id, JSON.parse(JSON.stringify(run)));
    return run.run_id;
  };
  context.getRun = async (runId) => {
    const run = runs.get(runId);
    return run ? JSON.parse(JSON.stringify(run)) : null;
  };
  context.upsertRunStepResult = async (runId, result) => {
    const run = runs.get(runId);
    if (!run) throw new Error(`Run no encontrado: ${runId}`);
    run.resultsByStep = run.resultsByStep || {};
    run.resultsByStep[String(result.step_id)] = JSON.parse(JSON.stringify(result));
    runs.set(runId, run);
    return run;
  };
  context.SimulatorAPI = {
    getProgramSnapshotId: () => 'snap_test_mqtt_step',
    setActiveMqttRunId(runId) {
      context.__activeRunId = runId;
    },
    getActualResults: () => actualResults,
    getPlannedSteps: () => [{ step_id: 31 }],
    compareSteps: () => [],
    renderComparisonTable: () => {},
    onMqttValidationFailure: () => {}
  };

  return vm.createContext(context);
}

async function main() {
  const logEntries = [];
  const context = createRuntimeContext(logEntries);
  const projectRoot = path.resolve(__dirname, '..');

  loadIntoContext(context, path.join(projectRoot, 'js', 'telemetry.js'));

  if (!context.window.TelemetryAPI || typeof context.window.TelemetryAPI.debugIngestMqttPayload !== 'function') {
    fail('TelemetryAPI.debugIngestMqttPayload no disponible');
  }

  const payload = {
    message_type: 'step_capture',
    schema_version: 'step_capture_socket_clean_v8_counted_cycles',
    snapshot_id: 'snap_test_mqtt_step',
    snapshot_short: 5846,
    step_id: 31,
    event_counter: 1,
    event_type: 'work_step',
    step_type: 'work_step',
    step_role: 'pick',
    timestamp: '2026-05-25T10:20:30.000Z',
    tcp_position_mm: { x: 100, y: 200, z: 300 },
    source: 'mqtt'
  };

  await context.window.TelemetryAPI.debugIngestMqttPayload(payload);

  const runId = context.__activeRunId;
  if (!runId) {
    fail('No se activó ningún run MQTT');
  }

  const persistedRun = await context.getRun(runId);
  if (!persistedRun) {
    fail('No se persistió el run MQTT');
  }

  const result = persistedRun.resultsByStep?.['31'];
  if (!result) {
    fail(`resultsByStep no contiene la clave '31': ${JSON.stringify(Object.keys(persistedRun.resultsByStep || {}))}`);
  }

  if (result.step_id !== 31) {
    fail(`step_id persistido incorrecto: ${result.step_id}`);
  }

  if (result.raw_step_id !== 31) {
    fail(`raw_step_id persistido incorrecto: ${result.raw_step_id}`);
  }

  if (result.meta?.raw_step_id !== 31 || result.meta?.stored_step_id !== 31) {
    fail(`meta raw/stored step ids incorrectos: ${JSON.stringify(result.meta || {})}`);
  }

  const mqttStepIdLog = logEntries.find((entry) => String(entry.args?.[0] || '').includes('[MQTT STEP ID]'));
  if (!mqttStepIdLog) {
    fail('No se encontró log [MQTT STEP ID]');
  }

  const payloadLog = mqttStepIdLog.args[1] || {};
  if (payloadLog.raw_step_id !== 31 || payloadLog.stored_step_id !== 31) {
    fail(`Log [MQTT STEP ID] incorrecto: ${JSON.stringify(payloadLog)}`);
  }

  pass('Telemetry MQTT conserva raw step_id sin remapeo legacy por defecto');
}

main().catch((error) => {
  fail(error?.stack || error?.message || String(error));
});