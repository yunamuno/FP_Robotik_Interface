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
  const defaultSpeedInput = { value: '100' };
  const docElements = { defaultSpeed: defaultSpeedInput };

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
      getElementById(id) {
        return docElements[id] || null;
      }
    }
  };

  context.window = context;
  context.global = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function buildPalletProgram() {
  return [
    {
      id: 'case_verify_ids',
      type: 'palletize_block',
      pick_pose: { x: 500, y: 0, z: 314.41, rx: 0, ry: 180, rz: 0 },
      pallet_p1_pose: { x: 0, y: 300, z: 141.12, rx: 0, ry: 180, rz: 0 },
      pallet_p2: { x: 100, y: 300, z: 141.12 },
      pallet_p3: { x: 0, y: 400, z: 141.12 },
      rows: 2,
      cols: 2,
      layers: 1,
      layer_height: 60,
      pick_approach_height: 50,
      place_approach_height: 100,
      pick_wait_time: 0.1,
      place_wait_time: 0.1,
      grip_close_actions: [{ type: 'set_do_block', pin: 1, state: 1 }],
      grip_open_actions: [{ type: 'set_do_block', pin: 1, state: 0 }]
    }
  ];
}

function main() {
  const logEntries = [];
  const context = createRuntimeContext(logEntries);
  const projectRoot = path.resolve(__dirname, '..');

  loadIntoContext(context, path.join(projectRoot, 'js', 'config.js'));
  vm.runInContext('window.CONSTANTS = CONSTANTS;', context);
  loadIntoContext(context, path.join(projectRoot, 'js', 'tools.js'));
  loadIntoContext(context, path.join(projectRoot, 'js', 'compiler.js'));
  loadIntoContext(context, path.join(projectRoot, 'js', 'generators.js'));

  const compiler = context.window.CompilerAPI;
  if (!compiler || typeof compiler.compilePlanFromProgram !== 'function') {
    fail('CompilerAPI.compilePlanFromProgram no disponible');
  }
  if (typeof context.generateCodeForSelectedRobot !== 'function') {
    fail('generateCodeForSelectedRobot no disponible');
  }

  const program = buildPalletProgram();
  const compilation = compiler.compilePlanFromProgram(program);
  const plannedSteps = compilation?.plannedSteps;
  if (!Array.isArray(plannedSteps) || plannedSteps.length === 0) {
    fail('Compilación de plannedSteps inválida');
  }

  const expectedVerifyIds = [3, 7, 11, 15, 19, 23, 27, 31];
  const targetIds = plannedSteps
    .filter((step) => ['target_pick', 'target_place'].includes(step?.meta?.phase))
    .map((step) => step.step_id);
  if (JSON.stringify(targetIds) !== JSON.stringify(expectedVerifyIds)) {
    fail(`plannedSteps target ids incorrectos: ${JSON.stringify(targetIds)}`);
  }

  const code = context.generateCodeForSelectedRobot(
    context.CONSTANTS.ROBOTS.UR3E,
    program,
    context.CONSTANTS.MODES.INDUSTRIAL,
    {
      instrumentation: true,
      executionMode: 'flat',
      plannedSteps,
      contextSummary: compilation?.contextSummary || null,
      program_snapshot_id: 'snap_verify_targets'
    }
  );

  if (typeof code !== 'string' || !code.includes('step_end(pick_sid)  # target_pick') || !code.includes('step_end(place_sid)  # target_place')) {
    fail('El código UR instrumentado no contiene step_end en target_pick/target_place');
  }

  if (code.includes('step_end(io_pick_sid)') || code.includes('step_end(io_place_sid)')) {
    fail('El código UR instrumentado no debe insertar step_end para IO de paletizado');
  }

  if (!code.includes('pallet_target_pick_first = 3') || !code.includes('pallet_target_place_first = 7')) {
    fail('Las fórmulas de step_id para target pick/place no son correctas');
  }

  const verifyLog = logEntries.find((entry) => String(entry.args?.[0] || '').includes('[UR VERIFY] inserted step_end ids:'));
  if (!verifyLog) {
    fail('No se encontró log [UR VERIFY] inserted step_end ids');
  }

  const loggedIds = Array.isArray(verifyLog.args[1]) ? verifyLog.args[1] : null;
  if (!loggedIds || JSON.stringify(loggedIds) !== JSON.stringify(expectedVerifyIds)) {
    fail(`Ids instrumentados incorrectos: ${JSON.stringify(loggedIds)}`);
  }

  const targetLogs = logEntries.filter((entry) => String(entry.args?.[0] || '').includes('[UR VERIFY TARGETS]'));
  if (targetLogs.length !== expectedVerifyIds.length) {
    fail(`Se esperaban ${expectedVerifyIds.length} logs [UR VERIFY TARGETS], recibidos ${targetLogs.length}`);
  }

  pass('UR pallet instrumentation usa step_end solo en targets físicos esperados');
}

main();