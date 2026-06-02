/*
  REGRESSION TEST: UR variables inside while generation

  Validates that Blockly program with:
    i = 0
    while i < 3:
      movej(...)
      i = i + 1
  generates UR industrial code containing:
    - i = 0
    - while (i < 3):  (or equivalent)
    - i = (i + 1) inside while body
    - end
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

function run() {
  const rootDir = path.resolve(__dirname, '..');
  const context = createRuntimeContext();

  loadIntoContext(context, path.join(rootDir, 'js', 'config.js'));
  vm.runInContext('window.CONSTANTS = CONSTANTS;', context);
  loadIntoContext(context, path.join(rootDir, 'js', 'tools.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'blocks.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'compiler.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'generators.js'));

  if (typeof context.workspaceToProgram !== 'function') {
    fail('workspaceToProgram no disponible');
  }
  if (typeof context.generateCodeForSelectedRobot !== 'function') {
    fail('generateCodeForSelectedRobot no disponible');
  }

  context.updatePosePointDropdowns = () => {};

  const number0 = createMockBlock('math_number', 'num_0', { NUM: 0 });
  const number1 = createMockBlock('math_number', 'num_1', { NUM: 1 });
  const number3 = createMockBlock('math_number', 'num_3', { NUM: 3 });

  const varGetCond = createMockBlock('variable_get', 'var_get_cond', { VARNAME: 'i' });
  const varGetInc = createMockBlock('variable_get', 'var_get_inc', { VARNAME: 'i' });

  const cond = createMockBlock(
    'logic_compare',
    'cond_lt_3',
    { OP: 'LT' },
    { A: varGetCond, B: number3 }
  );

  const addExpr = createMockBlock(
    'math_arithmetic',
    'add_i_1',
    { OP: 'ADD' },
    { A: varGetInc, B: number1 }
  );

  const varInit = createMockBlock(
    'variable_set',
    'var_set_init',
    { VARNAME: 'i' },
    { VALUE: number0 }
  );

  const moveInWhile = createMockBlock('move_block', 'move_while_1', { ZONE: 'z50' });

  const varInc = createMockBlock(
    'variable_set',
    'var_set_inc',
    { VARNAME: 'i' },
    { VALUE: addExpr }
  );

  moveInWhile.setNextBlock(varInc);

  const whileBlock = createMockBlock(
    'while_block',
    'while_i_lt_3',
    {},
    { COND: cond, DO: moveInWhile },
    [{ name: 'COND', connection: { type: 1 } }, { name: 'DO', connection: { type: 3 } }]
  );

  varInit.setNextBlock(whileBlock);

  const allBlocks = [
    varInit,
    whileBlock,
    moveInWhile,
    varInc,
    cond,
    addExpr,
    varGetCond,
    varGetInc,
    number0,
    number1,
    number3
  ];

  const workspace = {
    getTopBlocks() {
      return [varInit];
    },
    getAllBlocks() {
      return allBlocks;
    }
  };

  const program = context.workspaceToProgram(workspace);
  if (!Array.isArray(program) || program.length !== 2) {
    fail(`program.length esperado=2, actual=${Array.isArray(program) ? program.length : 'null'}`);
  }

  const industrial = context.generateCodeForSelectedRobot(
    context.CONSTANTS.ROBOTS.UR3E,
    program,
    context.CONSTANTS.MODES.INDUSTRIAL,
    { instrumentation: false, executionMode: 'flat' }
  ) || '';

  if (!industrial.includes(' i = 0')) {
    fail('No aparece inicialización "i = 0" en UR industrial');
  }

  if (!/\bwhile\s*\(?\s*i\s*<\s*3\s*\)?\s*:/.test(industrial)) {
    fail('No aparece condición while i < 3 en UR industrial');
  }

  if (!/\bend\b/.test(industrial)) {
    fail('No aparece "end" de cierre en UR industrial');
  }

  const whileBodyMatch = industrial.match(/\bwhile\s*\(?\s*i\s*<\s*3\s*\)?\s*:\s*([\s\S]*?)\n\s*end\b/);
  if (!whileBodyMatch || !whileBodyMatch[1]) {
    fail('No se pudo extraer el cuerpo del while en UR industrial');
  }

  const whileBody = whileBodyMatch[1];
  if (!whileBody.includes('i = (i + 1)')) {
    fail('No aparece incremento "i = (i + 1)" dentro del cuerpo del while');
  }

  pass('Generación UR incluye i = 0, while i < 3, i = (i + 1) dentro del while y end');
}

run();
