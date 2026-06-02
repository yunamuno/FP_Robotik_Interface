const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

const steps = [
  { kind: 'CHECK', label: 'simulator.js', args: ['--check', path.join(projectRoot, 'simulator.js')] },
  { kind: 'CHECK', label: 'js/blocks.js', args: ['--check', path.join(projectRoot, 'js', 'blocks.js')] },
  { kind: 'CHECK', label: 'js/generators.js', args: ['--check', path.join(projectRoot, 'js', 'generators.js')] },
  { kind: 'CHECK', label: 'js/telemetry.js', args: ['--check', path.join(projectRoot, 'js', 'telemetry.js')] },
  { kind: 'CHECK', label: 'js/ui.js', args: ['--check', path.join(projectRoot, 'js', 'ui.js')] },
  { kind: 'TEST', label: 'workspace_chain_while_regression.js', args: [path.join(projectRoot, 'tests', 'workspace_chain_while_regression.js')] },
  { kind: 'TEST', label: 'ur_manual_tcp_regression.js', args: [path.join(projectRoot, 'tests', 'ur_manual_tcp_regression.js')] },
  { kind: 'TEST', label: 'ur_pallet_target_instrumentation_regression.js', args: [path.join(projectRoot, 'tests', 'ur_pallet_target_instrumentation_regression.js')] },
  { kind: 'TEST', label: 'telemetry_mqtt_step_id_regression.js', args: [path.join(projectRoot, 'tests', 'telemetry_mqtt_step_id_regression.js')] },
  { kind: 'TEST', label: 'ur_loop_block_generation_regression.js', args: [path.join(projectRoot, 'tests', 'ur_loop_block_generation_regression.js')] },
  { kind: 'TEST', label: 'variables_while_generation_regression.js', args: [path.join(projectRoot, 'tests', 'variables_while_generation_regression.js')] },
  { kind: 'TEST', label: 'sim_control_blocks_io_regression.js', args: [path.join(projectRoot, 'tests', 'sim_control_blocks_io_regression.js')] },
  { kind: 'TEST', label: 'sim_while_variable_counter_regression.js', args: [path.join(projectRoot, 'tests', 'sim_while_variable_counter_regression.js')] }
];

function runStep(step) {
  console.log(`\n[${step.kind}] ${step.label}`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: projectRoot,
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(`\nFAILED: ${step.label}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.error(`\nFAILED: ${step.label} (exit code ${result.status})`);
    process.exit(1);
  }
}

for (const step of steps) {
  runStep(step);
}

console.log('\nALL REGRESSION TESTS PASSED');
process.exit(0);
