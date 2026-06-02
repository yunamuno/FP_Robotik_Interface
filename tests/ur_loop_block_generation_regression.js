/*
  REGRESSION TEST: UR loop_block generation + plannedSteps expansion

  Validates:
  - Industrial URScript emits a counter while-loop for loop_block/repeat_block
  - Loop body is present inside the while block
  - Body is not flattened via instr.next duplication
  - Planned mode expands body count times (for verification/step_end)
*/

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
      getItem(key) {
        if (key === 'fp_debug') return 'false';
        return null;
      },
      setItem() {},
      removeItem() {}
    },
    document: {
      getElementById() {
        return { value: '100' };
      }
    }
  };

  context.window = context;
  context.global = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function countMatches(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function run() {
  const rootDir = path.resolve(__dirname, '..');
  const context = createRuntimeContext();

  loadIntoContext(context, path.join(rootDir, 'js', 'config.js'));
  vm.runInContext('window.CONSTANTS = CONSTANTS;', context);
  loadIntoContext(context, path.join(rootDir, 'js', 'tools.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'compiler.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'generators.js'));

  if (!context.window.CompilerAPI || typeof context.window.CompilerAPI.compilePlanFromProgram !== 'function') {
    fail('CompilerAPI.compilePlanFromProgram no disponible');
  }
  if (typeof context.generateCodeForSelectedRobot !== 'function') {
    fail('generateCodeForSelectedRobot no disponible');
  }

  const program = [{
    type: 'loop_block',
    count: 5,
    do: [
      {
        type: 'move_block',
        x: -120,
        y: 80,
        z: 200,
        sourceName: 'pick',
        sourceType: 'pose',
        rx: 180,
        ry: 0,
        rz: 0,
        speed: 50,
        zone: 'fine'
      },
      {
        type: 'move_linear_block',
        x: 220,
        y: -40,
        z: 180,
        sourceName: 'place',
        sourceType: 'pose',
        rx: 180,
        ry: 0,
        rz: 0,
        speed: 50,
        zone: 'fine'
      }
    ]
  }];

  // A) UR industrial mode should emit real loop with counter
  const industrial = context.generateCodeForSelectedRobot(
    context.CONSTANTS.ROBOTS.UR3E,
    program,
    context.CONSTANTS.MODES.INDUSTRIAL,
    { instrumentation: false, executionMode: 'flat' }
  ) || '';

  if (!/fp_loop_i_\d+\s*=\s*0/.test(industrial)) {
    fail('Industrial URScript no contiene inicialización de contador fp_loop_i_N = 0');
  }
  if (!/while\s*\(fp_loop_i_\d+\s*<\s*5\):/.test(industrial)) {
    fail('Industrial URScript no contiene while (fp_loop_i_N < 5): para loop_block');
  }
  if (!/fp_loop_i_\d+\s*=\s*fp_loop_i_\d+\s*\+\s*1/.test(industrial)) {
    fail('Industrial URScript no contiene incremento de contador fp_loop_i_N = fp_loop_i_N + 1');
  }

  // Body should appear once in loop template (not expanded x5 in flat industrial loop mode)
  const movejCount = countMatches(industrial, /\bmovej\(/g);
  const movelCount = countMatches(industrial, /\bmovel\(/g);
  if (movejCount !== 1 || movelCount !== 1) {
    fail(`Industrial loop debería contener cuerpo una vez (1 movej + 1 movel). Actual: movej=${movejCount}, movel=${movelCount}`);
  }

  pass('UR industrial genera while con contador y cuerpo único por plantilla de loop');

  // B) PlannedSteps must expand body count times
  const compilation = context.window.CompilerAPI.compilePlanFromProgram(program);
  const plannedSteps = Array.isArray(compilation?.plannedSteps) ? compilation.plannedSteps : [];
  if (plannedSteps.length !== 10) {
    fail(`plannedSteps esperado=10 (2 movimientos x 5 ciclos), actual=${plannedSteps.length}`);
  }

  const stepIds = plannedSteps.map(s => s.step_id);
  const expectedIds = Array.from({ length: 10 }, (_, i) => i + 1);
  if (JSON.stringify(stepIds) !== JSON.stringify(expectedIds)) {
    fail(`step_id secuenciales esperados 1..10, actual=${JSON.stringify(stepIds)}`);
  }

  pass('Compiler expande loop_block en plannedSteps con step_id 1..10');

  // C) Instrumented planned mode should include step_end(1..10)
  const verification = context.generateCodeForSelectedRobot(
    context.CONSTANTS.ROBOTS.UR3E,
    program,
    context.CONSTANTS.MODES.INDUSTRIAL,
    {
      instrumentation: true,
      executionMode: 'planned',
      plannedSteps,
      contextSummary: compilation?.contextSummary || {},
      programSnapshotId: 'snap_loop_regression',
      snapshotShort: 5555
    }
  ) || '';

  const hasAllStepEnds = expectedIds.every((id) => verification.includes(`step_end(${id})`));
  if (!hasAllStepEnds) {
    fail('Código verificación no contiene step_end(1..10) para loop expandido');
  }

  pass('Modo verificación instrumentado contiene step_end(1..10)');
  console.log('\n✓ ur_loop_block_generation_regression: ALL PASSED');
}

run();
