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
  function generateCodeForSelectedRobot(robot, program, mode) {
    const spd = currentDefaultSpeed();
    
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
          const tool = TOOL_DATABASE[instr.tool_id];
          if (tool) {
            lines.push(`Seleccionar Herramienta: ${tool.name}`);
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
          // Paletizado Completo con Pick & Place
          const pickPos = instr.pick_pos || { x: 500, y: 0, z: 100 };
          const palletOrigin = instr.pallet_origin || { x: 0, y: 300, z: 0 };
          const homePos = instr.home_pos || null;
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickWait = instr.pick_wait_time ?? 0.5;
          const placeWait = instr.place_wait_time ?? 0.3;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const boxX = instr.box_x ?? 100;
          const boxY = instr.box_y ?? 100;
          const boxZ = instr.box_z ?? 50;
          const spacingX = instr.spacing_x ?? 10;
          const spacingY = instr.spacing_y ?? 10;
          const layerHeight = instr.layer_height ?? 60;
          
          lines.push(`╔═══════════════════════════════════════════════════════════╗`);
          lines.push(`║     PALETIZADO COMPLETO (PICK & PLACE)                   ║`);
          lines.push(`╚═══════════════════════════════════════════════════════════╝`);
          lines.push(``);
          lines.push(`📋 CONFIGURACIÓN:`);
          lines.push(`  🔵 Posición PICK (recogida):`);
          lines.push(`     └─ Coordenadas: (X:${pickPos.x ?? 0}, Y:${pickPos.y ?? 0}, Z:${pickPos.z ?? 0}) mm`);
          lines.push(`     └─ Altura aproximación: ${pickApproach} mm`);
          lines.push(`     └─ Gripper: DO[${gripperPin}]`);
          lines.push(`     └─ Tiempo espera: ${pickWait} s`);
          lines.push(``);
          lines.push(`  🟢 Configuración PALET:`);
          lines.push(`     └─ Origen: (X:${palletOrigin.x ?? 0}, Y:${palletOrigin.y ?? 0}, Z:${palletOrigin.z ?? 0}) mm`);
          lines.push(`     └─ Patrón: ${rows} filas × ${cols} columnas × ${layers} capas`);
          lines.push(`     └─ Dimensiones caja: ${boxX}×${boxY}×${boxZ} mm`);
          lines.push(`     └─ Separación: X:${spacingX} mm, Y:${spacingY} mm`);
          lines.push(`     └─ Altura entre capas: ${layerHeight} mm`);
          lines.push(`     └─ Altura aproximación: ${placeApproach} mm`);
          lines.push(`     └─ Tiempo espera: ${placeWait} s`);
          if (homePos) {
            lines.push(``);
            lines.push(`  🏠 Posición HOME: (X:${homePos.x ?? 0}, Y:${homePos.y ?? 0}, Z:${homePos.z ?? 0}) mm`);
          }
          lines.push(``);
          lines.push(`  📊 Total de ciclos Pick & Place: ${rows * cols * layers}`);
          lines.push(``);
          lines.push(`═══════════════════════════════════════════════════════════`);
          lines.push(``);
          
          // Generar ciclos
          let cycleNum = 1;
          for (let layer = 0; layer < layers; layer++) {
            lines.push(`▶ Capa ${layer + 1} de ${layers}:`);
            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                const palletX = (palletOrigin.x ?? 0) + col * (boxX + spacingX);
                const palletY = (palletOrigin.y ?? 0) + row * (boxY + spacingY);
                const palletZ = (palletOrigin.z ?? 0) + layer * layerHeight;
                
                lines.push(``);
                lines.push(`  ┌─ Ciclo ${cycleNum}/${rows * cols * layers} [Fila ${row + 1}, Col ${col + 1}]`);
                
                // Secuencia HOME
                if (homePos) {
                  lines.push(`  │  1. Mover Articular a HOME (${homePos.x ?? 0}, ${homePos.y ?? 0}, ${homePos.z ?? 0})`);
                }
                
                // Secuencia PICK
                lines.push(`  │  ${homePos ? '2' : '1'}. Mover Lineal a aproximación PICK (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${(pickPos.z ?? 0) + pickApproach})`);
                lines.push(`  │  ${homePos ? '3' : '2'}. Mover Lineal a PICK (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${pickPos.z ?? 0})`);
                lines.push(`  │  ${homePos ? '4' : '3'}. ✋ Activar DO[${gripperPin}] (Cerrar pinza)`);
                lines.push(`  │  ${homePos ? '5' : '4'}. ⏱ Esperar ${pickWait} s`);
                lines.push(`  │  ${homePos ? '6' : '5'}. Mover Lineal arriba (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${(pickPos.z ?? 0) + pickApproach})`);
                
                // Secuencia PLACE
                lines.push(`  │  ${homePos ? '7' : '6'}. Mover Articular a aproximación PALET (${palletX}, ${palletY}, ${palletZ + placeApproach})`);
                lines.push(`  │  ${homePos ? '8' : '7'}. Mover Lineal a PALET (${palletX}, ${palletY}, ${palletZ})`);
                lines.push(`  │  ${homePos ? '9' : '8'}. 🖐 Desactivar DO[${gripperPin}] (Abrir pinza)`);
                lines.push(`  │  ${homePos ? '10' : '9'}. ⏱ Esperar ${placeWait} s`);
                lines.push(`  │  ${homePos ? '11' : '10'}. Mover Lineal arriba (${palletX}, ${palletY}, ${palletZ + placeApproach})`);
                lines.push(`  └─ ✅ Ciclo ${cycleNum} completado`);
                
                cycleNum++;
              }
            }
          }
          
          lines.push(``);
          lines.push(`╔═══════════════════════════════════════════════════════════╗`);
          lines.push(`║  ✅ PALETIZADO COMPLETO FINALIZADO                       ║`);
          lines.push(`╚═══════════════════════════════════════════════════════════╝`);
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
      
      function gen(instr) {
        if (!instr) return;
        if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J || instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (lines.push(` # WARNING: Punto fuera de alcance (${w.d.toFixed(0)}mm > ${w.limit}mm)`));
          
          const x_m = (instr.x / 1000).toFixed(5);
          const y_m = (instr.y / 1000).toFixed(5);
          const z_m = (instr.z / 1000).toFixed(5);
          
          if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
            const speed_pct = (instr.speed ?? spd) / 100.0;
            lines.push(` movej(p[${x_m}, ${y_m}, ${z_m}, 0, 3.14, 0], a=1.4, v=${speed_pct.toFixed(2)})`);
          } else {
            if (checkSingularityWarning(instr.y)) {
              lines.push(` # ADVERTENCIA: movel cerca de Y=0. Riesgo de singularidad.`);
            }
            const speed_ms = ( (instr.speed ?? spd) / 1000.0 ).toFixed(3);
            lines.push(` movel(p[${x_m}, ${y_m}, ${z_m}, 0, 3.14, 0], a=1.2, v=${speed_ms})`);
          }
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          lines.push(` # movec no implementado en este generador simple`);
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
          const tool = TOOL_DATABASE[instr.tool_id];
          if (instr.tool_id === 'manual') {
            lines.push(` # Selección de herramienta: Manual`);
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
        } else if (instr.type === 'use_pose') {
          lines.push(` # Usando Pose: ${instr.poseName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})`);
        } else if (instr.type === 'use_point') {
          lines.push(` # Usando Punto: ${instr.pointName} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})`);
        } else if (instr.type === 'if_block') {
          const condStr = formatConditionUR(instr.condition);
          lines.push(` if ${condStr}:`);
          
          // Rama DO (entonces)
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          // Rama ELSE (sino) - opcional
          if (instr.else && instr.else.length > 0) {
            lines.push(` else:`);
            instr.else.forEach(subInstr => gen(subInstr));
          }
          
          lines.push(` end`);
        } else if (instr.type === 'while_block') {
          const condStr = formatConditionUR(instr.condition);
          lines.push(` while ${condStr}:`);
          
          // Cuerpo del bucle
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
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
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          lines.push(`   ${varName} = ${varName} + 1`);
          lines.push(` end`);
        } else if (instr.type === 'palletize_block') {
          // Paletizado Completo con Pick & Place
          const pickPos = instr.pick_pos || { x: 500, y: 0, z: 100 };
          const palletOrigin = instr.pallet_origin || { x: 0, y: 300, z: 0 };
          const homePos = instr.home_pos || null;
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickWait = instr.pick_wait_time ?? 0.5;
          const placeWait = instr.place_wait_time ?? 0.3;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const boxX = instr.box_x ?? 100;
          const boxY = instr.box_y ?? 100;
          const spacingX = instr.spacing_x ?? 10;
          const spacingY = instr.spacing_y ?? 10;
          const layerHeight = instr.layer_height ?? 60;
          
          // Convertir a metros
          const pickX = ((pickPos.x ?? 0) / 1000).toFixed(4);
          const pickY = ((pickPos.y ?? 0) / 1000).toFixed(4);
          const pickZ = ((pickPos.z ?? 0) / 1000).toFixed(4);
          const pickZApproach = (((pickPos.z ?? 0) + pickApproach) / 1000).toFixed(4);
          
          const palletX = ((palletOrigin.x ?? 0) / 1000).toFixed(4);
          const palletY = ((palletOrigin.y ?? 0) / 1000).toFixed(4);
          const palletZ = ((palletOrigin.z ?? 0) / 1000).toFixed(4);
          
          const stepX = ((boxX + spacingX) / 1000).toFixed(4);
          const stepY = ((boxY + spacingY) / 1000).toFixed(4);
          const stepZ = (layerHeight / 1000).toFixed(4);
          const approachZ = (placeApproach / 1000).toFixed(4);
          
          lines.push(` # ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══`);
          lines.push(` # Configuración:`);
          lines.push(` #   PICK: (${pickX}, ${pickY}, ${pickZ})`);
          lines.push(` #   PALET: ${rows}x${cols}x${layers} = ${rows * cols * layers} ciclos`);
          lines.push(` #   Gripper: DO[${gripperPin}]`);
          lines.push(``);
          
          // Variables base
          lines.push(` pick_x = ${pickX}`);
          lines.push(` pick_y = ${pickY}`);
          lines.push(` pick_z = ${pickZ}`);
          lines.push(` pick_z_approach = ${pickZApproach}`);
          lines.push(` pallet_base_x = ${palletX}`);
          lines.push(` pallet_base_y = ${palletY}`);
          lines.push(` pallet_base_z = ${palletZ}`);
          lines.push(` step_x = ${stepX}`);
          lines.push(` step_y = ${stepY}`);
          lines.push(` step_z = ${stepZ}`);
          lines.push(` approach_z = ${approachZ}`);
          
          if (homePos) {
            const homeX = ((homePos.x ?? 0) / 1000).toFixed(4);
            const homeY = ((homePos.y ?? 0) / 1000).toFixed(4);
            const homeZ = ((homePos.z ?? 0) / 1000).toFixed(4);
            lines.push(` home_x = ${homeX}`);
            lines.push(` home_y = ${homeY}`);
            lines.push(` home_z = ${homeZ}`);
          }
          lines.push(``);
          
          // Bucles anidados
          lines.push(` layer = 0`);
          lines.push(` while layer < ${layers}:`);
          lines.push(`   row = 0`);
          lines.push(`   while row < ${rows}:`);
          lines.push(`     col = 0`);
          lines.push(`     while col < ${cols}:`);
          lines.push(`       # ─── Ciclo Pick & Place ───`);
          
          // HOME (opcional)
          if (homePos) {
            lines.push(`       movel(p[home_x, home_y, home_z, 0, 3.14159, 0], a=1.2, v=0.25)`);
          }
          
          // PICK
          lines.push(`       # PICK: Aproximación`);
          lines.push(`       movel(p[pick_x, pick_y, pick_z_approach, 0, 3.14159, 0], a=1.2, v=0.25)`);
          lines.push(`       # PICK: Descenso`);
          lines.push(`       movel(p[pick_x, pick_y, pick_z, 0, 3.14159, 0], a=1.2, v=0.1)`);
          lines.push(`       # PICK: Cerrar pinza`);
          lines.push(`       set_standard_digital_out(${gripperPin}, True)`);
          lines.push(`       sleep(${pickWait})`);
          lines.push(`       # PICK: Levantar`);
          lines.push(`       movel(p[pick_x, pick_y, pick_z_approach, 0, 3.14159, 0], a=1.2, v=0.25)`);
          lines.push(``);
          
          // PLACE
          lines.push(`       # PLACE: Calcular posición`);
          lines.push(`       place_x = pallet_base_x + col * step_x`);
          lines.push(`       place_y = pallet_base_y + row * step_y`);
          lines.push(`       place_z = pallet_base_z + layer * step_z`);
          lines.push(`       place_z_approach = place_z + approach_z`);
          lines.push(`       # PLACE: Aproximación`);
          lines.push(`       movel(p[place_x, place_y, place_z_approach, 0, 3.14159, 0], a=1.2, v=0.25)`);
          lines.push(`       # PLACE: Descenso`);
          lines.push(`       movel(p[place_x, place_y, place_z, 0, 3.14159, 0], a=1.2, v=0.1)`);
          lines.push(`       # PLACE: Abrir pinza`);
          lines.push(`       set_standard_digital_out(${gripperPin}, False)`);
          lines.push(`       sleep(${placeWait})`);
          lines.push(`       # PLACE: Levantar`);
          lines.push(`       movel(p[place_x, place_y, place_z_approach, 0, 3.14159, 0], a=1.2, v=0.25)`);
          lines.push(``);
          
          lines.push(`       col = col + 1`);
          lines.push(`     end`);
          lines.push(`     row = row + 1`);
          lines.push(`   end`);
          lines.push(`   layer = layer + 1`);
          lines.push(` end`);
          lines.push(` # ═══ FIN PALETIZADO ═══`);
        } else if (instr.type === 'loop_block') {
          // Loop simple
          const count = instr.count ?? 1;
          lines.push(` loop_count = 0`);
          lines.push(` while loop_count < ${count}:`);
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          lines.push(`   loop_count = loop_count + 1`);
          lines.push(` end`);
        } else if (instr.type === 'read_ai_block') {
          lines.push(` # Leer AI[${instr.pin}]: analog_in[${instr.pin}] devuelve valor (0.0 a 1.0 normalmente)`);
        } else if (instr.type === 'write_ao_block') {
          const valueExpr = formatMathUR(instr.value);
          const normalized = typeof instr.value === 'number' ? ((instr.value ?? 0) / 10.0).toFixed(3) : `(${valueExpr} / 10.0)`;
          lines.push(` set_analog_out(${instr.pin}, ${normalized})`);
        } else if (instr.type === 'wait_ai_block') {
          const opMap = { GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
          const opStr = opMap[instr.operator] || '>';
          const value = (instr.value ?? 0) / 10.0;
           lines.push(` while not (analog_in[${instr.pin}] ${opStr} ${value.toFixed(3)}):`);
          lines.push(`   sleep(0.01)`);
          lines.push(` end`);
        } else if (instr.type === 'function_def_params') {
          const params = instr.params ? instr.params.join(', ') : '';
          lines.push(` def ${instr.funcname}(${params}):`);
          
          if (instr.do && instr.do.length > 0) {
            instr.do.forEach(subInstr => gen(subInstr));
          }
          
          lines.push(` end`);
        } else if (instr.type === 'function_call_params') {
          const args = instr.args ? instr.args.map(a => formatMathUR(a)).join(', ') : '';
          lines.push(` ${instr.funcname}(${args})`);
        } else if (instr.type === 'function_return') {
          const value = formatMathUR(instr.value);
          lines.push(`   return ${value}`);
        }
        gen(instr.next);
      }
      program.forEach(gen);
      lines.push('end');
      lines.push('');
      lines.push('program()');
      return lines.join('\n');
    }
    
    /* SECCIÓN 022: Generador de Código Industrial para ABB IRC5 (RAPID) */
    else if (robot === CONSTANTS.ROBOTS.ABB) {
      let header = "MODULE MainModule\n";
      header += ` ! La configuración de tooldata se define con el bloque de herramienta.\n`;
      header += " PROC main()\n";
      
      let consts = "";
      let bodyPath = "";
      let pcount = 1;
      
      const abbSpeedToken = (speed_mms, isLinear) => {
        const v = speed_mms || spd;
        if (isLinear) return `v${Math.max(5, v.toFixed(0))}`;
        return `v${Math.max(100, (v*20).toFixed(0))}`;
      };

      function gen(instr) {
        if (!instr) return;
        if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
          const name = `p${pcount++}`;
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (bodyPath += ` ! WARNING: Fuera de alcance\n`);
          consts += ` CONST robtarget ${name}:=[[${(instr.x || 0).toFixed(2)},${(instr.y || 0).toFixed(2)},${(instr.z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
          bodyPath += ` MoveJ ${name}, ${abbSpeedToken(instr.speed, false)}, z50, tool0\\WObj:=wobj0;\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          const name = `p${pcount++}`;
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (bodyPath += ` ! WARNING: Fuera de alcance\n`);
          if (checkSingularityWarning(instr.y)) {
            bodyPath += ` ! ADVERTENCIA: movel cerca de Y=0. Riesgo de singularidad.\n`;
          }
          consts += ` CONST robtarget ${name}:=[[${(instr.x || 0).toFixed(2)},${(instr.y || 0).toFixed(2)},${(instr.z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
          bodyPath += ` MoveL ${name}, ${abbSpeedToken(instr.speed ?? spd, true)}, z50, tool0\\WObj:=wobj0;\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          const via_name = `p${pcount++}`;
          const end_name = `p${pcount++}`;
          const w_via = warnIfOutOfReach(robot, instr.via_x, instr.via_y, instr.via_z);
          w_via && (bodyPath += ` ! WARNING: Pto Vía Fuera de alcance\n`);
          const w_end = warnIfOutOfReach(robot, instr.end_x, instr.end_y, instr.end_z);
          w_end && (bodyPath += ` ! WARNING: Pto Final Fuera de alcance\n`);
          
          if (checkSingularityWarning(instr.via_y) || checkSingularityWarning(instr.end_y)) {
              bodyPath += ` ! ADVERTENCIA: movec cerca de Y=0. Riesgo de singularidad.\n`;
          }
          
          consts += ` CONST robtarget ${via_name}:=[[${(instr.via_x || 0).toFixed(2)},${(instr.via_y || 0).toFixed(2)},${(instr.via_z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
          consts += ` CONST robtarget ${end_name}:=[[${(instr.end_x || 0).toFixed(2)},${(instr.end_y || 0).toFixed(2)},${(instr.end_z || 0).toFixed(2)}],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];\n`;
          bodyPath += ` MoveC ${via_name}, ${end_name}, ${abbSpeedToken(instr.speed ?? spd, true)}, z50, tool0\\WObj:=wobj0;\n`;
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
        }
        // Generar código para 'define_point' en RAPID (como comentario)
        else if (instr.type === 'define_point') {
          bodyPath += ` ! Punto definido: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0})\n`;
        }
        // Generar código para 'define_pose' en RAPID (como comentario)
        else if (instr.type === 'define_pose') {
          bodyPath += ` ! Pose definida: ${instr.name} (X: ${instr.x ?? 0}, Y: ${instr.y ?? 0}, Z: ${instr.z ?? 0}, Rx: ${instr.rx ?? 0}, Ry: ${instr.ry ?? 180}, Rz: ${instr.rz ?? 0})\n`;
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
          const pickPos = instr.pick_pos || { x: 500, y: 0, z: 100 };
          const palletOrigin = instr.pallet_origin || { x: 0, y: 300, z: 0 };
          const homePos = instr.home_pos || null;
          
          const pickApproach = instr.pick_approach_height ?? 50;
          const placeApproach = instr.place_approach_height ?? 50;
          const gripperPin = instr.gripper_pin ?? 1;
          const pickWait = instr.pick_wait_time ?? 0.5;
          const placeWait = instr.place_wait_time ?? 0.3;
          
          const rows = instr.rows ?? 3;
          const cols = instr.cols ?? 4;
          const layers = instr.layers ?? 2;
          const boxX = instr.box_x ?? 100;
          const boxY = instr.box_y ?? 100;
          const spacingX = instr.spacing_x ?? 10;
          const spacingY = instr.spacing_y ?? 10;
          const layerHeight = instr.layer_height ?? 60;
          
          bodyPath += ` ! ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══\n`;
          bodyPath += ` ! Configuración:\n`;
          bodyPath += ` !   PICK: (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${pickPos.z ?? 0})\n`;
          bodyPath += ` !   PALET: ${rows}x${cols}x${layers} = ${rows * cols * layers} ciclos\n`;
          bodyPath += ` !   Gripper: DO[${gripperPin}]\n`;
          bodyPath += `\n`;
          
          // Declaración de variables en consts
          consts += ` ! Variables de paletizado\n`;
          consts += ` VAR num pick_x := ${(pickPos.x ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pick_y := ${(pickPos.y ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pick_z := ${(pickPos.z ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pick_z_approach := ${((pickPos.z ?? 0) + pickApproach).toFixed(2)};\n`;
          consts += ` VAR num pallet_base_x := ${(palletOrigin.x ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pallet_base_y := ${(palletOrigin.y ?? 0).toFixed(2)};\n`;
          consts += ` VAR num pallet_base_z := ${(palletOrigin.z ?? 0).toFixed(2)};\n`;
          consts += ` VAR num step_x := ${(boxX + spacingX).toFixed(2)};\n`;
          consts += ` VAR num step_y := ${(boxY + spacingY).toFixed(2)};\n`;
          consts += ` VAR num step_z := ${layerHeight.toFixed(2)};\n`;
          consts += ` VAR num approach_z := ${placeApproach.toFixed(2)};\n`;
          consts += ` VAR num place_x;\n`;
          consts += ` VAR num place_y;\n`;
          consts += ` VAR num place_z;\n`;
          consts += ` VAR robtarget pick_approach_pos;\n`;
          consts += ` VAR robtarget pick_pos_target;\n`;
          consts += ` VAR robtarget place_approach_pos;\n`;
          consts += ` VAR robtarget place_pos_target;\n`;
          
          if (homePos) {
            consts += ` VAR num home_x := ${(homePos.x ?? 0).toFixed(2)};\n`;
            consts += ` VAR num home_y := ${(homePos.y ?? 0).toFixed(2)};\n`;
            consts += ` VAR num home_z := ${(homePos.z ?? 0).toFixed(2)};\n`;
            consts += ` VAR robtarget home_pos_target;\n`;
          }
          consts += `\n`;
          
          // Bucles anidados
          bodyPath += ` FOR layer FROM 1 TO ${layers} DO\n`;
          bodyPath += `   FOR row FROM 1 TO ${rows} DO\n`;
          bodyPath += `     FOR col FROM 1 TO ${cols} DO\n`;
          bodyPath += `       ! ─── Ciclo Pick & Place ───\n`;
          
          // HOME (opcional)
          if (homePos) {
            bodyPath += `       home_pos_target := [[home_x, home_y, home_z], [0, 1, 0, 0], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
            bodyPath += `       MoveJ home_pos_target, v500, z50, tool0\\WObj:=wobj0;\n`;
          }
          
          // PICK - Aproximación
          bodyPath += `       ! PICK: Aproximación\n`;
          bodyPath += `       pick_approach_pos := [[pick_x, pick_y, pick_z_approach], [0, 1, 0, 0], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL pick_approach_pos, v200, fine, tool0\\WObj:=wobj0;\n`;
          
          // PICK - Descenso
          bodyPath += `       ! PICK: Descenso\n`;
          bodyPath += `       pick_pos_target := [[pick_x, pick_y, pick_z], [0, 1, 0, 0], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL pick_pos_target, v100, fine, tool0\\WObj:=wobj0;\n`;
          
          // PICK - Cerrar pinza
          bodyPath += `       ! PICK: Cerrar pinza\n`;
          bodyPath += `       SetDO do${gripperPin}, 1;\n`;
          bodyPath += `       WaitTime ${pickWait};\n`;
          
          // PICK - Levantar
          bodyPath += `       ! PICK: Levantar\n`;
          bodyPath += `       MoveL pick_approach_pos, v200, fine, tool0\\WObj:=wobj0;\n`;
          bodyPath += `\n`;
          
          // PLACE - Calcular posición
          bodyPath += `       ! PLACE: Calcular posición\n`;
          bodyPath += `       place_x := pallet_base_x + (col - 1) * step_x;\n`;
          bodyPath += `       place_y := pallet_base_y + (row - 1) * step_y;\n`;
          bodyPath += `       place_z := pallet_base_z + (layer - 1) * step_z;\n`;
          
          // PLACE - Aproximación
          bodyPath += `       ! PLACE: Aproximación\n`;
          bodyPath += `       place_approach_pos := [[place_x, place_y, place_z + approach_z], [0, 1, 0, 0], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveJ place_approach_pos, v500, z50, tool0\\WObj:=wobj0;\n`;
          
          // PLACE - Descenso
          bodyPath += `       ! PLACE: Descenso\n`;
          bodyPath += `       place_pos_target := [[place_x, place_y, place_z], [0, 1, 0, 0], [0, 0, 0, 0], [9E9, 9E9, 9E9, 9E9, 9E9, 9E9]];\n`;
          bodyPath += `       MoveL place_pos_target, v100, fine, tool0\\WObj:=wobj0;\n`;
          
          // PLACE - Abrir pinza
          bodyPath += `       ! PLACE: Abrir pinza\n`;
          bodyPath += `       SetDO do${gripperPin}, 0;\n`;
          bodyPath += `       WaitTime ${placeWait};\n`;
          
          // PLACE - Levantar
          bodyPath += `       ! PLACE: Levantar\n`;
          bodyPath += `       MoveL place_approach_pos, v200, fine, tool0\\WObj:=wobj0;\n`;
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
      return header + consts + bodyPath + " ENDPROC\nENDMODULE\n";
    }
    else if (robot === CONSTANTS.ROBOTS.FANUC) { // Generador para Fanuc
      let header = "/PROG  MAIN_PROG\n/ATTR\n/MN\n";
      let body = "";
      let pos = "/POS\n";
      let pcount = 1;
      pos += `! La configuración de UTOOL se define con el bloque de herramienta.\n`;
      body += ` 1:  UFRAME_NUM=0 ;\n`;
      body += ` 2:  UTOOL_NUM=0 ;\n`; // Por defecto, sin herramienta
      
      function gen(instr, index) {
        if (!instr) return;
        if(instr.type === CONSTANTS.BLOCK_TYPES.MOVE_J){
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (body += ` ! WARNING: Fuera de alcance\n`);
          body += ` ${index+3}:J P[${pcount}] ${Math.round(instr.speed ?? spd)}% FINE ;\n`;
          pos += `P[${pcount}]{X=${(instr.x || 0).toFixed(1)}, Y=${(instr.y || 0).toFixed(1)}, Z=${(instr.z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          pcount++;
        } else if(instr.type === CONSTANTS.BLOCK_TYPES.MOVE_L){
          const w = warnIfOutOfReach(robot, instr.x, instr.y, instr.z);
          w && (body += ` ! WARNING: Fuera de alcance\n`);
          
          if (checkSingularityWarning(instr.y)) {
              body += ` ! ADVERTENCIA: movel cerca de Y=0. ¡Riesgo de singularidad!\n`;
          }
          
          body += ` ${index+3}:L P[${pcount}] ${Math.round(instr.speed ?? spd)}mm/sec FINE ;\n`;
          pos += `P[${pcount}]{X=${(instr.x || 0).toFixed(1)}, Y=${(instr.y || 0).toFixed(1)}, Z=${(instr.z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          pcount++;
        } else if(instr.type === CONSTANTS.BLOCK_TYPES.MOVE_C){
          const w_via = warnIfOutOfReach(robot, instr.via_x, instr.via_y, instr.via_z);
          w_via && (body += ` ! WARNING: Pto Vía Fuera de alcance\n`);
          const w_end = warnIfOutOfReach(robot, instr.end_x, instr.end_y, instr.end_z);
          w_end && (body += ` ! WARNING: Pto Final Fuera de alcance\n`);
          
          if (checkSingularityWarning(instr.via_y) || checkSingularityWarning(instr.end_y)) {
              body += ` ! ADVERTENCIA: movec cerca de Y=0. ¡Riesgo de singularidad!\n`;
          }
          
          const via_p = pcount++;
          const end_p = pcount++;
          body += ` ${index+3}:C P[${via_p}] P[${end_p}] ${Math.round(instr.speed ?? spd)}mm/sec FINE ;\n`;
          pos += `P[${via_p}]{X=${(instr.via_x || 0).toFixed(1)}, Y=${(instr.via_y || 0).toFixed(1)}, Z=${(instr.via_z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
          pos += `P[${end_p}]{X=${(instr.end_x || 0).toFixed(1)}, Y=${(instr.end_y || 0).toFixed(1)}, Z=${(instr.end_z || 0).toFixed(1)}, W=0.0, P=0.0, R=0.0};\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT) {
          body += ` ${index+3}:  WAIT ${(instr.time || 1).toFixed(2)} SEC ;\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.SET_DO) {
           const state = instr.state == 1 ? 'ON' : 'OFF';
           body += ` ${index+3}:  DO[${instr.pin}]=${state} ;\n`;
        } else if (instr.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
           const state = instr.state == 1 ? 'ON' : 'OFF';
           body += ` ${index+3}:  WAIT DI[${instr.pin}]=${state} ;\n`;
        } else if (instr.type === 'if_block') {
           const condStr = formatConditionFanuc(instr.condition);
           body += ` ${index+3}:  IF ${condStr} THEN ;\n`;
           
           // Rama DO (entonces)
           let subIndex = index + 4;
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               subIndex = gen(subInstr, subIndex) || subIndex;
               subIndex++;
             });
           }
           
           // Rama ELSE (sino) - opcional
           if (instr.else && instr.else.length > 0) {
             body += ` ${subIndex}:  ELSE ;\n`;
             subIndex++;
             instr.else.forEach(subInstr => {
               subIndex = gen(subInstr, subIndex) || subIndex;
               subIndex++;
             });
           }
           
           body += ` ${subIndex}:  ENDIF ;\n`;
           return subIndex;
        } else if (instr.type === 'while_block') {
           const condStr = formatConditionFanuc(instr.condition);
           body += ` ${index+3}:  WHILE ${condStr} DO ;\n`;
           
           // Cuerpo del bucle
           let subIndex = index + 4;
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               subIndex = gen(subInstr, subIndex) || subIndex;
               subIndex++;
             });
           }
           
           body += ` ${subIndex}:  ENDWHILE ;\n`;
           return subIndex;
        } else if (instr.type === 'for_block') {
           const varName = instr.variable || 'i';
           const from = instr.from ?? 0;
           const to = instr.to ?? 10;
           body += ` ${index+3}:  FOR R[1]=${from} TO ${to} ;\n`;
           body += ` ${index+4}:  ! Variable ${varName} = R[1] ;\n`;
           
           // Cuerpo del bucle
           let subIndex = index + 5;
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               subIndex = gen(subInstr, subIndex) || subIndex;
               subIndex++;
             });
           }
           
           body += ` ${subIndex}:  ENDFOR ;\n`;
           return subIndex;
        } else if (instr.type === 'loop_block') {
           const count = instr.count ?? 1;
           body += ` ${index+3}:  FOR R[99]=1 TO ${count} ;\n`;
           
           let subIndex = index + 4;
           if (instr.do && instr.do.length > 0) {
             instr.do.forEach(subInstr => {
               subIndex = gen(subInstr, subIndex) || subIndex;
               subIndex++;
             });
           }
           
           body += ` ${subIndex}:  ENDFOR ;\n`;
           return subIndex;
        } else if (instr.type === 'palletize_block') {
           // Paletizado completo para Fanuc TP
           const pickPos = instr.pick_pos || { x: 500, y: 0, z: 100 };
           const palletOrigin = instr.pallet_origin || { x: 0, y: 300, z: 0 };
           const homePos = instr.home_pos || null;
           
           const pickApproach = instr.pick_approach_height ?? 50;
           const placeApproach = instr.place_approach_height ?? 50;
           const gripperPin = instr.gripper_pin ?? 1;
           const pickWait = instr.pick_wait_time ?? 0.5;
           const placeWait = instr.place_wait_time ?? 0.3;
           
           const rows = instr.rows ?? 3;
           const cols = instr.cols ?? 4;
           const layers = instr.layers ?? 2;
           const boxX = instr.box_x ?? 100;
           const boxY = instr.box_y ?? 100;
           const spacingX = instr.spacing_x ?? 10;
           const spacingY = instr.spacing_y ?? 10;
           const layerHeight = instr.layer_height ?? 60;
           
           let currentIndex = index + 3;
           
           body += ` ${currentIndex}:  ! ═══ PALETIZADO COMPLETO (PICK & PLACE) ═══ ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! PICK: (${pickPos.x ?? 0}, ${pickPos.y ?? 0}, ${pickPos.z ?? 0}) ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! PALET: ${rows}x${cols}x${layers} = ${rows * cols * layers} ciclos ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! Gripper: DO[${gripperPin}] ;\n`;
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
           body += ` ${currentIndex}:  R[13]=${((pickPos.z ?? 0) + pickApproach).toFixed(1)} ; ! pick_z_approach ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[14]=${(palletOrigin.x ?? 0).toFixed(1)} ; ! pallet_base_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[15]=${(palletOrigin.y ?? 0).toFixed(1)} ; ! pallet_base_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[16]=${(palletOrigin.z ?? 0).toFixed(1)} ; ! pallet_base_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[17]=${(boxX + spacingX).toFixed(1)} ; ! step_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[18]=${(boxY + spacingY).toFixed(1)} ; ! step_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[19]=${layerHeight.toFixed(1)} ; ! step_z ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[20]=${placeApproach.toFixed(1)} ; ! approach_z ;\n`;
           currentIndex++;
           
           if (homePos) {
             body += ` ${currentIndex}:  R[21]=${(homePos.x ?? 0).toFixed(1)} ; ! home_x ;\n`;
             currentIndex++;
             body += ` ${currentIndex}:  R[22]=${(homePos.y ?? 0).toFixed(1)} ; ! home_y ;\n`;
             currentIndex++;
             body += ` ${currentIndex}:  R[23]=${(homePos.z ?? 0).toFixed(1)} ; ! home_z ;\n`;
             currentIndex++;
           }
           
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
           
           body += ` ${currentIndex}:  ! ─── Ciclo Pick & Place ─── ;\n`;
           currentIndex++;
           
           // HOME (opcional)
           if (homePos) {
             body += ` ${currentIndex}:  ! HOME ;\n`;
             currentIndex++;
             body += ` ${currentIndex}:  PR[1,1]=R[21] ;\n`;
             currentIndex++;
             body += ` ${currentIndex}:  PR[1,2]=R[22] ;\n`;
             currentIndex++;
             body += ` ${currentIndex}:  PR[1,3]=R[23] ;\n`;
             currentIndex++;
             body += ` ${currentIndex}:J PR[1] 50% FINE ;\n`;
             currentIndex++;
           }
           
           // PICK - Aproximación
           body += ` ${currentIndex}:  ! PICK: Aproximación ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,1]=R[10] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,2]=R[11] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,3]=R[13] ;\n`;
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
           
           // PICK - Levantar
           body += ` ${currentIndex}:  ! PICK: Levantar ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[1,3]=R[13] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[1] 200mm/sec FINE ;\n`;
           currentIndex++;
           
           // PLACE - Calcular posición
           body += ` ${currentIndex}:  ! PLACE: Calcular posición ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[31]=R[14]+(R[3]-1)*R[17] ; ! place_x ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[32]=R[15]+(R[2]-1)*R[18] ; ! place_y ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  R[33]=R[16]+(R[1]-1)*R[19] ; ! place_z ;\n`;
           currentIndex++;
           
           // PLACE - Aproximación
           body += ` ${currentIndex}:  ! PLACE: Aproximación ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,1]=R[31] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,2]=R[32] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  PR[2,3]=R[33]+R[20] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:J PR[2] 50% FINE ;\n`;
           currentIndex++;
           
           // PLACE - Descenso
           body += ` ${currentIndex}:  ! PLACE: Descenso ;\n`;
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
           body += ` ${currentIndex}:  PR[2,3]=R[33]+R[20] ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:L PR[2] 200mm/sec FINE ;\n`;
           currentIndex++;
           
           // Incrementar y saltar columnas
           body += ` ${currentIndex}:  R[3]=R[3]+1 ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  IF R[3]<=${cols} JMP LBL[${lblCol}] ;\n`;
           currentIndex++;
           
           // Incrementar y saltar filas
           body += ` ${currentIndex}:  R[2]=R[2]+1 ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  IF R[2]<=${rows} JMP LBL[${lblRow}] ;\n`;
           currentIndex++;
           
           // Incrementar y saltar capas
           body += ` ${currentIndex}:  R[1]=R[1]+1 ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  IF R[1]<=${layers} JMP LBL[${lblLayer}] ;\n`;
           currentIndex++;
           
           body += ` ${currentIndex}:  ! ═══ FIN PALETIZADO ═══ ;\n`;
           
           return currentIndex;
        } else if (instr.type === 'read_ai_block') {
           body += ` ${index+3}:  ! Leer AI[${instr.pin}] en R[10] ;\n`;
           body += ` ${index+4}:  R[10]=AI[${instr.pin}] ;\n`;
           return index + 4;
        } else if (instr.type === 'write_ao_block') {
           const value = formatMathFanuc(instr.value);
           body += ` ${index+3}:  AO[${instr.pin}]=${value} ;\n`;
        } else if (instr.type === 'wait_ai_block') {
           const opMap = { GT: '>', LT: '<', GTE: '>=', LTE: '<=' };
           const opStr = opMap[instr.operator] || '>';
           const value = instr.value ?? 0;
           body += ` ${index+3}:  WAIT AI[${instr.pin}]${opStr}${value.toFixed(2)} ;\n`;
        } else if (instr.type === 'function_def_params') {
           // Fanuc: Generar comentario explicativo sobre el subprograma
           const params = instr.params || [];
           body += ` ${index+3}:  ! ========================================== ;\n`;
           body += ` ${index+4}:  ! SUBPROGRAMA: ${instr.funcname.toUpperCase()} ;\n`;
           if (params.length > 0) {
             body += ` ${index+5}:  ! Parámetros (usar registros antes de CALL): ;\n`;
             params.forEach((p, i) => {
               body += ` ${index+6+i}:  ! - R[${20+i}] = ${p} ;\n`;
             });
           }
           body += ` ${index+6+params.length}:  ! Resultado en R[50] ;\n`;
           body += ` ${index+7+params.length}:  ! ========================================== ;\n`;
           
           // Generar cuerpo del subprograma como comentarios
           let subIndex = index + 8 + params.length;
           if (instr.do && instr.do.length > 0) {
             body += ` ${subIndex}:  ! Código del subprograma (crear archivo separado .TP): ;\n`;
             subIndex++;
           }
           
           return subIndex;
        } else if (instr.type === 'function_call_params') {
           const args = instr.args || [];
           // Asignar argumentos a registros antes de llamar
           let currentIndex = index + 3;
           args.forEach((arg, i) => {
             const value = formatMathFanuc(arg);
             body += ` ${currentIndex}:  R[${20+i}]=${value} ; ! Arg ${i+1}\n`;
             currentIndex++;
           });
           
           // Hacer la llamada al subprograma
           body += ` ${currentIndex}:  CALL ${instr.funcname.toUpperCase()} ;\n`;
           currentIndex++;
           body += ` ${currentIndex}:  ! Resultado en R[50] ;\n`;
           return currentIndex;
        } else if (instr.type === 'function_return') {
           // Fanuc: Guardar valor de retorno en R[50]
           const value = formatMathFanuc(instr.value);
           body += ` ${index+3}:  R[50]=${value} ; ! RETURN\n`;
        }
        
        let i = index;
        if (instr.next) {
          i = gen(instr.next, index + 1);
        }
        return i;
      }
      let lineIndex = 0;
      program.forEach(p => {
        const nextIndex = gen(p, lineIndex);
        lineIndex = nextIndex ? nextIndex + 1 : lineIndex + 1;
      });
      
      return header + body + "\n/END\n" + pos + "\n/END\n";
    }
    else { // Caso por defecto si no coincide ningún robot
      return "// Robot no soportado para modo industrial //";
    }
  }
