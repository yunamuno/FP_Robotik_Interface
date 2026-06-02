/*==========================================================================
  COMPILER.JS - Compilador headless de programas a plannedSteps

  - No depende de THREE ni de la escena.
  - Se puede usar tanto en index.html como en simulator.html.
  - Expone window.CompilerAPI con utilidades de compilación.
==========================================================================*/

(function () {
  const COMPILER_DEBUG_MODE = (() => {
    try {
      return localStorage.getItem('fp_debug') === 'true';
    } catch (error) {
      return false;
    }
  })();

  function makeId(prefix) {
    const base = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return prefix ? `${prefix}_${base}` : base;
  }

  function parseZone(zoneStr) {
    const raw = (zoneStr || 'fine').toString().trim();
    const lower = raw.toLowerCase();
    let zoneMm = 0;

    if (lower === 'fine') {
      zoneMm = 0;
    } else if (lower.startsWith('z')) {
      const digits = lower.replace(/[^0-9]/g, '');
      zoneMm = digits ? parseInt(digits, 10) : 0;
    } else {
      const digits = lower.replace(/[^0-9]/g, '');
      zoneMm = digits ? parseInt(digits, 10) : 0;
    }

    if (!Number.isFinite(zoneMm) || zoneMm < 0) {
      zoneMm = 0;
    }

    const zoneNormalized = zoneMm === 0 ? 'fine' : `z${zoneMm}`;
    const urRm = zoneMm / 1000;

    return {
      zone: zoneNormalized,
      zone_mm: zoneMm,
      ur_r_m: urRm
    };
  }

  function createPlannedStep(stepId, type, pointName, position, orientation, ctx, extraMeta, zoneStr) {
    const zoneInfo = parseZone(zoneStr);
    return {
      step_id: stepId,
      type: type,
      target_pose: {
        x: position.x,
        y: position.y,
        z: position.z,
        rx: orientation.rx,
        ry: orientation.ry,
        rz: orientation.rz
      },
      target_joints: null,
      tool_id: ctx.activeTool || 'default',
      frame_id: ctx.activeFrame || 'WORLD',
      pointName: pointName,
      meta: { ...extraMeta, ...zoneInfo }
    };
  }

  function createIOStep(stepId, pin, value, waitSeconds, ctx, extraMeta) {
    return {
      step_id: stepId,
      type: 'IO_DO',
      target_pose: null,
      target_joints: null,
      tool_id: ctx.activeTool || 'default',
      frame_id: ctx.activeFrame || 'WORLD',
      pointName: null,
      meta: {
        pin: pin,
        value: value,
        wait_s: waitSeconds,
        ...extraMeta
      }
    };
  }

  function normalizeNonNegative(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return num < 0 ? 0 : num;
  }

  function createToolStep(stepId, toolId, action, widthMm, force, ctx, extraMeta) {
    return {
      step_id: stepId,
      type: 'tool',
      kind: 'tool',
      tool_id: toolId || ctx.activeTool || 'default',
      action: action,
      width_mm: widthMm,
      force: force,
      meta: { ...extraMeta }
    };
  }

  function compilerWarn(code, message, data) {
    const debug = localStorage.getItem("fp_debug") === "true";
    if (debug) {
      console.warn(`[Compiler:${code}] ${message}`, data);
    }
  }

  function vecSub(a, b) {
    return { x: (a.x ?? 0) - (b.x ?? 0), y: (a.y ?? 0) - (b.y ?? 0), z: (a.z ?? 0) - (b.z ?? 0) };
  }

  function vecAdd(a, b) {
    return { x: (a.x ?? 0) + (b.x ?? 0), y: (a.y ?? 0) + (b.y ?? 0), z: (a.z ?? 0) + (b.z ?? 0) };
  }

  function vecMul(v, k) {
    return { x: (v.x ?? 0) * k, y: (v.y ?? 0) * k, z: (v.z ?? 0) * k };
  }

  function palletPointFrom3Points(p1, p2, p3, row, col, layer, layerHeight) {
    const dx = vecSub(p2, p1);
    const dy = vecSub(p3, p1);
    const pos = vecAdd(p1, vecAdd(vecMul(dx, col), vecMul(dy, row)));
    return { x: pos.x, y: pos.y, z: pos.z + (layer * layerHeight) };
  }

  function expandPalletizeBlock(block, ctx, startStepId) {
    const steps = [];
    let stepId = startStepId;

    function toFiniteNumber(value) {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }

    function resolvePoseValue(value) {
      if (!value || typeof value !== 'object') return null;
      const refName = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null;
      const refPose = refName ? ctx.definedPoses[refName] : null;

      const x = toFiniteNumber(refPose?.x ?? value.x);
      const y = toFiniteNumber(refPose?.y ?? value.y);
      const z = toFiniteNumber(refPose?.z ?? value.z);
      const rx = toFiniteNumber(refPose?.rx ?? value.rx);
      const ry = toFiniteNumber(refPose?.ry ?? value.ry);
      const rz = toFiniteNumber(refPose?.rz ?? value.rz);

      if (x == null || y == null || z == null) return null;

      return {
        x,
        y,
        z,
        rx: rx ?? 0,
        ry: ry ?? 180,
        rz: rz ?? 0,
        name: refName || value.name || null
      };
    }

    function resolvePointValue(value) {
      if (!value || typeof value !== 'object') return null;
      const refName = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : null;
      const refPoint = refName ? ctx.definedPoints[refName] : null;

      const x = toFiniteNumber(refPoint?.x ?? value.x);
      const y = toFiniteNumber(refPoint?.y ?? value.y);
      const z = toFiniteNumber(refPoint?.z ?? value.z);

      if (x == null || y == null || z == null) return null;

      return {
        x,
        y,
        z,
        rx: toFiniteNumber(value.rx),
        ry: toFiniteNumber(value.ry),
        rz: toFiniteNumber(value.rz),
        name: refName || value.name || null
      };
    }

    const pickInput = block.pick_pose || block.pick_pos || null;
    const p1Input = block.pallet_p1_pose || block.pallet_p1 || null;
    const p2Input = block.pallet_p2 || null;
    const p3Input = block.pallet_p3 || null;

    if (COMPILER_DEBUG_MODE) {
      console.log(
        `[PALLET COMPILE INPUT] block=${block.id || 'na'} ` +
        `pick=${pickInput?.name || 'na'} p1=${p1Input?.name || 'na'} ` +
        `p2=${p2Input?.name || 'na'} p3=${p3Input?.name || 'na'}`
      );
    }

    let pickPos = resolvePoseValue(block.pick_pose);
    if (!pickPos) {
      pickPos = resolvePoseValue(block.pick_pos);
    }
    if (!pickPos) {
      pickPos = { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 };
      console.warn(`[PALLET FALLBACK] block=${block.id || 'na'} field=PICK_POS reason=unresolved_reference`);
    }
    let homePos = block.home_pos || null;
    const pickApproach = block.pick_approach_height ?? 50;
    const placeApproach = block.place_approach_height ?? 50;
    const approachOffset = block.approach_offset_mm ?? 50;
    const toOptionalPositiveWait = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num <= 0) return null;
      return num;
    };
    const pickWait = toOptionalPositiveWait(block.pick_wait_time);
    const placeWait = toOptionalPositiveWait(block.place_wait_time);
    const blockZone = block.zone || 'z5';

    const gripCloseActions = Array.isArray(block.grip_close_actions) ? block.grip_close_actions : [];
    const gripOpenActions = Array.isArray(block.grip_open_actions) ? block.grip_open_actions : [];

    function appendGripActions(actions, baseMeta, waitPhase, defaultWaitS) {
      if (!actions.length) {
        return;
      }

      const hasExplicitWaitBlock = actions.some(action => action && action.type === 'wait_block');
      const fallbackWaitS = hasExplicitWaitBlock ? null : defaultWaitS;
      const normalizeActionWait = (action) => {
        const raw = action?.wait_s ?? action?.delay_s ?? action?.sleep_s ?? action?.wait ?? action?.seconds ?? action?.time;
        const normalized = toOptionalPositiveWait(raw);
        if (normalized !== null) return normalized;
        return fallbackWaitS;
      };

      actions.forEach(action => {
        if (!action || !action.type) return;

        const waitS = normalizeActionWait(action);

        if (action.type === 'set_do_block') {
          const state = action.state == 1;
          const ioStep = createIOStep(
            stepId++,
            action.pin ?? 0,
            state,
            0,
            ctx,
            { ...baseMeta, action: 'set_do' }
          );
          if (waitS !== null) ioStep.wait_s = waitS;
          steps.push(ioStep);
          return;
        }

        if (action.type === 'wait_block') {
          const time = action.time ?? 1;
          steps.push(createIOStep(
            stepId++,
            0,
            false,
            time,
            ctx,
            { ...baseMeta, phase: waitPhase, action: 'wait' }
          ));
          return;
        }

        if (action.type === 'gripper_set' || action.type === 'rg2_grip_set') {
          const widthMm = normalizeNonNegative(action.width_mm ?? action.width ?? 0, 0);
          const force = normalizeNonNegative(action.force ?? action.force_n ?? 0, 0);
          const toolId = action.tool_id || ctx.activeTool || 'onrobot_rg2_urcap';
          const toolStep = createToolStep(
            stepId++,
            toolId,
            'grip_set',
            widthMm,
            force,
            ctx,
            { ...baseMeta, action: 'grip_set' }
          );
          if (waitS !== null) toolStep.wait_s = waitS;
          steps.push(toolStep);
        }
      });
    }

    let p1 = resolvePoseValue(block.pallet_p1_pose);
    if (!p1) {
      // TODO: eliminar compatibilidad legacy con point
      const p1PointLike = resolvePointValue(block.pallet_p1);
      if (p1PointLike) {
        p1 = {
          ...p1PointLike,
          rx: p1PointLike.rx ?? 0,
          ry: p1PointLike.ry ?? 180,
          rz: p1PointLike.rz ?? 0
        };
      }
    }
    if (!p1) {
      p1 = { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
      console.warn(`[PALLET FALLBACK] block=${block.id || 'na'} field=PALLET_P1 reason=unresolved_reference`);
    }

    let p2 = resolvePointValue(block.pallet_p2);
    if (!p2) {
      p2 = { x: 400, y: 300, z: 0 };
      console.warn(`[PALLET FALLBACK] block=${block.id || 'na'} field=PALLET_P2 reason=unresolved_reference`);
    }

    let p3 = resolvePointValue(block.pallet_p3);
    if (!p3) {
      p3 = { x: 0, y: 600, z: 0 };
      console.warn(`[PALLET FALLBACK] block=${block.id || 'na'} field=PALLET_P3 reason=unresolved_reference`);
    }

    if (COMPILER_DEBUG_MODE) {
      console.log(
        `[PALLET COMPILE RESOLVED] block=${block.id || 'na'} ` +
        `pick=(${pickPos.x},${pickPos.y},${pickPos.z}) ` +
        `p1=(${p1.x},${p1.y},${p1.z}) p2=(${p2.x},${p2.y},${p2.z}) p3=(${p3.x},${p3.y},${p3.z})`
      );
    }

    if (ctx.activeFrame && ctx.activeFrame !== 'WORLD' && ctx.definedFrames[ctx.activeFrame]) {
      const frameData = ctx.definedFrames[ctx.activeFrame];
      const frameOrigin = frameData.origin;
      const frameRotation = frameData.rotation;

      const transformPoint = (point) => {
        if (!point) return point;

        let x = point.x - frameOrigin.x;
        let y = point.y - frameOrigin.y;
        let z = point.z - frameOrigin.z;

        const rx = frameRotation.rx ?? 0;
        const ry = frameRotation.ry ?? 0;
        const rz = frameRotation.rz ?? 0;

        let x_rot = x * Math.cos(rz) - y * Math.sin(rz);
        let y_rot = x * Math.sin(rz) + y * Math.cos(rz);
        x = x_rot;
        y = y_rot;

        let x_rot2 = x * Math.cos(ry) + z * Math.sin(ry);
        let z_rot = -x * Math.sin(ry) + z * Math.cos(ry);
        x = x_rot2;
        z = z_rot;

        let y_rot2 = y * Math.cos(rx) - z * Math.sin(rx);
        let z_rot2 = y * Math.sin(rx) + z * Math.cos(rx);
        y = y_rot2;
        z = z_rot2;

        return {
          x: frameOrigin.x + x,
          y: frameOrigin.y + y,
          z: frameOrigin.z + z,
          rx: point.rx,
          ry: point.ry,
          rz: point.rz
        };
      };

      p1 = transformPoint(p1);
      p2 = transformPoint(p2);
      p3 = transformPoint(p3);
      pickPos = transformPoint(pickPos);
      if (homePos) homePos = transformPoint(homePos);
    }

    const rows = block.rows ?? 3;
    const cols = block.cols ?? 4;
    const layers = block.layers ?? 2;
    const layerHeight = block.layer_height ?? 60;

    const baseName = block.base_name || 'Pallet';

    const baseRot = {
      rx: Number.isFinite(p1.rx) ? p1.rx : (block.rx ?? 0),
      ry: Number.isFinite(p1.ry) ? p1.ry : (block.ry ?? 180),
      rz: Number.isFinite(p1.rz) ? p1.rz : (block.rz ?? 0)
    };

    // Orientación de PICK: deriva de pick_pose (la misma que usa el generador industrial)
    const pickRot = {
      rx: Number.isFinite(pickPos.rx) ? pickPos.rx : (block.rx ?? 0),
      ry: Number.isFinite(pickPos.ry) ? pickPos.ry : (block.ry ?? 180),
      rz: Number.isFinite(pickPos.rz) ? pickPos.rz : (block.rz ?? 0)
    };

    // Orientación de PLACE: deriva de pallet_p1_pose (orientación común del pallet)
    // TODO: eliminar fallback legacy si baseRot ya no se usa para place
    const placeRot = baseRot;

    const epsilon = 1e-6;
    const isFinitePoint = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z);
    const distSq = (a, b) => {
      const dx = (a.x ?? 0) - (b.x ?? 0);
      const dy = (a.y ?? 0) - (b.y ?? 0);
      const dz = (a.z ?? 0) - (b.z ?? 0);
      return dx * dx + dy * dy + dz * dz;
    };
    const angleDegBetweenXY = (v1, v2) => {
      const mag1 = Math.hypot(v1.x ?? 0, v1.y ?? 0);
      const mag2 = Math.hypot(v2.x ?? 0, v2.y ?? 0);
      if (mag1 <= epsilon || mag2 <= epsilon) return null;
      const dot = (v1.x ?? 0) * (v2.x ?? 0) + (v1.y ?? 0) * (v2.y ?? 0);
      let cos = dot / (mag1 * mag2);
      cos = Math.max(-1, Math.min(1, cos));
      return Math.acos(cos) * 180 / Math.PI;
    };

    if (!isFinitePoint(p1) || !isFinitePoint(p2) || !isFinitePoint(p3)) {
      block.meta = { ...(block.meta || {}), warning: 'PALLET_POINTS_INVALID' };
      compilerWarn(
        "PALLET_POINTS_INVALID",
        "P1,P2,P3 inválidos o coincidentes",
        { P1: p1, P2: p2, P3: p3, blockId: block.id }
      );
      return steps;
    }

    if (distSq(p1, p2) <= epsilon || distSq(p1, p3) <= epsilon) {
      block.meta = { ...(block.meta || {}), warning: 'PALLET_POINTS_INVALID' };
      compilerWarn(
        "PALLET_POINTS_INVALID",
        "P1,P2,P3 inválidos o coincidentes",
        { P1: p1, P2: p2, P3: p3, blockId: block.id }
      );
      return steps;
    }

    const dx = { x: (p2.x ?? 0) - (p1.x ?? 0), y: (p2.y ?? 0) - (p1.y ?? 0) };
    const dy = { x: (p3.x ?? 0) - (p1.x ?? 0), y: (p3.y ?? 0) - (p1.y ?? 0) };
    const angle = angleDegBetweenXY(dx, dy);
    if (angle != null && (angle < 80 || angle > 100)) {
      const angleRounded = Math.round(angle * 10) / 10;
      block.meta = {
        ...(block.meta || {}),
        warning: 'PALLET_POINTS_NOT_ORTHOGONAL',
        warning_data: { angle_deg: angleRounded }
      };
      compilerWarn(
        "PALLET_POINTS_NOT_ORTHOGONAL",
        `Ángulo dx/dy = ${angle.toFixed(1)}°`,
        { P1: p1, P2: p2, P3: p3, blockId: block.id }
      );
    }

    const safePointZ = Math.max(
      (p1.z || 0) + Math.max(pickApproach, placeApproach, approachOffset),
      (pickPos.z || 0) + pickApproach
    ) + 100;
    const safePosGlobal = { x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: safePointZ };

    if (homePos) {
      steps.push(createPlannedStep(
        stepId++,
        'MoveJ',
        `${baseName}_HOME`,
        { x: homePos.x ?? 0, y: homePos.y ?? 0, z: homePos.z ?? 0 },
        { rx: homePos.rx ?? 0, ry: homePos.ry ?? 180, rz: homePos.rz ?? 0 },
        ctx,
        { stage: 'home', phase: 'home', motion: 'MoveJ' }
      ));
    }

    const totalCells = rows * cols * layers;
    if (totalCells > 0) {
      steps.push(createPlannedStep(
        stepId++,
        'MoveJ',
        `${baseName}_Pick_Safe_Prelude`,
        safePosGlobal,
        baseRot,
        ctx,
        { phase: 'approach_global_pick', motion: 'MoveJ' },
        'z10'
      ));
    }

    for (let layer = 0; layer < layers; layer++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const palletMeta = {
            pallet: {
              row: row + 1,
              col: col + 1,
              layer: layer + 1
            },
            approach_offset_mm: approachOffset,
            origin_block_id: block.id
          };

          const pickStep2 = createPlannedStep(
            stepId++,
            'MoveJ',
            `${baseName}_Pick_Approach_J_L${layer + 1}_R${row + 1}_C${col + 1}`,
            { x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: (pickPos.z ?? 0) + pickApproach },
            pickRot,
            ctx,
            { ...palletMeta, phase: 'approach_pick', motion: 'MoveJ' },
            'z10'
          );
          steps.push(pickStep2);

          const pickStep3 = createPlannedStep(
            stepId++,
            'MoveL',
            `${baseName}_Pick_Target_L${layer + 1}_R${row + 1}_C${col + 1}`,
            { x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: pickPos.z ?? 0 },
            pickRot,
            ctx,
            { ...palletMeta, phase: 'target_pick', motion: 'MoveL' },
            'fine'
          );
          steps.push(pickStep3);

          // Hooks explícitos: cerrar/esperar
          appendGripActions(
            gripCloseActions,
            { ...palletMeta, phase: 'io_pick', motion: 'IO' },
            'wait_pick',
            pickWait
          );

          const pickStep6 = createPlannedStep(
            stepId++,
            'MoveL',
            `${baseName}_Pick_Retract_L${layer + 1}_R${row + 1}_C${col + 1}`,
            { x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: (pickPos.z ?? 0) + pickApproach },
            pickRot,
            ctx,
            { ...palletMeta, phase: 'retract_pick', motion: 'MoveL' },
            blockZone
          );
          steps.push(pickStep6);

          const placePos = palletPointFrom3Points(p1, p2, p3, row, col, layer, layerHeight);

          const placeSafePos = {
            x: placePos.x,
            y: placePos.y,
            z: placePos.z + placeApproach + 50
          };

          const placeStep1 = createPlannedStep(
            stepId++,
            'MoveJ',
            `${baseName}_Place_Safe_L${layer + 1}_R${row + 1}_C${col + 1}`,
            placeSafePos,
            placeRot,
            ctx,
            { ...palletMeta, phase: 'approach_global_place', motion: 'MoveJ' },
            'z10'
          );
          steps.push(placeStep1);

          const placeStep2 = createPlannedStep(
            stepId++,
            'MoveL',
            `${baseName}_Place_Target_L${layer + 1}_R${row + 1}_C${col + 1}`,
            placePos,
            placeRot,
            ctx,
            { ...palletMeta, phase: 'target_place', motion: 'MoveL' },
            'fine'
          );
          steps.push(placeStep2);

          // Hooks explícitos: abrir/esperar
          appendGripActions(
            gripOpenActions,
            { ...palletMeta, phase: 'io_place', motion: 'IO' },
            'wait_place',
            placeWait
          );

          const placeStep5 = createPlannedStep(
            stepId++,
            'MoveL',
            `${baseName}_Place_Retract_L${layer + 1}_R${row + 1}_C${col + 1}`,
            { x: placePos.x, y: placePos.y, z: placePos.z + placeApproach },
            placeRot,
            ctx,
            { ...palletMeta, phase: 'retract_place', motion: 'MoveL' },
            blockZone
          );
          steps.push(placeStep5);
        }
      }
    }

    return steps;
  }

  function normalizeProgramInput(program) {
    let p = program;

    if (typeof p === "string") {
      try { p = JSON.parse(p); } catch (e) { return []; }
    }

    if (Array.isArray(p)) {
      if (p.length === 1 && p[0]?.next) return flattenNextChain(p[0]);
      return p;
    }

    if (p && typeof p === "object") {
      if (Array.isArray(p.blocks)) return p.blocks;
      if (Array.isArray(p.programPlano)) return p.programPlano;
      if (Array.isArray(p.program)) return p.program;
      if (Array.isArray(p.flat)) return p.flat;
      if (p.program && Array.isArray(p.program.blocks)) return p.program.blocks;
    }

    return [];
  }

  function flattenNextChain(head) {
    const out = [];
    const seen = new Set();
    let cur = head;

    while (cur && typeof cur === "object" && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
      cur = cur.next;
    }
    return out;
  }

  // Recursively process blocks including nested statements (while, if, for, etc.)
  function processBlocksRecursive(blockList, steps, stepIdCounterRef, ctx) {
    if (!Array.isArray(blockList)) return;

    function countMovementBlocks(blocks) {
      if (!Array.isArray(blocks)) return 0;
      let count = 0;
      for (const item of blocks) {
        if (!item || typeof item !== 'object') continue;
        if (
          item.type === 'move_block'
          || item.type === 'move_linear_block'
          || item.type === 'move_circular_block'
          || item.type === 'use_pose'
          || item.type === 'use_point'
        ) {
          count += 1;
        }
      }
      return count;
    }
    
    for (const block of blockList) {
      if (!block) continue;
      
      // Handle control flow blocks by processing their inner statement arrays
      if (block.type === 'while_block') {
        // Process the 'do' array (body of while/repeat)
        if (Array.isArray(block.do)) {
          processBlocksRecursive(block.do, steps, stepIdCounterRef, ctx);
        }
        continue;
      }

      if (block.type === 'loop_block' || block.type === 'repeat_block') {
        const rawCount = Number(block.count ?? block.times ?? block.n ?? 0);
        const repeatCount = Number.isFinite(rawCount) ? Math.floor(rawCount) : 0;
        if (repeatCount <= 0) {
          continue;
        }
        const bodyBlocks = Array.isArray(block.do) ? block.do : [];
        const bodyMotions = countMovementBlocks(bodyBlocks);
        const expandedMotions = bodyMotions * repeatCount;
        if (COMPILER_DEBUG_MODE) {
          console.log(`[PLAN LOOP] count=${repeatCount} body motions=${bodyMotions} expanded motions=${expandedMotions}`);
        }
        for (let i = 0; i < repeatCount; i++) {
          processBlocksRecursive(bodyBlocks, steps, stepIdCounterRef, ctx);
        }
        continue;
      }
      
      if (block.type === 'if_block') {
        // Process then branch
        if (Array.isArray(block.then)) {
          processBlocksRecursive(block.then, steps, stepIdCounterRef, ctx);
        }
        // Process else branch
        if (Array.isArray(block.else)) {
          processBlocksRecursive(block.else, steps, stepIdCounterRef, ctx);
        }
        continue;
      }
      
      if (block.type === 'for_block') {
        // Process loop body
        if (Array.isArray(block.do)) {
          processBlocksRecursive(block.do, steps, stepIdCounterRef, ctx);
        }
        continue;
      }
      
      // Handle movement blocks (same as in main loop)
      if (block.type === 'palletize_block') {
        const palletSteps = expandPalletizeBlock(block, ctx, stepIdCounterRef.current);
        steps.push(...palletSteps);
        stepIdCounterRef.current += palletSteps.length;
        continue;
      }

      if (block.type === 'gripper_set' || block.type === 'rg2_grip_set') {
        const widthMm = normalizeNonNegative(block.width_mm ?? block.width ?? 0, 0);
        const force = normalizeNonNegative(block.force ?? block.force_n ?? 0, 0);
        const toolId = block.tool_id || ctx.activeTool || 'onrobot_rg2_urcap';
        steps.push(createToolStep(
          stepIdCounterRef.current++,
          toolId,
          'grip_set',
          widthMm,
          force,
          ctx,
          { origin_block_id: block.id }
        ));
        continue;
      }

      if (block.type === 'move_circular_block') {
        steps.push(createPlannedStep(
          stepIdCounterRef.current++,
          'MoveL',
          block.sourceName ? `${block.sourceName}_Via` : null,
          { x: block.via_x ?? 0, y: block.via_y ?? 0, z: block.via_z ?? 0 },
          { rx: block.via_rx ?? 0, ry: block.via_ry ?? 180, rz: block.via_rz ?? 0 },
          ctx,
          { circular_phase: 'via', origin_block_id: block.id },
          block.zone
        ));

        steps.push(createPlannedStep(
          stepIdCounterRef.current++,
          'MoveL',
          block.sourceName ? `${block.sourceName}_End` : null,
          { x: block.end_x ?? 0, y: block.end_y ?? 0, z: block.end_z ?? 0 },
          { rx: block.end_rx ?? 0, ry: block.end_ry ?? 180, rz: block.end_rz ?? 0 },
          ctx,
          { circular_phase: 'end', origin_block_id: block.id },
          block.zone
        ));
        continue;
      }

      if (block.type === 'move_block' ||
          block.type === 'move_linear_block' ||
          block.type === 'use_pose' ||
          block.type === 'use_point') {

        let resolvedPos, resolvedRot;

        if (block.type === 'use_pose' && block.poseName) {
          const pose = ctx.definedPoses[block.poseName];
          if (!pose) {
            continue;
          }
          resolvedPos = { x: pose.x, y: pose.y, z: pose.z };
          resolvedRot = { rx: pose.rx, ry: pose.ry, rz: pose.rz };
        } else if (block.type === 'use_point' && block.pointName) {
          const point = ctx.definedPoints[block.pointName];
          if (!point) {
            continue;
          }
          resolvedPos = { x: point.x, y: point.y, z: point.z };
          resolvedRot = { rx: block.rx ?? 0, ry: block.ry ?? 180, rz: block.rz ?? 0 };
        } else {
          resolvedPos = { x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0 };
          resolvedRot = { rx: block.rx ?? 0, ry: block.ry ?? 180, rz: block.rz ?? 0 };
        }

        const moveType = (block.type === 'move_block') ? 'MoveJ' : 'MoveL';

        steps.push(createPlannedStep(
          stepIdCounterRef.current++,
          moveType,
          block.pointName || block.poseName || block.sourceName || null,
          resolvedPos,
          resolvedRot,
          ctx,
          { origin_block_id: block.id },
          block.zone
        ));
      }
    }
  }

  function compilePlanFromProgram(program) {
    const programSnapshotId = makeId('snap');
    const steps = [];
    const stepIdCounterRef = { current: 0 };

    const blocks = normalizeProgramInput(program);
    const programToolId = program?.tool_id
      ?? program?.program?.tool_id
      ?? null;

    const ctx = {
      activeFrame: null,
      activeTool: null,
      definedFrames: {},
      definedPoses: {},
      definedPoints: {},
      seenSetTool: false
    };

    // First pass: collect definitions
    for (const block of blocks) {
      if (block.type === 'define_frame' && block.name) {
        ctx.definedFrames[block.name] = {
          origin: { x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0 },
          rotation: { rx: block.rx ?? 0, ry: block.ry ?? 0, rz: block.rz ?? 0 }
        };
      }

      if (block.type === 'define_pose' && block.name) {
        ctx.definedPoses[block.name] = {
          x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0,
          rx: block.rx ?? 0, ry: block.ry ?? 180, rz: block.rz ?? 0
        };
      }

      if (block.type === 'define_point' && block.name) {
        ctx.definedPoints[block.name] = {
          x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0
        };
      }
    }

    // Second pass: process blocks recursively (including nested statements)
    const processedBlocks = [];
    for (const block of blocks) {
      if (block.type === 'define_frame') {
        ctx.definedFrames[block.name] = {
          origin: { x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0 },
          rotation: { rx: block.rx ?? 0, ry: block.ry ?? 0, rz: block.rz ?? 0 }
        };
        continue;
      }

      if (block.type === 'define_pose') {
        ctx.definedPoses[block.name] = {
          x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0,
          rx: block.rx ?? 0, ry: block.ry ?? 180, rz: block.rz ?? 0
        };
        continue;
      }

      if (block.type === 'define_point') {
        ctx.definedPoints[block.name] = {
          x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0
        };
        continue;
      }

      if (block.type === 'set_tool') {
        ctx.activeTool = block.tool_id || null;
        ctx.seenSetTool = true;
        continue;
      }

      if (block.type === 'use_frame') {
        ctx.activeFrame = block.frameName || null;
        continue;
      }

      // Use recursive processing for all blocks (handles both top-level and nested)
      processBlocksRecursive([block], steps, stepIdCounterRef, ctx);
    }

    let plannedSteps = Array.isArray(steps) ? steps : [];
    plannedSteps = plannedSteps.filter(step => step != null);
    // Assign step_id starting from 1 (not 0) for verification compatibility
    plannedSteps.forEach((step, index) => {
      step.step_id = index + 1;
    });

    if (plannedSteps.length > 0) {
      console.debug('[PLAN] plannedSteps step_ids:', plannedSteps.map(s => s.step_id));
    }

    // Debug: warn if compilation resulted in empty plannedSteps despite having movement commands
    if (plannedSteps.length === 0 && blocks.some(b => 
      (b.type && (b.type.includes('move') || b.type.includes('circular') || b.type === 'gripper_set' || b.type === 'rg2_grip_set')) ||
      (b.type === 'while_block' && Array.isArray(b.do) && b.do.length > 0) ||
      (b.type === 'if_block' && (Array.isArray(b.then) || Array.isArray(b.else))) ||
      (b.type === 'for_block' && Array.isArray(b.do))
    )) {
      console.warn('[VERIFY] Industrial code contains motion commands but plannedSteps is empty. Check recursive compilation inside control blocks.');
    }

    const verifyStepIds = plannedSteps
      .filter((step) => {
        if (!step) return false;
        const meta = step.meta || {};
        const phase = meta.phase;
        const isTargetPhase = typeof phase === 'string' && phase.toLowerCase().startsWith('target_');
        const isFine = (typeof meta.zone_mm === 'number' && meta.zone_mm === 0)
          || meta.zone === 'fine'
          || meta.ur_r_m === 0;
        return isTargetPhase || isFine;
      })
      .map(step => step.step_id);

    const contextSummary = {
      frames: Object.keys(ctx.definedFrames),
      poses: Object.keys(ctx.definedPoses),
      points: Object.keys(ctx.definedPoints),
      activeTool: ctx.activeTool,
      stepCount: plannedSteps.length,
      verify_step_ids: verifyStepIds,
      verify_count: verifyStepIds.length
    };


    return {
      program_snapshot_id: programSnapshotId,
      plannedSteps: plannedSteps,
      contextSummary: contextSummary
    };
  }

  window.CompilerAPI = {
    compilePlanFromProgram,
    makeId,
    parseZone,
    createPlannedStep,
    expandPalletizeBlock
  };
})();
