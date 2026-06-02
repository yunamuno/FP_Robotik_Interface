/**
 * ============================================================================
 * GENERATORS.JS - Generadores de Código para Robots
 * ============================================================================
 * 
 * Este archivo contiene la función principal de generación de código para
 * diferentes tipos de robots y modos de operación.
 * 
 * Soporta:
 * - Modo Educativo: Genera pseudocódigo legible en español
 * - UR3e (Universal Robots): Genera código URScript
 * - ABB IRC5: Genera código RAPID
 * - Fanuc: Genera código TP (Teach Pendant)
 * 
 * La función principal 'generateCodeForSelectedRobot' actúa como un router
 * que recibe el robot, el programa y el modo, y llama al generador apropiado.
 * ============================================================================
 */

  /* SECCIÓN 010: Funciones Auxiliares para Condiciones y Matemáticas */

  /**
   * computeSnapshotShortId(text) → uint16  (0..65535)
   * Hash deterministico de 16 bits: mismo snapshot_id → mismo entero siempre.
   * Algoritmo: hash = (hash * 31 + charCode) & 0xFFFF
   */
  function computeSnapshotShortIdPure(text) {
    let hash = 0;
    const str = String(text || '');
    for (let i = 0; i < str.length; i++) {
      hash = ((hash * 31) + str.charCodeAt(i)) & 0xFFFF;
    }
    return hash;
  }
  const computeSnapshotShortId = computeSnapshotShortIdPure;
  if (typeof window !== 'undefined' && typeof window.computeSnapshotShortId !== 'function') {
    window.computeSnapshotShortId = computeSnapshotShortIdPure;
  }

  // Formatea una expresión matemática para código educativo
  function formatMathEducational(expr) {
    if (typeof expr === 'number') return expr;
    if (!expr) return 0;
    
    if (expr.type === 'variable') {
      return expr.name;
    } else if (expr.type === 'math_arithmetic') {
      const opMap = { ADD: '+', SUBTRACT: '-', MULTIPLY: '×', DIVIDE: '÷', POWER: '^' };
      const a = formatMathEducational(expr.a);
      const b = formatMathEducational(expr.b);
      return `(${a} ${opMap[expr.operator] || '+'} ${b})`;
    } else if (expr.type === 'math_single') {
      const num = formatMathEducational(expr.num);
      const opMap = { ROOT: 'raíz', ABS: '|', NEG: '-', ROUND: 'redondear', ROUNDUP: 'redondear_arriba', ROUNDDOWN: 'redondear_abajo' };
      return `${opMap[expr.operator] || ''}(${num})`;
    } else if (expr.type === 'math_modulo') {
      const a = formatMathEducational(expr.dividend);
      const b = formatMathEducational(expr.divisor);
      return `(${a} módulo ${b})`;
    }
    return expr;
  }
  
  // Formatea una expresión matemática para URScript
  function formatMathUR(expr) {
    if (typeof expr === 'number') return expr;
    if (!expr) return 0;
    
    if (expr.type === 'variable') {
      return expr.name;
    } else if (expr.type === 'math_arithmetic') {
      const opMap = { ADD: '+', SUBTRACT: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '**' };
      const a = formatMathUR(expr.a);
      const b = formatMathUR(expr.b);
      return `(${a} ${opMap[expr.operator] || '+'} ${b})`;
    } else if (expr.type === 'math_single') {
      const num = formatMathUR(expr.num);
      if (expr.operator === 'ROOT') return `sqrt(${num})`;
      if (expr.operator === 'ABS') return `abs(${num})`;
      if (expr.operator === 'NEG') return `(-${num})`;
      if (expr.operator === 'ROUND') return `floor(${num} + 0.5)`;
      if (expr.operator === 'ROUNDUP') return `ceil(${num})`;
      if (expr.operator === 'ROUNDDOWN') return `floor(${num})`;
      return num;
    } else if (expr.type === 'math_modulo') {
      const a = formatMathUR(expr.dividend);
      const b = formatMathUR(expr.divisor);
      return `(${a} % ${b})`;
    }
    return expr;
  }
  
  // Formatea una expresión matemática para RAPID
  function formatMathRAPID(expr) {
    if (typeof expr === 'number') return expr;
    if (!expr) return 0;
    
    if (expr.type === 'variable') {
      return expr.name;
    } else if (expr.type === 'math_arithmetic') {
      const opMap = { ADD: '+', SUBTRACT: '-', MULTIPLY: '*', DIVIDE: '/', POWER: 'Pow' };
      const a = formatMathRAPID(expr.a);
      const b = formatMathRAPID(expr.b);
      if (expr.operator === 'POWER') return `Pow(${a}, ${b})`;
      return `(${a} ${opMap[expr.operator] || '+'} ${b})`;
    } else if (expr.type === 'math_single') {
      const num = formatMathRAPID(expr.num);
      if (expr.operator === 'ROOT') return `Sqrt(${num})`;
      if (expr.operator === 'ABS') return `Abs(${num})`;
      if (expr.operator === 'NEG') return `(-${num})`;
      if (expr.operator === 'ROUND') return `Round(${num})`;
      if (expr.operator === 'ROUNDUP') return `Ceil(${num})`;
      if (expr.operator === 'ROUNDDOWN') return `Floor(${num})`;
      return num;
    } else if (expr.type === 'math_modulo') {
      const a = formatMathRAPID(expr.dividend);
      const b = formatMathRAPID(expr.divisor);
      return `(${a} MOD ${b})`;
    }
    return expr;
  }
  
  // Formatea una expresión matemática para Fanuc
  function formatMathFanuc(expr) {
    if (typeof expr === 'number') return expr.toFixed(2);
    if (!expr) return '0.00';
    
    if (expr.type === 'variable') {
      return `R[${expr.name === 'i' ? '1' : '2'}]`; // Simplificado: i=R[1], otros=R[2]
    } else if (expr.type === 'math_arithmetic') {
      const opMap = { ADD: '+', SUBTRACT: '-', MULTIPLY: '*', DIVIDE: '/' };
      const a = formatMathFanuc(expr.a);
      const b = formatMathFanuc(expr.b);
      if (expr.operator === 'POWER') return `(${a}**${b})`;
      return `(${a}${opMap[expr.operator] || '+'}${b})`;
    } else if (expr.type === 'math_single') {
      const num = formatMathFanuc(expr.num);
      if (expr.operator === 'ROOT') return `SQRT(${num})`;
      if (expr.operator === 'ABS') return `ABS(${num})`;
      if (expr.operator === 'NEG') return `(-${num})`;
      if (expr.operator === 'ROUND') return `ROUND(${num})`;
      return num;
    } else if (expr.type === 'math_modulo') {
      const a = formatMathFanuc(expr.dividend);
      const b = formatMathFanuc(expr.divisor);
      return `MOD(${a},${b})`;
    }
    return expr;
  }

  function makeVector(a, b) {
    const from = a || {};
    const to = b || {};
    return {
      x: (to.x ?? 0) - (from.x ?? 0),
      y: (to.y ?? 0) - (from.y ?? 0),
      z: (to.z ?? 0) - (from.z ?? 0)
    };
  }

  function scaleVector(v, k) {
    const vec = v || {};
    return {
      x: (vec.x ?? 0) * k,
      y: (vec.y ?? 0) * k,
      z: (vec.z ?? 0) * k
    };
  }

  function addVector(p, v) {
    const point = p || {};
    const vec = v || {};
    return {
      x: (point.x ?? 0) + (vec.x ?? 0),
      y: (point.y ?? 0) + (vec.y ?? 0),
      z: (point.z ?? 0) + (vec.z ?? 0)
    };
  }

  function computePalletPlacePose(p1Pose, p2Point, p3Point, row, col, layer, layerHeight) {
    const basePose = p1Pose || { x: 0, y: 0, z: 0, rx: 0, ry: 180, rz: 0 };
    const dx = makeVector(basePose, p2Point || basePose);
    const dy = makeVector(basePose, p3Point || basePose);
    const pos = addVector(
      addVector(
        addVector(basePose, scaleVector(dx, col)),
        scaleVector(dy, row)
      ),
      { x: 0, y: 0, z: (layer || 0) * (layerHeight || 0) }
    );
    return {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rx: basePose.rx ?? 0,
      ry: basePose.ry ?? 180,
      rz: basePose.rz ?? 0
    };
  }

  function isSameXYZ(a, b, eps = 1e-9) {
    if (!a || !b) return false;
    return (
      Math.abs((a.x ?? 0) - (b.x ?? 0)) <= eps &&
      Math.abs((a.y ?? 0) - (b.y ?? 0)) <= eps &&
      Math.abs((a.z ?? 0) - (b.z ?? 0)) <= eps
    );
  }

  function enrichProgramReferenceValues(program) {
    const root = Array.isArray(program) ? program : [];
    const seen = new Set();
    const blocks = [];

    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);

      if (typeof node.type === 'string') {
        blocks.push(node);
      }

      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }

      Object.keys(node).forEach((key) => {
        const value = node[key];
        if (!value) return;
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        if (typeof value === 'object') {
          walk(value);
        }
      });
    };

    walk(root);

    const poses = {};
    const points = {};

    blocks.forEach((block) => {
      if (block.type === 'define_pose' && block.name) {
        poses[block.name] = {
          x: block.x ?? 0,
          y: block.y ?? 0,
          z: block.z ?? 0,
          rx: block.rx ?? 0,
          ry: block.ry ?? 180,
          rz: block.rz ?? 0
        };
      }
      if (block.type === 'define_point' && block.name) {
        points[block.name] = {
          x: block.x ?? 0,
          y: block.y ?? 0,
          z: block.z ?? 0
        };
      }
    });

    const resolvePoseLike = (value) => {
      if (!value || typeof value !== 'object') return null;
      const name = typeof value.name === 'string' ? value.name : null;
      const ref = name ? poses[name] : null;
      const x = Number(ref?.x ?? value.x);
      const y = Number(ref?.y ?? value.y);
      const z = Number(ref?.z ?? value.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      const rx = Number(ref?.rx ?? value.rx);
      const ry = Number(ref?.ry ?? value.ry);
      const rz = Number(ref?.rz ?? value.rz);
      return {
        ...value,
        x,
        y,
        z,
        rx: Number.isFinite(rx) ? rx : 0,
        ry: Number.isFinite(ry) ? ry : 180,
        rz: Number.isFinite(rz) ? rz : 0
      };
    };

    const resolvePointLike = (value) => {
      if (!value || typeof value !== 'object') return null;
      const name = typeof value.name === 'string' ? value.name : null;
      const ref = name ? points[name] : null;
      const x = Number(ref?.x ?? value.x);
      const y = Number(ref?.y ?? value.y);
      const z = Number(ref?.z ?? value.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      return {
        ...value,
        x,
        y,
        z
      };
    };

    blocks.forEach((block) => {
      if (block.type === 'use_pose' && block.poseName && poses[block.poseName]) {
        const pose = poses[block.poseName];
        block.x = pose.x;
        block.y = pose.y;
        block.z = pose.z;
        block.rx = pose.rx;
        block.ry = pose.ry;
        block.rz = pose.rz;
      }

      if (block.type === 'use_point' && block.pointName && points[block.pointName]) {
        const point = points[block.pointName];
        block.x = point.x;
        block.y = point.y;
        block.z = point.z;
      }

      if (block.type === 'palletize_block') {
        const pickPose = resolvePoseLike(block.pick_pose) || resolvePoseLike(block.pick_pos);
        if (pickPose) block.pick_pose = pickPose;

        const p1Pose = resolvePoseLike(block.pallet_p1_pose);
        if (p1Pose) block.pallet_p1_pose = p1Pose;

        const p2Point = resolvePointLike(block.pallet_p2);
        if (p2Point) block.pallet_p2 = p2Point;

        const p3Point = resolvePointLike(block.pallet_p3);
        if (p3Point) block.pallet_p3 = p3Point;
      }
    });

    return root;
  }
  
  // Formatea una condición para código educativo
  function formatConditionEducational(cond) {
    if (!cond) return 'verdadero';
    
    if (cond.type === 'read_di_block') {
      const state = cond.state == 1 ? 'ON' : 'OFF';
      return `DI[${cond.pin}] está en ${state}`;
    } else if (cond.type === 'logic_compare') {
      const opMap = { EQ: '=', NEQ: '≠', GT: '>', LT: '<', GTE: '≥', LTE: '≤' };
      const a = formatMathEducational(cond.a);
      const b = formatMathEducational(cond.b);
      return `${a} ${opMap[cond.operator] || '='} ${b}`;
    } else if (cond.type === 'logic_boolean') {
      return cond.value ? 'verdadero' : 'falso';
    } else if (cond.type === 'logic_and') {
      return `(${formatConditionEducational(cond.a)}) Y (${formatConditionEducational(cond.b)})`;
    } else if (cond.type === 'logic_or') {
      return `(${formatConditionEducational(cond.a)}) O (${formatConditionEducational(cond.b)})`;
    } else if (cond.type === 'logic_not') {
      return `NO (${formatConditionEducational(cond.inner)})`;
    } else if (cond.type === 'read_ai_block') {
      return `AI[${cond.pin}]`;
    }
    return 'condición';
  }
  
  // Formatea una condición para URScript (UR3e)
  function formatConditionUR(cond) {
    if (!cond) return 'True';
    
    if (cond.type === 'read_di_block') {
      const state = cond.state == 1 ? 'True' : 'False';
      return `(get_standard_digital_in(${cond.pin}) == ${state})`;
    } else if (cond.type === 'logic_compare') {
      const opMap = { EQ: '==', NEQ: '!=', GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
      const a = formatMathUR(cond.a);
      const b = formatMathUR(cond.b);
      return `(${a} ${opMap[cond.operator] || '=='} ${b})`;
    } else if (cond.type === 'logic_boolean') {
      return cond.value ? 'True' : 'False';
    } else if (cond.type === 'logic_and') {
      return `(${formatConditionUR(cond.a)} and ${formatConditionUR(cond.b)})`;
    } else if (cond.type === 'logic_or') {
      return `(${formatConditionUR(cond.a)} or ${formatConditionUR(cond.b)})`;
    } else if (cond.type === 'logic_not') {
      return `(not ${formatConditionUR(cond.inner)})`;
    } else if (cond.type === 'read_ai_block') {
      return `analog_in[${cond.pin}]`;
    }
    return 'True';
  }
  
  // Formatea una condición para RAPID (ABB)
  function formatConditionRAPID(cond) {
    if (!cond) return 'TRUE';
    
    if (cond.type === 'read_di_block') {
      const state = cond.state == 1 ? '1' : '0';
      return `(DInput(di${cond.pin}) = ${state})`;
    } else if (cond.type === 'logic_compare') {
      const opMap = { EQ: '=', NEQ: '<>', GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
      const a = formatMathRAPID(cond.a);
      const b = formatMathRAPID(cond.b);
      return `(${a} ${opMap[cond.operator] || '='} ${b})`;
    } else if (cond.type === 'logic_boolean') {
      return cond.value ? 'TRUE' : 'FALSE';
    } else if (cond.type === 'logic_and') {
      return `(${formatConditionRAPID(cond.a)} AND ${formatConditionRAPID(cond.b)})`;
    } else if (cond.type === 'logic_or') {
      return `(${formatConditionRAPID(cond.a)} OR ${formatConditionRAPID(cond.b)})`;
    } else if (cond.type === 'logic_not') {
      return `(NOT ${formatConditionRAPID(cond.inner)})`;
    } else if (cond.type === 'read_ai_block') {
      return `AInput(ai${cond.pin})`;
    }
    return 'TRUE';
  }
  
  // Formatea una condición para Fanuc TP
  function formatConditionFanuc(cond) {
    if (!cond) return 'ON';
    
    if (cond.type === 'read_di_block') {
      const state = cond.state == 1 ? 'ON' : 'OFF';
      return `DI[${cond.pin}]=${state}`;
    } else if (cond.type === 'logic_compare') {
      const opMap = { EQ: '=', NEQ: '<>', GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
      const a = formatMathFanuc(cond.a);
      const b = formatMathFanuc(cond.b);
      return `${a}${opMap[cond.operator] || '='}${b}`;
    } else if (cond.type === 'logic_boolean') {
      return cond.value ? 'ON' : 'OFF';
    } else if (cond.type === 'logic_and') {
      return `(${formatConditionFanuc(cond.a)} AND ${formatConditionFanuc(cond.b)})`;
    } else if (cond.type === 'logic_or') {
      return `(${formatConditionFanuc(cond.a)} OR ${formatConditionFanuc(cond.b)})`;
    } else if (cond.type === 'logic_not') {
      return `(NOT ${formatConditionFanuc(cond.inner)})`;
    } else if (cond.type === 'read_ai_block') {
      return `AI[${cond.pin}]`;
    }
    return 'ON';
  }

  /* SECCIÓN 020: Generador de Código Principal (Función Router) */
  // Esta función actúa como un enrutador: recibe el programa, el robot y el modo, y llama al generador correspondiente
  function generateCodeForSelectedRobot(robot, program, mode, options = {}) {
    program = enrichProgramReferenceValues(program);
    const spd = currentDefaultSpeed();
    function resolveToolById(toolId) {
      if (!toolId) return null;
      const toolLibrary = (typeof window !== 'undefined' && window.ToolLibrary) ? window.ToolLibrary : {};
      return toolLibrary[toolId] || TOOL_DATABASE[toolId] || null;
    }

    function normalizePalletHookActionsShared(actions) {
      if (!Array.isArray(actions)) return [];
      return actions.filter(action => action && typeof action === 'object' && typeof action.type === 'string');
    }

    function formatPalletGripperLabelShared(options) {
      if (typeof options === 'string') {
        const modeRaw = String(options || '').trim();
        const mode = modeRaw.toLowerCase();
        if (mode === 'auto' || mode === 'tool' || mode === 'tool_actions') return 'AUTO (tool actions)';
        if (mode === 'digital' || mode === 'do' || mode === 'digital_output') return 'digital output DO1';
        if (mode === 'none' || mode === 'sin_pinza') return 'sin acción de pinza';
        return modeRaw || 'AUTO (tool actions)';
      }

      const closeActions = normalizePalletHookActionsShared(options?.closeActions);
      const openActions = normalizePalletHookActionsShared(options?.openActions);
      const allActions = [...closeActions, ...openActions];
      if (allActions.length === 0) return 'NONE';

      const firstDigital = allActions.find(action => action.type === 'set_do_block');
      if (firstDigital) {
        const fallbackPin = options?.fallbackPin ?? 1;
        const rawPin = firstDigital.pin ?? fallbackPin;
        const pin = Number.isFinite(Number(rawPin)) ? Number(rawPin) : fallbackPin;
        return `digital output DO${pin}`;
      }

      const hasRg2 = allActions.some(action => action.type === 'rg2_grip_set');
      if (hasRg2) return 'RG2/URCap';

      const hasToolAction = allActions.some(action => action.type === 'gripper_set');
      if (hasToolAction) {
        const actionTool = allActions.find(action => action.tool_id)?.tool_id;
        const toolId = actionTool ?? options?.activeToolId ?? options?.instrToolId ?? null;
        const tool = toolId ? resolveToolById(toolId) : null;
        if (tool?.type === 'io') {
          const rawPin = tool.channel ?? tool.pin;
          if (Number.isFinite(Number(rawPin))) {
            return `digital output DO${Number(rawPin)}`;
          }
        }
        if (tool?.id === 'onrobot_rg2_urcap' || tool?.type === 'urcap') {
          return 'RG2/URCap';
        }
        return 'tool_action';
      }

      return 'sin acciones configuradas';
    }

    /*
     * REGLA DE COHERENCIA ENTRE MODOS DE GENERACIÓN
     *
     * - Modo educativo:
     *   Debe ser una explicación didáctica fiel de la lógica real que ejecutará el robot.
     *   Puede usar mm, grados, nombres legibles y descripciones, pero no debe simplificar
     *   ni cambiar el tipo de movimiento respecto al código real.
     *
     * - Modo industrial:
     *   Debe generar código ejecutable compacto para el robot real.
     *   Puede usar bucles, variables auxiliares y unidades propias del robot
     *   (por ejemplo, metros y radianes en URScript).
     *
     * - Modo verificación / instrumentado:
     *   Debe mantener la misma trayectoria lógica que el modo industrial.
     *   Puede estar expandido y añadir step_end(...), snapshot_short, step_id,
     *   telemetría y metadatos, pero no debe modificar coordenadas, orientaciones
     *   ni tipos de movimiento.
     *
     * Regla práctica:
     *   educativo = explicación fiel
     *   industrial = ejecución real compacta
     *   verificación = ejecución real + instrumentación
     *
     * Antes de modificar este archivo, validar si fp_debug está activo:
     *   window.debugEducationalPalletizingTest()
     *   window.debugEducationalIndustrialSimpleMovesAudit()
     *   window.debugIndustrialVerificationAudit()
     */
    
    // MODO EDUCATIVO
    if (mode === CONSTANTS.MODES.EDUCATIONAL) {
      let lines = [`// Modo educativo para ${robot}`];
      lines.push(`// La configuración del TCP se define en los bloques de herramienta.`);
      
      function emit(instr) {
        if (!instr) return;
        const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
        if (w) {
          lines.push(`// ADVERTENCIA: Punto (X: ${instr.x}, Y: ${instr.y}, Z: ${instr.z}) está a ${w.d.toFixed(0)}mm, fuera del límite de ${w.limit}mm.`);
        }
        
        const sourceInfo = instr.sourceName 
          ? ` (usando ${instr.sourceType}: "${instr.sourceName}")` 
          : '';
        
        if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          if (checkSingularityWarning(instr.y)) {
            lines.push(`// ADVERTENCIA DE SINGULARIDAD: Mover linealmente cerca de Y=0.`);
          }
          lines.push(
            `Mover Lineal a (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}) ` +
            `a ${instr.speed ?? spd} mm/s${sourceInfo}`
          );
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
          lines.push(
            `Mover Articular a (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}) ` +
            `al ${instr.speed ?? spd}%${sourceInfo}`
          );
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          const w_via = warnIfOutOfReach(robot, instr.via_x, instr.via_y, instr.via_z);
          if (w_via) {
            lines.push(`// ADVERTENCIA (Vía): Punto (X: ${instr.via_x}, Y: ${instr.via_y}, Z: ${instr.via_z}) está a ${w_via.d.toFixed(0)}mm, fuera del límite de ${w_via.limit}mm.`);
          }
          const w_end = warnIfOutOfReach(robot, instr.end_x, instr.end_y, instr.end_z);
          if (w_end) {
            lines.push(`// ADVERTENCIA (Fin): Punto (X: ${instr.end_x}, Y: ${instr.end_y}, Z: ${instr.end_z}) está a ${w_end.d.toFixed(0)}mm, fuera del límite de ${w_end.limit}mm.`);
          }
          
          if (checkSingularityWarning(instr.via_y) || checkSingularityWarning(instr.end_y)) {
            lines.push(`// ADVERTENCIA DE SINGULARIDAD: Mover en círculo cerca de Y=0.`);
          }
          
          const viaInfo = instr.via_sourceName 
            ? ` (${instr.via_sourceType}: "${instr.via_sourceName}")` 
            : '';
          const endInfo = instr.end_sourceName 
            ? ` (${instr.end_sourceType}: "${instr.endSourceName}")` 
            : '';
          
          lines.push(
            `Mover Circular vía (X: ${instr.via_x ?? 0}, Y: ${instr.via_y ?? 0}, Z: ${instr.via_z ?? 0})${viaInfo} ` +
            `hasta (X: ${instr.end_x ?? 0}, Y: ${instr.end_y ?? 0}, Z: ${instr.end_z ?? 0})${endInfo} ` +
            `a ${instr.speed ?? spd} mm/s`
          );
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT) {
          lines.push(`Esperar ${instr.time || 1} segundos`);
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.SET_DO) {
          lines.push(`Poner Salida ${instr.pin} en ${instr.state == 1 ? 'ON' : 'OFF'}`);
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
          lines.push(`Esperar Entrada ${instr.pin} a estado ${instr.state == 1 ? 'ON' : 'OFF'}`);
        } else if (instr.type === 'set_tool') {
          const tool = resolveToolById(instr.tool_id);
          if (tool) {
            const educationalToolLabel = instr.tool_id === 'manual'
              ? 'Manual'
              : (tool.name || instr.tool_id);
            lines.push(`Seleccionar Herramienta: ${educationalToolLabel}`);
            if (instr.tool_id === 'manual') {
              lines.push(`  TCP Manual: (X:${instr.tcp_x ?? 0}, Y:${instr.tcp_y ?? 0}, Z:${instr.tcp_z ?? 0}, Rx:${instr.tcp_rx ?? 0}, Ry:${instr.tcp_ry ?? 0}, Rz:${instr.tcp_rz ?? 0})`);
            }
          } else {
            lines.push(`// Herramienta con ID '${instr.tool_id}' no encontrada.`);
          }
        } else if (instr.type === 'define_point') {
          lines.push(`Definir Punto: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'define_pose') {
          lines.push(`Definir Pose: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'define_frame') {
          lines.push(`Definir Frame: ${instr.name} (Origen: X:${instr.x ?? 0}, Y:${instr.y ?? 0}, Z:${instr.z ?? 0}, Rotación: Rx:${instr.rx ?? 0}, Ry:${instr.ry ?? 0}, Rz:${instr.rz ?? 0})`);
        } else if (instr.type === 'use_frame') {
          lines.push(`Activar Frame: ${instr.frameName}`);
          lines.push(`  → Todos los movimientos siguientes serán relativos a este frame`);
        } else if (instr.type === 'use_pose') {
          lines.push(`Usar Pose: ${instr.poseName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'use_point') {
          lines.push(`Usar Punto: ${instr.pointName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'if_block') {
          // Generar condición legible
          let condStr = formatConditionEducational(instr.condition);
          lines.push(`Si ${condStr} entonces:`);
          
          // Generar rama DO (indentada)
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              // Indentar las líneas añadidas
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          // Generar rama ELSE si existe
          if (instr.else && instr.else.length > 0) {
            lines.push(`Sino:`);
            instr.else.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              // Indentar las líneas añadidas
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Si`);
        } else if (instr.type === 'while_block') {
          // Generar condición legible
          let condStr = formatConditionEducational(instr.condition);
          lines.push(`Mientras ${condStr} hacer:`);
          
          // Generar cuerpo del bucle (indentado)
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              // Indentar las líneas añadidas
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Mientras`);
        } else if (instr.type === 'for_block') {
          const varName = instr.variable || 'i';
          const from = instr.from ?? 0;
          const to = instr.to ?? 10;
          lines.push(`Para ${varName} desde ${from} hasta ${to} hacer:`);
          
          // Generar cuerpo del bucle (indentado)
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              // Indentar las líneas añadidas
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Para`);
        } else if (instr.type === 'loop_block') {
          // Loop simple (mantener compatibilidad)
          const count = instr.count ?? 1;
          lines.push(`Repetir ${count} veces:`);
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Repetir`);
        } else if (instr.type === 'palletize_block') {
          // Paletizado Completo con Pick & Place (Método 3 Puntos)
          let pickPos = instr.pick_pose;
          if (!pickPos && instr.pick_pos && typeof instr.pick_pos === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            pickPos = {
              ...instr.pick_pos,
              rx: instr.pick_pos.rx ?? 0,
              ry: instr.pick_pos.ry ?? 180,
              rz: instr.pick_pos.rz ?? 0
            };
          }
          pickPos = pickPos || { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 };
          let p1 = instr.pallet_p1_pose;
          if (!p1 && instr.pallet_p1 && typeof instr.pallet_p1 === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            p1 = {
              ...instr.pallet_p1,
              rx: instr.pallet_p1.rx ?? 0,
              ry: instr.pallet_p1.ry ?? 180,
              rz: instr.pallet_p1.rz ?? 0
            };
          }
          p1 = p1 || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          const p2 = instr.pallet_p2 || { x: 400, y: 300, z: 0 };
          const p3 = instr.pallet_p3 || { x: 0, y: 600, z: 0 };
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickWait = instr.pick_wait_time ?? 0.5;
          const placeWait = instr.place_wait_time ?? 0.3;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const layerHeight = instr.layer_height ?? 60;
          const toolIdForGripper = instr?.tool_id ?? null;
          const gripperLabel = formatPalletGripperLabelShared({
            closeActions: instr?.grip_close_actions,
            openActions: instr?.grip_open_actions,
            fallbackPin: gripperPin,
            activeToolId: toolIdForGripper,
            instrToolId: toolIdForGripper
          });
          
          const palletValidationErrors = [];
          if (!p1 || !p2 || !p3) palletValidationErrors.push('P1/P2/P3 inexistentes');
          if (isSameXYZ(p1, p2)) palletValidationErrors.push('P2 coincide con P1');
          if (isSameXYZ(p1, p3)) palletValidationErrors.push('P3 coincide con P1');
          if ((rows ?? 0) <= 0) palletValidationErrors.push('rows <= 0');
          if ((cols ?? 0) <= 0) palletValidationErrors.push('cols <= 0');
          if ((layers ?? 0) <= 0) palletValidationErrors.push('layers <= 0');
          if ((placeApproach ?? 0) < 0) palletValidationErrors.push('approach_distance < 0');

          const safeRows = Math.max(1, Number(rows) || 1);
          const safeCols = Math.max(1, Number(cols) || 1);
          const safeLayers = Math.max(1, Number(layers) || 1);
          const safePickApproach = Math.max(0, Number(pickApproach) || 0);
          const safePlaceApproach = Math.max(0, Number(placeApproach) || 0);

          let safeP1 = p1 || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let safeP2 = p2 || addVector(safeP1, { x: 100, y: 0, z: 0 });
          let safeP3 = p3 || addVector(safeP1, { x: 0, y: 100, z: 0 });
          if (isSameXYZ(safeP1, safeP2)) safeP2 = addVector(safeP1, { x: 100, y: 0, z: 0 });
          if (isSameXYZ(safeP1, safeP3)) safeP3 = addVector(safeP1, { x: 0, y: 100, z: 0 });

          if (palletValidationErrors.length > 0) {
            lines.push(`⚠️ VALIDACIÓN PALET: ${palletValidationErrors.join('; ')}. Se aplica fallback controlado.`);
          }
          
          lines.push(`╭───────────────────────────────────────────────────────────╮`);
          lines.push(`│     PALETIZADO COMPLETO (MÉTODO 3 PUNTOS)              │`);
          lines.push(`╰───────────────────────────────────────────────────────────╯`);
          lines.push(``);
          lines.push(`📋 CONFIGURACIÓN:`);
          lines.push(`  🔵 Posición PICK (recogida):`);
          lines.push(`     └─ Coordenadas: (X:${pickPos.x ?? 0}, Y:${pickPos.y ?? 0}, Z:${pickPos.z ?? 0}) mm`);
          lines.push(`     └─ Altura aproximación: ${pickApproach} mm`);
          lines.push(`     └─ Gripper: ${gripperLabel}`);
          lines.push(`     └─ Tiempo espera: ${pickWait} s`);
          lines.push(``);
          lines.push(`  🟢 Configuración PALET (3 puntos):`);
          lines.push(`     └─ P1 (origen): (X:${p1.x ?? 0}, Y:${p1.y ?? 0}, Z:${p1.z ?? 0}) mm`);
          lines.push(`     └─ P1 orientación común: (Rx:${p1.rx ?? 0}, Ry:${p1.ry ?? 180}, Rz:${p1.rz ?? 0})°`);
          lines.push(`     └─ P2 (columnas): (X:${p2.x ?? 0}, Y:${p2.y ?? 0}, Z:${p2.z ?? 0}) mm`);
          lines.push(`     └─ P3 (filas): (X:${p3.x ?? 0}, Y:${p3.y ?? 0}, Z:${p3.z ?? 0}) mm`);
          lines.push(`     └─ Fórmula didáctica: P = P1 + columna·(P2-P1) + fila·(P3-P1) + capa·altura`);
          lines.push(`     └─ Patrón: ${safeRows} filas × ${safeCols} columnas × ${safeLayers} capas`);
          lines.push(`     └─ Altura entre capas: ${layerHeight} mm`);
          lines.push(`     └─ Altura aproximación: ${safePlaceApproach} mm`);
          lines.push(`     └─ Tiempo espera: ${placeWait} s`);
          lines.push(``);
          lines.push(`  📊 Total de ciclos Pick & Place: ${safeRows * safeCols * safeLayers}`);
          lines.push(``);
          lines.push(`═══════════════════════════════════════════════════════════`);
          lines.push(``);
          
          // Generar ciclos
          let cycleNum = 1;
          for (let layer = 0; layer < safeLayers; layer++) {
            lines.push(`▶ Capa ${layer + 1} de ${safeLayers}`);
            for (let row = 0; row < safeRows; row++) {
              for (let col = 0; col < safeCols; col++) {
                const placePose = computePalletPlacePose(safeP1, safeP2, safeP3, row, col, layer, layerHeight);
                const palletX = placePose.x;
                const palletY = placePose.y;
                const palletZ = placePose.z;
                const safetyZ = (safeP1.z ?? 0) + (layer * layerHeight) + 100;
                
                lines.push(``);
                lines.push(`  ┌─ Ciclo ${cycleNum}/${safeRows * safeCols * safeLayers} [Fila ${row + 1}, Col ${col + 1}]`);
                
                // Secuencia PICK
                lines.push(`  │  1. Mover Articular a aproximación PICK (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${((pickPos.z ?? 0) + safePickApproach).toFixed(1)})`);
                lines.push(`  │  2. Mover Lineal a PICK (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${pickPos.z ?? 0})`);
                lines.push(`  │  3. 🟢 Acción herramienta (Activar)`);
                lines.push(`  │  4. ⏱ Esperar ${pickWait} s`);
                lines.push(`  │  5. Mover Lineal a aproximación PICK (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${((pickPos.z ?? 0) + safePickApproach).toFixed(1)})`);
                
                // Secuencia PLACE (coherente con industrial: safety_z -> place_z_approach -> place_z)
                lines.push(`  │  6. Mover Articular a altura segura PALET (${palletX.toFixed(1)}, ${palletY.toFixed(1)}, ${safetyZ.toFixed(1)})`);
                lines.push(`  │  7. Mover Lineal a aproximación PALET (${palletX.toFixed(1)}, ${palletY.toFixed(1)}, ${(palletZ + safePlaceApproach).toFixed(1)})`);
                lines.push(`  │  8. Mover Lineal a PALET (${palletX.toFixed(1)}, ${palletY.toFixed(1)}, ${palletZ.toFixed(1)})`);
                lines.push(`  │  9. ⚪ Acción herramienta (Desactivar)`);
                lines.push(`  │  10. ⏱ Esperar ${placeWait} s`);
                lines.push(`  │  11. Mover Lineal a aproximación PALET (${palletX.toFixed(1)}, ${palletY.toFixed(1)}, ${(palletZ + safePlaceApproach).toFixed(1)})`);
                lines.push(`  └─ ✓ Ciclo ${cycleNum} completado`);
                
                cycleNum++;
              }
            }
          }
          
          lines.push(``);
          lines.push(`╭───────────────────────────────────────────────────────────╮`);
          lines.push(`│  ✓ PALETIZADO COMPLETO FINALIZADO                        │`);
          lines.push(`╰───────────────────────────────────────────────────────────╯`);
        } else if (instr.type === 'read_ai_block') {
          lines.push(`Leer AI[${instr.pin}] (devuelve valor en voltios 0-10V)`);
        } else if (instr.type === 'write_ao_block') {
          const value = formatMathEducational(instr.value);
          lines.push(`Escribir AO[${instr.pin}] = ${value} V`);
        } else if (instr.type === 'wait_ai_block') {
          const opMap = { GT: '>', LT: '<', GTE: '≥', LTE: '≤' };
          const opStr = opMap[instr.operator] || '>';
          const value = instr.value ?? 0;
          lines.push(`Esperar AI[${instr.pin}] ${opStr} ${value} V`);
        } else if (instr.type === 'function_def_params') {
          const params = instr.params ? instr.params.join(', ') : '';
          lines.push(`Función ${instr.funcname}(${params}):`);
          lines.push(`  // Nota: En Fanuc se implementa como subprograma separado .TP`);
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Función`);
        } else if (instr.type === 'function_call_params') {
          const args = instr.args ? instr.args.map(a => formatMathEducational(a)).join(', ') : '';
          lines.push(`Llamar ${instr.funcname}(${args})`);
        } else if (instr.type === 'function_return') {
          const value = formatMathEducational(instr.value);
          lines.push(`Retornar ${value}`);
        }
        emit(instr.next);
      }
      program.forEach(emit);
      return lines.join("\n");
    }

    /* SECCIÓN 021: Generador de Código Industrial para UR3e (URScript) */
    if (robot === CONSTANTS.ROBOTS.UR3E) {
      let lines = ['def program():'];
      lines.push(` # La configuración del TCP y payload se define con el bloque de herramienta.`);

      const instrumentationEnabled = Boolean(options && options.instrumentation);
      const plannedSteps = Array.isArray(options?.plannedSteps) ? options.plannedSteps : null;
      const executionMode =
        options?.executionMode ??
        (options?.mode === "planned" ? "planned" : undefined) ??
        "flat";
      const isPlannedMode = executionMode === "planned";
      let plannedStepIndex = 0;
      let fallbackStepId = 0;
      let instrumentationInsertCount = 0;
      const insertedStepEndIds = [];  // Track all step_end IDs for debug logging

      let emittedSteps = 0;
      let emittedStepEnd = 0;
      let loopCounterVarSeq = 0;

      const lastIOState = { channel: null, value: null };
      // Dedupe IO only for consecutive identical writes (avoid duplicated lines from plan)
      console.log(`UR Instrumentation enabled: ${instrumentationEnabled}`);

      let lastFlatIO = null;
      let currentFrameVar = null; // Nombre de la variable del frame activo
      const verifySet = new Set(options?.contextSummary?.verify_step_ids || []);
      const hasPalletTargetPhases = Array.isArray(plannedSteps) && plannedSteps.some((step) => {
        const phase = String(step?.meta?.phase || '').toLowerCase();
        return phase === 'target_pick' || phase === 'target_place';
      });
      function isVerificationCandidateStep(step) {
        if (!step || typeof step !== 'object') return false;
        const meta = step.meta || {};
        const phase = String(meta.phase || '').toLowerCase();
        const isTargetPhase = phase.startsWith('target_');
        const isFine = (typeof meta.zone_mm === 'number' && meta.zone_mm === 0)
          || meta.zone === 'fine'
          || meta.ur_r_m === 0;
        return isTargetPhase || isFine;
      }
      function logUrVerifyTarget(step) {
        if (!step || typeof step !== 'object') return;
        console.log('[UR VERIFY TARGETS]', {
          step_id: step.step_id,
          pointName: step.pointName || '',
          type: step.type || '',
          z: step?.target_pose?.z ?? null
        });
      }
      // Fallback: if plannedSteps exist but no verify_step_ids matched the filter,
      // mirror compiler criteria (target/fine) instead of instrumenting every move.
      if (plannedSteps && verifySet.size === 0 && instrumentationEnabled) {
        plannedSteps.forEach(step => {
          const shouldUseStep = hasPalletTargetPhases
            ? isVerificationCandidateStep(step)
            : (step && (step.type === 'MoveJ' || step.type === 'MoveL' || step.type === 'MoveC'));
          if (step && typeof step.step_id === 'number' && shouldUseStep) {
            verifySet.add(step.step_id);
          }
        });
      }
      const verifyIds = options?.contextSummary?.verify_step_ids;
      const verifyCount = options?.contextSummary?.verify_count;
      const toolLibrary = (typeof window !== 'undefined' && window.ToolLibrary) ? window.ToolLibrary : {};
      let activeToolId = program?.tool_id ?? null;
      let seenSetTool = false;
      const gripperSetContextQueue = [];

      function collectFlatBlocks(programBlocks) {
        const out = [];
        if (!Array.isArray(programBlocks)) return out;
        programBlocks.forEach(top => {
          let cur = top;
          const seen = new Set();
          while (cur && typeof cur === 'object' && !seen.has(cur)) {
            seen.add(cur);
            out.push(cur);
            cur = cur.next;
          }
        });
        return out;
      }

      (function buildGripperSetContexts() {
        const flatBlocks = collectFlatBlocks(program);
        let ctxToolId = activeToolId;
        let ctxSeenSetTool = false;

        flatBlocks.forEach(instr => {
          if (!instr) return;
          if (instr.type === 'set_tool') {
            ctxToolId = instr.tool_id || null;
            ctxSeenSetTool = true;
            return;
          }
          if (instr.type === 'gripper_set' || instr.type === 'rg2_grip_set') {
            gripperSetContextQueue.push({
              activeToolId: ctxToolId,
              seenSetTool: ctxSeenSetTool
            });
          }
        });
      })();

      function emitDigitalOut(lines, stepOrBlock, lastIOState, commandName = 'set_digital_out') {
        function toBool(value) {
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'false' || normalized === '0' || normalized === '' || normalized === 'off' || normalized === 'low') return false;
            if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'high') return true;
          }
          return !!value;
        }
        const ch = stepOrBlock?.io?.channel
          ?? stepOrBlock?.channel
          ?? stepOrBlock?.port
          ?? stepOrBlock?.pin
          ?? stepOrBlock?.meta?.pin
          ?? null;
        const chNum = typeof ch === 'string' && ch.trim() !== '' && !Number.isNaN(Number(ch))
          ? Number(ch)
          : ch;
        const rawVal = stepOrBlock?.io?.value
          ?? stepOrBlock?.value
          ?? stepOrBlock?.state
          ?? stepOrBlock?.meta?.value
          ?? null;
        const hasVal = rawVal !== null && rawVal !== undefined;
        const ioVal = hasVal ? toBool(rawVal) : false;
        const name = stepOrBlock?.io?.name ?? stepOrBlock?.name ?? '';

        if (!Number.isFinite(chNum)) {
          lines.push(` # TODO: IO_DO${name ? " (" + name + ")" : ""} missing channel`);
          return;
        }

        if (!Number.isInteger(chNum) || chNum < 0) {
          lines.push(` # TODO: IO_DO${name ? " (" + name + ")" : ""} invalid channel ${chNum}`);
          return;
        }

        if (!hasVal) {
          lines.push(` # TODO: IO_DO${name ? " (" + name + ")" : ""} missing value -> default False`);
        }

        if (lastIOState && lastIOState.channel === chNum && lastIOState.value === ioVal) {
          return;
        }

        lines.push(` ${commandName}(${chNum}, ${ioVal ? 'True' : 'False'})`);

        if (lastIOState) {
          lastIOState.channel = chNum;
          lastIOState.value = ioVal;
        }
      }

      function emitToolAction(lines, action, tool, params) {
        if (!tool) {
          lines.push(` # TODO: tool not set`);
          return;
        }
        const indent = params?.indent ?? '';
        if (tool.type === 'urcap') {
          if (tool.id === 'onrobot_rg2_urcap') {
            const fromDefaults = action === 'open' ? 'open' : 'close';
            const result = buildRg2GripCommand({ tool, fromDefaults });
            if (!result.ok) {
              lines.push(` # ADVERTENCIA: RG2 ${result.reason || 'error'} (omitido)`);
              return;
            }
            lines.push(`${indent}${result.cmd}`);
            return;
          }
          const template = action === 'close' ? tool?.ur?.close : tool?.ur?.open;
          if (!template) {
            lines.push(` # TODO: tool action not supported`);
            return;
          }
          const merged = { ...(tool.defaults || {}), ...(params || {}) };
          let cmd = template;
          cmd = cmd.replace('{width}', merged.width ?? tool.defaults?.width ?? '');
          cmd = cmd.replace('{force}', merged.force ?? tool.defaults?.force ?? '');
          lines.push(`${indent}${cmd}`);
          return;
        }
        if (tool.type === 'io') {
          const channel = tool?.channel ?? tool?.pin;
          if (typeof channel !== 'number') {
            lines.push(` # TODO: tool io channel missing`);
            return;
          }
          const ioVal = action === 'close';
          lines.push(`${indent}set_digital_out(${channel}, ${ioVal ? 'True' : 'False'})`);
          return;
        }
        lines.push(` # TODO: tool type not supported`);
      }

      function toOptionalPositiveWaitSeconds(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return null;
        return num;
      }

      function formatWaitSeconds(value) {
        const normalized = toOptionalPositiveWaitSeconds(value);
        if (normalized === null) return null;
        return `${parseFloat(normalized.toFixed(3))}`;
      }

      function isFpDebugEnabled() {
        try {
          return window.fp_debug === true || window.localStorage.getItem('fp_debug') === 'true';
        } catch (_err) {
          return window.fp_debug === true;
        }
      }

      function normalizePalletHookActions(actions, options = {}) {
        if (!Array.isArray(actions)) return [];

        const defaultWaitS = toOptionalPositiveWaitSeconds(options?.defaultWaitS);
        const hasExplicitWaitBlock = actions.some(action => action && action.type === 'wait_block');

        return actions
          .filter(action => action && typeof action === 'object' && typeof action.type === 'string')
          .map(action => {
            const normalized = { ...action };
            const rawWait = action.wait_s
              ?? action.delay_s
              ?? action.sleep_s
              ?? action.wait
              ?? action.seconds
              ?? (action.type === 'wait_block' ? action.time : null);
            let waitS = toOptionalPositiveWaitSeconds(rawWait);

            if (waitS === null && action.type !== 'wait_block' && !hasExplicitWaitBlock && defaultWaitS !== null) {
              waitS = defaultWaitS;
            }

            if (waitS !== null) {
              normalized.wait_s = waitS;
            }

            return normalized;
          });
      }

      function formatPalletGripperLabel(options) {
        const closeActions = normalizePalletHookActions(options?.closeActions);
        const openActions = normalizePalletHookActions(options?.openActions);
        const allActions = [...closeActions, ...openActions];
        if (allActions.length === 0) return 'NONE';

        const firstDigital = allActions.find(action => action.type === 'set_do_block');
        if (firstDigital) {
          const fallbackPin = options?.fallbackPin ?? 1;
          const rawPin = firstDigital.pin ?? fallbackPin;
          const pin = Number.isFinite(Number(rawPin)) ? Number(rawPin) : fallbackPin;
          return `digital output DO${pin}`;
        }

        const hasRg2 = allActions.some(action => action.type === 'rg2_grip_set');
        if (hasRg2) return 'RG2/URCap';

        const hasToolAction = allActions.some(action => action.type === 'gripper_set');
        if (hasToolAction) {
          const actionTool = allActions.find(action => action.tool_id)?.tool_id;
          const toolId = actionTool ?? options?.activeToolId ?? options?.instrToolId ?? null;
          const tool = toolId ? resolveToolById(toolId) : null;
          if (tool?.type === 'io') {
            const rawPin = tool.channel ?? tool.pin;
            if (Number.isFinite(Number(rawPin))) {
              return `digital output DO${Number(rawPin)}`;
            }
          }
          if (tool?.id === 'onrobot_rg2_urcap' || tool?.type === 'urcap') {
            return 'RG2/URCap';
          }
          return 'tool_action';
        }

        return 'sin acciones configuradas';
      }

      function emitPalletHookActions(lines, actions, options) {
        const hookActions = normalizePalletHookActions(actions, options);
        if (hookActions.length === 0) return false;

        const indent = options?.indent ?? '';
        const fallbackPin = options?.fallbackPin ?? 1;
        const phase = options?.phase === 'place' ? 'place' : 'pick';
        const closeAction = phase === 'pick';
        const debugMode = isFpDebugEnabled();

        const emitActionWaitIfNeeded = (action) => {
          const waitLiteral = formatWaitSeconds(action?.wait_s);
          if (waitLiteral == null) return;
          lines.push(`${indent}sleep(${waitLiteral})`);
        };

        const logGripAction = (payload) => {
          if (!debugMode) return;
          const channelPart = payload.channel ?? 'na';
          const valuePart = payload.value ?? 'na';
          const waitLiteral = formatWaitSeconds(payload.wait_s);
          const waitPart = waitLiteral ?? 'none';
          console.log(
            `[PALLET GRIP ACTION] phase=${phase} type=${payload.type} channel=${channelPart} value=${valuePart} wait_s=${waitPart}`
          );
        };

        let emitted = false;

        hookActions.forEach(action => {
          if (action.type === 'set_do_block') {
            const rawPin = action.pin ?? fallbackPin;
            const pin = Number.isFinite(Number(rawPin)) ? Number(rawPin) : fallbackPin;
            const state = action.state == 1;
            lines.push(`${indent}set_standard_digital_out(${pin}, ${state ? 'True' : 'False'})`);
            emitActionWaitIfNeeded(action);
            logGripAction({ type: 'digital_out', channel: pin, value: state ? 'true' : 'false', wait_s: action.wait_s });
            emitted = true;
            return;
          }

          if (action.type === 'wait_block') {
            const waitLiteral = formatWaitSeconds(action.wait_s ?? action.time ?? action.seconds);
            if (waitLiteral != null) {
              lines.push(`${indent}sleep(${waitLiteral})`);
              emitted = true;
            }
            return;
          }

          if (action.type === 'gripper_set' || action.type === 'rg2_grip_set') {
            const actionToolId = action.tool_id ?? options?.activeToolId ?? options?.instrToolId ?? null;
            const tool = actionToolId ? resolveToolById(actionToolId) : null;
            if (!tool) {
              lines.push(`${indent}# ADVERTENCIA: acción de pinza sin herramienta activa (omitida)`);
              return;
            }

            if (action.type === 'rg2_grip_set' || tool.id === 'onrobot_rg2_urcap') {
              const result = buildRg2GripCommand({
                tool,
                width: action.width_mm ?? action.width,
                force: action.force ?? action.force_n
              });
              if (!result.ok) {
                lines.push(`${indent}# ADVERTENCIA: RG2 sin width/force válidos (omitido)`);
                return;
              }
              lines.push(`${indent}${result.cmd}`);
              emitActionWaitIfNeeded(action);
              logGripAction({ type: 'rg2_urcap', channel: 'na', value: closeAction ? 'true' : 'false', wait_s: action.wait_s });
              emitted = true;
              return;
            }

            emitToolAction(lines, closeAction ? 'close' : 'open', tool, {
              ...(action || {}),
              indent
            });
            emitActionWaitIfNeeded(action);
            logGripAction({ type: 'tool_action', channel: 'na', value: closeAction ? 'true' : 'false', wait_s: action.wait_s });
            emitted = true;
          }
        });

        return emitted;
      }

      function clampNonNegative(value, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return num < 0 ? 0 : num;
      }

      function toNonNegativeNumber(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        return Math.max(0, num);
      }

      function toolName(toolId) {
        if (!toolId) return 'sin herramienta definida';
        const tool = toolLibrary[toolId];
        return tool?.displayName || tool?.name || toolId;
      }

      function buildRg2GripCommand(options) {
        const opts = options || {};
        const tool = opts.tool || (opts.toolId ? toolLibrary[opts.toolId] : null) || toolLibrary.onrobot_rg2_urcap;
        if (!tool || tool.type !== 'urcap') {
          return { ok: false, reason: 'invalid_tool' };
        }

        let width = null;
        let forceVal = null;

        if (opts.fromDefaults) {
          const defaults = tool.defaults || {};
          if (opts.fromDefaults === 'open') {
            width = defaults.openWidth;
            forceVal = defaults.openForce;
          } else if (opts.fromDefaults === 'close') {
            width = defaults.closeWidth;
            forceVal = defaults.closeForce;
          } else {
            return { ok: false, reason: 'invalid_mode' };
          }

          if (!Number.isFinite(Number(width)) || !Number.isFinite(Number(forceVal))) {
            return { ok: false, reason: 'missing_defaults' };
          }
        } else {
          if (!Number.isFinite(Number(opts.width)) || !Number.isFinite(Number(opts.force))) {
            return { ok: false, reason: 'missing_params' };
          }
          width = opts.width;
          forceVal = opts.force;
        }

        width = clampNonNegative(width, 0);
        forceVal = clampNonNegative(forceVal, 0);
        const profile = tool?.ur?.profiles?.rg2_urcap_rg_grip;

        if (profile?.fnName) {
          const args = Array.isArray(profile.args) ? profile.args : ['width_mm', 'force'];
          const values = args.map(arg => {
            if (arg === 'width_mm' || arg === 'width') return width;
            if (arg === 'force' || arg === 'force_n') return forceVal;
            return '';
          });
          return { ok: true, cmd: `${profile.fnName}(${values.join(', ')})`, width, force: forceVal };
        }

        return { ok: true, cmd: `rg_grip(${width}, ${forceVal})`, width, force: forceVal };
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

        return {
          zone_mm: zoneMm,
          ur_r_m: zoneMm / 1000
        };
      }

      function nextPlannedMoveStep() {
        if (!plannedSteps) return null;
        while (plannedStepIndex < plannedSteps.length) {
          const step = plannedSteps[plannedStepIndex++];
          if (step && (step.type === 'MoveJ' || step.type === 'MoveL')) return step;
        }
        return null;
      }

      function consumePlannedMoveSteps(count) {
        if (!plannedSteps || count <= 0) return;
        let remaining = count;
        while (plannedStepIndex < plannedSteps.length && remaining > 0) {
          const step = plannedSteps[plannedStepIndex++];
          if (step && (step.type === 'MoveJ' || step.type === 'MoveL')) {
            remaining -= 1;
          }
        }
      }

      function resolveInstrumentationForMove(instr, zoneInfo) {
        let stepId = typeof instr.step_id === 'number' ? instr.step_id : null;
        let meta = instr.meta || null;
        let effectiveZone = zoneInfo;

        if (plannedSteps) {
          const plannedStep = nextPlannedMoveStep();
          if (plannedStep) {
            stepId = plannedStep.step_id;
            meta = plannedStep.meta || meta;
            if (plannedStep.meta && typeof plannedStep.meta.ur_r_m === 'number') {
              effectiveZone = { ...effectiveZone, ur_r_m: plannedStep.meta.ur_r_m };
            }
          }
        }

        const phase = meta?.phase;
        const isTargetPhase = typeof phase === 'string' && phase.toLowerCase().startsWith('target');
        const isFine = effectiveZone && Number(effectiveZone.ur_r_m) === 0;

        if (!plannedSteps && (isTargetPhase || isFine) && (stepId === null || typeof stepId === 'undefined')) {
          stepId = fallbackStepId;
          fallbackStepId += 1;
        }

        let shouldInsert = (isTargetPhase || isFine) && typeof stepId === 'number';
        if (plannedSteps && verifySet.size > 0) {
          shouldInsert = typeof stepId === 'number' && verifySet.has(stepId);
        }
        return { shouldInsert, stepId };
      }

      /**
       * buildPalletVerifyFormula - derive first/stride formula per verify phase.
       *
       * Uses plannedSteps from compiler.js and verify_step_ids from contextSummary.
       * Returns formula metadata per phase so generated URScript does not need
       * list literals or list indexing.
       */
      function buildPalletVerifyFormula(blockId) {
        if (!plannedSteps || plannedSteps.length === 0) return null;

        const VERIFY_PHASES = ['target_pick', 'target_place'];
        const idsByPhase = {};
        VERIFY_PHASES.forEach(ph => { idsByPhase[ph] = []; });

        plannedSteps.forEach(step => {
          if (!step) return;
          const meta = step.meta || {};
          const phase = meta.phase;
          if (!VERIFY_PHASES.includes(phase)) return;
          if (blockId != null && meta.origin_block_id != null && meta.origin_block_id !== blockId) return;
          logUrVerifyTarget(step);
          idsByPhase[phase].push(step.step_id);
        });

        function calcStride(ids) {
          if (!Array.isArray(ids) || ids.length === 0) return null;
          if (ids.length === 1) return 0;
          const stride = ids[1] - ids[0];
          for (let i = 2; i < ids.length; i++) {
            if ((ids[i] - ids[i - 1]) !== stride) return null;
          }
          return stride;
        }

        const cycleCount = idsByPhase.target_pick.length;
        const phaseFormula = {};
        VERIFY_PHASES.forEach(ph => {
          const ids = idsByPhase[ph];
          const stride = calcStride(ids);
          const hasCycleAlignedLength = cycleCount > 0 && ids.length === cycleCount;
          const enabled = ids.length > 0 && hasCycleAlignedLength && stride !== null;
          phaseFormula[ph] = {
            enabled,
            firstSid: enabled ? ids[0] : null,
            stride: enabled ? stride : null,
            count: ids.length
          };
        });

        return { phaseFormula, cycleCount };
      }

      function collectPalletPredictedVerifyIds(palletVerify) {
        if (!palletVerify || !palletVerify.phaseFormula || !(palletVerify.cycleCount > 0)) return [];
        const predicted = [];
        ['target_pick', 'target_place'].forEach((phase) => {
          const formula = palletVerify.phaseFormula?.[phase];
          if (!formula?.enabled) return;
          for (let cycleIndex = 0; cycleIndex < palletVerify.cycleCount; cycleIndex++) {
            predicted.push(formula.firstSid + cycleIndex * formula.stride);
          }
        });
        return predicted.sort((a, b) => a - b);
      }

      if (instrumentationEnabled) {
        if (isPlannedMode) {
          const _effectiveVerifyIds = [...verifySet].sort((a, b) => a - b);
          if (_effectiveVerifyIds.length > 0) {
            lines.push(` # verify_count=${_effectiveVerifyIds.length} (step_end only on verify_step_ids)`);
            lines.push(` # verify_ids: first=${_effectiveVerifyIds[0]} last=${_effectiveVerifyIds[_effectiveVerifyIds.length - 1]}`);
          } else if (!verifyIds) {
            lines.push(` # verify_mode=fallback_meta_phase`);
          }
        }
        lines.push(` # INSTRUMENTATION SECTION`);
        lines.push(` # SOCKET TELEMETRY`);
        const _sockHost1 = (typeof options?.socket_host === 'string' && options.socket_host.trim()) ? options.socket_host.trim() : '192.168.0.50';
        const _sockPort1 = (Number.isFinite(options?.socket_port) && options.socket_port >= 1 && options.socket_port <= 65535) ? options.socket_port : 5000;
        lines.push(` # socket target: ${_sockHost1}:${_sockPort1}`);
        lines.push(` # payload: STEP;snapshot_short;step_id;event_counter;x_mm;y_mm;z_mm;rx_rad;ry_rad;rz_rad`);
        lines.push(` # snapshot_id=${options?.program_snapshot_id ?? options?.snapshot_id ?? 'n/a'}`);
        const _snapShort1 = computeSnapshotShortId(options?.program_snapshot_id ?? options?.snapshot_id ?? '');
        lines.push(` # snapshot_short=${_snapShort1}`);
        lines.push(` global fp_event_counter = 0`);
        lines.push(` global fp_last_sent_counter = 0`);
        lines.push(` global fp_last_step_id = -1`);
        lines.push(` global fp_snapshot_short = ${_snapShort1}`);
        lines.push(` global fp_socket_name = "fp_iot"`);
        lines.push(` global fp_socket_host = "${_sockHost1}"`);
        lines.push(` global fp_socket_port = ${_sockPort1}`);
        lines.push(` global fp_socket_ok = False`);
        lines.push(` global fp_last_x_mm = 0`);
        lines.push(` global fp_last_y_mm = 0`);
        lines.push(` global fp_last_z_mm = 0`);
        lines.push(` global fp_last_rx = 0`);
        lines.push(` global fp_last_ry = 0`);
        lines.push(` global fp_last_rz = 0`);
        lines.push(` def step_end(step_id):`);
        lines.push(`  pose = get_actual_tcp_pose()`);
        lines.push(`  global fp_last_x_mm = pose[0] * 1000`);
        lines.push(`  global fp_last_y_mm = pose[1] * 1000`);
        lines.push(`  global fp_last_z_mm = pose[2] * 1000`);
        lines.push(`  global fp_last_rx = pose[3]`);
        lines.push(`  global fp_last_ry = pose[4]`);
        lines.push(`  global fp_last_rz = pose[5]`);
        lines.push(`  global fp_last_step_id = step_id`);
        lines.push(`  global fp_event_counter = fp_event_counter + 1`);
        lines.push(` end`);

        // Funciones de ciclo para bloques cíclicos/paletizado
        lines.push(` def cycle_start(cycle_number):`);
        lines.push(`  step_end(10000)`);
        lines.push(`  sleep(0.05)`);
        lines.push(` end`);
        lines.push(` def cycle_end(cycle_number):`);
        lines.push(`  step_end(20000)`);
        lines.push(`  sleep(0.05)`);
        lines.push(` end`);
        lines.push(` thread fp_sender_thread():`);
        lines.push(`  global fp_socket_ok = socket_open(fp_socket_host, fp_socket_port, fp_socket_name)`);
        lines.push(`  fp_retry_count = 0`);
        lines.push(`  while True:`);
        lines.push(`    if fp_socket_ok == False:`);
        lines.push(`      fp_retry_count = fp_retry_count + 1`);
        lines.push(`      if fp_retry_count >= 100:`);
        lines.push(`        fp_retry_count = 0`);
        lines.push(`        socket_close(fp_socket_name)`);
        lines.push(`        global fp_socket_ok = socket_open(fp_socket_host, fp_socket_port, fp_socket_name)`);
        lines.push(`      end`);
        lines.push(`    end`);
        lines.push(`    if fp_last_sent_counter != fp_event_counter:`);
        lines.push(`      local_counter = fp_event_counter`);
        lines.push(`      local_step_id = fp_last_step_id`);
        lines.push(`      local_x = fp_last_x_mm`);
        lines.push(`      local_y = fp_last_y_mm`);
        lines.push(`      local_z = fp_last_z_mm`);
        lines.push(`      local_rx = fp_last_rx`);
        lines.push(`      local_ry = fp_last_ry`);
        lines.push(`      local_rz = fp_last_rz`);
        lines.push(`      msg = str_cat("STEP", ";")`);
        lines.push(`      msg = str_cat(msg, to_str(fp_snapshot_short))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_step_id))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_counter))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_x))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_y))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_z))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_rx))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_ry))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_rz))`);
        lines.push(`      if fp_socket_ok:`);
        lines.push(`        send_ok = socket_send_line(msg, fp_socket_name)`);
        lines.push(`        if send_ok:`);
        lines.push(`          global fp_last_sent_counter = local_counter`);
        lines.push(`        else:`);
        lines.push(`          socket_close(fp_socket_name)`);
        lines.push(`          global fp_socket_ok = False`);
        lines.push(`        end`);
        lines.push(`      end`);
        lines.push(`    end`);
        lines.push(`    sync()`);
        lines.push(`  end`);
        lines.push(` end`);
        lines.push(` socket_close(fp_socket_name)`);
        lines.push(` sleep(0.2)`);
        lines.push(` fp_sender_handle = run fp_sender_thread()`);
        lines.push(` sleep(0.2)`);
      }

      function toURPose(pose) {
        const raw = pose || {};
        let x = raw.x ?? 0;
        let y = raw.y ?? 0;
        let z = raw.z ?? 0;
        let rx = raw.rx ?? 0;
        let ry = raw.ry ?? 0;
        let rz = raw.rz ?? 0;

        if (Math.abs(x) > 5 || Math.abs(y) > 5 || Math.abs(z) > 5) {
          x = x / 1000;
          y = y / 1000;
          z = z / 1000;
        }

        // Compatibilidad: Rx/Ry/Rz se esperan en radianes (Polyscope).
        // Si algún valor supera ±3.2 rad, se asume entrada en grados y se convierte.
        if (Math.abs(rx) > 3.2 || Math.abs(ry) > 3.2 || Math.abs(rz) > 3.2) {
          rx = (rx * Math.PI) / 180;
          ry = (ry * Math.PI) / 180;
          rz = (rz * Math.PI) / 180;
        }

        return `p[${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)}, ${rx.toFixed(6)}, ${ry.toFixed(6)}, ${rz.toFixed(6)}]`;
      }

      function plannedStepToPose(step) {
        const pose = step?.target_pose || step?.target_pos || step?.position || step?.pose || {};
        return toURPose(pose);
      }

      function getZoneInfoFromStep(step) {
        const zoneStr = step?.meta?.zone || step?.zone || 'fine';
        const zoneInfo = parseZone(zoneStr);
        if (typeof step?.meta?.ur_r_m === 'number') {
          zoneInfo.ur_r_m = step.meta.ur_r_m;
        }
        return zoneInfo;
      }

      function emitPlannedStep(step) {
        if (!step) return;
        const type = step.type;
        emittedSteps += 1;

        if (type === 'MoveJ' || type === 'MoveL') {
          const poseStr = plannedStepToPose(step);
          const speed_mms = step.speed ?? spd;
          const speed_ms = ((speed_mms) / 1000.0).toFixed(3);
          const zoneInfo = getZoneInfoFromStep(step);
          const rValue = typeof step?.meta?.ur_r_m === 'number' ? step.meta.ur_r_m : zoneInfo.ur_r_m;

          if (type === 'MoveJ') {
            lines.push(` movej(${poseStr}, a=1.4, v=${speed_ms}, r=${Number(rValue).toFixed(3)})`);
          } else {
            lines.push(` movel(${poseStr}, a=1.2, v=${speed_ms}, r=${Number(rValue).toFixed(3)})`);
          }

          if (instrumentationEnabled) {
            const phase = step?.meta?.phase;
            const isTargetPhase = typeof phase === 'string' && phase.toLowerCase().startsWith('target_');
            const zoneInfo = getZoneInfoFromStep(step);
            const isFine = Number(zoneInfo?.ur_r_m) === 0;
            const shouldInsert = typeof step.step_id === 'number'
              && (verifySet.size > 0 ? verifySet.has(step.step_id) : (isTargetPhase || isFine));
            if (shouldInsert && typeof step.step_id === 'number') {
              const verifyLabel = verifySet.size > 0
                ? (step?.meta?.phase ?? `step_${step.step_id}`)
                : phase;
              lines.push(` # verify ${verifyLabel}`);
              lines.push(` step_end(${step.step_id})`);
              insertedStepEndIds.push(step.step_id);
              instrumentationInsertCount += 1;
              emittedStepEnd += 1;
            }
          }
          return;
        }

        if (type === 'IO_DO' || type === 'SetDO' || type === 'DO' || type === 'io_do') {
          emitDigitalOut(lines, step, lastIOState, 'set_digital_out');
          const waitSeconds = step?.wait_s ?? step?.waitSeconds ?? step?.meta?.wait_s ?? 0;
          if (waitSeconds > 0) {
            lines.push(` sleep(${Number(waitSeconds).toFixed(3)})`);
          }
          return;
        }

        if (type === 'tool' || step?.kind === 'tool') {
          if (step?.action === 'gripper_close' || step?.action === 'gripper_open') {
            const toolId = step?.tool_id ?? null;
            const toolDef = toolId ? toolLibrary[toolId] : null;
            const act = step?.action === 'gripper_close'
              ? toolDef?.actions?.close
              : toolDef?.actions?.open;

            if (!toolId || !act) {
              const tc = step?.meta?.tool_context;
              if (tc?.seenSetTool) {
                lines.push(` # ADVERTENCIA: tool NULL o sin actions para ${step?.action}`);
              }
              return;
            }

            if (act.type === 'rg_grip') {
              const isUrRobot = typeof robot === 'string' && robot.toUpperCase().includes('UR');
              if (!isUrRobot) {
                lines.push(` # ADVERTENCIA: Acción RG2 en robot "${robot}". Solo UR (omitido)`);
                return;
              }

              const result = buildRg2GripCommand({
                tool: toolDef,
                fromDefaults: act.fromDefaults
              });
              if (!result.ok) {
                const tc = step?.meta?.tool_context;
                if (tc?.seenSetTool) {
                  const reason = result.reason || 'error';
                  lines.push(` # ADVERTENCIA: RG2 ${reason} para ${step?.action} (omitido)`);
                }
                return;
              }

              lines.push(` ${result.cmd}`);
              return;
            }

            if (act.type === 'digital_out') {
              emitDigitalOut(lines, { channel: act.channel, value: act.value }, lastIOState, 'set_digital_out');
              return;
            }

            lines.push(` # ADVERTENCIA: Acción de tool no soportada (${act.type || 'unknown'})`);
            return;
          }

          if (step?.action === 'grip_set') {
            const isUrRobot = typeof robot === 'string' && robot.toUpperCase().includes('UR');
            if (!isUrRobot) {
              lines.push(` # ADVERTENCIA: Bloque RG2 usado con robot "${robot}". RG2 URCap solo es compatible con UR. (omitido)`);
              return;
            }
            const ctx = gripperSetContextQueue.length > 0
              ? gripperSetContextQueue.shift()
              : { activeToolId: null, seenSetTool: false };

            if (ctx.activeToolId === 'onrobot_rg2_urcap') {
              const result = buildRg2GripCommand({
                width: step?.width_mm,
                force: step?.force,
                tool: toolLibrary?.onrobot_rg2_urcap
              });
              if (!result.ok) {
                lines.push(` # ADVERTENCIA: Bloque RG2 sin width/force válidos (omitido)`);
                return;
              }
              lines.push(` ${result.cmd}`);
              return;
            }

            if (ctx.activeToolId != null) {
              lines.push(` # ADVERTENCIA: Bloque RG2 sin herramienta activa RG2 URCap. Herramienta activa: "${ctx.activeToolId}". Inserta set_tool RG2 antes. (omitido)`);
              return;
            }

            if (ctx.seenSetTool) {
              lines.push(` # ADVERTENCIA: Bloque RG2 pero la herramienta activa es NULL (hubo set_tool). Inserta set_tool RG2 antes. (omitido)`);
            }
            return;
          }
          lines.push(` # Paso de herramienta no soportado: ${step?.action || 'unknown'}`);
          return;
        }

        if (type === 'WAIT' || type === 'Wait' || type === 'sleep') {
          const waitSeconds = step?.wait_s ?? step?.seconds ?? step?.waitSeconds ?? step?.time ?? 0.1;
          lines.push(` sleep(${Number(waitSeconds).toFixed(3)})`);
          return;
        }

        lines.push(` # Paso no soportado: ${type}`);
      }

      if (isPlannedMode) {
        const steps = plannedSteps || [];
        steps.forEach(emitPlannedStep);
        lines.push('end');
        lines.push('');
        lines.push('program()');
        console.debug(`[UR planned] snapshot=${options?.program_snapshot_id ?? "n/a"} steps=${emittedSteps} step_end=${emittedStepEnd}`);
        if (instrumentationEnabled) {
          console.log(`UR Instrumentation step_end inserted: ${instrumentationInsertCount}`);
          if (insertedStepEndIds.length > 0) {
            console.debug('[UR VERIFY] inserted step_end ids:', insertedStepEndIds);
          }
        }
        const code = lines.join('\n');
        
        // Validate: count actual motion commands in generated code
        const motionCommandCount = (code.match(/\b(?:movej|movel|movec)\s*\(/gi) || []).length;
        const plannedList = Array.isArray(plannedSteps) ? plannedSteps : [];
        const plannedMotionSteps = plannedList.filter(step => {
          const type = String(step?.type || step?.meta?.motion || step?.motion || '').trim().toLowerCase();
          if (type.startsWith('move')) return true;
          return !!step?.target_pose && !['io_do', 'set_do', 'digital_output', 'gripper', 'wait', 'sleep', 'io'].includes(type);
        });
        const nonMotionSteps = plannedList.filter(step => {
          const type = String(step?.type || step?.meta?.motion || step?.motion || '').trim().toLowerCase();
          return ['io_do', 'set_do', 'digital_output', 'gripper', 'wait', 'sleep', 'io'].includes(type);
        });
        if (instrumentationEnabled) {
          const plannedMotionCount = plannedMotionSteps.length;
          const nonMotionCount = nonMotionSteps.length;
          const totalPlannedSteps = plannedList.length;
          if (plannedMotionCount === motionCommandCount) {
            console.log(`[VERIFY OK] planned motion steps=${plannedMotionCount} generated motion commands=${motionCommandCount} nonMotionSteps=${nonMotionCount} totalPlannedSteps=${totalPlannedSteps}`);
          } else {
            console.warn(`[VERIFY MISMATCH] planned motion steps=${plannedMotionCount} generated motion commands=${motionCommandCount} nonMotionSteps=${nonMotionCount} totalPlannedSteps=${totalPlannedSteps}`);
          }
        }
        
        return code;
      }

      function gen(instr) {
        if (!instr) return;
        const indentGeneratedLines = (startIndex, indentPrefix = '  ') => {
          for (let i = startIndex; i < lines.length; i++) {
            if (typeof lines[i] === 'string' && lines[i].trim().length > 0) {
              lines[i] = `${indentPrefix}${lines[i]}`;
            }
          }
        };
        if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J || instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (lines.push(` # WARNING: Punto fuera de alcance (${w.d.toFixed(0)}mm > ${w.limit}mm)`));
          
          const x_m = (instr.x / 1000).toFixed(5);
          const y_m = (instr.y / 1000).toFixed(5);
          const z_m = (instr.z / 1000).toFixed(5);
          const isPoseTarget = instr.sourceType === 'pose';
          // Rx/Ry/Rz se esperan en radianes (Polyscope). Compat: convierte si |val|>3.2 (probablemente grados).
          const _toRadUR = v => { const n = Number(v ?? 0); return Math.abs(n) > 3.2 ? n * Math.PI / 180 : n; };
          const rx = isPoseTarget ? _toRadUR(instr.rx ?? 0) : 0;
          const ry = isPoseTarget ? _toRadUR(instr.ry ?? 3.14) : 3.14;
          const rz = isPoseTarget ? _toRadUR(instr.rz ?? 0) : 0;
          
          let poseStr = `p[${x_m}, ${y_m}, ${z_m}, ${rx.toFixed(5)}, ${ry.toFixed(5)}, ${rz.toFixed(5)}]`;
          
          // Si hay frame activo, aplicar pose_trans()
          if (currentFrameVar) {
            poseStr = `pose_trans(${currentFrameVar}, ${poseStr})`;
          }
          
          if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
            const speed_pct = (instr.speed ?? spd) / 100.0;
            const zoneInfo = parseZone(instr.zone);
            lines.push(` movej(${poseStr}, a=1.4, v=${speed_pct.toFixed(2)}, r=${zoneInfo.ur_r_m.toFixed(3)})`);
            if (instrumentationEnabled) {
              const { shouldInsert, stepId } = resolveInstrumentationForMove(instr, zoneInfo);
              if (shouldInsert) {
                lines.push(` step_end(${stepId})`);
                instrumentationInsertCount += 1;
              }
            }
          } else {
            if (checkSingularityWarning(instr.y)) {
              lines.push(` # ADVERTENCIA: movel cerca de Y=0. Riesgo de singularidad.`);
            }
            const speed_ms = ( (instr.speed ?? spd) / 1000.0 ).toFixed(3);
            const zoneInfo = parseZone(instr.zone);
            lines.push(` movel(${poseStr}, a=1.2, v=${speed_ms}, r=${zoneInfo.ur_r_m.toFixed(3)})`);
            if (instrumentationEnabled) {
              const { shouldInsert, stepId } = resolveInstrumentationForMove(instr, zoneInfo);
              if (shouldInsert) {
                lines.push(` step_end(${stepId})`);
                instrumentationInsertCount += 1;
              }
            }
          }
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          if (plannedSteps) {
            consumePlannedMoveSteps(2);
          }
          const via_x = (instr.via_x / 1000).toFixed(5);
          const via_y = (instr.via_y / 1000).toFixed(5);
          const via_z = (instr.via_z / 1000).toFixed(5);
          const end_x = (instr.end_x / 1000).toFixed(5);
          const end_y = (instr.end_y / 1000).toFixed(5);
          const end_z = (instr.end_z / 1000).toFixed(5);
          
          let viaPoseStr = `p[${via_x}, ${via_y}, ${via_z}, 0, 3.14, 0]`;
          let endPoseStr = `p[${end_x}, ${end_y}, ${end_z}, 0, 3.14, 0]`;
          
          if (currentFrameVar) {
            viaPoseStr = `pose_trans(${currentFrameVar}, ${viaPoseStr})`;
            endPoseStr = `pose_trans(${currentFrameVar}, ${endPoseStr})`;
          }
          
          const speed_ms = ((instr.speed ?? spd) / 1000.0).toFixed(3);
          lines.push(` movec(${viaPoseStr}, ${endPoseStr}, a=1.2, v=${speed_ms})`);
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT) {
          lines.push(` sleep(${instr.time || 1})`);
        } else if (
          instr.type === CONSTANTS.BLOCK_TYPES.SET_DO ||
          instr.type === 'set_do' ||
          instr.type === 'set_digital_out' ||
          instr.type === 'io_set'
        ) {
          emitDigitalOut(lines, instr, lastFlatIO, 'set_standard_digital_out');
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
          const state = instr.state == 1 ? 'True' : 'False';
          lines.push(` while (get_standard_digital_in(${instr.pin}) != ${state}):`);
          lines.push(`   sleep(0.01)`);
          lines.push(` end`);
        } else if (instr.type === 'set_tool') {
          activeToolId = instr.tool_id || null;
          seenSetTool = true;
          const tool = resolveToolById(instr.tool_id);
          if (instr.tool_id === 'manual') {
            lines.push(` # Selección de herramienta: Manual`);
            // Blockly inputs are in degrees; URScript set_tcp requires radians.
            const {tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz} = instr;
            lines.push(` set_tcp(p[${(tcp_x ?? 0)/1000}, ${(tcp_y ?? 0)/1000}, ${(tcp_z ?? 0)/1000}, ${(tcp_rx ?? 0)*Math.PI/180}, ${(tcp_ry ?? 0)*Math.PI/180}, ${(tcp_rz ?? 0)*Math.PI/180}])`);
          }
          else if (tool && tool.tcp) {
            const {x, y, z, rx, ry, rz} = tool.tcp;
            lines.push(` # Selección de herramienta: ${tool.name || instr.tool_id}`);
            lines.push(` set_tcp(p[${x/1000}, ${y/1000}, ${z/1000}, ${rx*Math.PI/180}, ${ry*Math.PI/180}, ${rz*Math.PI/180}])`);
          } else {
            lines.push(` # ADVERTENCIA: Herramienta '${instr.tool_id}' no encontrada o sin TCP definido.`);
          }
        } else if (instr.type === 'gripper_set' || instr.type === 'rg2_grip_set') {
          const isUrRobot = typeof robot === 'string' && robot.toUpperCase().includes('UR');
          if (!isUrRobot) {
            lines.push(` # ADVERTENCIA: Bloque RG2 usado con robot "${robot}". RG2 URCap solo es compatible con UR. (omitido)`);
            return;
          }

          if (activeToolId === 'onrobot_rg2_urcap') {
            const result = buildRg2GripCommand({
              width: instr.width_mm,
              force: instr.force,
              tool: toolLibrary?.onrobot_rg2_urcap
            });
            if (!result.ok) {
              lines.push(` # ADVERTENCIA: Bloque RG2 sin width/force válidos (omitido)`);
              return;
            }
            lines.push(` ${result.cmd}`);
            return;
          }

          if (activeToolId != null) {
            lines.push(` # ADVERTENCIA: Bloque RG2 sin herramienta activa RG2 URCap. Herramienta activa: "${activeToolId}". Inserta set_tool RG2 antes. (omitido)`);
            return;
          }

          if (seenSetTool) {
            lines.push(` # ADVERTENCIA: Bloque RG2 pero la herramienta activa es NULL (hubo set_tool). Inserta set_tool RG2 antes. (omitido)`);
          }
          return;
        } else if (instr.type === 'define_point') {
          lines.push(` # Punto definido: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'define_pose') {
          lines.push(` # Pose definida: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'define_frame') {
          const fx = (instr.x ?? 0) / 1000;
          const fy = (instr.y ?? 0) / 1000;
          const fz = (instr.z ?? 0) / 1000;
          const frx = (instr.rx ?? 0) * Math.PI / 180;
          const fry = (instr.ry ?? 0) * Math.PI / 180;
          const frz = (instr.rz ?? 0) * Math.PI / 180;
          
          lines.push(` ${instr.name}_frame = p[${fx.toFixed(4)}, ${fy.toFixed(4)}, ${fz.toFixed(4)}, ${frx.toFixed(4)}, ${fry.toFixed(4)}, ${frz.toFixed(4)}]`);
        } else if (instr.type === 'use_frame') {
          if (instr.frameName === 'WORLD') {
            currentFrameVar = null; // Sin transformación
          } else {
            currentFrameVar = `${instr.frameName}_frame`;
          }
        } else if (instr.type === 'use_pose') {
          lines.push(` # Usando Pose: ${instr.poseName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'use_point') {
          lines.push(` # Usando Punto: ${instr.pointName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'variable_set') {
          const varName = instr.varName || instr.variable || 'i';
          const valueExpr = formatMathUR(instr.value);
          lines.push(` ${varName} = ${valueExpr}`);
        } else if (instr.type === 'if_block') {
          const condStr = formatConditionUR(instr.condition);
          lines.push(` if ${condStr}:`);
          
          // Rama DO (entonces)
          if (instr.do && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }
          
          // Rama ELSE (sino) - opcional
          if (instr.else && instr.else.length > 0) {
            lines.push(` else:`);
            const elseStart = lines.length;
            instr.else.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(elseStart);
          }
          
          lines.push(` end`);
        } else if (instr.type === 'while_block') {
          const condStr = formatConditionUR(instr.condition);
          lines.push(` while ${condStr}:`);
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }
          
          lines.push(` end`);
        } else if (instr.type === 'for_block') {
          const varName = instr.variable || 'i';
          const from = instr.from ?? 0;
          const to = instr.to ?? 10;
          lines.push(` ${varName} = ${from}`);
          lines.push(` while ${varName} <= ${to}:`);
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }
          
          lines.push(`   ${varName} = ${varName} + 1`);
          lines.push(` end`);
        } else if (instr.type === 'loop_block' || instr.type === 'repeat_block') {
          const rawCount = Number(instr.count ?? instr.times ?? instr.n ?? 0);
          const count = Number.isFinite(rawCount) ? Math.floor(rawCount) : 0;
          if (isFpDebugEnabled()) {
            console.log(`[GEN LOOP] count=${count}`);
          }
          if (count <= 0) {
            return;
          }
          loopCounterVarSeq += 1;
          const loopVar = `fp_loop_i_${loopCounterVarSeq}`;
          lines.push(` ${loopVar} = 0`);
          lines.push(` while (${loopVar} < ${count}):`);

          if (Array.isArray(instr.do) && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }

          lines.push(`   ${loopVar} = ${loopVar} + 1`);
          lines.push(` end`);
        } else if (instr.type === 'palletize_block') {
          // Paletizado completo para URScript
          let pickPos = instr.pick_pose;
          if (!pickPos && instr.pick_pos && typeof instr.pick_pos === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            pickPos = {
              ...instr.pick_pos,
              rx: instr.pick_pos.rx ?? 0,
              ry: instr.pick_pos.ry ?? 180,
              rz: instr.pick_pos.rz ?? 0
            };
          }
          pickPos = pickPos || { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 };
          let p1Pose = instr.pallet_p1_pose;
          if (!p1Pose && instr.pallet_p1 && typeof instr.pallet_p1 === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            p1Pose = {
              ...instr.pallet_p1,
              rx: instr.pallet_p1.rx ?? 0,
              ry: instr.pallet_p1.ry ?? 180,
              rz: instr.pallet_p1.rz ?? 0
            };
          }
          p1Pose = p1Pose || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let palletOrigin = p1Pose;
          if (instr.pallet_origin) {
            // TODO: eliminar fallback legacy con pallet_origin
            palletOrigin = instr.pallet_origin;
          }
          const p2Point = instr.pallet_p2 || addVector(palletOrigin, { x: 100, y: 0, z: 0 });
          const p3Point = instr.pallet_p3 || addVector(palletOrigin, { x: 0, y: 100, z: 0 });
          const applyFrameUR = (poseStr) => currentFrameVar ? `pose_trans(${currentFrameVar}, ${poseStr})` : poseStr;
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const safetyMargin = instr.safety_margin ?? 100;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickHookActions = normalizePalletHookActions(instr?.grip_close_actions, {
            defaultWaitS: instr?.pick_wait_time
          });
          const placeHookActions = normalizePalletHookActions(instr?.grip_open_actions, {
            defaultWaitS: instr?.place_wait_time
          });
          const hasPickGripperAction = pickHookActions.length > 0;
          const hasPlaceGripperAction = placeHookActions.length > 0;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const layerHeight = instr.layer_height ?? 60;

          const palletValidationErrors = [];
          if (!p1Pose || !p2Point || !p3Point) palletValidationErrors.push('P1/P2/P3 inexistentes');
          if (isSameXYZ(p1Pose, p2Point)) palletValidationErrors.push('P2 coincide con P1');
          if (isSameXYZ(p1Pose, p3Point)) palletValidationErrors.push('P3 coincide con P1');
          if ((rows ?? 0) <= 0) palletValidationErrors.push('rows <= 0');
          if ((cols ?? 0) <= 0) palletValidationErrors.push('cols <= 0');
          if ((layers ?? 0) <= 0) palletValidationErrors.push('layers <= 0');
          if ((placeApproach ?? 0) < 0) palletValidationErrors.push('approach_distance < 0');
          if ((pickApproach ?? 0) < 0) palletValidationErrors.push('pick_approach < 0');

          const safeRows = Math.max(1, Number(rows) || 1);
          const safeCols = Math.max(1, Number(cols) || 1);
          const safeLayers = Math.max(1, Number(layers) || 1);
          const safePickApproach = Math.max(0, Number(pickApproach) || 0);
          const safePlaceApproach = Math.max(0, Number(placeApproach) || 0);
          let safeP1 = palletOrigin || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let safeP2 = p2Point || addVector(safeP1, { x: 100, y: 0, z: 0 });
          let safeP3 = p3Point || addVector(safeP1, { x: 0, y: 100, z: 0 });
          if (isSameXYZ(safeP1, safeP2)) safeP2 = addVector(safeP1, { x: 100, y: 0, z: 0 });
          if (isSameXYZ(safeP1, safeP3)) safeP3 = addVector(safeP1, { x: 0, y: 100, z: 0 });
          const dx = makeVector(safeP1, safeP2);
          const dy = makeVector(safeP1, safeP3);
          if (palletValidationErrors.length > 0) {
            lines.push(` # ADVERTENCIA PALET: ${palletValidationErrors.join('; ')}. Se aplica fallback controlado.`);
          }
          
          // Convertir a metros
          const pickX = ((pickPos.x ?? 0) / 1000).toFixed(4);
          const pickY = ((pickPos.y ?? 0) / 1000).toFixed(4);
          const pickZ = ((pickPos.z ?? 0) / 1000).toFixed(4);
          const pickZApproach = (((pickPos.z ?? 0) + safePickApproach) / 1000).toFixed(4);
          const pickRx = ((((pickPos.rx ?? 0) * Math.PI) / 180)).toFixed(5);
          const pickRy = ((((pickPos.ry ?? 180) * Math.PI) / 180)).toFixed(5);
          const pickRz = ((((pickPos.rz ?? 0) * Math.PI) / 180)).toFixed(5);
          
          const p1X = ((safeP1.x ?? 0) / 1000).toFixed(4);
          const p1Y = ((safeP1.y ?? 0) / 1000).toFixed(4);
          const p1Z = ((safeP1.z ?? 0) / 1000).toFixed(4);
          const dxX = ((dx.x ?? 0) / 1000).toFixed(4);
          const dxY = ((dx.y ?? 0) / 1000).toFixed(4);
          const dxZ = ((dx.z ?? 0) / 1000).toFixed(4);
          const dyX = ((dy.x ?? 0) / 1000).toFixed(4);
          const dyY = ((dy.y ?? 0) / 1000).toFixed(4);
          const dyZ = ((dy.z ?? 0) / 1000).toFixed(4);
          const palletRx = ((((p1Pose.rx ?? 0) * Math.PI) / 180)).toFixed(5);
          const palletRy = ((((p1Pose.ry ?? 180) * Math.PI) / 180)).toFixed(5);
          const palletRz = ((((p1Pose.rz ?? 0) * Math.PI) / 180)).toFixed(5);
          
          const stepZ = (layerHeight / 1000).toFixed(4);
          const approachZ = (safePlaceApproach / 1000).toFixed(4);
          const toolIdForGripper = activeToolId ?? instr?.tool_id ?? null;
          const gripperLabel = formatPalletGripperLabel({
            closeActions: pickHookActions,
            openActions: placeHookActions,
            fallbackPin: gripperPin,
            activeToolId,
            instrToolId: toolIdForGripper
          });

          // Instrumented mode: derive step_id formulas from execution plan.
          let palletVerify = null;
          if (instrumentationEnabled && plannedSteps) {
            palletVerify = buildPalletVerifyFormula(instr.id ?? null);
          }

          if (instrumentationEnabled) {
            lines.push(` # PALLETIZE PICK AND PLACE`);
          } else {
            lines.push(` # ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══`);
          }
          lines.push(` # Configuración:`);
          lines.push(` #   PICK: (${pickX}, ${pickY}, ${pickZ})`);
          lines.push(` #   PALET: ${safeRows}x${safeCols}x${safeLayers} = ${safeRows * safeCols * safeLayers} ciclos`);
          lines.push(` #   Gripper: ${gripperLabel}`);
          lines.push(``);

          // Variables base
          lines.push(` pick_x = ${pickX}`);
          lines.push(` pick_y = ${pickY}`);
          lines.push(` pick_z = ${pickZ}`);
          lines.push(` pick_z_approach = ${pickZApproach}`);
          lines.push(` pick_rx = ${pickRx}`);
          lines.push(` pick_ry = ${pickRy}`);
          lines.push(` pick_rz = ${pickRz}`);
          lines.push(` p1_x = ${p1X}`);
          lines.push(` p1_y = ${p1Y}`);
          lines.push(` p1_z = ${p1Z}`);
          lines.push(` dx_x = ${dxX}`);
          lines.push(` dx_y = ${dxY}`);
          lines.push(` dx_z = ${dxZ}`);
          lines.push(` dy_x = ${dyX}`);
          lines.push(` dy_y = ${dyY}`);
          lines.push(` dy_z = ${dyZ}`);
          lines.push(` pallet_rx = ${palletRx}`);
          lines.push(` pallet_ry = ${palletRy}`);
          lines.push(` pallet_rz = ${palletRz}`);
          lines.push(` step_z = ${stepZ}`);
          lines.push(` approach_z = ${approachZ}`);
          lines.push(``);

          // Instrumentation formulas from plannedSteps (no list literals/indexing).
          if (instrumentationEnabled && palletVerify && palletVerify.cycleCount > 0) {
            const { phaseFormula, cycleCount } = palletVerify;
            const predictedPalletVerifyIds = collectPalletPredictedVerifyIds(palletVerify);
            predictedPalletVerifyIds.forEach((id) => insertedStepEndIds.push(id));
            lines.push(` # INSTRUMENTATION formula mode from execution plan`);
            lines.push(` # cycle_count=${cycleCount}`);
            if (phaseFormula.target_pick.enabled) {
              lines.push(` pallet_target_pick_first = ${phaseFormula.target_pick.firstSid}`);
              lines.push(` pallet_target_pick_stride = ${phaseFormula.target_pick.stride}`);
            }
            if (phaseFormula.target_place.enabled) {
              lines.push(` pallet_target_place_first = ${phaseFormula.target_place.firstSid}`);
              lines.push(` pallet_target_place_stride = ${phaseFormula.target_place.stride}`);
            }
            lines.push(``);
          }

          // Bucles anidados
          lines.push(` layer = 0`);
          if (instrumentationEnabled) {
            lines.push(` pallet_cycle_idx = 0`);
            lines.push(` cycle_number = 1`);
          }
          lines.push(` while layer < ${safeLayers}:`);
          lines.push(`   # Calcular altura de seguridad para esta capa`);
          lines.push(`   safety_z = p1_z + layer * step_z + ${(safetyMargin / 1000).toFixed(4)}`);
          lines.push(`   row = 0`);
          lines.push(`   while row < ${safeRows}:`);
          lines.push(`     col = 0`);
          lines.push(`     while col < ${safeCols}:`);
          lines.push(`       # Cycle Pick and Place`);

          // PICK
          if (instrumentationEnabled) {
            lines.push(`       cycle_start(cycle_number)`);
          }
          lines.push(`       # PICK: Aproximación`);
          lines.push(`       movej(${applyFrameUR(`p[pick_x, pick_y, pick_z_approach, pick_rx, pick_ry, pick_rz]`)}, a=1.2, v=0.25)`);
          lines.push(`       # PICK: Descenso`);
          lines.push(`       movel(${applyFrameUR(`p[pick_x, pick_y, pick_z, pick_rx, pick_ry, pick_rz]`)}, a=1.2, v=0.1)`);
          // target_pick verify
          if (instrumentationEnabled && palletVerify?.phaseFormula?.target_pick?.enabled) {
            lines.push(`       pick_sid = pallet_target_pick_first + pallet_cycle_idx * pallet_target_pick_stride`);
            lines.push(`       step_end(pick_sid)  # target_pick`);
            instrumentationInsertCount += 1;
            emittedStepEnd += 1;
          }
          if (hasPickGripperAction) {
            lines.push(`       # PICK: Acción pinza explícita`);
            emitPalletHookActions(lines, pickHookActions, {
              indent: '       ',
              fallbackPin: gripperPin,
              phase: 'pick',
              activeToolId,
              instrToolId: toolIdForGripper
            });
          }
          lines.push(`       # PICK: Retirada local a aproximación`);
          lines.push(`       movel(${applyFrameUR(`p[pick_x, pick_y, pick_z_approach, pick_rx, pick_ry, pick_rz]`)}, a=1.2, v=0.25)`);
          lines.push(``);

          // PLACE
          lines.push(`       # PLACE: Calcular posición`);
          lines.push(`       place_x = p1_x + col * dx_x + row * dy_x`);
          lines.push(`       place_y = p1_y + col * dx_y + row * dy_y`);
          lines.push(`       place_z = p1_z + col * dx_z + row * dy_z + layer * step_z`);
          lines.push(`       place_z_approach = place_z + approach_z`);
          lines.push(`       # PLACE: Movimiento articular a XY a altura segura`);
          lines.push(`       movej(${applyFrameUR(`p[place_x, place_y, safety_z, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.5)`);
          lines.push(`       # PLACE: Descenso a aproximación`);
          lines.push(`       movel(${applyFrameUR(`p[place_x, place_y, place_z_approach, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.25)`);
          lines.push(`       # PLACE: Descenso final`);
          lines.push(`       movel(${applyFrameUR(`p[place_x, place_y, place_z, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.1)`);
          // target_place verify
          if (instrumentationEnabled && palletVerify?.phaseFormula?.target_place?.enabled) {
            lines.push(`       place_sid = pallet_target_place_first + pallet_cycle_idx * pallet_target_place_stride`);
            lines.push(`       step_end(place_sid)  # target_place`);
            instrumentationInsertCount += 1;
            emittedStepEnd += 1;
          }
          if (hasPlaceGripperAction) {
            lines.push(`       # PLACE: Acción pinza explícita`);
            emitPalletHookActions(lines, placeHookActions, {
              indent: '       ',
              fallbackPin: gripperPin,
              phase: 'place',
              activeToolId,
              instrToolId: toolIdForGripper
            });
          }
          lines.push(`       # PLACE: Levantar`);
          lines.push(`       movel(${applyFrameUR(`p[place_x, place_y, place_z_approach, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.25)`);
          lines.push(``);

          if (instrumentationEnabled) {
            lines.push(`       cycle_end(cycle_number)`);
            lines.push(`       cycle_number = cycle_number + 1`);
          }

          lines.push(`       col = col + 1`);
          if (instrumentationEnabled && palletVerify && palletVerify.cycleCount > 0) {
            lines.push(`       pallet_cycle_idx = pallet_cycle_idx + 1`);
          }
          lines.push(`     end`);
          lines.push(`     row = row + 1`);
          lines.push(`   end`);
          lines.push(`   layer = layer + 1`);
          lines.push(` end`);
          if (instrumentationEnabled) {
            lines.push(` # END PALLETIZE`);
          } else {
            lines.push(` # ═══ FIN PALETIZADO ═══`);
          }
        } else if (instr.type === 'read_ai_block') {
          lines.push(`Leer AI[${instr.pin}] (devuelve valor en voltios 0-10V)`);
        } else if (instr.type === 'write_ao_block') {
          const value = formatMathEducational(instr.value);
          lines.push(`Escribir AO[${instr.pin}] = ${value} V`);
        } else if (instr.type === 'wait_ai_block') {
          const opMap = { GT: '>', LT: '<', GTE: '≥', LTE: '≤' };
          const opStr = opMap[instr.operator] || '>';
          const value = instr.value ?? 0;
          lines.push(`Esperar AI[${instr.pin}] ${opStr} ${value} V`);
        } else if (instr.type === 'function_def_params') {
          const params = instr.params ? instr.params.join(', ') : '';
          lines.push(`Función ${instr.funcname}(${params}):`);
          lines.push(`  // Nota: En Fanuc se implementa como subprograma separado .TP`);
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              gen(subInstr);
              // Indentar las líneas añadidas
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Función`);
        } else if (instr.type === 'function_call_params') {
          const args = instr.args ? instr.args.map(a => formatMathEducational(a)).join(', ') : '';
          lines.push(`Llamar ${instr.funcname}(${args})`);
        } else if (instr.type === 'function_return') {
          const value = formatMathEducational(instr.value);
          lines.push(`Retornar ${value}`);
        }
        gen(instr.next);
      }
      program.forEach(gen);
      // Give the socket sender thread time to transmit the last step_end event
      // before the program exits. Only needed when at least one step_end was emitted.
      if (instrumentationEnabled && instrumentationInsertCount > 0) {
        lines.push(` sleep(1) # wait for last telemetry event to be sent`);
      }
      lines.push('end');
      lines.push('');
      lines.push('program()');
      const code = lines.join("\n");
      if (instrumentationEnabled) {
        const reportedInsertCount = insertedStepEndIds.length > 0 ? insertedStepEndIds.length : instrumentationInsertCount;
        console.debug(`[UR planned] snapshot=${options?.program_snapshot_id ?? "n/a"} steps=${emittedSteps} step_end=${emittedStepEnd}`);
        console.log(`UR Instrumentation step_end inserted: ${reportedInsertCount}`);
        if (insertedStepEndIds.length > 0) {
          console.debug('[UR VERIFY] inserted step_end ids:', insertedStepEndIds);
        }
      }
      return code;
    }

    /* SECCIÓN 021: Generador de Código Industrial para UR3e (URScript) */
    if (robot === CONSTANTS.ROBOTS.UR3E) {
      let lines = ['def program():'];
      lines.push(` # La configuración del TCP y payload se define con el bloque de herramienta.`);

      const instrumentationEnabled = Boolean(options && options.instrumentation);
      const plannedSteps = Array.isArray(options?.plannedSteps) ? options.plannedSteps : null;
      const executionMode =
        options?.executionMode ??
        (options?.mode === "planned" ? "planned" : undefined) ??
        "flat";
      const isPlannedMode = executionMode === "planned";
      let plannedStepIndex = 0;
      let fallbackStepId = 0;
      let instrumentationInsertCount = 0;

      console.log(`UR Instrumentation enabled: ${instrumentationEnabled}`);

      let currentFrameVar = null; // Nombre de la variable del frame activo

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

        return {
          zone_mm: zoneMm,
          ur_r_m: zoneMm / 1000
        };
      }

      function nextPlannedMoveStep() {
        if (!plannedSteps) return null;
        while (plannedStepIndex < plannedSteps.length) {
          const step = plannedSteps[plannedStepIndex++];
          if (step && (step.type === 'MoveJ' || step.type === 'MoveL')) return step;
        }
        return null;
      }

      function consumePlannedMoveSteps(count) {
        if (!plannedSteps || count <= 0) return;
        let remaining = count;
        while (plannedStepIndex < plannedSteps.length && remaining > 0) {
          const step = plannedSteps[plannedStepIndex++];
          if (step && (step.type === 'MoveJ' || step.type === 'MoveL')) {
            remaining -= 1;
          }
        }
      }

      function resolveInstrumentationForMove(instr, zoneInfo) {
        let stepId = typeof instr.step_id === 'number' ? instr.step_id : null;
        let meta = instr.meta || null;
        let effectiveZone = zoneInfo;

        if (plannedSteps) {
          const plannedStep = nextPlannedMoveStep();
          if (plannedStep) {
            stepId = plannedStep.step_id;
            meta = plannedStep.meta || meta;
            if (plannedStep.meta && typeof plannedStep.meta.ur_r_m === 'number') {
              effectiveZone = { ...effectiveZone, ur_r_m: plannedStep.meta.ur_r_m };
            }
          }
        }

        const phase = meta?.phase;
        const isTargetPhase = typeof phase === 'string' && phase.toLowerCase().startsWith('target');
        const isFine = effectiveZone && Number(effectiveZone.ur_r_m) === 0;

        if (!plannedSteps && (isTargetPhase || isFine) && (stepId === null || typeof stepId === 'undefined')) {
          stepId = fallbackStepId;
          fallbackStepId += 1;
        }

        const shouldInsert = (isTargetPhase || isFine) && typeof stepId === 'number';
        return { shouldInsert, stepId };
      }

      if (instrumentationEnabled) {
        lines.push(` # INSTRUMENTATION SECTION`);
        lines.push(` # SOCKET TELEMETRY`);
        const _sockHost2 = (typeof options?.socket_host === 'string' && options.socket_host.trim()) ? options.socket_host.trim() : '192.168.0.50';
        const _sockPort2 = (Number.isFinite(options?.socket_port) && options.socket_port >= 1 && options.socket_port <= 65535) ? options.socket_port : 5000;
        lines.push(` # socket target: ${_sockHost2}:${_sockPort2}`);
        lines.push(` # payload: STEP;snapshot_short;step_id;event_counter;x_mm;y_mm;z_mm;rx_rad;ry_rad;rz_rad`);
        lines.push(` # snapshot_id=${options?.program_snapshot_id ?? options?.snapshot_id ?? 'n/a'}`);
        const _snapShort2 = computeSnapshotShortId(options?.program_snapshot_id ?? options?.snapshot_id ?? '');
        lines.push(` # snapshot_short=${_snapShort2}`);
        lines.push(` global fp_event_counter = 0`);
        lines.push(` global fp_last_sent_counter = 0`);
        lines.push(` global fp_last_step_id = -1`);
        lines.push(` global fp_snapshot_short = ${_snapShort2}`);
        lines.push(` global fp_socket_name = "fp_iot"`);
        lines.push(` global fp_socket_host = "${_sockHost2}"`);
        lines.push(` global fp_socket_port = ${_sockPort2}`);
        lines.push(` global fp_socket_ok = False`);
        lines.push(` global fp_last_x_mm = 0`);
        lines.push(` global fp_last_y_mm = 0`);
        lines.push(` global fp_last_z_mm = 0`);
        lines.push(` global fp_last_rx = 0`);
        lines.push(` global fp_last_ry = 0`);
        lines.push(` global fp_last_rz = 0`);
        lines.push(` def step_end(step_id):`);
        lines.push(`  pose = get_actual_tcp_pose()`);
        lines.push(`  global fp_last_x_mm = pose[0] * 1000`);
        lines.push(`  global fp_last_y_mm = pose[1] * 1000`);
        lines.push(`  global fp_last_z_mm = pose[2] * 1000`);
        lines.push(`  global fp_last_rx = pose[3]`);
        lines.push(`  global fp_last_ry = pose[4]`);
        lines.push(`  global fp_last_rz = pose[5]`);
        lines.push(`  global fp_last_step_id = step_id`);
        lines.push(`  global fp_event_counter = fp_event_counter + 1`);
        lines.push(` end`);
        lines.push(` thread fp_sender_thread():`);
        lines.push(`  global fp_socket_ok = socket_open(fp_socket_host, fp_socket_port, fp_socket_name)`);
        lines.push(`  fp_retry_count = 0`);
        lines.push(`  while True:`);
        lines.push(`    if fp_socket_ok == False:`);
        lines.push(`      fp_retry_count = fp_retry_count + 1`);
        lines.push(`      if fp_retry_count >= 100:`);
        lines.push(`        fp_retry_count = 0`);
        lines.push(`        socket_close(fp_socket_name)`);
        lines.push(`        global fp_socket_ok = socket_open(fp_socket_host, fp_socket_port, fp_socket_name)`);
        lines.push(`      end`);
        lines.push(`    end`);
        lines.push(`    if fp_last_sent_counter != fp_event_counter:`);
        lines.push(`      local_counter = fp_event_counter`);
        lines.push(`      local_step_id = fp_last_step_id`);
        lines.push(`      local_x = fp_last_x_mm`);
        lines.push(`      local_y = fp_last_y_mm`);
        lines.push(`      local_z = fp_last_z_mm`);
        lines.push(`      local_rx = fp_last_rx`);
        lines.push(`      local_ry = fp_last_ry`);
        lines.push(`      local_rz = fp_last_rz`);
        lines.push(`      msg = str_cat("STEP", ";")`);
        lines.push(`      msg = str_cat(msg, to_str(fp_snapshot_short))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_step_id))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_counter))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_x))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_y))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_z))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_rx))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_ry))`);
        lines.push(`      msg = str_cat(msg, ";")`);
        lines.push(`      msg = str_cat(msg, to_str(local_rz))`);
        lines.push(`      if fp_socket_ok:`);
        lines.push(`        send_ok = socket_send_line(msg, fp_socket_name)`);
        lines.push(`        if send_ok:`);
        lines.push(`          global fp_last_sent_counter = local_counter`);
        lines.push(`        else:`);
        lines.push(`          socket_close(fp_socket_name)`);
        lines.push(`          global fp_socket_ok = False`);
        lines.push(`        end`);
        lines.push(`      end`);
        lines.push(`    end`);
        lines.push(`    sync()`);
        lines.push(`  end`);
        lines.push(` end`);
        lines.push(` socket_close(fp_socket_name)`);
        lines.push(` sleep(0.2)`);
        lines.push(` fp_sender_handle = run fp_sender_thread()`);
        lines.push(` sleep(0.2)`);
      }

      function plannedStepToPose(step) {
        const pos = step?.position || step?.target_pos || step?.target_pose?.position || {};
        const rot = step?.orientation || step?.target_pose?.orientation || {};
        const x = ((pos.x ?? 0) / 1000).toFixed(5);
        const y = ((pos.y ?? 0) / 1000).toFixed(5);
        const z = ((pos.z ?? 0) / 1000).toFixed(5);
        const rx = ((rot.rx ?? 0) * Math.PI / 180).toFixed(5);
        const ry = ((rot.ry ?? 180) * Math.PI / 180).toFixed(5);
        const rz = ((rot.rz ?? 0) * Math.PI / 180).toFixed(5);
        return `p[${x}, ${y}, ${z}, ${rx}, ${ry}, ${rz}]`;
      }

      function getZoneInfoFromStep(step) {
        const zoneStr = step?.meta?.zone || step?.zone || 'fine';
        const zoneInfo = parseZone(zoneStr);
        if (typeof step?.meta?.ur_r_m === 'number') {
          zoneInfo.ur_r_m = step.meta.ur_r_m;
        }
        return zoneInfo;
      }

      function emitPlannedStep(step) {
        if (!step) return;
        const type = step.type;

        if (type === 'MoveJ' || type === 'MoveL') {
          const poseStr = plannedStepToPose(step);
          const speed_mms = step.speed ?? spd;
          const speed_ms = ((speed_mms) / 1000.0).toFixed(3);
          const zoneInfo = getZoneInfoFromStep(step);

          if (type === 'MoveJ') {
            lines.push(` movej(${poseStr}, a=1.4, v=${speed_ms}, r=${zoneInfo.ur_r_m.toFixed(3)})`);
          } else {
            lines.push(` movel(${poseStr}, a=1.2, v=${speed_ms}, r=${zoneInfo.ur_r_m.toFixed(3)})`);
          }

          if (instrumentationEnabled) {
            const phase = step?.meta?.phase;
            const isTargetPhase = typeof phase === 'string' && phase.toLowerCase().startsWith('target');
            const isFine = Number(zoneInfo.ur_r_m) === 0;
            if ((isTargetPhase || isFine) && typeof step.step_id === 'number') {
              lines.push(` step_end(${step.step_id})`);
              insertedStepEndIds.push(step.step_id);
              instrumentationInsertCount += 1;
            }
          }
          return;
        }

        if (type === 'IO_DO' || type === 'SetDO' || type === 'DO' || type === 'io_do') {
          const pin = step.pin ?? step.meta?.pin ?? 0;
          const value = step.value ?? step.state ?? step.meta?.value ?? 0;
          lines.push(` set_digital_out(${pin}, ${value ? 'True' : 'False'})`);
          const waitSeconds = step.waitSeconds ?? step.meta?.waitSeconds ?? 0;
          if (waitSeconds > 0) {
            lines.push(` sleep(${Number(waitSeconds).toFixed(3)})`);
          }
          return;
        }

        if (type === 'WAIT' || type === 'Wait' || type === 'sleep') {
          const waitSeconds = step.seconds ?? step.waitSeconds ?? step.time ?? 0;
          lines.push(` sleep(${Number(waitSeconds).toFixed(3)})`);
          return;
        }

        lines.push(` # Paso no soportado: ${type}`);
      }

      if (isPlannedMode && !instrumentationEnabled) {
        const steps = plannedSteps || [];
        steps.forEach(emitPlannedStep);
        lines.push('end');
        lines.push('');
        lines.push('program()');
        if (instrumentationEnabled) {
          console.log(`UR Instrumentation step_end inserted: ${instrumentationInsertCount}`);
          if (insertedStepEndIds.length > 0) {
            console.debug('[UR VERIFY] inserted step_end ids:', insertedStepEndIds);
          }
        }
        const code = lines.join('\n');
        
        // Validate: count actual motion commands in generated code
        const motionCommandCount = (code.match(/\b(?:movej|movel|movec)\s*\(/gi) || []).length;
        const plannedList = Array.isArray(plannedSteps) ? plannedSteps : [];
        const plannedMotionSteps = plannedList.filter(step => {
          const type = String(step?.type || step?.meta?.motion || step?.motion || '').trim().toLowerCase();
          if (type.startsWith('move')) return true;
          return !!step?.target_pose && !['io_do', 'set_do', 'digital_output', 'gripper', 'wait', 'sleep', 'io'].includes(type);
        });
        const nonMotionSteps = plannedList.filter(step => {
          const type = String(step?.type || step?.meta?.motion || step?.motion || '').trim().toLowerCase();
          return ['io_do', 'set_do', 'digital_output', 'gripper', 'wait', 'sleep', 'io'].includes(type);
        });
        if (instrumentationEnabled) {
          const plannedMotionCount = plannedMotionSteps.length;
          const nonMotionCount = nonMotionSteps.length;
          const totalPlannedSteps = plannedList.length;
          if (plannedMotionCount === motionCommandCount) {
            console.log(`[VERIFY OK] planned motion steps=${plannedMotionCount} generated motion commands=${motionCommandCount} nonMotionSteps=${nonMotionCount} totalPlannedSteps=${totalPlannedSteps}`);
          } else {
            console.warn(`[VERIFY MISMATCH] planned motion steps=${plannedMotionCount} generated motion commands=${motionCommandCount} nonMotionSteps=${nonMotionCount} totalPlannedSteps=${totalPlannedSteps}`);
          }
        }
        
        return code;
      }

      function gen(instr) {
        if (!instr) return;
        const indentGeneratedLines = (startIndex, indentPrefix = '  ') => {
          for (let i = startIndex; i < lines.length; i++) {
            if (typeof lines[i] === 'string' && lines[i].trim().length > 0) {
              lines[i] = `${indentPrefix}${lines[i]}`;
            }
          }
        };
        if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J || instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (lines.push(` # WARNING: Punto fuera de alcance (${w.d.toFixed(0)}mm > ${w.limit}mm)`));
          
          const x_m = (instr.x / 1000).toFixed(5);
          const y_m = (instr.y / 1000).toFixed(5);
          const z_m = (instr.z / 1000).toFixed(5);
          const isPoseTarget = instr.sourceType === 'pose';
          // Rx/Ry/Rz se esperan en radianes (Polyscope). Compat: convierte si |val|>3.2 (probablemente grados).
          const _toRadUR = v => { const n = Number(v ?? 0); return Math.abs(n) > 3.2 ? n * Math.PI / 180 : n; };
          const rx = isPoseTarget ? _toRadUR(instr.rx ?? 0) : 0;
          const ry = isPoseTarget ? _toRadUR(instr.ry ?? 3.14) : 3.14;
          const rz = isPoseTarget ? _toRadUR(instr.rz ?? 0) : 0;
          
          let poseStr = `p[${x_m}, ${y_m}, ${z_m}, ${rx.toFixed(5)}, ${ry.toFixed(5)}, ${rz.toFixed(5)}]`;
          
          // Si hay frame activo, aplicar pose_trans()
          if (currentFrameVar) {
            poseStr = `pose_trans(${currentFrameVar}, ${poseStr})`;
          }
          
          if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
            const speed_pct = (instr.speed ?? spd) / 100.0;
            const zoneInfo = parseZone(instr.zone);
            lines.push(` movej(${poseStr}, a=1.4, v=${speed_pct.toFixed(2)}, r=${zoneInfo.ur_r_m.toFixed(3)})`);
            if (instrumentationEnabled) {
              const { shouldInsert, stepId } = resolveInstrumentationForMove(instr, zoneInfo);
              if (shouldInsert) {
                lines.push(` step_end(${stepId})`);
                instrumentationInsertCount += 1;
              }
            }
          } else {
            if (checkSingularityWarning(instr.y)) {
              lines.push(` # ADVERTENCIA: movel cerca de Y=0. Riesgo de singularidad.`);
            }
            const speed_ms = ( (instr.speed ?? spd) / 1000.0 ).toFixed(3);
            const zoneInfo = parseZone(instr.zone);
            lines.push(` movel(${poseStr}, a=1.2, v=${speed_ms}, r=${zoneInfo.ur_r_m.toFixed(3)})`);
            if (instrumentationEnabled) {
              const { shouldInsert, stepId } = resolveInstrumentationForMove(instr, zoneInfo);
              if (shouldInsert) {
                lines.push(` step_end(${stepId})`);
                instrumentationInsertCount += 1;
              }
            }
          }
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          if (plannedSteps) {
            consumePlannedMoveSteps(2);
          }
          const via_x = (instr.via_x / 1000).toFixed(5);
          const via_y = (instr.via_y / 1000).toFixed(5);
          const via_z = (instr.via_z / 1000).toFixed(5);
          const end_x = (instr.end_x / 1000).toFixed(5);
          const end_y = (instr.end_y / 1000).toFixed(5);
          const end_z = (instr.end_z / 1000).toFixed(5);
          
          let viaPoseStr = `p[${via_x}, ${via_y}, ${via_z}, 0, 3.14, 0]`;
          let endPoseStr = `p[${end_x}, ${end_y}, ${end_z}, 0, 3.14, 0]`;
          
          if (currentFrameVar) {
            viaPoseStr = `pose_trans(${currentFrameVar}, ${viaPoseStr})`;
            endPoseStr = `pose_trans(${currentFrameVar}, ${endPoseStr})`;
          }
          
          const speed_ms = ((instr.speed ?? spd) / 1000.0).toFixed(3);
          lines.push(` movec(${viaPoseStr}, ${endPoseStr}, a=1.2, v=${speed_ms})`);
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT) {
          lines.push(` sleep(${instr.time || 1})`);
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.SET_DO) {
          const state = instr.state == 1 ? 'True' : 'False';
          lines.push(` set_standard_digital_out(${instr.pin}, ${state})`);
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
          const state = instr.state == 1 ? 'True' : 'False';
          lines.push(` while (get_standard_digital_in(${instr.pin}) != ${state}):`);
          lines.push(`   sleep(0.01)`);
          lines.push(` end`);
        } else if (instr.type === 'set_tool') {
          const tool = resolveToolById(instr.tool_id);
          if (instr.tool_id === 'manual') {
            lines.push(` # Selección de herramienta: Manual`);
            // Blockly inputs are in degrees; URScript set_tcp requires radians.
            const {tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz} = instr;
            lines.push(` set_tcp(p[${(tcp_x ?? 0)/1000}, ${(tcp_y ?? 0)/1000}, ${(tcp_z ?? 0)/1000}, ${(tcp_rx ?? 0)*Math.PI/180}, ${(tcp_ry ?? 0)*Math.PI/180}, ${(tcp_rz ?? 0)*Math.PI/180}])`);
          }
          else if (tool && tool.tcp) {
            const {x, y, z, rx, ry, rz} = tool.tcp;
            lines.push(` # Selección de herramienta: ${tool.name}`);
            lines.push(` set_tcp(p[${x/1000}, ${y/1000}, ${z/1000}, ${rx*Math.PI/180}, ${ry*Math.PI/180}, ${rz*Math.PI/180}])`);
          } else {
            lines.push(` # ADVERTENCIA: Herramienta '${instr.tool_id}' no encontrada o sin TCP definido.`);
          }
        } else if (instr.type === 'define_point') {
          lines.push(` # Punto definido: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'define_pose') {
          lines.push(` # Pose definida: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'define_frame') {
          const fx = (instr.x ?? 0) / 1000;
          const fy = (instr.y ?? 0) / 1000;
          const fz = (instr.z ?? 0) / 1000;
          const frx = (instr.rx ?? 0) * Math.PI / 180;
          const fry = (instr.ry ?? 0) * Math.PI / 180;
          const frz = (instr.rz ?? 0) * Math.PI / 180;
          
          lines.push(` ${instr.name}_frame = p[${fx.toFixed(4)}, ${fy.toFixed(4)}, ${fz.toFixed(4)}, ${frx.toFixed(4)}, ${fry.toFixed(4)}, ${frz.toFixed(4)}]`);
        } else if (instr.type === 'use_frame') {
          if (instr.frameName === 'WORLD') {
            currentFrameVar = null; // Sin transformación
          } else {
            currentFrameVar = `${instr.frameName}_frame`;
          }
        } else if (instr.type === 'use_pose') {
          lines.push(` # Usando Pose: ${instr.poseName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'use_point') {
          lines.push(` # Usando Punto: ${instr.pointName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'variable_set') {
          const varName = instr.varName || instr.variable || 'i';
          const valueExpr = formatMathUR(instr.value);
          lines.push(` ${varName} = ${valueExpr}`);
        } else if (instr.type === 'if_block') {
          const condStr = formatConditionUR(instr.condition);
          lines.push(` if ${condStr}:`);
          
          // Rama DO (entonces)
          if (instr.do && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }
          
          // Rama ELSE (sino) - opcional
          if (instr.else && instr.else.length > 0) {
            lines.push(` else:`);
            const elseStart = lines.length;
            instr.else.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(elseStart);
          }
          
          lines.push(` end`);
        } else if (instr.type === 'while_block') {
          const condStr = formatConditionUR(instr.condition);
          lines.push(` while ${condStr}:`);
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }
          
          lines.push(` end`);
        } else if (instr.type === 'for_block') {
          const varName = instr.variable || 'i';
          const from = instr.from ?? 0;
          const to = instr.to ?? 10;
          lines.push(` ${varName} = ${from}`);
          lines.push(` while ${varName} <= ${to}:`);
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            const bodyStart = lines.length;
            instr.do.forEach(subInstr => gen(subInstr));
            indentGeneratedLines(bodyStart);
          }
          
          lines.push(`   ${varName} = ${varName} + 1`);
          lines.push(` end`);
        } else if (instr.type === 'palletize_block') {
          // Paletizado completo para URScript
          let pickPos = instr.pick_pose;
          if (!pickPos && instr.pick_pos && typeof instr.pick_pos === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            pickPos = {
              ...instr.pick_pos,
              rx: instr.pick_pos.rx ?? 0,
              ry: instr.pick_pos.ry ?? 180,
              rz: instr.pick_pos.rz ?? 0
            };
          }
          pickPos = pickPos || { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 };
          let p1Pose = instr.pallet_p1_pose;
          if (!p1Pose && instr.pallet_p1 && typeof instr.pallet_p1 === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            p1Pose = {
              ...instr.pallet_p1,
              rx: instr.pallet_p1.rx ?? 0,
              ry: instr.pallet_p1.ry ?? 180,
              rz: instr.pallet_p1.rz ?? 0
            };
          }
          p1Pose = p1Pose || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let palletOrigin = p1Pose;
          if (instr.pallet_origin) {
            // TODO: eliminar fallback legacy con pallet_origin
            palletOrigin = instr.pallet_origin;
          }
          const p2Point = instr.pallet_p2 || addVector(palletOrigin, { x: 100, y: 0, z: 0 });
          const p3Point = instr.pallet_p3 || addVector(palletOrigin, { x: 0, y: 100, z: 0 });
          const applyFrameUR = (poseStr) => currentFrameVar ? `pose_trans(${currentFrameVar}, ${poseStr})` : poseStr;
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const safetyMargin = instr.safety_margin ?? 100;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickHookActions = normalizePalletHookActions(instr?.grip_close_actions, {
            defaultWaitS: instr?.pick_wait_time
          });
          const placeHookActions = normalizePalletHookActions(instr?.grip_open_actions, {
            defaultWaitS: instr?.place_wait_time
          });
          const hasPickGripperAction = pickHookActions.length > 0;
          const hasPlaceGripperAction = placeHookActions.length > 0;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const layerHeight = instr.layer_height ?? 60;

          const palletValidationErrors = [];
          if (!p1Pose || !p2Point || !p3Point) palletValidationErrors.push('P1/P2/P3 inexistentes');
          if (isSameXYZ(p1Pose, p2Point)) palletValidationErrors.push('P2 coincide con P1');
          if (isSameXYZ(p1Pose, p3Point)) palletValidationErrors.push('P3 coincide con P1');
          if ((rows ?? 0) <= 0) palletValidationErrors.push('rows <= 0');
          if ((cols ?? 0) <= 0) palletValidationErrors.push('cols <= 0');
          if ((layers ?? 0) <= 0) palletValidationErrors.push('layers <= 0');
          if ((placeApproach ?? 0) < 0) palletValidationErrors.push('approach_distance < 0');
          if ((pickApproach ?? 0) < 0) palletValidationErrors.push('pick_approach < 0');

          const safeRows = Math.max(1, Number(rows) || 1);
          const safeCols = Math.max(1, Number(cols) || 1);
          const safeLayers = Math.max(1, Number(layers) || 1);
          const safePickApproach = Math.max(0, Number(pickApproach) || 0);
          const safePlaceApproach = Math.max(0, Number(placeApproach) || 0);
          let safeP1 = palletOrigin || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let safeP2 = p2Point || addVector(safeP1, { x: 100, y: 0, z: 0 });
          let safeP3 = p3Point || addVector(safeP1, { x: 0, y: 100, z: 0 });
          if (isSameXYZ(safeP1, safeP2)) safeP2 = addVector(safeP1, { x: 100, y: 0, z: 0 });
          if (isSameXYZ(safeP1, safeP3)) safeP3 = addVector(safeP1, { x: 0, y: 100, z: 0 });
          const dx = makeVector(safeP1, safeP2);
          const dy = makeVector(safeP1, safeP3);
          if (palletValidationErrors.length > 0) {
            lines.push(` # ADVERTENCIA PALET: ${palletValidationErrors.join('; ')}. Se aplica fallback controlado.`);
          }
          
          // Convertir a metros
          const pickX = ((pickPos.x ?? 0) / 1000).toFixed(4);
          const pickY = ((pickPos.y ?? 0) / 1000).toFixed(4);
          const pickZ = ((pickPos.z ?? 0) / 1000).toFixed(4);
          const pickZApproach = (((pickPos.z ?? 0) + safePickApproach) / 1000).toFixed(4);
          const pickRx = ((((pickPos.rx ?? 0) * Math.PI) / 180)).toFixed(5);
          const pickRy = ((((pickPos.ry ?? 180) * Math.PI) / 180)).toFixed(5);
          const pickRz = ((((pickPos.rz ?? 0) * Math.PI) / 180)).toFixed(5);
          
          const p1X = ((safeP1.x ?? 0) / 1000).toFixed(4);
          const p1Y = ((safeP1.y ?? 0) / 1000).toFixed(4);
          const p1Z = ((safeP1.z ?? 0) / 1000).toFixed(4);
          const dxX = ((dx.x ?? 0) / 1000).toFixed(4);
          const dxY = ((dx.y ?? 0) / 1000).toFixed(4);
          const dxZ = ((dx.z ?? 0) / 1000).toFixed(4);
          const dyX = ((dy.x ?? 0) / 1000).toFixed(4);
          const dyY = ((dy.y ?? 0) / 1000).toFixed(4);
          const dyZ = ((dy.z ?? 0) / 1000).toFixed(4);
          const palletRx = ((((p1Pose.rx ?? 0) * Math.PI) / 180)).toFixed(5);
          const palletRy = ((((p1Pose.ry ?? 180) * Math.PI) / 180)).toFixed(5);
          const palletRz = ((((p1Pose.rz ?? 0) * Math.PI) / 180)).toFixed(5);
          
          const stepZ = (layerHeight / 1000).toFixed(4);
          const approachZ = (safePlaceApproach / 1000).toFixed(4);
          const toolIdForGripper = activeToolId ?? instr?.tool_id ?? null;
          const gripperLabel = formatPalletGripperLabel({
            closeActions: pickHookActions,
            openActions: placeHookActions,
            fallbackPin: gripperPin,
            activeToolId,
            instrToolId: toolIdForGripper
          });

          lines.push(` # ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══`);
          lines.push(` # Configuración:`);
          lines.push(` #   PICK: (${pickX}, ${pickY}, ${pickZ})`);
          lines.push(` #   PALET: ${safeRows}x${safeCols}x${safeLayers} = ${safeRows * safeCols * safeLayers} ciclos`);
          lines.push(` #   Gripper: ${gripperLabel}`);
          lines.push(``);
          
          // Variables base
          lines.push(` pick_x = ${pickX}`);
          lines.push(` pick_y = ${pickY}`);
          lines.push(` pick_z = ${pickZ}`);
          lines.push(` pick_z_approach = ${pickZApproach}`);
          lines.push(` pick_rx = ${pickRx}`);
          lines.push(` pick_ry = ${pickRy}`);
          lines.push(` pick_rz = ${pickRz}`);
          lines.push(` p1_x = ${p1X}`);
          lines.push(` p1_y = ${p1Y}`);
          lines.push(` p1_z = ${p1Z}`);
          lines.push(` dx_x = ${dxX}`);
          lines.push(` dx_y = ${dxY}`);
          lines.push(` dx_z = ${dxZ}`);
          lines.push(` dy_x = ${dyX}`);
          lines.push(` dy_y = ${dyY}`);
          lines.push(` dy_z = ${dyZ}`);
          lines.push(` pallet_rx = ${palletRx}`);
          lines.push(` pallet_ry = ${palletRy}`);
          lines.push(` pallet_rz = ${palletRz}`);
          lines.push(` step_z = ${stepZ}`);
          lines.push(` approach_z = ${approachZ}`);
          lines.push(``);
          
          // Bucles anidados
          lines.push(` layer = 0`);
          lines.push(` while layer < ${safeLayers}:`);
          lines.push(`   # Calcular altura de seguridad para esta capa`);
          lines.push(`   safety_z = p1_z + layer * step_z + ${(safetyMargin / 1000).toFixed(4)}`);
          lines.push(`   row = 0`);
          lines.push(`   while row < ${safeRows}:`);
          lines.push(`     col = 0`);
          lines.push(`     while col < ${safeCols}:`);
          lines.push(`       # ─── Ciclo Pick & Place ───`);
          
          // PICK
          lines.push(`       # PICK: Aproximación`);
          lines.push(`       movej(${applyFrameUR(`p[pick_x, pick_y, pick_z_approach, pick_rx, pick_ry, pick_rz]`)}, a=1.2, v=0.25)`);
          lines.push(`       # PICK: Descenso`);
          lines.push(`       movel(${applyFrameUR(`p[pick_x, pick_y, pick_z, pick_rx, pick_ry, pick_rz]`)}, a=1.2, v=0.1)`);
          if (hasPickGripperAction) {
            lines.push(`       # PICK: Acción pinza explícita`);
            emitPalletHookActions(lines, pickHookActions, {
              indent: '       ',
              fallbackPin: gripperPin,
              phase: 'pick',
              activeToolId,
              instrToolId: toolIdForGripper
            });
          }
          lines.push(`       # PICK: Retirada local a aproximación`);
          lines.push(`       movel(${applyFrameUR(`p[pick_x, pick_y, pick_z_approach, pick_rx, pick_ry, pick_rz]`)}, a=1.2, v=0.25)`);
          lines.push(``);
          
          // PLACE
          lines.push(`       # PLACE: Calcular posición`);
          lines.push(`       place_x = p1_x + col * dx_x + row * dy_x`);
          lines.push(`       place_y = p1_y + col * dx_y + row * dy_y`);
          lines.push(`       place_z = p1_z + col * dx_z + row * dy_z + layer * step_z`);
          lines.push(`       place_z_approach = place_z + approach_z`);
          lines.push(`       # PLACE: Movimiento articular a XY a altura segura`);
          lines.push(`       movej(${applyFrameUR(`p[place_x, place_y, safety_z, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.5)`);
          lines.push(`       # PLACE: Descenso a aproximación`);
          lines.push(`       movel(${applyFrameUR(`p[place_x, place_y, place_z_approach, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.25)`);
          lines.push(`       # PLACE: Descenso final`);
          lines.push(`       movel(${applyFrameUR(`p[place_x, place_y, place_z, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.1)`);
          if (hasPlaceGripperAction) {
            lines.push(`       # PLACE: Acción pinza explícita`);
            emitPalletHookActions(lines, placeHookActions, {
              indent: '       ',
              fallbackPin: gripperPin,
              phase: 'place',
              activeToolId,
              instrToolId: toolIdForGripper
            });
          }
          lines.push(`       # PLACE: Levantar`);
          lines.push(`       movel(${applyFrameUR(`p[place_x, place_y, place_z_approach, pallet_rx, pallet_ry, pallet_rz]`)}, a=1.2, v=0.25)`);
          lines.push(``);
          
          lines.push(`       col = col + 1`);
          lines.push(`     end`);
          lines.push(`     row = row + 1`);
          lines.push(`   end`);
          lines.push(`   layer = layer + 1`);
          lines.push(` end`);
          lines.push(` # ═══ FIN PALETIZADO ═══`);
        } else if (instr.type === 'read_ai_block') {
          lines.push(`Leer AI[${instr.pin}] (devuelve valor en voltios 0-10V)`);
        } else if (instr.type === 'write_ao_block') {
          const value = formatMathEducational(instr.value);
          lines.push(`Escribir AO[${instr.pin}] = ${value} V`);
        } else if (instr.type === 'wait_ai_block') {
          const opMap = { GT: '>', LT: '<', GTE: '≥', LTE: '≤' };
          const opStr = opMap[instr.operator] || '>';
          const value = instr.value ?? 0;
          lines.push(`Esperar AI[${instr.pin}] ${opStr} ${value} V`);
        } else if (instr.type === 'function_def_params') {
          const params = instr.params ? instr.params.join(', ') : '';
          lines.push(`Función ${instr.funcname}(${params}):`);
          lines.push(`  // Nota: En Fanuc se implementa como subprograma separado .TP`);
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => {
              const currentLength = lines.length;
              emit(subInstr);
              // Indentar las líneas añadidas
              for (let i = currentLength; i < lines.length; i++) {
                lines[i] = '  ' + lines[i];
              }
            });
          }
          
          lines.push(`Fin Función`);
        } else if (instr.type === 'function_call_params') {
          const args = instr.args ? instr.args.map(a => formatMathEducational(a)).join(', ') : '';
          lines.push(`Llamar ${instr.funcname}(${args})`);
        } else if (instr.type === 'function_return') {
          const value = formatMathEducational(instr.value);
          lines.push(`Retornar ${value}`);
        }
        emit(instr.next);
      }
      program.forEach(emit);
      return lines.join("\n");
    }
    
    /* SECCIÓN 022: Generador de Código Industrial para ABB IRC5 (RAPID) */
    else if (robot === CONSTANTS.ROBOTS.ABB) {
      let header = "MODULE MainModule\n";
      header += ` ! La configuración de tooldata se define con el bloque de herramienta.\n`;
      header += " PROC main()\n";
      
      let consts = "";
      let wobjDefs = ""; // Definiciones de Work Objects (frames)
      let bodyPath = "";
      let pcount = 1;
      
      // Mapeo de frames a nombres de wobjdata
      const frameMap = {};
      let currentFrame = 'wobj0'; // Frame activo (por defecto wobj0 = WORLD)
      const definedTargets = new Set(); // Para evitar redefinir puntos/poses
      
      const abbSpeedToken = (speed_mms, isLinear) => {
        const v = speed_mms || spd;
        if (isLinear) return `v${Math.max(5, v.toFixed(0))}`;
        return `v${Math.max(100, (v*20).toFixed(0))}`;
      };

      function gen(instr) {
        if (!instr) return;
        if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
          // Usar nombre de pose/punto si está disponible, sino genérico
          const name = instr.sourceName || `p${pcount++}`;
          const zone = instr.zone || 'z50';
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (bodyPath += ` ! WARNING: Fuera de alcance\n`);
          
          // Solo definir si no existe ya
          if (!definedTargets.has(name)) {
            consts += ` CONST robtarget ${name}:=[[${(instr.x || 0).toFixed(2)},${(instr.y || 0).toFixed(2)},${(instr.z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
            definedTargets.add(name);
          }
          bodyPath += ` MoveJ ${name}, ${abbSpeedToken(instr.speed, false)}, ${zone}, tool0\\WObj:=${currentFrame};\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          // Usar nombre de pose/punto si está disponible, sino genérico
          const name = instr.sourceName || `p${pcount++}`;
          const zone = instr.zone || 'z50';
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (bodyPath += ` ! WARNING: Fuera de alcance\n`);
          if (checkSingularityWarning(instr.y)) {
            bodyPath += ` ! ADVERTENCIA: movel cerca de Y=0. Riesgo de singularidad.\n`;
          }
          
          // Solo definir si no existe ya
          if (!definedTargets.has(name)) {
            consts += ` CONST robtarget ${name}:=[[${(instr.x || 0).toFixed(2)},${(instr.y || 0).toFixed(2)},${(instr.z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
            definedTargets.add(name);
          }
          bodyPath += ` MoveL ${name}, ${abbSpeedToken(instr.speed ?? spd, true)}, ${zone}, tool0\\WObj:=${currentFrame};\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          // Usar nombres de pose/punto si están disponibles, sino genéricos
          const via_name = instr.via_sourceName || `p${pcount++}`;
          const end_name = instr.end_sourceName || `p${pcount++}`;
          const zone = instr.zone || 'z50';
          const w_via = warnIfOutOfReach(robot, instr.via_x, instr.via_y, instr.via_z);
          w_via && (bodyPath += ` ! WARNING: Pto Vía Fuera de alcance\n`);
          const w_end = warnIfOutOfReach(robot, instr.end_x, instr.end_y, instr.end_z);
          w_end && (bodyPath += ` ! WARNING: Pto Final Fuera de alcance\n`);
          
          if (checkSingularityWarning(instr.via_y) || checkSingularityWarning(instr.end_y)) {
              bodyPath += ` ! ADVERTENCIA: movec cerca de Y=0. Riesgo de singularidad.\n`;
          }
          
          // Solo definir si no existen ya
          if (!definedTargets.has(via_name)) {
            consts += ` CONST robtarget ${via_name}:=[[${(instr.via_x || 0).toFixed(2)},${(instr.via_y || 0).toFixed(2)},${(instr.via_z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
            definedTargets.add(via_name);
          }
          if (!definedTargets.has(end_name)) {
            consts += ` CONST robtarget ${end_name}:=[[${(instr.end_x || 0).toFixed(2)},${(instr.end_y || 0).toFixed(2)},${(instr.end_z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
            definedTargets.add(end_name);
          }
          bodyPath += ` MoveC ${via_name}, ${end_name}, ${abbSpeedToken(instr.speed ?? spd, true)}, ${zone}, tool0\\WObj:=${currentFrame};\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT) {
          bodyPath += ` WaitTime ${instr.time || 1};\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.SET_DO) {
          const state = instr.state == 1 ? '1' : '0';
          bodyPath += ` SetDO do${instr.pin}, ${state};\n`; // Asume que las DO se llaman do1, do2...
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
          const state = instr.state == 1 ? '1' : '0';
          bodyPath += ` WaitDI di${instr.pin}, ${state};\n`; // Asume que las DI se llaman di1, di2...

        // Generar código para 'set_tool' en RAPID (ABB)
        } else if (instr.type === 'set_tool') {
          const tool = TOOL_DATABASE[instr.tool_id];
          if (tool) {
            bodyPath += ` ! Selección de herramienta: ${tool.name}\n`;
            if (instr.tool_id === 'manual') {
              const {tcp_x, tcp_y, tcp_z, tcp_rx, tcp_ry, tcp_rz} = instr;
              const q = eulerToQuaternion(tcp_rx ?? 0, tcp_ry ?? 0, tcp_rz ?? 0);
              bodyPath += ` ! Definición de TCP Manual. Se debe crear un tooldata y activarlo.\n`;
              bodyPath += ` ! PERS tooldata tool_manual:=[TRUE,[[${(tcp_x ?? 0).toFixed(2)},${(tcp_y ?? 0).toFixed(2)},${(tcp_z ?? 0).toFixed(2)}],[${q.join(',')}]],[0.1,[0,0,0.1],[1,0,0,0],0,0,0]];\n`;
            } else {
              bodyPath += ` ! TODO: Activar tooldata predefinido correspondiente a '${instr.tool_id}' (ABB)\n`;
            }
          } else {
            bodyPath += ` ! Herramienta con ID '${instr.tool_id}' no encontrada.\n`;
          }
        } else if (instr.type === 'gripper_set' || instr.type === 'rg2_grip_set') {
          bodyPath += ` ! ADVERTENCIA: Bloque RG2 usado con robot "${robot}". RG2 URCap solo es compatible con UR. (omitido)\n`;
        }
        // Generar código para 'define_point' en RAPID (como comentario)
        else if (instr.type === 'define_point') {
          bodyPath += ` ! Punto definido: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})\n`;
        }
        // Generar código para 'define_pose' en RAPID (como comentario)
        else if (instr.type === 'define_pose') {
          bodyPath += ` ! Pose definida: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})\n`;
        }
        // Generar código para 'define_frame' en RAPID
        else if (instr.type === 'define_frame') {
          const wobjName = `wobj_${instr.name}`;
          frameMap[instr.name] = wobjName;
          
          // Calcular cuaternión de rotación
          const q = eulerToQuaternion(instr.rx ?? 0, instr.ry ?? 0, instr.rz ?? 0);
          
          // Generar definición de wobjdata
          wobjDefs += ` PERS wobjdata ${wobjName}:=[FALSE,TRUE,"",[`;
          wobjDefs += `[${(instr.x ?? 0).toFixed(2)},${(instr.y ?? 0).toFixed(2)},${(instr.z ?? 0).toFixed(2)}],`;
          wobjDefs += `[${q.join(',')}]`;
          wobjDefs += `],[[0,0,0],[1,0,0,0]]];\n`;
        }
        // Generar código para 'use_frame' en RAPID
        else if (instr.type === 'use_frame') {
          if (instr.frameName === 'WORLD') {
            currentFrame = 'wobj0';
          } else {
            currentFrame = frameMap[instr.frameName] || 'wobj0';
          }
        }
        // Generar código para 'use_pose' en RAPID (como comentario)
        else if (instr.type === 'use_pose') {
          bodyPath += ` ! Usando Pose: ${instr.poseName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})\n`;
        }
        // Generar código para 'use_point' en RAPID (como comentario)
        else if (instr.type === 'use_point') {
          bodyPath += ` ! Usando Punto: ${instr.pointName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})\n`;
        }
        // Generar código para 'if_block' en RAPID
        else if (instr.type === 'if_block') {
          const condStr = formatConditionRAPID(instr.condition);
          bodyPath += ` IF ${condStr} THEN\n`;
          
          // Rama DO (entonces)
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          // Rama ELSE (sino) - opcional
          if (instr.else && instr.else.length > 0) {
            bodyPath += ` ELSE\n`;
            instr.else.forEach(subInstr => gen(subInstr));
          }
          
          bodyPath += ` ENDIF\n`;
        }
        // Generar código para 'while_block' en RAPID
        else if (instr.type === 'while_block') {
          const condStr = formatConditionRAPID(instr.condition);
          bodyPath += ` WHILE ${condStr} DO\n`;
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          bodyPath += ` ENDWHILE\n`;
        }
        // Generar código para 'for_block' en RAPID
        else if (instr.type === 'for_block') {
          const varName = instr.variable || 'i';
          const from = instr.from ?? 0;
          const to = instr.to ?? 10;
          bodyPath += ` FOR ${varName} FROM ${from} TO ${to} DO\n`;
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          bodyPath += ` ENDFOR\n`;
        }
        // Loop simple para RAPID
        else if (instr.type === 'loop_block') {
          const count = instr.count ?? 1;
          bodyPath += ` FOR loop_i FROM 1 TO ${count} DO\n`;
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          bodyPath += ` ENDFOR\n`;
        }
        // Paletizado completo para RAPID (ABB)
        else if (instr.type === 'palletize_block') {
          let pickPos = instr.pick_pose;
          if (!pickPos && instr.pick_pos && typeof instr.pick_pos === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            pickPos = {
              ...instr.pick_pos,
              rx: instr.pick_pos.rx ?? 0,
              ry: instr.pick_pos.ry ?? 180,
              rz: instr.pick_pos.rz ?? 0
            };
          }
          pickPos = pickPos || { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 };
          const pickQ = eulerToQuaternion(pickPos.rx ?? 0, pickPos.ry ?? 180, pickPos.rz ?? 0);
          let p1Pose = instr.pallet_p1_pose;
          if (!p1Pose && instr.pallet_p1 && typeof instr.pallet_p1 === 'object') {
            // TODO: eliminar compatibilidad legacy con point
            p1Pose = {
              ...instr.pallet_p1,
              rx: instr.pallet_p1.rx ?? 0,
              ry: instr.pallet_p1.ry ?? 180,
              rz: instr.pallet_p1.rz ?? 0
            };
          }
          p1Pose = p1Pose || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let palletOrigin = p1Pose;
          if (instr.pallet_origin) {
            // TODO: eliminar fallback legacy con pallet_origin
            palletOrigin = instr.pallet_origin;
          }
          const p2Point = instr.pallet_p2 || addVector(palletOrigin, { x: 100, y: 0, z: 0 });
          const p3Point = instr.pallet_p3 || addVector(palletOrigin, { x: 0, y: 100, z: 0 });
          const palletQ = eulerToQuaternion(p1Pose.rx ?? 0, p1Pose.ry ?? 180, p1Pose.rz ?? 0);
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const safetyMargin = instr.safety_margin ?? 100;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickWait = instr.pick_wait_time ?? 0.5;
          const placeWait = instr.place_wait_time ?? 0.3;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const layerHeight = instr.layer_height ?? 60;

          const palletValidationErrors = [];
          if (!p1Pose || !p2Point || !p3Point) palletValidationErrors.push('P1/P2/P3 inexistentes');
          if (isSameXYZ(p1Pose, p2Point)) palletValidationErrors.push('P2 coincide con P1');
          if (isSameXYZ(p1Pose, p3Point)) palletValidationErrors.push('P3 coincide con P1');
          if ((rows ?? 0) <= 0) palletValidationErrors.push('rows <= 0');
          if ((cols ?? 0) <= 0) palletValidationErrors.push('cols <= 0');
          if ((layers ?? 0) <= 0) palletValidationErrors.push('layers <= 0');
          if ((placeApproach ?? 0) < 0) palletValidationErrors.push('approach_distance < 0');

          const safeRows = Math.max(1, Number(rows) || 1);
          const safeCols = Math.max(1, Number(cols) || 1);
          const safeLayers = Math.max(1, Number(layers) || 1);
          const safePickApproach = Math.max(0, Number(pickApproach) || 0);
          const safePlaceApproach = Math.max(0, Number(placeApproach) || 0);
          let safeP1 = palletOrigin || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
          let safeP2 = p2Point || addVector(safeP1, { x: 100, y: 0, z: 0 });
          let safeP3 = p3Point || addVector(safeP1, { x: 0, y: 100, z: 0 });
          if (isSameXYZ(safeP1, safeP2)) safeP2 = addVector(safeP1, { x: 100, y: 0, z: 0 });
          if (isSameXYZ(safeP1, safeP3)) safeP3 = addVector(safeP1, { x: 0, y: 100, z: 0 });
          const dx = makeVector(safeP1, safeP2);
          const dy = makeVector(safeP1, safeP3);
          if (palletValidationErrors.length > 0) {
            bodyPath += ` ! ADVERTENCIA PALET: ${palletValidationErrors.join('; ')}. Se aplica fallback controlado.\n`;
          }
          const gripperOverride = instr?.gripper_override || null;
          const toolIdForGripper = instr?.tool_id ?? null;
          const activeWObj = currentFrame || 'wobj0';
          let gripperLabel = 'AUTO (tool actions)';
          if (toolIdForGripper === 'onrobot_rg2_urcap') {
            gripperLabel = 'RG2 (URCap defaults)';
          } else if (gripperOverride?.type === 'digital_out') {
            gripperLabel = 'Digital IO';
          }
          
          bodyPath += ` ! ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══\n`;
          bodyPath += ` ! Configuración:\n`;
          bodyPath += ` !   PICK: (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${pickPos.z ?? 0})\n`;
          bodyPath += ` !   PALET: ${safeRows}x${safeCols}x${safeLayers} = ${safeRows * safeCols * safeLayers} ciclos\n`;
          bodyPath += ` !   Gripper: ${gripperLabel}\n`;
          bodyPath += `\n`;
          
          // Declaración de variables en consts
          consts += ` ! Variables de paletizado\n`;
          consts += ` VAR num pick_x := ${(pickPos.x ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pick_y := ${(pickPos.y ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pick_z := ${(pickPos.z ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pick_z_approach := ${((pickPos.z ?? 0) + safePickApproach).toFixed(2)};\n`;
          consts += ` VAR num p1_x := ${(safeP1.x ?? 0).toFixed(2)};\n`;
          consts += ` VAR num p1_y := ${(safeP1.y ?? 0).toFixed(2)};\n`;
          consts += ` VAR num p1_z := ${(safeP1.z ?? 0).toFixed(2)};\n`;
          consts += ` VAR num dx_x := ${(dx.x ?? 0).toFixed(2)};\n`;
          consts += ` VAR num dx_y := ${(dx.y ?? 0).toFixed(2)};\n`;
          consts += ` VAR num dx_z := ${(dx.z ?? 0).toFixed(2)};\n`;
          consts += ` VAR num dy_x := ${(dy.x ?? 0).toFixed(2)};\n`;
          consts += ` VAR num dy_y := ${(dy.y ?? 0).toFixed(2)};\n`;
          consts += ` VAR num dy_z := ${(dy.z ?? 0).toFixed(2)};\n`;
          consts += ` VAR num step_z := ${layerHeight.toFixed(2)};\n`;
          consts += ` VAR num approach_z := ${safePlaceApproach.toFixed(2)};\n`;
          consts += ` VAR num safety_margin := ${safetyMargin.toFixed(2)};\n`;
          consts += ` VAR num safety_z;\n`;
          consts += ` VAR num place_x;\n`;
          consts += ` VAR num place_y;\n`;
          consts += ` VAR num place_z;\n`;
          consts += ` VAR robtarget pick_approach_pos;\n`;
          consts += ` VAR robtarget pick_pos_target;\n`;
          consts += ` VAR robtarget pick_safety_pos;\n`;
          consts += ` VAR robtarget place_safety_pos;\n`;
          consts += ` VAR robtarget place_approach_pos;\n`;
          consts += ` VAR robtarget place_pos_target;\n`;
          consts += `\n`;
          
          // Bucles anidados
          bodyPath += ` FOR layer FROM 1 TO ${safeLayers} DO\n`;
          bodyPath += `   ! Calcular altura de seguridad para esta capa\n`;
          bodyPath += `   safety_z := p1_z + (layer - 1) * step_z + safety_margin;\n`;
          bodyPath += `   FOR row FROM 1 TO ${safeRows} DO\n`;
          bodyPath += `     FOR col FROM 1 TO ${safeCols} DO\n`;
          bodyPath += `       ! ─── Ciclo Pick & Place (Capa layer) ───\n`;
          
          // PICK - Aproximación
          bodyPath += `       ! PICK: Aproximación\n`;
          bodyPath += `       pick_approach_pos := [[pick_x, pick_y, pick_z_approach], [${pickQ.join(',')}], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL pick_approach_pos, v200, fine, tool0\\WObj:=${activeWObj};\n`;
          
          // PICK - Descenso
          bodyPath += `       ! PICK: Descenso\n`;
          bodyPath += `       pick_pos_target := [[pick_x, pick_y, pick_z], [${pickQ.join(',')}], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL pick_pos_target, v100, fine, tool0\\WObj:=${activeWObj};\n`;
          
          // PICK - Cerrar pinza
          bodyPath += `       ! PICK: Cerrar pinza\n`;
          bodyPath += `       SetDO do${gripperPin}, 1;\n`;
          bodyPath += `       WaitTime ${pickWait};\n`;
          
          // PICK - Levantar a altura segura
          bodyPath += `       ! PICK: Levantar a altura de seguridad\n`;
          bodyPath += `       pick_safety_pos := [[pick_x, pick_y, safety_z], [${pickQ.join(',')}], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL pick_safety_pos, v200, fine, tool0\\WObj:=${activeWObj};\n`;
          bodyPath += `\n`;
          
          // PLACE - Calcular posición
          bodyPath += `       ! PLACE: Calcular posición\n`;
          bodyPath += `       place_x := p1_x + (col - 1) * dx_x + (row - 1) * dy_x;\n`;
          bodyPath += `       place_y := p1_y + (col - 1) * dx_y + (row - 1) * dy_y;\n`;
          bodyPath += `       place_z := p1_z + (col - 1) * dx_z + (row - 1) * dy_z + (layer - 1) * step_z;\n`;
          
          // PLACE - Movimiento articular a XY a altura segura
          bodyPath += `       ! PLACE: Movimiento articular a XY a altura segura\n`;
          bodyPath += `       place_safety_pos := [[place_x, place_y, safety_z], [${palletQ.join(',')}], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveJ place_safety_pos, v500, z50, tool0\\WObj:=${activeWObj};\n`;
          
          // PLACE - Descenso a aproximación
          bodyPath += `       ! PLACE: Descenso a aproximación\n`;
          bodyPath += `       place_approach_pos := [[place_x, place_y, place_z + approach_z], [${palletQ.join(',')}], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL place_approach_pos, v200, fine, tool0\\WObj:=${activeWObj};\n`;
          
          // PLACE - Descenso final
          bodyPath += `       ! PLACE: Descenso final\n`;
          bodyPath += `       place_pos_target := [[place_x, place_y, place_z], [${palletQ.join(',')}], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL place_pos_target, v100, fine, tool0\\WObj:=${activeWObj};\n`;
          
          // PLACE - Abrir pinza
          bodyPath += `       ! PLACE: Abrir pinza\n`;
          bodyPath += `       SetDO do${gripperPin}, 0;\n`;
          bodyPath += `       WaitTime ${placeWait};\n`;
          
          // PLACE - Levantar
          bodyPath += `       ! PLACE: Levantar\n`;
          bodyPath += `       MoveL place_approach_pos, v200, fine, tool0\\WObj:=${activeWObj};\n`;
          bodyPath += `\n`;
          
          bodyPath += `     ENDFOR\n`;
          bodyPath += `   ENDFOR\n`;
          bodyPath += ` ENDFOR\n`;
          bodyPath += ` ! ═══ FIN PALETIZADO ═══\n`;
        }
        // Generar código para E/S analógicas en RAPID
        else if (instr.type === 'read_ai_block') {
          bodyPath += ` ! Leer AI[${instr.pin}]: usar AInput(ai${instr.pin}) devuelve 0-10V\n`;
        } else if (instr.type === 'write_ao_block') {
          const value = formatMathRAPID(instr.value);
          bodyPath += ` SetAO ao${instr.pin}, ${value};\n`;
        } else if (instr.type === 'wait_ai_block') {
          const opMap = { GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
          const opStr = opMap[instr.operator] || '>';
          const value = instr.value ?? 0;
          bodyPath += ` WaitUntil (AInput(ai${instr.pin}) ${opStr} ${value.toFixed(2)});\n`;
        } else if (instr.type === 'function_def_params') {
          const params = instr.params ? instr.params.map(p => `num ${p}`).join(', ') : '';
          bodyPath += ` ! Definición de función: ${instr.funcname}\n`;
          bodyPath += ` PROC ${instr.funcname}(${params})\n`;
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          bodyPath += ` ENDPROC\n`;
        } else if (instr.type === 'function_call_params') {
          const args = instr.args ? instr.args.map(a => formatMathRAPID(a)).join(', ') : '';
          bodyPath += ` ${instr.funcname} ${args};\n`;
        } else if (instr.type === 'function_return') {
          const value = formatMathRAPID(instr.value);
          bodyPath += `   RETURN ${value};\n`;
        }
        gen(instr.next);
      }
      program.forEach(gen);
      return header + wobjDefs + consts + bodyPath + " ENDPROC\nENDMODULE\n";
    }
    else if (robot === CONSTANTS.ROBOTS.FANUC) { // Generador para Fanuc
      console.log('🔵 Generador Fanuc iniciado. Programa:', program);
      console.log('🔵 Total bloques top-level:', program.length);
      const spd = currentDefaultSpeed(); // Velocidad por defecto
      console.log('🔵 Velocidad por defecto:', spd);
      let header = "/PROG  MAIN_PROG\n/ATTR\n/MN\n";
      let body = "";
      let pos = "/POS\n";
      let pcount = 1;
      pos += `! La configuración de UTOOL se define con el bloque de herramienta.\n`;
      body += ` 1:  UFRAME_NUM=0 ;\n`;
      body += ` 2:  UTOOL_NUM=0 ;\n`; // Por defecto, sin herramienta
      
      // Mapeo de frames a números de UFRAME
      const frameMap = { 'WORLD': 0 };
      let frameCounter = 1;
      
      function gen(instr, index) {
        if (!instr) {
          console.log('⚠️ gen() recibió instrucción null/undefined en índice:', index);
          return index;
        }
        console.log('🟢 Procesando bloque:', instr.type, 'en índice:', index);
        
        let currentIndex = index;
        
        if(instr.type === 'move_block'){
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (body += ` ! WARNING: Fuera de alcance\n`);
          body += ` ${currentIndex+3}:J P[${pcount}] ${Math.round(instr.speed ?? spd)}% FINE ;\n`;
          pos += `P[${pcount}]{X=${(instr.x || 0).toFixed(1)}, Y=${(instr.y || 0).toFixed(1)}, Z=${(instr.z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          pcount++;
          
        } else if(instr.type === 'move_linear_block'){
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (body += ` ! WARNING: Fuera de alcance\n`);
          
          if (checkSingularityWarning(instr.y)) {
              body += ` ! ADVERTENCIA: movel cerca de Y=0. ¡Riesgo de singularidad!\n`;
          }
          
          body += ` ${currentIndex+3}:L P[${pcount}] ${Math.round(instr.speed ?? spd)}mm/sec FINE ;\n`;
          pos += `P[${pcount}]{X=${(instr.x || 0).toFixed(1)}, Y=${(instr.y || 0).toFixed(1)}, Z=${(instr.z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          pcount++;
          
        } else if(instr.type === 'move_circular_block'){
          const w_via = warnIfOutOfReach(robot, instr.via_x, instr.via_y, instr.via_z);
          w_via && (body += ` ! WARNING: Pto Vía Fuera de alcance\n`);
          const w_end = warnIfOutOfReach(robot, instr.end_x, instr.end_y, instr.end_z);
          w_end && (body += ` ! WARNING: Pto Final Fuera de alcance\n`);
          
          if (checkSingularityWarning(instr.via_y) || checkSingularityWarning(instr.end_y)) {
              body += ` ! ADVERTENCIA: movec cerca de Y=0. ¡Riesgo de singularidad!\n`;
          }
          
          const via_p = pcount++;
          const end_p = pcount++;
          body += ` ${currentIndex+3}:C P[${via_p}] P[${end_p}] ${Math.round(instr.speed ?? spd)}mm/sec FINE ;\n`;
          pos += `P[${via_p}]{X=${(instr.via_x || 0).toFixed(1)}, Y=${(instr.via_y || 0).toFixed(1)}, Z=${(instr.via_z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          pos += `P[${end_p}]{X=${(instr.end_x || 0).toFixed(1)}, Y=${(instr.end_y || 0).toFixed(1)}, Z=${(instr.end_z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          
        } else if (instr.type === 'wait_block') {
          body += ` ${currentIndex+3}:  WAIT ${(instr.time || 1).toFixed(2)} SEC ;\n`;
          
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.SET_DO) {
           const state = instr.state == 1 ? 'ON' : 'OFF';
           body += ` ${currentIndex+3}:  DO[${instr.pin}]=${state} ;\n`;
           
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
           const state = instr.state == 1 ? 'ON' : 'OFF';
           body += ` ${currentIndex+3}:  WAIT DI[${instr.pin}]=${state} ;\n`;
           
        } else if (instr.type === 'if_block') {
           const condStr = formatConditionFanuc(instr.condition);
           body += ` ${currentIndex+3}:  IF ${condStr} THEN ;\n`;
           currentIndex++;
           
           // Rama DO (entonces)
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               currentIndex = gen(subInstr, currentIndex);
               currentIndex++;
             });
           }
           
           // Rama ELSE (sino) - opcional
           if (instr.else && instr.else.length > 0) {
             body += ` ${currentIndex+3}:  ELSE ;\n`;
             currentIndex++;
             instr.else.forEach(subInstr => {
               currentIndex = gen(subInstr, currentIndex);
               currentIndex++;
             });
           }
           
           body += ` ${currentIndex+3}:  ENDIF ;\n`;
           return currentIndex;
           
        } else if (instr.type === 'while_block') {
           const condStr = formatConditionFanuc(instr.condition);
           body += ` ${currentIndex+3}:  WHILE ${condStr} DO ;\n`;
           currentIndex++;
           
           // Cuerpo del bucle
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               currentIndex = gen(subInstr, currentIndex);
               currentIndex++;
             });
           }
           
           body += ` ${currentIndex+3}:  ENDWHILE ;\n`;
           return currentIndex;
           
        } else if (instr.type === 'for_block') {
           const varName = instr.variable || 'i';
           const from = instr.from ?? 0;
           const to = instr.to ?? 10;
           body += ` ${currentIndex+3}:  FOR R[1]=${from} TO ${to} ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! Variable ${varName} = R[1] ;\n`;
           currentIndex++;
           
           // Cuerpo del bucle
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               currentIndex = gen(subInstr, currentIndex);
               currentIndex++;
             });
           }
           
           body += ` ${currentIndex+3}:  ENDFOR ;\n`;
           return currentIndex;
           
        } else if (instr.type === 'loop_block') {
           const count = instr.count ?? 1;
           body += ` ${currentIndex+3}:  FOR R[99]=1 TO ${count} ;\n`;
           currentIndex++;
           
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               currentIndex = gen(subInstr, currentIndex);
               currentIndex++;
             });
           }
           
           body += ` ${currentIndex+3}:  ENDFOR ;\n`;
           return currentIndex;
           
        } else if (instr.type === 'define_point') {
           body += ` ${currentIndex+3}:  ! Punto definido: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}) ;\n`;
           
        } else if (instr.type === 'define_pose') {
           body += ` ${currentIndex+3}:  ! Pose definida: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0}) ;\n`;
           
        } else if (instr.type === 'define_frame') {
           const frameNum = frameCounter++;
           frameMap[instr.name] = frameNum;
           
           body += ` ${currentIndex+3}:  ! Frame ${instr.name} = UFRAME[${frameNum}] ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! Origen: ${instr.x ?? 0},${instr.y ?? 0},${instr.z ?? 0} ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! Rotación: ${instr.rx ?? 0},${instr.ry ?? 0},${instr.rz ?? 0} ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! NOTA: Los frames se definen en el TP de Fanuc ;\n`;
           // NO hacer return - continuar con el flujo normal
           
        } else if (instr.type === 'use_frame') {
           const frameNum = frameMap[instr.frameName] ?? 0;
           body += ` ${currentIndex+3}:  UFRAME_NUM=${frameNum} ; ! Activar ${instr.frameName} ;\n`;
           
        } else if (instr.type === 'use_pose') {
           body += ` ${currentIndex+3}:  ! Usando Pose: ${instr.poseName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0}) ;\n`;
           
        } else if (instr.type === 'use_point') {
           body += ` ${currentIndex+3}:  ! Usando Punto: ${instr.pointName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}) ;\n`;
           
        } else if (instr.type === 'set_tool') {
           // Configuración de herramienta
           const toolId = instr.tool_id || 'manual';
           const toolInfo = TOOL_DATABASE[toolId];
           
           if (toolId === 'manual' && instr.tcp_x !== undefined) {
             body += ` ${currentIndex+3}:  ! Herramienta Manual: TCP (${instr.tcp_x ?? 0}, ${instr.tcp_y ?? 0}, ${instr.tcp_z ?? 0}) ;\n`;
             currentIndex++;
             body += ` ${currentIndex+3}:  ! Configurar UTOOL manualmente en el TP ;\n`;
           } else if (toolInfo) {
             body += ` ${currentIndex+3}:  ! ${toolInfo.name} ;\n`;
             currentIndex++;
             body += ` ${currentIndex+3}:  ! Configurar UTOOL en el TP ;\n`;
           }
           
        } else if (instr.type === 'palletize_block') {
           console.log('🟡 INICIO PALETIZADO, currentIndex:', currentIndex);
           // Paletizado completo para Fanuc TP
           let pickPos = instr.pick_pose;
           if (!pickPos && instr.pick_pos && typeof instr.pick_pos === 'object') {
             // TODO: eliminar compatibilidad legacy con point
             pickPos = {
               ...instr.pick_pos,
               rx: instr.pick_pos.rx ?? 0,
               ry: instr.pick_pos.ry ?? 180,
               rz: instr.pick_pos.rz ?? 0
             };
           }
           pickPos = pickPos || { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 };
           let p1Pose = instr.pallet_p1_pose;
           if (!p1Pose && instr.pallet_p1 && typeof instr.pallet_p1 === 'object') {
             // TODO: eliminar compatibilidad legacy con point
             p1Pose = {
               ...instr.pallet_p1,
               rx: instr.pallet_p1.rx ?? 0,
               ry: instr.pallet_p1.ry ?? 180,
               rz: instr.pallet_p1.rz ?? 0
             };
           }
           p1Pose = p1Pose || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
           let palletOrigin = p1Pose;
           if (instr.pallet_origin) {
             // TODO: eliminar fallback legacy con pallet_origin
             palletOrigin = instr.pallet_origin;
           }
           const p2Point = instr.pallet_p2 || addVector(palletOrigin, { x: 100, y: 0, z: 0 });
           const p3Point = instr.pallet_p3 || addVector(palletOrigin, { x: 0, y: 100, z: 0 });
           
           const pickApproach = instr.pick_approach_height ?? 50;
           const placeApproach = instr.place_approach_height ?? 50;
           const safetyMargin = instr.safety_margin ?? 100;
           const gripperPin = instr.gripper_pin ?? 1;
           const pickWait = instr.pick_wait_time ?? 0.5;
           const placeWait = instr.place_wait_time ?? 0.3;
           
           const rows = instr.rows ?? 3;
           const cols = instr.cols ?? 4;
           const layers = instr.layers ?? 2;
           const layerHeight = instr.layer_height ?? 60;

           const palletValidationErrors = [];
           if (!p1Pose || !p2Point || !p3Point) palletValidationErrors.push('P1/P2/P3 inexistentes');
           if (isSameXYZ(p1Pose, p2Point)) palletValidationErrors.push('P2 coincide con P1');
           if (isSameXYZ(p1Pose, p3Point)) palletValidationErrors.push('P3 coincide con P1');
           if ((rows ?? 0) <= 0) palletValidationErrors.push('rows <= 0');
           if ((cols ?? 0) <= 0) palletValidationErrors.push('cols <= 0');
           if ((layers ?? 0) <= 0) palletValidationErrors.push('layers <= 0');
           if ((placeApproach ?? 0) < 0) palletValidationErrors.push('approach_distance < 0');

           const safeRows = Math.max(1, Number(rows) || 1);
           const safeCols = Math.max(1, Number(cols) || 1);
           const safeLayers = Math.max(1, Number(layers) || 1);
           const safePickApproach = Math.max(0, Number(pickApproach) || 0);
           const safePlaceApproach = Math.max(0, Number(placeApproach) || 0);
           let safeP1 = palletOrigin || { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 };
           let safeP2 = p2Point || addVector(safeP1, { x: 100, y: 0, z: 0 });
           let safeP3 = p3Point || addVector(safeP1, { x: 0, y: 100, z: 0 });
           if (isSameXYZ(safeP1, safeP2)) safeP2 = addVector(safeP1, { x: 100, y: 0, z: 0 });
           if (isSameXYZ(safeP1, safeP3)) safeP3 = addVector(safeP1, { x: 0, y: 100, z: 0 });
           const dx = makeVector(safeP1, safeP2);
           const dy = makeVector(safeP1, safeP3);

           if (palletValidationErrors.length > 0) {
             body += ` ${currentIndex}:  ! ADVERTENCIA PALET: ${palletValidationErrors.join('; ')}. Fallback controlado ;\n`;
             currentIndex++;
           }
           const gripperOverride = instr?.gripper_override || null;
           const toolIdForGripper = instr?.tool_id ?? null;
           let gripperLabel = 'AUTO (tool actions)';
           if (toolIdForGripper === 'onrobot_rg2_urcap') {
             gripperLabel = 'RG2 (URCap defaults)';
           } else if (gripperOverride?.type === 'digital_out') {
             gripperLabel = 'Digital IO';
           }
           
           // NO redefinir currentIndex - usar el del scope externo
           currentIndex = currentIndex + 3; // Ajustar para líneas iniciales UFRAME/UTOOL
           
           body += ` ${currentIndex}:  ! ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══ ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! PICK: (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${pickPos.z ?? 0}) ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! PALET: ${safeRows}x${safeCols}x${safeLayers} = ${safeRows * safeCols * safeLayers} ciclos ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! Gripper: ${gripperLabel} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:   ;\n`;
           currentIndex++;
           
           // Configuración de variables en registros R[10-30]
           body += ` ${currentIndex}:  ! === Configuración de variables === ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[10]=${(pickPos.x ?? 0).toFixed(1)} ; ! pick_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[11]=${(pickPos.y ?? 0).toFixed(1)} ; ! pick_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[12]=${(pickPos.z ?? 0).toFixed(1)} ; ! pick_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[13]=${((pickPos.z ?? 0) + safePickApproach).toFixed(1)} ; ! pick_z_approach ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[14]=${(safeP1.x ?? 0).toFixed(1)} ; ! p1_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[15]=${(safeP1.y ?? 0).toFixed(1)} ; ! p1_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[16]=${(safeP1.z ?? 0).toFixed(1)} ; ! p1_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[17]=${(dx.x ?? 0).toFixed(1)} ; ! dx_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[18]=${(dx.y ?? 0).toFixed(1)} ; ! dx_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[19]=${(dx.z ?? 0).toFixed(1)} ; ! dx_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[20]=${(dy.x ?? 0).toFixed(1)} ; ! dy_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[21]=${(dy.y ?? 0).toFixed(1)} ; ! dy_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[22]=${(dy.z ?? 0).toFixed(1)} ; ! dy_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[23]=${layerHeight.toFixed(1)} ; ! layer_height ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[24]=${safePlaceApproach.toFixed(1)} ; ! approach_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[25]=${safetyMargin.toFixed(1)} ; ! safety_margin ;\n`;
           currentIndex++;
           
           body += ` ${currentIndex}:   ;\n`;
           currentIndex++;
           
           // Bucle de capas (R[1])
           body += ` ${currentIndex}:  ! === Bucle de Capas === ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[1]=1 ; ! layer ;\n`;
           currentIndex++;
           const lblLayer = 1; // LBL[1] - inicio bucle capas
           body += ` ${currentIndex}:  LBL[${lblLayer}] ;\n`;
           currentIndex++;
           
           // Calcular altura de seguridad para esta capa
           body += ` ${currentIndex}:  ! Calcular altura de seguridad ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[34]=R[16]+(R[1]-1)*R[23]+R[25] ; ! safety_z ;\n`;
           currentIndex++;
           
           // Bucle de filas (R[2])
           body += ` ${currentIndex}:  R[2]=1 ; ! row ;\n`;
           currentIndex++;
           const lblRow = 2; // LBL[2] - inicio bucle filas
           body += ` ${currentIndex}:  LBL[${lblRow}] ;\n`;
           currentIndex++;
           
           // Bucle de columnas (R[3])
           body += ` ${currentIndex}:  R[3]=1 ; ! col ;\n`;
           currentIndex++;
           const lblCol = 3; // LBL[3] - inicio bucle columnas
           body += ` ${currentIndex}:  LBL[${lblCol}] ;\n`;
           currentIndex++;
           
           body += ` ${currentIndex}:  ! ─── Ciclo Pick & Place (Capa R[1]) ─── ;\n`;
           currentIndex++;
           
           // PICK - Aproximación
           body += ` ${currentIndex}:  ! PICK: Aproximación ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,1]=R[10] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,2]=R[11] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,3]=R[13] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,4]=${(pickPos.rx ?? 0).toFixed(2)} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,5]=${(pickPos.ry ?? 180).toFixed(2)} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,6]=${(pickPos.rz ?? 0).toFixed(2)} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[1] 200mm/sec FINE ;\n`;
           currentIndex++;
           
           // PICK - Descenso
           body += ` ${currentIndex}:  ! PICK: Descenso ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,3]=R[12] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[1] 100mm/sec FINE ;\n`;
           currentIndex++;
           
           // PICK - Cerrar pinza
           body += ` ${currentIndex}:  ! PICK: Cerrar pinza ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  DO[${gripperPin}]=ON ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  WAIT ${pickWait.toFixed(2)} SEC ;\n`;
           currentIndex++;
           
           // PICK - Levantar a altura segura
           body += ` ${currentIndex}:  ! PICK: Levantar a altura segura ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,3]=R[34] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[1] 200mm/sec FINE ;\n`;
           currentIndex++;
           
           // PLACE - Calcular posición
           body += ` ${currentIndex}:  ! PLACE: Calcular posición ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[31]=R[14]+(R[3]-1)*R[17]+(R[2]-1)*R[20] ; ! place_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[32]=R[15]+(R[3]-1)*R[18]+(R[2]-1)*R[21] ; ! place_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[33]=R[16]+(R[3]-1)*R[19]+(R[2]-1)*R[22]+(R[1]-1)*R[23] ; ! place_z ;\n`;
           currentIndex++;
           
           // PLACE - Movimiento articular a XY a altura segura
           body += ` ${currentIndex}:  ! PLACE: MoveJ a XY a altura segura ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,1]=R[31] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,2]=R[32] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,3]=R[34] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,4]=${(p1Pose.rx ?? 0).toFixed(2)} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,5]=${(p1Pose.ry ?? 180).toFixed(2)} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,6]=${(p1Pose.rz ?? 0).toFixed(2)} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:J PR[2] 50% FINE ;\n`;
           currentIndex++;
           
           // PLACE - Descenso a aproximación
           body += ` ${currentIndex}:  ! PLACE: Descenso a aproximación ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,3]=R[33]+R[24] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[2] 200mm/sec FINE ;\n`;
           currentIndex++;
           
           // PLACE - Descenso final
           body += ` ${currentIndex}:  ! PLACE: Descenso final ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,3]=R[33] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[2] 100mm/sec FINE ;\n`;
           currentIndex++;
           
           // PLACE - Abrir pinza
           body += ` ${currentIndex}:  ! PLACE: Abrir pinza ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  DO[${gripperPin}]=OFF ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  WAIT ${placeWait.toFixed(2)} SEC ;\n`;
           currentIndex++;
           
           // PLACE - Levantar
           body += ` ${currentIndex}:  ! PLACE: Levantar ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,3]=R[33]+R[24] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[2] 200mm/sec FINE ;\n`;
           currentIndex++;
           
           // Incrementar y saltar columnas
           body += ` ${currentIndex}:  R[3]=R[3]+1 ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  IF R[3]<=${safeCols} JMP LBL[${lblCol}] ;\n`;
           currentIndex++;
           
           // Incrementar y saltar filas
           body += ` ${currentIndex}:  R[2]=R[2]+1 ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  IF R[2]<=${safeRows} JMP LBL[${lblRow}] ;\n`;
           currentIndex++;
           
           // Incrementar y saltar capas
           body += ` ${currentIndex}:  R[1]=R[1]+1 ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  IF R[1]<=${safeLayers} JMP LBL[${lblLayer}] ;\n`;
           currentIndex++;
           
           body += ` ${currentIndex}:  ! ═══ FIN PALETIZADO ═══ ;\n`;
           currentIndex++; // Incrementar para el siguiente bloque
           console.log('✅ Paletizado completado, currentIndex:', currentIndex);
           console.log('✅ ¿Tiene next?:', !!instr.next, 'tipo next:', instr.next?.type);
           
        } else if (instr.type === 'read_ai_block') {
           body += ` ${currentIndex+3}:  ! Leer AI[${instr.pin}] en R[10] ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  R[10]=AI[${instr.pin}] ;\n`;
           
        } else if (instr.type === 'write_ao_block') {
           const value = formatMathFanuc(instr.value);
           body += ` ${currentIndex+3}:  AO[${instr.pin}]=${value} ;\n`;
           
        } else if (instr.type === 'wait_ai_block') {
           const opMap = { GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
           const opStr = opMap[instr.operator] || '>';
           const value = instr.value ?? 0;
           body += ` ${currentIndex+3}:  WAIT AI[${instr.pin}]${opStr}${value.toFixed(2)} ;\n`;
           
        } else if (instr.type === 'function_def_params') {
           // Fanuc: Generar comentario explicativo sobre el subprograma
           const params = instr.params || [];
           body += ` ${currentIndex+3}:  ! ========================================== ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! SUBPROGRAMA: ${instr.funcname.toUpperCase()} ;\n`;
           currentIndex++;
           if (params.length > 0) {
             body += ` ${currentIndex+3}:  ! Parámetros (usar registros antes de CALL): ;\n`;
             currentIndex++;
             params.forEach((p, i) => {
               body += ` ${currentIndex+3}:  ! - R[${20+i}] = ${p} ;\n`;
               currentIndex++;
             });
           }
           body += ` ${currentIndex+3}:  ! Resultado en R[50] ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! ========================================== ;\n`;
           currentIndex++;
           
           // Generar cuerpo del subprograma como comentarios
           if (instr.do && instr.do.length > 0) {
             body += ` ${currentIndex+3}:  ! Código del subprograma (crear archivo separado .TP): ;\n`;
             currentIndex++;
           }
           
           return currentIndex;
           
        } else if (instr.type === 'function_call_params') {
           const args = instr.args || [];
           // Asignar argumentos a registros antes de llamar
           args.forEach((arg, i) => {
             const value = formatMathFanuc(arg);
             body += ` ${currentIndex+3}:  R[${20+i}]=${value} ; ! Arg ${i+1}\n`;
             currentIndex++;
           });
           
           // Hacer la llamada al subprograma
           body += ` ${currentIndex+3}:  CALL ${instr.funcname.toUpperCase()} ;\n`;
           currentIndex++;
           body += ` ${currentIndex+3}:  ! Resultado en R[50] ;\n`;
           return currentIndex;
           
        } else if (instr.type === 'function_return') {
           // Fanuc: Guardar valor de retorno en R[50]
           const value = formatMathFanuc(instr.value);
           body += ` ${currentIndex+3}:  R[50]=${value} ; ! RETURN\n`;
        }
        
        // IMPORTANTE: Procesar el siguiente bloque en la cadena
        if (instr.next) {
          console.log('➡️ Siguiendo cadena next desde:', instr.type, 'al tipo:', instr.next.type);
          return gen(instr.next, currentIndex + 1);
        }
        console.log('🔚 FIN de cadena para tipo:', instr.type, 'currentIndex final:', currentIndex);
        return currentIndex;
      }
      
      let lineIndex = 0;
      program.forEach((p, idx) => {
        try {
          console.log(`🔴 Procesando top-level block #${idx}:`, p.type);
          lineIndex = gen(p, lineIndex);
          console.log(`✅ Terminó bloque #${idx}, nuevo lineIndex:`, lineIndex);
          lineIndex++;
        } catch (error) {
          console.error(`❌ ERROR procesando bloque #${idx}:`, error);
          console.error('Bloque que causó el error:', p);
        }
      });
      
      console.log('🟣 Body generado (longitud):', body.length);
      console.log('🟣 Pos generado (longitud):', pos.length);
      
      const result = header + body + "\n/END\n" + pos + "\n/END\n";
      console.log('🎯 RESULTADO FINAL (longitud):', result.length);
      return result;
    }
    else { // Caso por defecto si no coincide ningún robot
      return "// Robot no soportado para modo industrial //";
    }
  }
