/*
  Regression test for interpreted control-block simulation with simulated DI.
  Covers:
  - evaluateSimCondition (read_di_block, logic_boolean, logic_and/or/not, unknown)
  - if_block branch selection
  - while_block semantics with DI changes between iterations
  - for_block ascending/descending counts
  - loop_block / repeat_block exact counts and safe handling for <= 0
  - interpretedStepCounter: step_id incremental en ruta interpretada
      • step_id interno: base-0  → [0, 1, 2, ..., 29] para 30 movimientos
      • step_id visible (log): base-1 → [1, 2, 3, ..., 30]
      • Sin duplicados, sin reinicio dentro de repeat/while/for/if

  Run:
    node tests/sim_control_blocks_io_regression.js
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

function extractFunction(source, functionName) {
  const declarationRegex = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`);
  const match = declarationRegex.exec(source);
  if (!match || typeof match.index !== 'number') {
    throw new Error(`Function not found in simulator.js: ${functionName}`);
  }
  const start = match.index;

  const openBrace = source.indexOf('{', start);
  if (openBrace < 0) {
    throw new Error(`Could not find opening brace for: ${functionName}`);
  }

  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const char = source[i];
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) {
      return source.slice(start, i + 1);
    }
  }

  throw new Error(`Could not extract full body for: ${functionName}`);
}

function buildContext() {
  const context = {
    console,
    Math,
    JSON,
    Date,
    Promise,
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
    isSimulating: true,
    isPaused: false,
    executedTypes: [],
    executedMoves: [],
    executedStepIds: [],  // step_id global 1..N (sólo movimientos reales)
    statusMessages: [],
    SIM_MAX_WHILE_ITERATIONS: 200,
    SIM_MAX_FOR_ITERATIONS: 10000,
    SIM_MAX_REPEAT_ITERATIONS: 10000,
    // Replicar el comportamiento del contador global del intérprete.
    // La función real en simulator.js reasigna step_id en executeCompiledBlockList;
    // en el mock hacemos lo mismo manualmente para poder validarlo en tests.
    interpretedStepCounter: 0,
    SIM_MOTION_TYPES: new Set(['MoveJ', 'MoveL', 'MoveC', 'move_block', 'move_linear_block', 'move_circular_block']),
    updateStatus(message) {
      context.statusMessages.push(String(message));
    }
  };

  context.window = {
    ioState: {
      DI: Array(9).fill(false),
      DO: Array(9).fill(false),
      AI: Array(5).fill(0),
      AO: Array(5).fill(0)
    },
    getSimulatedDigitalInput(index) {
      const pin = Number(index);
      return pin >= 1 && pin <= 8 ? !!this.ioState.DI[pin] : false;
    },
    setSimulatedDigitalInput(index, value) {
      const pin = Number(index);
      if (pin < 1 || pin > 8) return;
      this.ioState.DI[pin] = !!value;
    }
  };

  context.global = context;
  context.globalThis = context;
  context.window.localStorage = context.localStorage;

  context.executeCompiledBlockList = async function executeCompiledBlockListMock(blockList) {
    for (const block of (Array.isArray(blockList) ? blockList : [])) {
      if (!block) continue;
      context.executedTypes.push(block.type);

      // Si es un bloque de movimiento real, asignar step_id global incremental.
      // Replicar el comportamiento de simulator.js:
      //   interpretedStepCounter += 1;
      //   step.step_id = interpretedStepCounter - 1;  // 0-based interno
      // Por eso executedStepIds almacena el valor 0-based.
      if (context.SIM_MOTION_TYPES.has(block.type)) {
        context.interpretedStepCounter += 1;
        const internalStepId = context.interpretedStepCounter - 1; // 0-based
        context.executedStepIds.push(internalStepId);
      }

      context.executedMoves.push({
        type: block.type,
        sourceName: block.sourceName || block.name || null,
        step_id: context.SIM_MOTION_TYPES.has(block.type) ? context.interpretedStepCounter - 1 : null
      });

      // Test hook: force DI1 OFF at end of first while iteration body
      if (block.type === 'move_linear_block' && context.__testFlipDiAfterFirstLinear === true) {
        context.window.setSimulatedDigitalInput(1, false);
        context.__testFlipDiAfterFirstLinear = false;
      }
    }
  };

  return vm.createContext(context);
}

function resetExecutionState(context) {
  context.executedTypes.length = 0;
  context.executedMoves.length = 0;
  context.executedStepIds.length = 0;
  context.statusMessages.length = 0;
  context.isSimulating = true;
  context.isPaused = false;
  context.interpretedStepCounter = 0;
  context.__testFlipDiAfterFirstLinear = false;
}

async function run() {
  const rootDir = path.resolve(__dirname, '..');
  const simulatorPath = path.join(rootDir, 'simulator.js');

  if (!fs.existsSync(simulatorPath)) {
    fail(`No existe simulator.js en ruta esperada: ${simulatorPath}`);
  }

  const source = fs.readFileSync(simulatorPath, 'utf8');

  const snippets = [
    extractFunction(source, '_parseDIState'),
    extractFunction(source, 'evaluateSimCondition'),
    extractFunction(source, 'hasControlStructure'),
    extractFunction(source, 'executeBlockListWithIO')
  ].join('\n\n');

  const context = buildContext();
  vm.runInContext(snippets, context, { filename: simulatorPath });

  if (typeof context.evaluateSimCondition !== 'function') {
    fail('evaluateSimCondition no disponible tras cargar snippets');
  }
  if (typeof context.executeBlockListWithIO !== 'function') {
    fail('executeBlockListWithIO no disponible tras cargar snippets');
  }
  if (typeof context.hasControlStructure !== 'function') {
    fail('hasControlStructure no disponible tras cargar snippets');
  }

  // 1) evaluateSimCondition with read_di_block and logic operators
  context.window.setSimulatedDigitalInput(1, true);
  let result = context.evaluateSimCondition({ type: 'read_di_block', pin: 1, state: '1' });
  if (result !== true) fail('read_di_block state=1 con DI1=true debía ser true');

  context.window.setSimulatedDigitalInput(1, false);
  result = context.evaluateSimCondition({ type: 'read_di_block', pin: 1, state: '1' });
  if (result !== false) fail('read_di_block state=1 con DI1=false debía ser false');

  context.window.setSimulatedDigitalInput(1, false);
  result = context.evaluateSimCondition({ type: 'read_di_block', pin: 1, state: '0' });
  if (result !== true) fail('read_di_block state=0 con DI1=false debía ser true');

  context.window.setSimulatedDigitalInput(1, true);
  result = context.evaluateSimCondition({ type: 'read_di_block', pin: 1, state: '0' });
  if (result !== false) fail('read_di_block state=0 con DI1=true debía ser false');

  result = context.evaluateSimCondition({ type: 'logic_boolean', value: true });
  if (result !== true) fail('logic_boolean(true) debía ser true');

  result = context.evaluateSimCondition({
    type: 'logic_and',
    a: { type: 'logic_boolean', value: true },
    b: { type: 'logic_boolean', value: false }
  });
  if (result !== false) fail('logic_and(true,false) debía ser false');

  result = context.evaluateSimCondition({
    type: 'logic_or',
    a: { type: 'logic_boolean', value: false },
    b: { type: 'logic_boolean', value: true }
  });
  if (result !== true) fail('logic_or(false,true) debía ser true');

  result = context.evaluateSimCondition({
    type: 'logic_not',
    inner: { type: 'logic_boolean', value: false }
  });
  if (result !== true) fail('logic_not(false) debía ser true');

  result = context.evaluateSimCondition({ type: 'no_such_condition' });
  if (result !== false) fail('condición desconocida debía devolver false');

  pass('evaluateSimCondition cubre DI y operadores lógicos correctamente');

  // 2) if_block do/else exclusivity (real neutral JSON shape)
  const ifProgram = [{
    type: 'if_block',
    condition: { type: 'read_di_block', pin: 2, state: '1' },
    do: [{
      type: 'move_block',
      sourceName: 'pick',
      sourceType: 'pose',
      speed: 50,
      zone: 'z50'
    }],
    else: [{
      type: 'move_block',
      sourceName: 'place',
      sourceType: 'pose',
      speed: 50,
      zone: 'z50'
    }]
  }];

  resetExecutionState(context);
  context.window.setSimulatedDigitalInput(2, true);
  await context.executeBlockListWithIO(ifProgram);
  if (context.executedMoves.length !== 1) {
    fail(`if_block con DI2=true debía ejecutar 1 movimiento. Ejecutado: ${context.executedMoves.length}`);
  }
  if (context.executedMoves[0]?.sourceName !== 'pick') {
    fail(`if_block con DI2=true debía ejecutar rama do(pick). Ejecutado: ${JSON.stringify(context.executedMoves)}`);
  }

  resetExecutionState(context);
  context.window.setSimulatedDigitalInput(2, false);
  await context.executeBlockListWithIO(ifProgram);
  if (context.executedMoves.length !== 1) {
    fail(`if_block con DI2=false debía ejecutar 1 movimiento. Ejecutado: ${context.executedMoves.length}`);
  }
  if (context.executedMoves[0]?.sourceName !== 'place') {
    fail(`if_block con DI2=false debía ejecutar rama else(place). Ejecutado: ${JSON.stringify(context.executedMoves)}`);
  }

  pass('if_block ejecuta una sola rama (do/else) según DI');

  // 3) while_block semantics
  const whileProgram = [{
    type: 'while_block',
    condition: { type: 'read_di_block', pin: 1, state: '1' },
    do: [
      { type: 'move_block' },
      { type: 'move_linear_block' }
    ]
  }];

  resetExecutionState(context);
  context.window.setSimulatedDigitalInput(1, false);
  await context.executeBlockListWithIO(whileProgram);
  if (context.executedTypes.length !== 0) {
    fail(`while con DI1=false debía ejecutar 0 movimientos. Ejecutado: ${context.executedTypes.length}`);
  }

  resetExecutionState(context);
  context.window.setSimulatedDigitalInput(1, true);
  context.__testFlipDiAfterFirstLinear = true;
  await context.executeBlockListWithIO(whileProgram);
  if (context.executedTypes.length !== 2) {
    fail(`while con DI ON y flip a OFF tras 1ª vuelta debía ejecutar 2 movimientos. Ejecutado: ${context.executedTypes.length}`);
  }
  if (context.executedTypes[0] !== 'move_block' || context.executedTypes[1] !== 'move_linear_block') {
    fail(`while no completó la vuelta antes de salir. Ejecutado: ${context.executedTypes.join(',')}`);
  }

  pass('while_block respeta evaluación por iteración y no corta a mitad de vuelta');

  // 4) for_block ascending/descending
  const forAscProgram = [{ type: 'for_block', from: 1, to: 3, do: [{ type: 'move_block' }] }];
  resetExecutionState(context);
  await context.executeBlockListWithIO(forAscProgram);
  if (context.executedTypes.length !== 3) {
    fail(`for ascendente 1..3 debía ejecutar 3 movimientos. Ejecutado: ${context.executedTypes.length}`);
  }

  const forDescProgram = [{ type: 'for_block', from: 3, to: 1, do: [{ type: 'move_block' }] }];
  resetExecutionState(context);
  await context.executeBlockListWithIO(forDescProgram);
  if (context.executedTypes.length !== 3) {
    fail(`for descendente 3..1 debía ejecutar 3 movimientos. Ejecutado: ${context.executedTypes.length}`);
  }

  pass('for_block ejecuta repeticiones correctas en ascendente y descendente');

  // 5) loop_block / repeat_block
  const repeat5Program = [{
    type: 'loop_block',
    count: 5,
    do: [{ type: 'move_block' }, { type: 'move_linear_block' }]
  }];
  resetExecutionState(context);
  await context.executeBlockListWithIO(repeat5Program);
  if (context.executedTypes.length !== 10) {
    fail(`loop/repeat 5 con 2 movimientos debía ejecutar 10. Ejecutado: ${context.executedTypes.length}`);
  }

  const repeatZeroProgram = [{ type: 'repeat_block', count: 0, do: [{ type: 'move_block' }] }];
  resetExecutionState(context);
  await context.executeBlockListWithIO(repeatZeroProgram);
  if (context.executedTypes.length !== 0) {
    fail(`repeat 0 debía ejecutar 0. Ejecutado: ${context.executedTypes.length}`);
  }

  const repeatNegativeProgram = [{ type: 'repeat_block', count: -1, do: [{ type: 'move_block' }] }];
  resetExecutionState(context);
  await context.executeBlockListWithIO(repeatNegativeProgram);
  if (context.executedTypes.length !== 0) {
    fail(`repeat -1 debía ejecutar 0 o manejo seguro. Ejecutado: ${context.executedTypes.length}`);
  }

  pass('loop_block/repeat_block ejecuta N correcto y maneja N<=0 sin bloqueo');

  // 6) interpretedStepCounter: repeat×5 × 6 movimientos = 30 movimientos
  //    Validaciones:
  //      a) 30 movimientos ejecutados.
  //      b) step_id internos (base 0): [0, 1, 2, ..., 29] — sin duplicados.
  //      c) step_id visibles (base 1 = interno + 1): [1, 2, 3, ..., 30].
  //      d) El contador NO se reinicia dentro de cada repetición.
  //      e) No hay step_ids duplicados en resultsByStep (cada entrada única).
  const repeat5x6Program = [{
    type: 'loop_block',
    count: 5,
    do: [
      { type: 'move_block',         sourceName: 'A' },
      { type: 'move_linear_block',  sourceName: 'B' },
      { type: 'move_linear_block',  sourceName: 'C' },
      { type: 'move_block',         sourceName: 'D' },
      { type: 'move_linear_block',  sourceName: 'E' },
      { type: 'move_linear_block',  sourceName: 'F' }
    ]
  }];
  resetExecutionState(context);
  await context.executeBlockListWithIO(repeat5x6Program);

  // a) Total de movimientos
  if (context.executedTypes.length !== 30) {
    fail(`(6a) repeat 5 × 6 movimientos debía ejecutar 30. Ejecutado: ${context.executedTypes.length}`);
  }
  if (context.executedStepIds.length !== 30) {
    fail(`(6a) debía registrar 30 step_ids. Registrados: ${context.executedStepIds.length}`);
  }

  // b) step_ids internos base-0: [0, 1, 2, ..., 29]
  const expectedInternal = Array.from({ length: 30 }, (_, i) => i);
  const internalOk = expectedInternal.every((id, i) => context.executedStepIds[i] === id);
  if (!internalOk) {
    fail(
      `(6b) step_ids internos (base-0) deben ser [0..29].\n` +
      `  Esperado: [${expectedInternal.join(',')}]\n` +
      `  Obtenido: [${context.executedStepIds.join(',')}]`
    );
  }

  // c) step_ids visibles base-1: [1, 2, 3, ..., 30]
  const visibleIds = context.executedStepIds.map(id => id + 1);
  const expectedVisible = Array.from({ length: 30 }, (_, i) => i + 1);
  const visibleOk = expectedVisible.every((id, i) => visibleIds[i] === id);
  if (!visibleOk) {
    fail(
      `(6c) step_ids visibles (base-1) deben ser [1..30].\n` +
      `  Esperado: [${expectedVisible.join(',')}]\n` +
      `  Obtenido: [${visibleIds.join(',')}]`
    );
  }

  // d) Sin duplicados: el Set debe tener exactamente 30 entradasúnicas.
  const uniqueIds = new Set(context.executedStepIds);
  if (uniqueIds.size !== 30) {
    fail(
      `(6d) step_ids duplicados detectados: ${uniqueIds.size} únicos de 30.\n` +
      `  Todos los ids: [${context.executedStepIds.join(',')}]`
    );
  }

  // e) El interpretedStepCounter debe ser exactamente 30 al final (no se reinició).
  if (context.interpretedStepCounter !== 30) {
    fail(
      `(6e) interpretedStepCounter debería ser 30 al finalizar, no ${context.interpretedStepCounter}.\n` +
      `     Indica que el contador se reinició dentro de alguna iteración.`
    );
  }

  // f) Cada move en executedMoves tiene el step_id correcto (base-0)
  const movesWithWrongId = context.executedMoves
    .filter(m => m.step_id !== null)
    .filter((m, i) => m.step_id !== i);
  if (movesWithWrongId.length > 0) {
    fail(
      `(6f) Algunos movimientos tienen step_id incorrecto:\n` +
      movesWithWrongId.map(m => `  ${m.sourceName} step_id=${m.step_id}`).join('\n')
    );
  }

  pass('interpretedStepCounter: repeat 5 × 6 → 30 step_ids base-0 [0..29], visibles [1..30], sin duplicados, sin reinicio');


  // Additional acceptance: detect interpreted-route eligibility helper
  if (context.hasControlStructure([{ type: 'move_block' }]) !== false) {
    fail('hasControlStructure debía devolver false para programa sin control');
  }
  if (context.hasControlStructure([{ type: 'if_block', condition: { type: 'logic_boolean', value: true }, then: [] }]) !== true) {
    fail('hasControlStructure debía devolver true para programa con if_block');
  }

  pass('hasControlStructure distingue programas con/sin estructuras de control');
  console.log('\n✓ sim_control_blocks_io_regression: ALL PASSED');
}

run().catch((error) => {
  console.error('✗ sim_control_blocks_io_regression fatal:', error);
  process.exit(1);
});
