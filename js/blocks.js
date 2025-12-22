/*═══════════════════════════════════════════════════════════════════════════════
  DEFINICIÓN Y PROCESAMIENTO DE BLOQUES - blocks.js
  
  Contiene:
  - Estado global de poses y puntos
  - Definición de todos los bloques de Blockly
  - Conversión de bloques a JSON
  - Actualización de dropdowns dinámicos
  - Validaciones y advertencias
═══════════════════════════════════════════════════════════════════════════════*/

/* Estado Global de Poses y Puntos */
const savedPoses = {};
const savedPoints = {};

/* Definición de Bloques Visuales Personalizados para Blockly */
function defineBlocks() {
  Blockly.defineBlocksWithJsonArray([
    // Bloques de movimiento
    {
      "type": "move_block",
      "message0": "Mover Articular a %1 Velocidad:%2 (%)",
      "args0": [
        { "type": "input_value", "name": "TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "SPEED" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 160,
      "tooltip": "Mueve el robot de forma articular a una pose o punto definido."
    },
    {
      "type": "move_linear_block",
      "message0": "Mover Lineal a %1 Velocidad:%2 (mm/s)",
      "args0": [
        { "type": "input_value", "name": "TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "SPEED" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 160,
      "tooltip": "Mueve el robot en línea recta a una pose o punto definido."
    },
    {
      "type": "move_circular_block",
      "message0": "Mover Circular %1 vía %2 hasta %3 %4 Velocidad:%5 (mm/s)",
      "args0": [
        { "type": "input_dummy" },
        { "type": "input_value", "name": "VIA_TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "END_TARGET", "check": ["pose", "point"] },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "SPEED" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 160,
      "tooltip": "Mueve el robot en arco pasando por el punto vía hasta el punto final."
    },
    
    // Bloques de control de flujo
    { "type": "wait_block", "message0": "Esperar %1 segundos", "args0": [ { "type": "input_value", "name": "TIME" } ], "previousStatement": null, "nextStatement": null, "colour": 230 },
    { 
      "type": "if_block", 
      "message0": "Si %1 entonces %2 sino %3", 
      "args0": [ 
        { "type": "input_value", "name": "COND", "check": "Boolean" }, 
        { "type": "input_statement", "name": "DO" },
        { "type": "input_statement", "name": "ELSE" }
      ], 
      "previousStatement": null, 
      "nextStatement": null, 
      "colour": 120,
      "tooltip": "Si la condición es verdadera, ejecuta el primer bloque. Si no, ejecuta el segundo (opcional)."
    },
    {
      "type": "while_block",
      "message0": "Mientras %1 hacer %2",
      "args0": [
        { "type": "input_value", "name": "COND", "check": "Boolean" },
        { "type": "input_statement", "name": "DO" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 120,
      "tooltip": "Repite las acciones mientras la condición sea verdadera."
    },
    {
      "type": "for_block",
      "message0": "Para %1 desde %2 hasta %3 hacer %4",
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "i" },
        { "type": "input_value", "name": "FROM", "check": "Number" },
        { "type": "input_value", "name": "TO", "check": "Number" },
        { "type": "input_statement", "name": "DO" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 120,
      "tooltip": "Repite las acciones con un contador que va desde un valor inicial hasta un valor final."
    },
    { "type": "loop_block", "message0": "Repetir %1 veces %2", "args0": [ { "type": "input_value", "name": "COUNT" }, { "type": "input_statement", "name": "DO" } ], "previousStatement": null, "nextStatement": null, "colour": 20, "tooltip": "Repetir N veces (simple)" },
    
    // Bloque de Paletizado Completo (Pick & Place)
    {
      "type": "palletize_block",
      "message0": "🔄 Paletizado Completo (Pick & Place) %1",
      "args0": [
        { "type": "input_dummy" }
      ],
      "message1": "🔵 Posición de Recogida (PICK) %1 Punto/Pose: %2 Altura aproximación (mm): %3 %4 Activar Gripper DO[%5] %6 Tiempo espera coger (s): %7",
      "args1": [
        { "type": "input_dummy" },
        { "type": "input_value", "name": "PICK_POS", "check": ["pose", "point"] },
        { "type": "input_value", "name": "PICK_APPROACH_HEIGHT", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "GRIPPER_PIN", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "PICK_WAIT_TIME", "check": "Number" }
      ],
      "message2": "🟢 Configuración del Palet (PLACE) %1 Origen: %2 Filas: %3 Columnas: %4 Capas: %5 %6 Dim. caja (mm): X:%7 Y:%8 Z:%9 %10 Separación (mm): X:%11 Y:%12 %13 Altura entre capas (mm): %14 %15 Altura aproximación (mm): %16 %17 Tiempo espera soltar (s): %18",
      "args2": [
        { "type": "input_dummy" },
        { "type": "input_value", "name": "PALLET_ORIGIN", "check": ["pose", "point"] },
        { "type": "input_value", "name": "ROWS", "check": "Number" },
        { "type": "input_value", "name": "COLS", "check": "Number" },
        { "type": "input_value", "name": "LAYERS", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "BOX_X", "check": "Number" },
        { "type": "input_value", "name": "BOX_Y", "check": "Number" },
        { "type": "input_value", "name": "BOX_Z", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "SPACING_X", "check": "Number" },
        { "type": "input_value", "name": "SPACING_Y", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "LAYER_HEIGHT", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "PLACE_APPROACH_HEIGHT", "check": "Number" },
        { "type": "input_dummy" },
        { "type": "input_value", "name": "PLACE_WAIT_TIME", "check": "Number" }
      ],
      "message3": "🏠 Posición HOME (opcional) %1 Punto/Pose: %2",
      "args3": [
        { "type": "input_dummy" },
        { "type": "input_value", "name": "HOME_POS", "check": ["pose", "point"] }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 200,
      "tooltip": "Paletizado completo automático con ciclo Pick & Place. Recoge piezas de una posición y las coloca en el palet."
    },
    
    // Bloques de E/S
    { "type": "set_do_block", "message0": "Poner Salida Digital (DO) %1 en %2", "args0": [ { "type": "field_number", "name": "PIN", "value": 1, "min": 0 }, { "type": "field_dropdown", "name": "STATE", "options": [ [ "ON", "1" ], [ "OFF", "0" ] ] } ], "previousStatement": null, "nextStatement": null, "colour": 60, "tooltip": "Activa o desactiva una salida digital." },
    { "type": "wait_di_block", "message0": "Esperar Entrada Digital (DI) %1 a %2", "args0": [ { "type": "field_number", "name": "PIN", "value": 1, "min": 0 }, { "type": "field_dropdown", "name": "STATE", "options": [ [ "ON", "1" ], [ "OFF", "0" ] ] } ], "previousStatement": null, "nextStatement": null, "colour": 60, "tooltip": "Detiene el programa hasta que la entrada digital especificada alcance el estado deseado." },
    
    // Bloques de E/S Analógicas
    {
      "type": "read_ai_block",
      "message0": "Leer Entrada Analógica AI[%1]",
      "args0": [
        { "type": "field_number", "name": "PIN", "value": 0, "min": 0 }
      ],
      "output": "Number",
      "colour": 90,
      "tooltip": "Lee el valor de una entrada analógica (0-10V, devuelve valor numérico)."
    },
    {
      "type": "write_ao_block",
      "message0": "Escribir Salida Analógica AO[%1] = %2 V",
      "args0": [
        { "type": "field_number", "name": "PIN", "value": 0, "min": 0 },
        { "type": "input_value", "name": "VALUE", "check": "Number" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 90,
      "tooltip": "Establece el voltaje de una salida analógica (0-10V)."
    },
    {
      "type": "wait_ai_block",
      "message0": "Esperar AI[%1] %2 %3 V",
      "args0": [
        { "type": "field_number", "name": "PIN", "value": 0, "min": 0 },
        { "type": "field_dropdown", "name": "OP", "options": [
          [">", "GT"], ["<", "LT"], [">=", "GTE"], ["<=", "LTE"]
        ]},
        { "type": "input_value", "name": "VALUE", "check": "Number" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 90,
      "tooltip": "Espera hasta que la entrada analógica cumpla la condición especificada."
    },
    
    // Bloques de condiciones (para usar con if_block)
    { 
      "type": "read_di_block", 
      "message0": "DI[%1] está en %2", 
      "args0": [ 
        { "type": "field_number", "name": "PIN", "value": 1, "min": 0 },
        { "type": "field_dropdown", "name": "STATE", "options": [ [ "ON", "1" ], [ "OFF", "0" ] ] }
      ], 
      "output": "Boolean", 
      "colour": 210, 
      "tooltip": "Devuelve verdadero si la entrada digital está en el estado especificado."
    },
    { 
      "type": "logic_compare", 
      "message0": "%1 %2 %3", 
      "args0": [
        { "type": "input_value", "name": "A" },
        { "type": "field_dropdown", "name": "OP", "options": [
          ["=", "EQ"], ["≠", "NEQ"], [">", "GT"], ["<", "LT"], ["≥", "GTE"], ["≤", "LTE"]
        ]},
        { "type": "input_value", "name": "B" }
      ],
      "output": "Boolean",
      "colour": 210,
      "tooltip": "Compara dos valores."
    },
    { 
      "type": "logic_boolean", 
      "message0": "%1", 
      "args0": [
        { "type": "field_dropdown", "name": "BOOL", "options": [["verdadero", "TRUE"], ["falso", "FALSE"]] }
      ],
      "output": "Boolean",
      "colour": 210,
      "tooltip": "Valor booleano verdadero o falso."
    },
    {
      "type": "logic_and",
      "message0": "%1 Y %2",
      "args0": [
        { "type": "input_value", "name": "A", "check": "Boolean" },
        { "type": "input_value", "name": "B", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 210,
      "tooltip": "Devuelve verdadero si ambas condiciones son verdaderas."
    },
    {
      "type": "logic_or",
      "message0": "%1 O %2",
      "args0": [
        { "type": "input_value", "name": "A", "check": "Boolean" },
        { "type": "input_value", "name": "B", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 210,
      "tooltip": "Devuelve verdadero si al menos una condición es verdadera."
    },
    {
      "type": "logic_not",
      "message0": "NO %1",
      "args0": [
        { "type": "input_value", "name": "BOOL", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 210,
      "tooltip": "Invierte el valor de la condición (verdadero pasa a falso y viceversa)."
    },
    
    // Bloques de variables y funciones
    { "type": "comment_block", "message0": "Comentario %1", "args0": [ { "type": "field_input", "name": "TEXT", "text": "nota" } ], "previousStatement": null, "nextStatement": null, "colour": 300 },
    { "type": "variable_set", "message0": "Variable %1 = %2", "args0": [ { "type": "field_input", "name": "VARNAME", "text": "x" }, { "type": "input_value", "name": "VALUE" } ], "previousStatement": null, "nextStatement": null, "colour": 330 },
    { "type": "variable_get", "message0": "usar variable %1", "args0": [ { "type": "field_input", "name": "VARNAME", "text": "x" } ], "output": "Number", "colour": 330 },
    {
      "type": "function_def_params",
      "message0": "Función %1 ( %2 ) %3 %4",
      "args0": [
        { "type": "field_input", "name": "FUNCNAME", "text": "miFuncion" },
        { "type": "field_input", "name": "PARAMS", "text": "param1, param2" },
        { "type": "input_dummy" },
        { "type": "input_statement", "name": "DO" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 290,
      "tooltip": "Define una función con parámetros separados por comas."
    },
    {
      "type": "function_call_params",
      "message0": "Llamar %1 ( %2 )",
      "args0": [
        { "type": "field_input", "name": "FUNCNAME", "text": "miFuncion" },
        { "type": "input_value", "name": "ARGS" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 290,
      "tooltip": "Llama a una función con argumentos."
    },
    {
      "type": "function_return",
      "message0": "Retornar %1",
      "args0": [
        { "type": "input_value", "name": "VALUE" }
      ],
      "previousStatement": null,
      "colour": 290,
      "tooltip": "Retorna un valor desde una función."
    },
    { "type": "function_def", "message0": "Función %1 %2 %3", "args0": [ { "type": "field_input", "name": "FUNCNAME", "text": "miFuncion" }, { "type": "input_dummy" }, { "type": "input_statement", "name": "DO" } ], "previousStatement": null, "nextStatement": null, "colour": 290, "tooltip": "Función simple sin parámetros" },
    { "type": "function_call", "message0": "Llamar %1", "args0": [ { "type": "field_input", "name": "FUNCNAME", "text": "miFuncion" } ], "previousStatement": null, "nextStatement": null, "colour": 290, "tooltip": "Llamar función simple" },
    { "type": "math_number", "message0": "%1", "args0": [ { "type": "field_number", "name": "NUM", "value": 0 } ], "output": "Number", "colour": 230 },
    {
      "type": "math_arithmetic",
      "message0": "%1 %2 %3",
      "args0": [
        { "type": "input_value", "name": "A", "check": "Number" },
        { "type": "field_dropdown", "name": "OP", "options": [
          ["+", "ADD"], ["-", "SUBTRACT"], ["×", "MULTIPLY"], ["÷", "DIVIDE"], ["^", "POWER"]
        ]},
        { "type": "input_value", "name": "B", "check": "Number" }
      ],
      "output": "Number",
      "colour": 230,
      "tooltip": "Operación matemática básica entre dos números."
    },
    {
      "type": "math_single",
      "message0": "%1 de %2",
      "args0": [
        { "type": "field_dropdown", "name": "OP", "options": [
          ["raíz cuadrada", "ROOT"],
          ["absoluto", "ABS"],
          ["negativo", "NEG"],
          ["redondear", "ROUND"],
          ["redondear arriba", "ROUNDUP"],
          ["redondear abajo", "ROUNDDOWN"]
        ]},
        { "type": "input_value", "name": "NUM", "check": "Number" }
      ],
      "output": "Number",
      "colour": 230,
      "tooltip": "Operación matemática sobre un número."
    },
    {
      "type": "math_modulo",
      "message0": "resto de %1 ÷ %2",
      "args0": [
        { "type": "input_value", "name": "DIVIDEND", "check": "Number" },
        { "type": "input_value", "name": "DIVISOR", "check": "Number" }
      ],
      "output": "Number",
      "colour": 230,
      "tooltip": "Devuelve el resto de la división (módulo)."
    },
    {
      "type": "argument_list",
      "message0": "%1 , %2",
      "args0": [
        { "type": "input_value", "name": "ARG1" },
        { "type": "input_value", "name": "ARG2" }
      ],
      "output": null,
      "colour": 290,
      "tooltip": "Lista de argumentos separados por coma."
    },
    
    // Bloques de poses y puntos
    {
      "type": "define_pose",
      "message0": "Nombre pose: %1 %2 X: %3 Y: %4 Z: %5",
      "args0": [
        { "type": "input_dummy" },
        { "type": "field_input", "name": "NAME", "text": "pose1" },
        { "type": "input_value", "name": "X" },
        { "type": "input_value", "name": "Y" },
        { "type": "input_value", "name": "Z" }
      ],
      "message1": "%1 Rx: %2 Ry: %3 Rz: %4",
      "args1": [
        { "type": "input_dummy" },
        { "type": "input_value", "name": "RX" },
        { "type": "input_value", "name": "RY" },
        { "type": "input_value", "name": "RZ" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 120,
      "tooltip": "Define una pose con nombre y valores de posición y orientación."
    },
    {
      "type": "define_point",
      "message0": "Nombre punto: %1 %2 X: %3 Y: %4 Z: %5",
      "args0": [
        { "type": "input_dummy" },
        { "type": "field_input", "name": "NAME", "text": "punto1" },
        { "type": "input_value", "name": "X" },
        { "type": "input_value", "name": "Y" },
        { "type": "input_value", "name": "Z" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 120,
      "tooltip": "Define un punto con nombre y coordenadas X, Y, Z."
    }
  ]);

  /* Bloques Dinámicos de Poses y Puntos */
  
  // Bloque dinámico para usar una pose guardada
  Blockly.Blocks['use_pose'] = {
    init: function() {
      const getPoseOptions = () => {
        const options = [];
        const poses = Object.keys(savedPoses);
        if (poses.length === 0) {
          options.push(['(ninguna pose definida)', '']);
        } else {
          poses.forEach(name => {
            options.push([name, name]);
          });
        }
        return options;
      };

      this.appendDummyInput()
          .appendField("Pose:")
          .appendField(new Blockly.FieldDropdown(getPoseOptions, (newValue) => {
            this.updateTooltip_(newValue);
            return newValue;
          }), 'POSE_NAME');
      this.setOutput(true, "pose");
      this.setColour(120);
      this.updateTooltip_('');
    },
    
    updateTooltip_: function(poseName) {
      const pose = savedPoses[poseName];
      if (pose) {
        this.setTooltip(
          `Vista previa:\n` +
          `X: ${pose.x ?? 0}\n` +
          `Y: ${pose.y ?? 0}\n` +
          `Z: ${pose.z ?? 0}\n` +
          `Rx: ${pose.rx ?? 0}\n` +
          `Ry: ${pose.ry ?? 180}\n` +
          `Rz: ${pose.rz ?? 0}`
        );
      } else {
        this.setTooltip("Selecciona una pose definida previamente.");
      }
    }
  };

  // Bloque dinámico para usar un punto guardado
  Blockly.Blocks['use_point'] = {
    init: function() {
      const getPointOptions = () => {
        const options = [];
        const points = Object.keys(savedPoints);
        if (points.length === 0) {
          options.push(['(ningún punto definido)', '']);
        } else {
          points.forEach(name => {
            options.push([name, name]);
          });
        }
        return options;
      };

      this.appendDummyInput()
          .appendField("Punto:")
          .appendField(new Blockly.FieldDropdown(getPointOptions, (newValue) => {
            this.updateTooltip_(newValue);
            return newValue;
          }), 'POINT_NAME');
      this.setOutput(true, "point");
      this.setColour(120);
      this.updateTooltip_('');
    },
    
    updateTooltip_: function(pointName) {
      const point = savedPoints[pointName];
      if (point) {
        this.setTooltip(
          `Vista previa:\n` +
          `X: ${point.x ?? 0}\n` +
          `Y: ${point.y ?? 0}\n` +
          `Z: ${point.z ?? 0}`
        );
      } else {
        this.setTooltip("Selecciona un punto definido previamente.");
      }
    }
  };

  /* Bloque Dinámico de Herramienta */
  Blockly.Blocks['set_tool'] = {
    init: function() {
      this.isManual_ = false;
      
      const generateToolOptions = () => {
        const robot = document.getElementById('robotSelect').value;
        const options = [];
        
        options.push([TOOL_DATABASE['manual'].name, 'manual']);

        for (const toolId in TOOL_DATABASE) {
          if (toolId === 'manual') continue;

          const tool = TOOL_DATABASE[toolId];
          if (tool.compatibleWith.includes(robot)) {
            options.push([tool.name, toolId]);
          } else {
            options.push([`(No comp.) ${tool.name}`, toolId]);
          }
        }
        return options;
      };

      this.appendDummyInput()
          .appendField("Seleccionar Herramienta")
          .appendField(new Blockly.FieldDropdown(generateToolOptions, (newValue) => {
            this.updateShape_(newValue === 'manual');
            return newValue;
          }), 'TOOL_ID');

      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(260);
      this.setTooltip("Selecciona la herramienta activa del robot. La lista de herramientas compatibles cambia según el robot seleccionado.");
    },

    saveExtraState: function() {
      return { 'isManual': this.isManual_ };
    },

    loadExtraState: function(state) {
      this.updateShape_(state['isManual']);
    },

    updateShape_: function(isManual) {
      if (this.isManual_ === isManual) return;
      this.isManual_ = isManual;

      if (isManual) {
        this.appendDummyInput('TCP_POS_ROW')
            .appendField('TCP:')
            .appendField('X:').appendField(new Blockly.FieldNumber(0), 'TCP_X')
            .appendField('Y:').appendField(new Blockly.FieldNumber(0), 'TCP_Y')
            .appendField('Z:').appendField(new Blockly.FieldNumber(0), 'TCP_Z');
        this.appendDummyInput('TCP_ROT_ROW')
            .appendField('Rot:')
            .appendField('Rx:').appendField(new Blockly.FieldNumber(0), 'TCP_RX')
            .appendField('Ry:').appendField(new Blockly.FieldNumber(180), 'TCP_RY')
            .appendField('Rz:').appendField(new Blockly.FieldNumber(0), 'TCP_RZ');
      } else {
        if (this.getInput('TCP_POS_ROW')) this.removeInput('TCP_POS_ROW');
        if (this.getInput('TCP_ROT_ROW')) this.removeInput('TCP_ROT_ROW');
      }
    }
  };
}

/* Función Auxiliar para Obtener Valores de Bloques (getVal) */
function getVal(block, name) {
  const t = block.getInputTargetBlock(name);
  if (!t) {
    const input = block.getInput(name);
    if (input && input.connection && input.connection.getShadowDom()) {
      const shadow = input.connection.getShadowDom();
      if (shadow.tagName.toLowerCase() === 'block' && shadow.getAttribute('type') === 'math_number') {
        return Number(shadow.querySelector('field[name="NUM"]').textContent);
      }
    }
    return null;
  }
  
  if (t.type === 'math_number') {
    return Number(t.getFieldValue('NUM'));
  }
  
  // Manejar bloques variable_get
  if (t.type === 'variable_get') {
    const varName = t.getFieldValue('VARNAME');
    return { type: 'variable', name: varName };
  }
  
  // Manejar bloques matemáticos
  if (t.type === 'math_arithmetic') {
    return {
      type: 'math_arithmetic',
      operator: t.getFieldValue('OP'),
      a: getVal(t, 'A'),
      b: getVal(t, 'B')
    };
  }
  
  if (t.type === 'math_single') {
    return {
      type: 'math_single',
      operator: t.getFieldValue('OP'),
      num: getVal(t, 'NUM')
    };
  }
  
  if (t.type === 'math_modulo') {
    return {
      type: 'math_modulo',
      dividend: getVal(t, 'DIVIDEND'),
      divisor: getVal(t, 'DIVISOR')
    };
  }
  
  // Manejar bloques use_pose
  if (t.type === 'use_pose') {
    const poseName = t.getFieldValue('POSE_NAME');
    const pose = savedPoses[poseName];
    if (pose) {
      return {
        type: 'pose',
        name: poseName,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        rx: pose.rx,
        ry: pose.ry,
        rz: pose.rz
      };
    }
  }
  
  // Manejar bloques use_point
  if (t.type === 'use_point') {
    const pointName = t.getFieldValue('POINT_NAME');
    const point = savedPoints[pointName];
    if (point) {
      return {
        type: 'point',
        name: pointName,
        x: point.x,
        y: point.y,
        z: point.z
      };
    }
  }
  
  return null;
}

/* Función auxiliar para parsear argumentos de función */
function parseArguments(argBlock) {
  if (!argBlock) return [];
  
  const args = [];
  
  // Si es una lista de argumentos
  if (argBlock.type === 'argument_list') {
    args.push(getVal(argBlock, 'ARG1'));
    args.push(getVal(argBlock, 'ARG2'));
  } else {
    // Un solo argumento
    args.push(getVal(argBlock, 'ARGS'));
  }
  
  return args.filter(a => a !== null && a !== undefined);
}

/* Función auxiliar para procesar condiciones del bloque IF */
function processCondition(condBlock) {
  if (!condBlock) return null;
  
  const cond = { type: condBlock.type };
  
  if (condBlock.type === 'read_di_block') {
    cond.pin = condBlock.getFieldValue('PIN');
    cond.state = condBlock.getFieldValue('STATE');
  } else if (condBlock.type === 'logic_compare') {
    cond.operator = condBlock.getFieldValue('OP');
    cond.a = getVal(condBlock, 'A');
    cond.b = getVal(condBlock, 'B');
  } else if (condBlock.type === 'logic_boolean') {
    cond.value = condBlock.getFieldValue('BOOL') === 'TRUE';
  } else if (condBlock.type === 'logic_and') {
    cond.a = processCondition(condBlock.getInputTargetBlock('A'));
    cond.b = processCondition(condBlock.getInputTargetBlock('B'));
  } else if (condBlock.type === 'logic_or') {
    cond.a = processCondition(condBlock.getInputTargetBlock('A'));
    cond.b = processCondition(condBlock.getInputTargetBlock('B'));
  } else if (condBlock.type === 'logic_not') {
    cond.inner = processCondition(condBlock.getInputTargetBlock('BOOL'));
  } else if (condBlock.type === 'read_ai_block') {
    cond.pin = condBlock.getFieldValue('PIN');
  }
  
  return cond;
}

/* Conversión de un Bloque a Formato JSON Intermedio */
function blockToJSON(block) {
  if (!block) return null;
  const obj = { type: block.type };
  
  // Procesamiento de bloques de movimiento (MoveJ, MoveL)
  if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_J || block.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
    const target = getVal(block, "TARGET");
    
    if (target && typeof target === 'object' && (target.type === 'pose' || target.type === 'point')) {
      obj.x = target.x;
      obj.y = target.y;
      obj.z = target.z;
      obj.sourceName = target.name;
      obj.sourceType = target.type;
      
      if (target.type === 'pose') {
        obj.rx = target.rx;
        obj.ry = target.ry;
        obj.rz = target.rz;
      }
    } else if (typeof target === 'number') {
      obj.x = target;
      obj.y = 0;
      obj.z = 0;
    }
    
    obj.speed = getVal(block, "SPEED");
  }
  // Procesamiento de bloques de movimiento circular (MoveC)
  else if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
    const viaTarget = getVal(block, "VIA_TARGET");
    const endTarget = getVal(block, "END_TARGET");
    
    if (viaTarget && typeof viaTarget === 'object') {
      obj.via_x = viaTarget.x;
      obj.via_y = viaTarget.y;
      obj.via_z = viaTarget.z;
      obj.via_sourceName = viaTarget.name;
      obj.via_sourceType = viaTarget.type;
    }
    
    if (endTarget && typeof endTarget === 'object') {
      obj.end_x = endTarget.x;
      obj.end_y = endTarget.y;
      obj.end_z = endTarget.z;
      obj.end_sourceName = endTarget.name;
      obj.end_sourceType = endTarget.type;
    }
    
    obj.speed = getVal(block, "SPEED");
  }
  // Procesamiento de bloque de espera
  else if (block.type === CONSTANTS.BLOCK_TYPES.WAIT) {
    obj.time = getVal(block, "TIME");
  }
  // Procesamiento del bloque IF-THEN-ELSE
  else if (block.type === 'if_block') {
    // Procesar la condición
    obj.condition = processCondition(block.getInputTargetBlock('COND'));
    
    // Procesar rama DO (entonces)
    const doBlock = block.getInputTargetBlock('DO');
    if (doBlock) {
      obj.do = [];
      let current = doBlock;
      while (current) {
        obj.do.push(blockToJSON(current));
        current = current.getNextBlock();
      }
    }
    
    // Procesar rama ELSE (sino) - opcional
    const elseBlock = block.getInputTargetBlock('ELSE');
    if (elseBlock) {
      obj.else = [];
      let current = elseBlock;
      while (current) {
        obj.else.push(blockToJSON(current));
        current = current.getNextBlock();
      }
    }
  }
  // Procesamiento del bloque WHILE
  else if (block.type === 'while_block') {
    // Procesar la condición
    obj.condition = processCondition(block.getInputTargetBlock('COND'));
    
    // Procesar rama DO (cuerpo del bucle)
    const doBlock = block.getInputTargetBlock('DO');
    if (doBlock) {
      obj.do = [];
      let current = doBlock;
      while (current) {
        obj.do.push(blockToJSON(current));
        current = current.getNextBlock();
      }
    }
  }
  // Procesamiento del bloque FOR
  else if (block.type === 'for_block') {
    obj.variable = block.getField('VAR') ? block.getField('VAR').getText() : 'i';
    obj.from = getVal(block, 'FROM');
    obj.to = getVal(block, 'TO');
    
    // Procesar cuerpo del bucle
    const doBlock = block.getInputTargetBlock('DO');
    if (doBlock) {
      obj.do = [];
      let current = doBlock;
      while (current) {
        obj.do.push(blockToJSON(current));
        current = current.getNextBlock();
      }
    }
  }
  // Procesamiento del bloque LOOP simple (mantener compatibilidad)
  else if (block.type === 'loop_block') {
    obj.count = getVal(block, 'COUNT');
    
    const doBlock = block.getInputTargetBlock('DO');
    if (doBlock) {
      obj.do = [];
      let current = doBlock;
      while (current) {
        obj.do.push(blockToJSON(current));
        current = current.getNextBlock();
      }
    }
  }
  // Procesamiento del bloque PALLETIZE (Pick & Place completo)
  else if (block.type === 'palletize_block') {
    // Posición de recogida (PICK)
    obj.pick_pos = getVal(block, 'PICK_POS');
    obj.pick_approach_height = getVal(block, 'PICK_APPROACH_HEIGHT');
    obj.gripper_pin = getVal(block, 'GRIPPER_PIN');
    obj.pick_wait_time = getVal(block, 'PICK_WAIT_TIME');
    
    // Configuración del palet (PLACE)
    obj.pallet_origin = getVal(block, 'PALLET_ORIGIN');
    obj.rows = getVal(block, 'ROWS');
    obj.cols = getVal(block, 'COLS');
    obj.layers = getVal(block, 'LAYERS');
    obj.box_x = getVal(block, 'BOX_X');
    obj.box_y = getVal(block, 'BOX_Y');
    obj.box_z = getVal(block, 'BOX_Z');
    obj.spacing_x = getVal(block, 'SPACING_X');
    obj.spacing_y = getVal(block, 'SPACING_Y');
    obj.layer_height = getVal(block, 'LAYER_HEIGHT');
    obj.place_approach_height = getVal(block, 'PLACE_APPROACH_HEIGHT');
    obj.place_wait_time = getVal(block, 'PLACE_WAIT_TIME');
    
    // Posición HOME (opcional)
    obj.home_pos = getVal(block, 'HOME_POS');
  }
  // Procesamiento de bloques de condición
  else if (block.type === 'read_di_block') {
    obj.pin = block.getFieldValue('PIN');
    obj.state = block.getFieldValue('STATE');
  }
  else if (block.type === 'logic_compare') {
    obj.operator = block.getFieldValue('OP');
    obj.a = getVal(block, 'A');
    obj.b = getVal(block, 'B');
  }
  else if (block.type === 'logic_boolean') {
    obj.value = block.getFieldValue('BOOL') === 'TRUE';
  }
  else if (block.type === 'logic_and') {
    obj.a = processCondition(block.getInputTargetBlock('A'));
    obj.b = processCondition(block.getInputTargetBlock('B'));
  }
  else if (block.type === 'logic_or') {
    obj.a = processCondition(block.getInputTargetBlock('A'));
    obj.b = processCondition(block.getInputTargetBlock('B'));
  }
  else if (block.type === 'logic_not') {
    obj.inner = processCondition(block.getInputTargetBlock('BOOL'));
  }
  // Procesamiento de bloques matemáticos
  else if (block.type === 'math_arithmetic') {
    obj.operator = block.getFieldValue('OP');
    obj.a = getVal(block, 'A');
    obj.b = getVal(block, 'B');
  }
  else if (block.type === 'math_single') {
    obj.operator = block.getFieldValue('OP');
    obj.num = getVal(block, 'NUM');
  }
  else if (block.type === 'math_modulo') {
    obj.dividend = getVal(block, 'DIVIDEND');
    obj.divisor = getVal(block, 'DIVISOR');
  }
  // Procesamiento de funciones con parámetros
  else if (block.type === 'function_def_params') {
    obj.funcname = block.getFieldValue('FUNCNAME');
    obj.params = block.getFieldValue('PARAMS').split(',').map(p => p.trim()).filter(p => p);
    
    const doBlock = block.getInputTargetBlock('DO');
    if (doBlock) {
      obj.do = [];
      let current = doBlock;
      while (current) {
        obj.do.push(blockToJSON(current));
        current = current.getNextBlock();
      }
    }
  }
  else if (block.type === 'function_call_params') {
    obj.funcname = block.getFieldValue('FUNCNAME');
    obj.args = parseArguments(block.getInputTargetBlock('ARGS'));
  }
  else if (block.type === 'function_return') {
    obj.value = getVal(block, 'VALUE');
  }
  // Procesamiento de bloques de E/S
  else if (block.type === CONSTANTS.BLOCK_TYPES.SET_DO || block.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
    obj.pin = block.getFieldValue('PIN');
    obj.state = block.getFieldValue('STATE');
  }
  // Procesamiento de bloques de E/S Analógicas
  else if (block.type === 'read_ai_block') {
    obj.pin = block.getFieldValue('PIN');
  }
  else if (block.type === 'write_ao_block') {
    obj.pin = block.getFieldValue('PIN');
    obj.value = getVal(block, 'VALUE');
  }
  else if (block.type === 'wait_ai_block') {
    obj.pin = block.getFieldValue('PIN');
    obj.operator = block.getFieldValue('OP');
    obj.value = getVal(block, 'VALUE');
  }
  // Procesamiento de bloque define_pose
  else if (block.type === 'define_pose') {
    obj.name = block.getFieldValue('NAME');
    obj.x = getVal(block, "X");
    obj.y = getVal(block, "Y");
    obj.z = getVal(block, "Z");
    obj.rx = getVal(block, "RX");
    obj.ry = getVal(block, "RY");
    obj.rz = getVal(block, "RZ");
    
    if (obj.name) {
      savedPoses[obj.name] = {
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        z: obj.z ?? 0,
        rx: obj.rx ?? 0,
        ry: obj.ry ?? 180,
        rz: obj.rz ?? 0
      };
    }
  }
  // Procesamiento de bloque define_point
  else if (block.type === 'define_point') {
    obj.name = block.getFieldValue('NAME');
    obj.x = getVal(block, "X");
    obj.y = getVal(block, "Y");
    obj.z = getVal(block, "Z");
    
    if (obj.name) {
      savedPoints[obj.name] = {
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        z: obj.z ?? 0
      };
    }
  }
  // Procesamiento de bloque use_pose
  else if (block.type === 'use_pose') {
    obj.poseName = block.getFieldValue('POSE_NAME');
    const pose = savedPoses[obj.poseName];
    if (pose) {
      obj.x = pose.x;
      obj.y = pose.y;
      obj.z = pose.z;
      obj.rx = pose.rx;
      obj.ry = pose.ry;
      obj.rz = pose.rz;
    }
  }
  // Procesamiento de bloque use_point
  else if (block.type === 'use_point') {
    obj.pointName = block.getFieldValue('POINT_NAME');
    const point = savedPoints[obj.pointName];
    if (point) {
      obj.x = point.x;
      obj.y = point.y;
      obj.z = point.z;
    }
  }
  // Procesamiento de bloque set_tool
  else if (block.type === 'set_tool') {
    obj.tool_id = block.getFieldValue('TOOL_ID');
    
    if (obj.tool_id === 'manual') {
      obj.tcp_x = block.getFieldValue('TCP_X');
      obj.tcp_y = block.getFieldValue('TCP_Y');
      obj.tcp_z = block.getFieldValue('TCP_Z');
      obj.tcp_rx = block.getFieldValue('TCP_RX');
      obj.tcp_ry = block.getFieldValue('TCP_RY');
      obj.tcp_rz = block.getFieldValue('TCP_RZ');
    }
  }

  // Procesar el siguiente bloque en la cadena
  if (block.getNextBlock()) {
    obj.next = blockToJSON(block.getNextBlock());
  }
  return obj;
}

/* Conversión del Workspace Completo a un Programa JSON */
function workspaceToProgram(workspace) {
  // Limpiar los almacenes antes de procesar
  Object.keys(savedPoses).forEach(key => delete savedPoses[key]);
  Object.keys(savedPoints).forEach(key => delete savedPoints[key]);
  
  // Procesar todos los bloques
  const program = workspace ? workspace.getTopBlocks(!0).map(blockToJSON).filter(Boolean) : [];
  
  // Actualizar los dropdowns de los bloques use_pose y use_point
  updatePosePointDropdowns(workspace);
  
  return program;
}

/* Actualizar Dropdowns de Poses y Puntos */
function updatePosePointDropdowns(workspace) {
  if (!workspace) return;
  
  workspace.getAllBlocks(false).forEach(block => {
    try {
      if (block.type === 'use_pose') {
        const dropdown = block.getField('POSE_NAME');
        if (dropdown) {
          const poses = Object.keys(savedPoses);
          const newOptions = poses.length > 0 
            ? poses.map(name => [name, name])
            : [['(ninguna pose definida)', '']];
          
          dropdown.menuGenerator_ = newOptions;
          
          const currentValue = dropdown.getValue();
          
          if (currentValue && !savedPoses[currentValue]) {
            block.setWarningText(`La pose "${currentValue}" no está definida.`);
          } else {
            block.setWarningText(null);
            block.updateTooltip_(currentValue);
          }
          
          if (!savedPoses[currentValue] && poses.length > 0) {
            dropdown.setValue(poses[0]);
          }
        }
      } else if (block.type === 'use_point') {
        const dropdown = block.getField('POINT_NAME');
        if (dropdown) {
          const points = Object.keys(savedPoints);
          const newOptions = points.length > 0 
            ? points.map(name => [name, name])
            : [['(ningún punto definido)', '']];
          
          dropdown.menuGenerator_ = newOptions;
          
          const currentValue = dropdown.getValue();
          
          if (currentValue && !savedPoints[currentValue]) {
            block.setWarningText(`El punto "${currentValue}" no está definido.`);
          } else {
            block.setWarningText(null);
            block.updateTooltip_(currentValue);
          }
          
          if (!savedPoints[currentValue] && points.length > 0) {
            dropdown.setValue(points[0]);
          }
        }
      }
    } catch (e) {
      // Ignorar errores durante eliminación de bloques
    }
  });
}

/* Actualización de Advertencias de Bloques */

// Recorre todos los bloques de movimiento y aplica o limpia las advertencias de singularidad
function updateBlockWarnings(workspace) {
  if (!workspace) return;
  const allBlocks = workspace.getAllBlocks(false);
  allBlocks.forEach(block => {
    try {
      if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
        const target = getVal(block, 'TARGET');
        const yVal = target?.y;
        if (checkSingularityWarning(yVal)) {
          block.setWarningText("Riesgo de Singularidad: Mover linealmente cerca de Y=0 puede causar un paro protector.");
        } else {
          block.setWarningText(null);
        }
      } else if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
        const viaTarget = getVal(block, 'VIA_TARGET');
        const endTarget = getVal(block, 'END_TARGET');
        const viaYVal = viaTarget?.y;
        const endYVal = endTarget?.y;
        if (checkSingularityWarning(viaYVal) || checkSingularityWarning(endYVal)) {
          block.setWarningText("Riesgo de Singularidad: Mover en círculo cerca de Y=0 puede causar un paro protector.");
        } else {
          block.setWarningText(null);
        }
      }
    } catch (e) {
      // Ignorar errores
    }
  });
}

// Recorre todos los bloques de herramienta y aplica advertencias de compatibilidad
function updateToolWarnings(workspace) {
  if (!workspace) return;

  const robot = document.getElementById('robotSelect').value;
  const allBlocks = workspace.getAllBlocks(false);
  const originalToolColour = 260;
  const errorColour = 0;

  allBlocks.forEach(block => {
    if (block.type === 'set_tool') {
      const toolId = block.getFieldValue('TOOL_ID');
      const tool = TOOL_DATABASE[toolId];

      if (tool && toolId !== 'manual' && !tool.compatibleWith.includes(robot)) {
        block.setWarningText(`Incompatible: La herramienta "${tool.name}" no es compatible con el robot ${robot}.`);
        block.setColour(errorColour);
      } else {
        block.setWarningText(null);
        block.setColour(originalToolColour);
      }
    }
  });
}
