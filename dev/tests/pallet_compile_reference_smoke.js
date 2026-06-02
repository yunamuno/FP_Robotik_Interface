const path = require('path');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✓ ${message}`);
}

global.window = global.window || {};
global.localStorage = global.localStorage || {
  getItem: () => 'false',
  setItem: () => {},
  removeItem: () => {}
};

const compilerPath = path.resolve(__dirname, '../../js/compiler.js');
require(compilerPath);

if (!global.window.CompilerAPI || typeof global.window.CompilerAPI.compilePlanFromProgram !== 'function') {
  fail('CompilerAPI.compilePlanFromProgram no está disponible');
}

const originalWarn = console.warn;
const originalLog = console.log;
const warnLogs = [];
const infoLogs = [];

console.warn = (...args) => {
  const line = args.map(String).join(' ');
  warnLogs.push(line);
  originalWarn.apply(console, args);
};

console.log = (...args) => {
  const line = args.map(String).join(' ');
  infoLogs.push(line);
  originalLog.apply(console, args);
};

const program = [
  {
    id: 'blk_pallet_before_defs',
    type: 'palletize_block',
    pick_pose: { type: 'pose', name: 'PICK_A' },
    pallet_p1_pose: { type: 'pose', name: 'P1_POSE' },
    pallet_p2: { type: 'point', name: 'P2_POINT' },
    pallet_p3: { type: 'point', name: 'P3_POINT' },
    rows: 1,
    cols: 1,
    layers: 1,
    layer_height: 50,
    pick_approach_height: 40,
    place_approach_height: 40,
    pick_wait_time: 0.1,
    place_wait_time: 0.1
  },
  {
    id: 'blk_pick_def',
    type: 'define_pose',
    name: 'PICK_A',
    x: 111,
    y: 222,
    z: 333,
    rx: 0.11,
    ry: 3.14,
    rz: -0.22
  },
  {
    id: 'blk_p1_def',
    type: 'define_pose',
    name: 'P1_POSE',
    x: 400,
    y: 500,
    z: 600,
    rx: 0,
    ry: 3.14159,
    rz: 0
  },
  {
    id: 'blk_p2_def',
    type: 'define_point',
    name: 'P2_POINT',
    x: 500,
    y: 500,
    z: 600
  },
  {
    id: 'blk_p3_def',
    type: 'define_point',
    name: 'P3_POINT',
    x: 400,
    y: 600,
    z: 600
  }
];

let result;
try {
  result = global.window.CompilerAPI.compilePlanFromProgram(program);
} catch (error) {
  console.warn = originalWarn;
  console.log = originalLog;
  fail(`compilePlanFromProgram lanzó error: ${error.message}`);
}

console.warn = originalWarn;
console.log = originalLog;

if (!result || !Array.isArray(result.plannedSteps)) {
  fail('Resultado inválido de compilación');
}

if (result.plannedSteps.length === 0) {
  fail('No se generaron plannedSteps para palletize_block');
}

const hasFallbackWarn = warnLogs.some(line => line.includes('[PALLET FALLBACK]'));
if (hasFallbackWarn) {
  fail('Se detectó fallback en compilación de paletizado');
}

const hasInputLog = infoLogs.some(line => line.includes('[PALLET COMPILE INPUT]'));
const hasResolvedLog = infoLogs.some(line => line.includes('[PALLET COMPILE RESOLVED]'));
if (!hasInputLog || !hasResolvedLog) {
  fail('Faltan logs de auditoría de compilación de paletizado');
}

const pickTarget = result.plannedSteps.find((step) => step?.meta?.phase === 'target_pick');
if (!pickTarget || !pickTarget.target_pose) {
  fail('No se encontró step target_pick');
}

const pick = pickTarget.target_pose;
if (pick.x !== 111 || pick.y !== 222 || pick.z !== 333) {
  fail(`Pick resuelto incorrectamente: (${pick.x}, ${pick.y}, ${pick.z})`);
}

pass('Pallet compile resuelve referencias por nombre sin fallback');
pass(`plannedSteps generados: ${result.plannedSteps.length}`);
