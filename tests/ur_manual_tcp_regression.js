/**
 * UR Manual TCP Regression Test
 * 
 * Verifies that manual set_tool blocks for UR generate correct set_tcp() calls
 * converting rotation values from degrees to radians.
 * 
 * Regression: Blockly manual TCP orientation inputs are degrees and URScript
 * set_tcp() requires radians, so tcp_rx/tcp_ry/tcp_rz must be converted.
 */

(function () {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  // Resolve root directory dynamically
  function getRootDir() {
    // Try to get the root from process.cwd() first (most reliable in test context)
    const cwd = process.cwd();
    if (fs.existsSync(path.join(cwd, 'js', 'generators.js'))) {
      return cwd;
    }
    // Fallback: use __dirname relative navigation
    const fromTest = path.resolve(__dirname, '..', '..');
    if (fs.existsSync(path.join(fromTest, 'js', 'generators.js'))) {
      return fromTest;
    }
    throw new Error('Could not locate root directory with js/generators.js');
  }

  const rootDir = getRootDir();
  const configPath = path.join(rootDir, 'js', 'config.js');
  const toolsPath = path.join(rootDir, 'js', 'tools.js');
  const generatorsPath = path.join(rootDir, 'js', 'generators.js');

  if (!fs.existsSync(configPath) || !fs.existsSync(toolsPath) || !fs.existsSync(generatorsPath)) {
    console.error(`[UR_MANUAL_TCP_REGRESSION] Missing files:
  config: ${fs.existsSync(configPath)}
  tools: ${fs.existsSync(toolsPath)}
  generators: ${fs.existsSync(generatorsPath)}`);
    process.exit(1);
  }

  // Create isolated VM context
  function createRuntimeContext() {
    const documentMock = {
      getElementById: (id) => ({ value: '100' }),
      createElement: (tag) => ({}),
      body: { appendChild: () => {} }
    };
    
    const context = vm.createContext({
      console: console,
      Math: Math,
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Date: Date,
      JSON: JSON,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      document: documentMock,
      window: {}
    });
    return context;
  }

  // Load file into VM context
  function loadIntoContext(filePath, context) {
    const code = fs.readFileSync(filePath, 'utf8');
    try {
      vm.runInContext(code, context, { filename: filePath });
    } catch (error) {
      console.error(`[UR_MANUAL_TCP_REGRESSION] Error loading ${filePath}:`);
      console.error(error);
      throw error;
    }
  }

  // Main test
  function runTest() {
    const context = createRuntimeContext();
    
    // Load dependencies in order
    loadIntoContext(configPath, context);
    loadIntoContext(toolsPath, context);
    
    // Load generators and capture the global scope before/after
    const beforeKeys = Object.keys(context.window);
    loadIntoContext(generatorsPath, context);
    const afterKeys = Object.keys(context.window);
    
    // Find newly added functions
    const newKeys = afterKeys.filter(k => !beforeKeys.includes(k));
    console.log('[UR_MANUAL_TCP_REGRESSION] New keys after generators.js:', newKeys.slice(0, 10));
    
    // Look for generateCodeForSelectedRobot in context directly (not window)
    let generateCodeForSelectedRobot = context.window.generateCodeForSelectedRobot;
    
    if (typeof generateCodeForSelectedRobot !== 'function') {
      // Try to find it by scanning the entire context
      for (const key in context) {
        if (typeof context[key] === 'function' && key.includes('generateCode')) {
          generateCodeForSelectedRobot = context[key];
          console.log(`[UR_MANUAL_TCP_REGRESSION] Found function in context.${key}`);
          break;
        }
      }
    }
    
    if (typeof generateCodeForSelectedRobot !== 'function') {
      throw new Error(`generateCodeForSelectedRobot not found. Window keys: ${Object.keys(context.window).join(', ')}`);
    }

    // Create test program with manual set_tool block
    const program = [
      {
        type: 'set_tool',
        tool_id: 'manual',
        tcp_x: -2.76,      // mm → -0.00276 m
        tcp_y: -50.02,     // mm → -0.05002 m
        tcp_z: 34.7,       // mm → 0.0347 m
        tcp_rx: -2.9907,   // degrees → radians
        tcp_ry: 0.862,     // degrees → radians
        tcp_rz: -0.0225    // degrees → radians
      }
    ];

    // Generate URScript for UR (use 'UR3e' from CONSTANTS.ROBOTS)
    let generatedCode;
    try {
      generatedCode = generateCodeForSelectedRobot('UR3e', program, 'industrial', {});
    } catch (error) {
      console.error('[UR_MANUAL_TCP_REGRESSION] Error generating code:', error);
      throw error;
    }

    if (!generatedCode) {
      throw new Error('generateCodeForSelectedRobot returned empty code');
    }

    // Expected exact line (coordinates in meters, rotations converted deg→rad)
    const expectedLine = 'set_tcp(p[-0.00276, -0.05002, 0.0347, -0.05219756193939441, 0.01504473815219112, -0.00039269908169872416])';

    // Forbidden unconverted degree values in set_tcp rotation vector
    const forbiddenUnconvertedTail = [
      '-2.9907, 0.862, -0.0225',
      '-2.9907,0.862,-0.0225'
    ];

    // Test 1: Exact expected line present
    const hasExpectedLine = generatedCode.includes(expectedLine);
    if (!hasExpectedLine) {
      console.error('[UR_MANUAL_TCP_REGRESSION] FAIL: Expected line not found');
      console.error(`  Expected: ${expectedLine}`);
      console.error(`  Generated:\n${generatedCode}`);
    }

    // Test 2: No unconverted degree tail in set_tcp
    const hasForbiddenUnconvertedTail = forbiddenUnconvertedTail.some(val => generatedCode.includes(val));
    if (hasForbiddenUnconvertedTail) {
      console.error('[UR_MANUAL_TCP_REGRESSION] FAIL: Found unconverted degree tail in set_tcp rotation');
      forbiddenUnconvertedTail.forEach(val => {
        if (generatedCode.includes(val)) {
          console.error(`  Forbidden tail found: ${val}`);
        }
      });
    }

    // Test 3: Ensure output is final numeric URScript (no raw expression)
    const hasMathPiConversion = /Math\.PI\s*\/\s*180/.test(generatedCode);
    if (hasMathPiConversion) {
      console.error('[UR_MANUAL_TCP_REGRESSION] FAIL: Found Math.PI/180 expression in generated URScript output');
    }

    // Print results
    console.log('[UR_MANUAL_TCP_REGRESSION] Test Results:');
    console.log(`  ✓ Expected line present: ${hasExpectedLine ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ No unconverted degree tail: ${!hasForbiddenUnconvertedTail ? 'PASS' : 'FAIL'}`);
    console.log(`  ✓ No Math.PI/180 conversion: ${!hasMathPiConversion ? 'PASS' : 'FAIL'}`);

    // Overall result
    const allPass = hasExpectedLine && !hasForbiddenUnconvertedTail && !hasMathPiConversion;
    if (allPass) {
      console.log('\n[UR_MANUAL_TCP_REGRESSION] ✓ ALL TESTS PASSED');
      return 0;
    } else {
      console.log('\n[UR_MANUAL_TCP_REGRESSION] ✗ TESTS FAILED');
      return 1;
    }
  }

  // Run and exit
  try {
    const exitCode = runTest();
    process.exit(exitCode);
  } catch (error) {
    console.error('[UR_MANUAL_TCP_REGRESSION] Fatal error:', error);
    process.exit(1);
  }
})();
