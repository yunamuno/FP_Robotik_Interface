(function () {
  function runGeneratorSmokeTest() {
    console.log("----- Generator Smoke Test -----");

    if (typeof generateCodeForSelectedRobot !== "function") {
      console.error("✗ Generator smoke test FAILED (generateCodeForSelectedRobot not found)");
      return false;
    }

    const program = {
      tool_id: "onrobot_rg2_urcap",
      instructions: [
        { type: "set_tool", tool_id: "onrobot_rg2_urcap" },
        { kind: "tool", action: "gripper_close", tool_id: "onrobot_rg2_urcap" },
        { kind: "tool", action: "gripper_open", tool_id: "onrobot_rg2_urcap" }
      ]
    };

    const robot = (window.CONSTANTS && window.CONSTANTS.ROBOTS && window.CONSTANTS.ROBOTS.UR3E) || "UR";
    const mode = (window.CONSTANTS && window.CONSTANTS.MODES && window.CONSTANTS.MODES.INDUSTRIAL) || "industrial";
    const programToUse = Array.isArray(program) ? program : program.instructions;

    const code = generateCodeForSelectedRobot(robot, programToUse, mode, { mode: "flat" }) || "";

    const hasTcp = code.includes("set_tcp(");
    const hasClose = code.includes("rg_grip(50, 40)");
    const hasOpen = code.includes("rg_grip(110, 10)");

    if (hasTcp && hasClose && hasOpen) {
      console.log("✓ Generator smoke test PASSED");
      return true;
    }

    console.error("✗ Generator smoke test FAILED");
    if (!hasTcp) console.error("  - Missing set_tcp(...)");
    if (!hasClose) console.error("  - Missing rg_grip(50, 40)");
    if (!hasOpen) console.error("  - Missing rg_grip(110, 10)");
    return false;
  }

  window.runGeneratorSmokeTest = runGeneratorSmokeTest;
})();
