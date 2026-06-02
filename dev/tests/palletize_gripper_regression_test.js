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

function createRuntimeContext() {
  const defaultSpeedInput = { value: '100' };
  const docElements = { defaultSpeed: defaultSpeedInput };

  const context = {
    console,
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

function buildPalletBlock(overrides = {}) {
  return {
    id: overrides.id || 'blk_pallet_regression',
    type: 'palletize_block',
    pick_pose: { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 },
    pallet_p1_pose: { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 },
    pallet_p2: { x: 100, y: 300, z: 0 },
    pallet_p3: { x: 0, y: 400, z: 0 },
    rows: 1,
    cols: 1,
    layers: 1,
    layer_height: 60,
    pick_approach_height: 50,
    place_approach_height: 50,
    pick_wait_time: 0.5,
    place_wait_time: 0.3,
    grip_close_actions: [],
    grip_open_actions: [],
    ...overrides
  };
}

function compilePlannedSteps(ctx, program) {
  const compiler = ctx.window.CompilerAPI;
  if (!compiler || typeof compiler.compilePlanFromProgram !== 'function') {
    fail('CompilerAPI.compilePlanFromProgram no disponible en contexto de test');
  }
  const result = compiler.compilePlanFromProgram(program);
  if (!result || !Array.isArray(result.plannedSteps)) {
    fail('Compilación de plannedSteps inválida para modo instrumentado');
  }
  return result.plannedSteps;
}

function generateUrCodes(ctx, program) {
  if (typeof ctx.generateCodeForSelectedRobot !== 'function') {
    fail('generateCodeForSelectedRobot no está disponible');
  }

  const robot = ctx.CONSTANTS.ROBOTS.UR3E;
  const mode = ctx.CONSTANTS.MODES.INDUSTRIAL;
  const plannedSteps = compilePlannedSteps(ctx, program);

  const industrial = ctx.generateCodeForSelectedRobot(robot, program, mode, {
    instrumentation: false,
    executionMode: 'flat'
  });

  const instrumented = ctx.generateCodeForSelectedRobot(robot, program, mode, {
    instrumentation: true,
    executionMode: 'planned',
    plannedSteps,
    programSnapshotId: 't_snap_pallet_gripper',
    snapshotShort: 12345
  });

  return { industrial, instrumented };
}

function assertInBoth(outputs, predicate, message) {
  const okIndustrial = predicate(outputs.industrial);
  const okInstrumented = predicate(outputs.instrumented);
  if (!okIndustrial || !okInstrumented) {
    fail(`${message} [industrial=${okIndustrial}, instrumented=${okInstrumented}]`);
  }
}

function run() {
  const rootDir = path.resolve(__dirname, '..', '..');
  const context = createRuntimeContext();

  loadIntoContext(context, path.join(rootDir, 'js', 'config.js'));
  vm.runInContext('window.CONSTANTS = CONSTANTS;', context);
  loadIntoContext(context, path.join(rootDir, 'js', 'tools.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'compiler.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'generators.js'));

  const caseAProgram = [buildPalletBlock({ id: 'case_a_no_gripper' })];
  const caseAOutputs = generateUrCodes(context, caseAProgram);

  assertInBoth(
    caseAOutputs,
    (code) => !code.includes('set_standard_digital_out('),
    'Caso A no debe generar set_standard_digital_out'
  );
  assertInBoth(
    caseAOutputs,
    (code) => !code.includes('sleep(0.5)') && !code.includes('sleep(0.3)'),
    'Caso A no debe generar sleep asociado a pinza'
  );
  assertInBoth(
    caseAOutputs,
    (code) => !code.includes('# PICK: Cerrar pinza'),
    'Caso A no debe generar comentario PICK cerrar pinza'
  );
  assertInBoth(
    caseAOutputs,
    (code) => !code.includes('# PLACE: Abrir pinza'),
    'Caso A no debe generar comentario PLACE abrir pinza'
  );
  assertInBoth(
    caseAOutputs,
    (code) => code.includes('#   Gripper: NONE'),
    'Caso A debe etiquetar Gripper: NONE'
  );

  const caseBProgram = [
    buildPalletBlock({
      id: 'case_b_digital_do1',
      pick_wait_time: 0.5,
      place_wait_time: 0.3,
      grip_close_actions: [{ type: 'set_do_block', pin: 1, state: 1 }],
      grip_open_actions: [{ type: 'set_do_block', pin: 1, state: 0 }]
    })
  ];
  const caseBOutputs = generateUrCodes(context, caseBProgram);

  assertInBoth(
    caseBOutputs,
    (code) => code.includes('set_standard_digital_out(1, True)'),
    'Caso B debe generar cierre digital DO1'
  );
  assertInBoth(
    caseBOutputs,
    (code) => code.includes('set_standard_digital_out(1, False)'),
    'Caso B debe generar apertura digital DO1'
  );
  assertInBoth(
    caseBOutputs,
    (code) => code.includes('sleep(0.5)'),
    'Caso B debe generar wait de cierre'
  );
  assertInBoth(
    caseBOutputs,
    (code) => code.includes('sleep(0.3)'),
    'Caso B debe generar wait de apertura'
  );
  assertInBoth(
    caseBOutputs,
    (code) => code.includes('#   Gripper: digital output DO1'),
    'Caso B debe etiquetar pinza digital DO1'
  );

  const caseCProgram = [
    {
      id: 'case_c_set_tool_rg2',
      type: 'set_tool',
      tool_id: 'onrobot_rg2_urcap'
    },
    buildPalletBlock({
      id: 'case_c_rg2_urcap',
      grip_close_actions: [{ type: 'rg2_grip_set', width_mm: 50, force: 40, wait_s: 0.25 }],
      grip_open_actions: [{ type: 'rg2_grip_set', width_mm: 110, force: 10, wait_s: 0.15 }]
    })
  ];
  const caseCOutputs = generateUrCodes(context, caseCProgram);

  assertInBoth(
    caseCOutputs,
    (code) => !code.includes('set_standard_digital_out(1, True)'),
    'Caso C no debe forzar DO1 True por defecto'
  );
  assertInBoth(
    caseCOutputs,
    (code) => !code.includes('set_standard_digital_out(1, False)'),
    'Caso C no debe forzar DO1 False por defecto'
  );
  assertInBoth(
    caseCOutputs,
    (code) => code.includes('rg_grip('),
    'Caso C debe generar llamada RG2/URCap'
  );
  assertInBoth(
    caseCOutputs,
    (code) => code.includes('sleep(0.25)'),
    'Caso C debe conservar wait de cierre RG2'
  );
  assertInBoth(
    caseCOutputs,
    (code) => code.includes('sleep(0.15)'),
    'Caso C debe conservar wait de apertura RG2'
  );
  assertInBoth(
    caseCOutputs,
    (code) => code.includes('#   Gripper: RG2/URCap'),
    'Caso C debe etiquetar Gripper RG2/URCap'
  );

  pass('Regresión palletize_block pinza: casos A/B/C OK en UR industrial + instrumentada');
}

run();