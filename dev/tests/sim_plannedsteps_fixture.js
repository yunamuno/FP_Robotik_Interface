(function () {
  if (localStorage.getItem("fp_debug") !== "true") {
    return;
  }

  const simFixturePlannedSteps = [
    {
      step_id: 0,
      type: "MoveJ",
      target_pose: { x: 200, y: 0, z: 150, rx: 0, ry: 180, rz: 0 },
      frame_id: "WORLD",
      meta: {}
    },
    {
      step_id: 1,
      kind: "tool",
      action: "gripper_close",
      tool_id: "onrobot_rg2_urcap",
      meta: {}
    },
    {
      step_id: 2,
      type: "wait",
      seconds: 0.2,
      meta: {}
    },
    {
      step_id: 3,
      kind: "tool",
      action: "gripper_open",
      tool_id: "onrobot_rg2_urcap",
      meta: {}
    },
    {
      step_id: 4,
      type: "MoveL",
      target_pose: { x: 250, y: 50, z: 120, rx: 0, ry: 180, rz: 0 },
      frame_id: "WORLD",
      meta: {}
    }
  ];

  async function runSimFixture() {
    if (!window.SimulatorAPI || typeof window.SimulatorAPI.runPlannedSteps !== "function") {
      console.error("runSimFixture: SimulatorAPI.runPlannedSteps no disponible");
      return false;
    }

    await window.SimulatorAPI.runPlannedSteps(simFixturePlannedSteps);
    return true;
  }

  // resetSimFixture(); runSimFixture();
  function resetSimFixture() {
    if (!window.SimulatorAPI || typeof window.SimulatorAPI.resetSimulationState !== "function") {
      console.error("resetSimFixture: SimulatorAPI.resetSimulationState no disponible");
      return false;
    }
    window.SimulatorAPI.resetSimulationState();
    return true;
  }

  window.simFixturePlannedSteps = simFixturePlannedSteps;
  window.runSimFixture = runSimFixture;
  window.resetSimFixture = resetSimFixture;
})();
