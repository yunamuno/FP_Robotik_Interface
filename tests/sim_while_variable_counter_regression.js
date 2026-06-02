/*
  Regression test for neutral-JSON interpreter while + variable counter.
  Covers:
  - variable_set / variables_get
  - math_arithmetic
  - logic_compare with LT and LTE
  - while loop iteration counting
  - anti-infinite-loop limit and warning path

  Run:
    node tests/sim_while_variable_counter_regression.js
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
  const capturedLogs = [];
  const capturedWarns = [];
  const capturedErrors = [];

  const context = {
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
    statusMessages: [],
    SIM_MAX_WHILE_ITERATIONS: 200,
    SIM_MAX_FOR_ITERATIONS: 10000,
    SIM_MAX_REPEAT_ITERATIONS: 10000,
    updateStatus(message) {
      context.statusMessages.push(String(message));
    },
    executeCompiledBlockList: async function executeCompiledBlockListMock() {
      return;
    }
  };

  context.console = {
    log: (...args) => capturedLogs.push(args.map(String).join(' ')),
    warn: (...args) => capturedWarns.push(args.map(String).join(' ')),
    error: (...args) => capturedErrors.push(args.map(String).join(' '))
  };

  context.window = {
    ioState: {
      DI: Array(9).fill(false),
      DO: Array(9).fill(false),
      AI: Array(5).fill(0),
      AO: Array(5).fill(0)
    }
  };

  context.__capturedLogs = capturedLogs;
  context.__capturedWarns = capturedWarns;
  context.__capturedErrors = capturedErrors;

  context.global = context;
  context.globalThis = context;
  context.window.localStorage = context.localStorage;

  return vm.createContext(context);
}

function loadIntoContext(context, filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(source, context, { filename: filePath });
}

function createMockBlock(type, id, fields = {}, inputTargets = {}, inputList = []) {
  return {
    type,
    id,
    inputList,
    _next: null,
    getNextBlock() {
      return this._next;
    },
    setNextBlock(next) {
      this._next = next;
      return next;
    },
    getFieldValue(name) {
      return Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : null;
    },
    getField(name) {
      if (!Object.prototype.hasOwnProperty.call(fields, name)) return null;
      return {
        getText() {
          return String(fields[name]);
        }
      };
    },
    getInputTargetBlock(name) {
      return Object.prototype.hasOwnProperty.call(inputTargets, name) ? inputTargets[name] : null;
    },
    getInput() {
      return null;
    }
  };
}

function createSerializationContext() {
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
      getItem() {
        return 'false';
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

async function runSerializationIntegration(rootDir, simulatorContext) {
  const serializationContext = createSerializationContext();

  loadIntoContext(serializationContext, path.join(rootDir, 'js', 'config.js'));
  serializationContext.window.CONSTANTS = serializationContext.CONSTANTS;
  loadIntoContext(serializationContext, path.join(rootDir, 'js', 'tools.js'));
  loadIntoContext(serializationContext, path.join(rootDir, 'js', 'blocks.js'));

  if (typeof serializationContext.workspaceToProgram !== 'function') {
    fail('workspaceToProgram no disponible en el contexto de serialización');
  }

  const number0 = createMockBlock('math_number', 'num_0', { NUM: 0 });
  const number1 = createMockBlock('math_number', 'num_1', { NUM: 1 });
  const number3 = createMockBlock('math_number', 'num_3', { NUM: 3 });
  const number180 = createMockBlock('math_number', 'num_180', { NUM: 180 });

  const setTool = createMockBlock('set_tool', 'set_tool_1', { TOOL_ID: 'manual' });
  const pose1 = createMockBlock('define_pose', 'pose_1', { NAME: 'punto_trabajo_app' }, {
    X: number0,
    Y: number0,
    Z: number0,
    RX: number0,
    RY: number180,
    RZ: number0
  });
  const pose2 = createMockBlock('define_pose', 'pose_2', { NAME: 'punto_trabajo' }, {
    X: number0,
    Y: number0,
    Z: number0,
    RX: number0,
    RY: number180,
    RZ: number0
  });
  const varInit = createMockBlock('variable_set', 'var_init', { VARNAME: 'i' }, { VALUE: number0 });
  const varGetCond = createMockBlock('variable_get', 'var_get_cond', { VARNAME: 'i' });
  const varGetInc = createMockBlock('variable_get', 'var_get_inc', { VARNAME: 'i' });
  const addExpr = createMockBlock('math_arithmetic', 'add_1', { OP: 'ADD' }, { A: varGetInc, B: number1 });
  const varInc = createMockBlock('variable_set', 'var_inc', { VARNAME: 'i' }, { VALUE: addExpr });
  const cond = createMockBlock('logic_compare', 'cond_1', { OP: 'LTE' }, { A: varGetCond, B: number3 });
  const whileBlock = createMockBlock('while_block', 'while_1', {}, { COND: cond, DO: varInc }, [
    { name: 'COND', connection: { type: 1 } },
    { name: 'DO', connection: { type: 3 } }
  ]);

  setTool.setNextBlock(pose1);
  pose1.setNextBlock(pose2);
  pose2.setNextBlock(varInit);
  varInit.setNextBlock(whileBlock);

  const allBlocks = [
    setTool,
    pose1,
    pose2,
    varInit,
    whileBlock,
    cond,
    varInc,
    addExpr,
    varGetCond,
    varGetInc,
    number0,
    number1,
    number3,
    number180
  ];

  const workspace = {
    getTopBlocks() {
      return [setTool];
    },
    getAllBlocks() {
      return allBlocks;
    }
  };

  serializationContext.workspace = workspace;

  const program = serializationContext.workspaceToProgram(workspace);
  const programTypes = program.map((block) => block?.type);
  if (programTypes.join(',') !== 'set_tool,define_pose,define_pose,variable_set,while_block') {
    fail(`workspaceToProgram no conservó el orden esperado. Obtenido: ${JSON.stringify(programTypes)}`);
  }

  const varInitBlock = program.find((block) => block && block.type === 'variable_set');
  if (!varInitBlock || varInitBlock.varName !== 'i' || varInitBlock.value !== 0) {
    fail(`variable_set top-level no se serializó correctamente: ${JSON.stringify(varInitBlock)}`);
  }

  if (simulatorContext.localStorage && typeof simulatorContext.localStorage.setItem === 'function') {
    simulatorContext.localStorage.setItem('robotProgramForSimulation', JSON.stringify(program));
  }

  const result = await executeProgram(simulatorContext, program);
  const cycles = countWhileCycles(result.statusMessages);

  if (program.length !== 5) {
    fail(`La ruta real serializada debía tener 5 bloques. Obtenido: ${program.length}`);
  }
  if (cycles !== 4) {
    fail(`La ruta real serializada debía ejecutar 4 iteraciones. Ejecutado: ${cycles}`);
  }
  if (result.vars.i !== 4) {
    fail(`La ruta real serializada debía terminar con i=4. Obtenido: ${String(result.vars.i)}`);
  }
  if (result.statusMessages.some((message) => message.includes('condición no evaluable'))) {
    fail('La ruta real serializada no debía reportar condición no evaluable');
  }
  assertNoLegacyWhileIssue(result, 'ruta real serializada con variable_set top-level');

  pass('ruta real serializada: incluye variable_set top-level antes del while y ejecuta 4 ciclos');
}

function resetContextState(context, maxWhileIterations = 200) {
  context.statusMessages.length = 0;
  context.__capturedLogs.length = 0;
  context.__capturedWarns.length = 0;
  context.__capturedErrors.length = 0;
  context.isSimulating = true;
  context.isPaused = false;
  context.SIM_MAX_WHILE_ITERATIONS = maxWhileIterations;
}

function countWhileCycles(statusMessages) {
  return statusMessages.filter((message) => message.includes('WHILE ciclo')).length;
}

function assertNoLegacyWhileIssue(result, label) {
  const statusText = result.statusMessages.join('\n');
  const warnText = result.warns.join('\n');

  if (statusText.includes('condición desconocida') || warnText.includes('condición desconocida')) {
    fail(`${label}: apareció "condición desconocida" y no debería`);
  }

  if (statusText.includes('WHILE terminado tras 0 ciclo(s)')) {
    fail(`${label}: apareció "WHILE terminado tras 0 ciclo(s)" y no debería`);
  }
}

async function executeProgram(context, program, maxWhileIterations = 200) {
  resetContextState(context, maxWhileIterations);
  const vars = {};
  await context.executeBlockListWithIO(program, vars);
  return {
    vars,
    statusMessages: [...context.statusMessages],
    warns: [...context.__capturedWarns],
    logs: [...context.__capturedLogs],
    errors: [...context.__capturedErrors],
    isSimulating: context.isSimulating
  };
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
    extractFunction(source, '_isSimDebugEnabled'),
    extractFunction(source, '_formatSimVariables'),
    extractFunction(source, '_normalizeExpressionOp'),
    extractFunction(source, '_normalizeCompareOp'),
    extractFunction(source, '_tryToNumber'),
    extractFunction(source, '_resolveSimVariableName'),
    extractFunction(source, 'evaluateExpression'),
    extractFunction(source, 'evaluateCondition'),
    extractFunction(source, 'evaluateSimCondition'),
    extractFunction(source, 'executeBlockListWithIO')
  ].join('\n\n');

  const context = buildContext();
  vm.runInContext(snippets, context, { filename: simulatorPath });

  if (typeof context.executeBlockListWithIO !== 'function') {
    fail('executeBlockListWithIO no disponible tras cargar snippets');
  }
  if (typeof context.evaluateExpression !== 'function') {
    fail('evaluateExpression no disponible tras cargar snippets');
  }
  if (typeof context.evaluateCondition !== 'function') {
    fail('evaluateCondition no disponible tras cargar snippets');
  }

  await runSerializationIntegration(rootDir, context);

  const whileLtProgram = [
    { type: 'variable_set', varName: 'i', value: { type: 'math_number', value: 0 } },
    {
      type: 'while_block',
      condition: {
        type: 'logic_compare',
        operator: 'LT',
        a: { type: 'variable_get', varName: 'i' },
        b: { type: 'math_number', value: 3 }
      },
      do: [
        {
          type: 'variable_set',
          varName: 'i',
          value: {
            type: 'math_arithmetic',
            operator: 'ADD',
            a: { type: 'variable_get', varName: 'i' },
            b: { type: 'math_number', value: 1 }
          }
        }
      ]
    }
  ];

  const ltResult = await executeProgram(context, whileLtProgram);
  const ltCycles = countWhileCycles(ltResult.statusMessages);
  if (ltCycles !== 3) {
    fail(`while i < 3 debía ejecutar 3 iteraciones. Ejecutado: ${ltCycles}`);
  }
  if (ltResult.vars.i !== 3) {
    fail(`while i < 3 debía terminar con i=3. Obtenido: ${String(ltResult.vars.i)}`);
  }
  if (ltResult.statusMessages.some((message) => message.includes('condición no evaluable'))) {
    fail('while i < 3 no debía reportar condición no evaluable');
  }
  if (ltResult.statusMessages.some((message) => message.includes('límite de'))) {
    fail('while i < 3 no debía activar límite anti-bucle');
  }
  assertNoLegacyWhileIssue(ltResult, 'while i < 3');
  pass('while i < 3: 3 iteraciones, i final=3, sin condición desconocida ni límite');

  const whileLteProgram = [
    { type: 'variable_set', varName: 'i', value: { type: 'math_number', value: 0 } },
    {
      type: 'while_block',
      condition: {
        type: 'logic_compare',
        operator: 'LTE',
        a: { type: 'variables_get', varName: 'i' },
        b: { type: 'math_number', value: 3 }
      },
      do: [
        {
          type: 'variable_set',
          varName: 'i',
          value: {
            type: 'math_arithmetic',
            operator: 'ADD',
            a: { type: 'variables_get', varName: 'i' },
            b: { type: 'math_number', value: 1 }
          }
        }
      ]
    }
  ];

  const lteResult = await executeProgram(context, whileLteProgram);
  const lteCycles = countWhileCycles(lteResult.statusMessages);
  if (lteCycles !== 4) {
    fail(`while i <= 3 debía ejecutar 4 iteraciones. Ejecutado: ${lteCycles}`);
  }
  if (lteResult.vars.i !== 4) {
    fail(`while i <= 3 debía terminar con i=4. Obtenido: ${String(lteResult.vars.i)}`);
  }
  if (lteResult.statusMessages.some((message) => message.includes('condición no evaluable'))) {
    fail('while i <= 3 no debía reportar condición no evaluable');
  }
  if (lteResult.statusMessages.some((message) => message.includes('límite de'))) {
    fail('while i <= 3 no debía activar límite anti-bucle');
  }
  assertNoLegacyWhileIssue(lteResult, 'while i <= 3');
  pass('while i <= 3: 4 iteraciones, i final=4, sin condición desconocida ni límite');

  // Caso 2b: while con variable real de Blockly (type: "variable", name: "i")
  const whileRealBlocklyProgram = [
    { type: 'variable_set', varName: 'j', value: { type: 'math_number', value: 0 } },
    {
      type: 'while_block',
      condition: {
        type: 'logic_compare',
        operator: 'LT',
        a: { type: 'variable', name: 'j' },
        b: { type: 'math_number', value: 3 }
      },
      do: [
        {
          type: 'variable_set',
          varName: 'j',
          value: {
            type: 'math_arithmetic',
            operator: 'ADD',
            a: { type: 'variable', name: 'j' },
            b: { type: 'math_number', value: 1 }
          }
        }
      ]
    }
  ];

  const realBlocklyResult = await executeProgram(context, whileRealBlocklyProgram);
  const realBlocklyCycles = countWhileCycles(realBlocklyResult.statusMessages);
  if (realBlocklyCycles !== 3) {
    fail(`while j < 3 (formato Blockly real) debía ejecutar 3 iteraciones. Ejecutado: ${realBlocklyCycles}`);
  }
  if (realBlocklyResult.vars.j !== 3) {
    fail(`while j < 3 debía terminar con j=3. Obtenido: ${String(realBlocklyResult.vars.j)}`);
  }
  if (realBlocklyResult.statusMessages.some((message) => message.includes('condición no evaluable'))) {
    fail('while j < 3 (formato Blockly real) no debía reportar condición no evaluable');
  }
  assertNoLegacyWhileIssue(realBlocklyResult, 'while j < 3 (Blockly real)');
  pass('while j < 3 (formato Blockly real: type=variable, name=j): 3 iteraciones, j final=3');

  const whileNoIncrementProgram = [
    { type: 'variable_set', varName: 'i', value: { type: 'math_number', value: 0 } },
    {
      type: 'while_block',
      condition: {
        type: 'logic_compare',
        operator: 'LT',
        a: { type: 'variables_get', varName: 'i' },
        b: { type: 'math_number', value: 3 }
      },
      do: [
        {
          type: 'variable_set',
          varName: 'i',
          value: { type: 'variables_get', varName: 'i' }
        }
      ]
    }
  ];

  const safetyLimit = 5;
  const noIncResult = await executeProgram(context, whileNoIncrementProgram, safetyLimit);
  const noIncCycles = countWhileCycles(noIncResult.statusMessages);
  if (noIncCycles !== safetyLimit) {
    fail(`while sin incremento debía cortar tras ${safetyLimit} iteraciones. Ejecutado: ${noIncCycles}`);
  }
  if (noIncResult.vars.i !== 0) {
    fail(`while sin incremento debía mantener i=0. Obtenido: ${String(noIncResult.vars.i)}`);
  }
  const hasLimitStatus = noIncResult.statusMessages.some((message) => message.includes(`límite de ${safetyLimit} ciclos while alcanzado`));
  if (!hasLimitStatus) {
    fail('while sin incremento debía dejar estado de límite anti-bucle');
  }
  const hasInfiniteLoopWarning = noIncResult.warns.some((message) => message.includes('posible bucle infinito'));
  if (!hasInfiniteLoopWarning) {
    fail('while sin incremento debía emitir warning de posible bucle infinito');
  }
  if (noIncResult.isSimulating !== false) {
    fail('while sin incremento debía detener la simulación (isSimulating=false) al alcanzar el límite');
  }
  pass('while sin incremento: corta por límite, deja warning y evita bucle infinito');

  console.log('\n✓ sim_while_variable_counter_regression: ALL PASSED');
}

run().catch((error) => {
  console.error('✗ sim_while_variable_counter_regression fatal:', error);
  process.exit(1);
});
