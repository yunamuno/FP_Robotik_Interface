/*
  REGRESSION TEST: blockToJSON()/workspaceToProgram() after removing instr.next.
  This test protects against losing:
  - top-level next-chain traversal in workspaceToProgram()
  - nested statement chains (while/if/for) serialized via getNextBlock()
  It must pass without reintroducing instr.next in blockToJSON().
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
  loadIntoContext(context, path.join(rootDir, 'js', 'blocks.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'compiler.js'));
  loadIntoContext(context, path.join(rootDir, 'js', 'generators.js'));

  if (typeof context.workspaceToProgram !== 'function') {
    fail('workspaceToProgram no disponible');
  }
  if (!context.window.CompilerAPI || typeof context.window.CompilerAPI.compilePlanFromProgram !== 'function') {
    fail('CompilerAPI.compilePlanFromProgram no disponible');
  }
  if (typeof context.generateCodeForSelectedRobot !== 'function') {
    fail('generateCodeForSelectedRobot no disponible');
  }

  context.updatePosePointDropdowns = () => {};

  const cond = createMockBlock('logic_boolean', 'cond_1', { BOOL: 'TRUE' });

  const move1 = createMockBlock('move_block', 'move_1', { ZONE: 'z50' });
  const moveL1 = createMockBlock('move_linear_block', 'movel_1', { ZONE: 'z50' });
  const setDo1 = createMockBlock('set_do_block', 'setdo_1', { PIN: 1, STATE: '1' });
  const wait1 = createMockBlock('wait_block', 'wait_1');
  const move2 = createMockBlock('move_block', 'move_2', { ZONE: 'z50' });
  const moveL2 = createMockBlock('move_linear_block', 'movel_2', { ZONE: 'z50' });
  const setDo2 = createMockBlock('set_do_block', 'setdo_2', { PIN: 1, STATE: '0' });
  const wait2 = createMockBlock('wait_block', 'wait_2');

  move1.setNextBlock(moveL1);
  moveL1.setNextBlock(setDo1);
  setDo1.setNextBlock(wait1);
  wait1.setNextBlock(move2);
  move2.setNextBlock(moveL2);
  moveL2.setNextBlock(setDo2);
  setDo2.setNextBlock(wait2);

  const whileBlock = createMockBlock(
    'while_block',
    'while_1',
    {},
    { COND: cond, DO: move1 },
    [{ name: 'COND', connection: { type: 1 } }, { name: 'DO', connection: { type: 3 } }]
  );

  const pose1 = createMockBlock('define_pose', 'pose_1', { NAME: 'p1' });
  const pose2 = createMockBlock('define_pose', 'pose_2', { NAME: 'p2' });
  const pose3 = createMockBlock('define_pose', 'pose_3', { NAME: 'p3' });
  const pose4 = createMockBlock('define_pose', 'pose_4', { NAME: 'p4' });
  const setTool = createMockBlock('set_tool', 'tool_1', { TOOL_ID: 'manual' });

  setTool.setNextBlock(pose1);
  pose1.setNextBlock(pose2);
  pose2.setNextBlock(pose3);
  pose3.setNextBlock(pose4);
  pose4.setNextBlock(whileBlock);

  const allBlocks = [
    setTool,
    pose1,
    pose2,
    pose3,
    pose4,
    whileBlock,
    cond,
    move1,
    moveL1,
    setDo1,
    wait1,
    move2,
    moveL2,
    setDo2,
    wait2
  ];

  const workspace = {
    getTopBlocks() {
      return [setTool];
    },
    getAllBlocks() {
      return allBlocks;
    }
  };

  const program = context.workspaceToProgram(workspace);

  if (!Array.isArray(program) || program.length !== 6) {
    fail(`program.length esperado=6, actual=${Array.isArray(program) ? program.length : 'null'}`);
  }

  const topTypes = program.map((p) => p.type);
  const expectedTop = ['set_tool', 'define_pose', 'define_pose', 'define_pose', 'define_pose', 'while_block'];
  if (JSON.stringify(topTypes) !== JSON.stringify(expectedTop)) {
    fail(`Tipos top-level inesperados: ${JSON.stringify(topTypes)}`);
  }

  const whileJson = program.find((p) => p.type === 'while_block');
  if (!whileJson) fail('No existe while_block en JSON neutral');
  if (!Array.isArray(whileJson.do) || whileJson.do.length !== 8) {
    fail(`while_block.do inválido: length=${whileJson?.do?.length ?? 'null'}`);
  }

  const whileMoves = whileJson.do.filter((b) => b.type === 'move_block').length;
  const whileMoveLs = whileJson.do.filter((b) => b.type === 'move_linear_block').length;
  if (whileMoves !== 2 || whileMoveLs !== 2) {
    fail(`Movimientos en while incorrectos: move=${whileMoves}, movel=${whileMoveLs}`);
  }

  const compiled = context.window.CompilerAPI.compilePlanFromProgram(program);
  const plannedSteps = Array.isArray(compiled?.plannedSteps) ? compiled.plannedSteps : [];
  if (plannedSteps.length !== 4) {
    fail(`plannedSteps esperado=4, actual=${plannedSteps.length}`);
  }

  const robot = context.CONSTANTS.ROBOTS.UR3E;
  const industrial = context.generateCodeForSelectedRobot(
    robot,
    program,
    context.CONSTANTS.MODES.INDUSTRIAL,
    { instrumentation: false, executionMode: 'flat' }
  ) || '';

  const movejCount = countMatches(industrial, /\bmovej\(/g);
  const movelCount = countMatches(industrial, /\bmovel\(/g);
  if (movejCount + movelCount !== 4) {
    fail(`Modo industrial movimientos esperados=4, actual=${movejCount + movelCount}`);
  }

  const verification = context.generateCodeForSelectedRobot(
    robot,
    program,
    context.CONSTANTS.MODES.INDUSTRIAL,
    {
      instrumentation: true,
      executionMode: 'planned',
      plannedSteps,
      programSnapshotId: 'snap_regression',
      snapshotShort: 9999
    }
  ) || '';

  const hasAllStepEnds = [1, 2, 3, 4].every((id) => verification.includes(`step_end(${id})`));
  if (!hasAllStepEnds) {
    fail('Modo verificación no contiene step_end(1..4)');
  }

  pass('workspaceToProgram serializa cadena top-level completa y while.do=8');
  pass('industrial/verificación cumplen conteos esperados (4 movej/movel y step_end1..4)');
}

run();
