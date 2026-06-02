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
let serializationRegistries = null;

/* Definición de Bloques Visuales Personalizados para Blockly */
function defineBlocks() {
  Blockly.defineBlocksWithJsonArray([
    // Bloques de movimiento
    {
      "type": "move_block",
      "message0": "Mover Articular a %1 Velocidad:%2 (%) Zona: %3",
      "args0": [
        { "type": "input_value", "name": "TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "SPEED" },
        { "type": "field_dropdown", "name": "ZONE", "options": [
          ["FINE (Parada exacta)", "fine"],
          ["z0 (0mm)", "z0"],
          ["z1 (1mm)", "z1"],
          ["z5 (5mm)", "z5"],
          ["z10 (10mm)", "z10"],
          ["z50 (50mm)", "z50"],
          ["z100 (100mm)", "z100"]
        ]}
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 160,
      "tooltip": "Movimiento articular del robot\n\nPuede usar punto o pose\nSi importa la orientación, usa pose"
    },
    {
      "type": "move_linear_block",
      "message0": "Mover Lineal a %1 Velocidad:%2 (mm/s) Zona: %3",
      "args0": [
        { "type": "input_value", "name": "TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "SPEED" },
        { "type": "field_dropdown", "name": "ZONE", "options": [
          ["FINE (Parada exacta)", "fine"],
          ["z0 (0mm)", "z0"],
          ["z1 (1mm)", "z1"],
          ["z5 (5mm)", "z5"],
          ["z10 (10mm)", "z10"],
          ["z50 (50mm)", "z50"],
          ["z100 (100mm)", "z100"]
        ]}
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 160,
      "tooltip": "Movimiento lineal del robot\n\nSigue una trayectoria recta\nÚtil para aproximar, entrar o salir de una zona"
    },
    {
      "type": "move_circular_block",
      "message0": "Mover Circular %1 vía %2 hasta %3 Velocidad:%4 (mm/s) Zona: %5",
      "args0": [
        { "type": "input_dummy" },
        { "type": "input_value", "name": "VIA_TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "END_TARGET", "check": ["pose", "point"] },
        { "type": "input_value", "name": "SPEED" },
        { "type": "field_dropdown", "name": "ZONE", "options": [
          ["FINE (Parada exacta)", "fine"],
          ["z0 (0mm)", "z0"],
          ["z1 (1mm)", "z1"],
          ["z5 (5mm)", "z5"],
          ["z10 (10mm)", "z10"],
          ["z50 (50mm)", "z50"],
          ["z100 (100mm)", "z100"]
        ]}
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 160,
      "tooltip": "Movimiento circular del robot\n\nUsa un punto intermedio y un punto final\nRevisa la trayectoria antes de ejecutar"
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
    
    // Bloque de Paletizado Completo
    {
      "type": "palletize_block",
      "message0": "🔄 Paletizado %1",
      "args0": [
        { "type": "input_dummy" }
      ],
      "message1": "🔵 PICK: Pose %1 Aprox.(mm) %2 Espera(s) %3",
      "args1": [
        { "type": "input_value", "name": "PICK_POS", "check": "pose" },
        { "type": "input_value", "name": "PICK_APPROACH_HEIGHT", "check": "Number" },
        { "type": "input_value", "name": "PICK_WAIT_TIME", "check": "Number" }
      ],
      "message2": "Pinza al agarrar (opcional) %1",
      "args2": [
        { "type": "input_statement", "name": "GRIP_CLOSE_ACTIONS" }
      ],
      "message3": "Pinza al soltar (opcional) %1",
      "args3": [
        { "type": "input_statement", "name": "GRIP_OPEN_ACTIONS" }
      ],
      "message4": "🟢 PALET (3 puntos): P1 %1 P2 %2 P3 %3",
      "args4": [
        { "type": "input_value", "name": "PALLET_P1", "check": "pose" },
        { "type": "input_value", "name": "PALLET_P2", "check": "point" },
        { "type": "input_value", "name": "PALLET_P3", "check": "point" }
      ],
      "message5": "Filas %1 Cols %2 Capas %3 Altura capas(mm) %4",
      "args5": [
        { "type": "input_value", "name": "ROWS", "check": "Number" },
        { "type": "input_value", "name": "COLS", "check": "Number" },
        { "type": "input_value", "name": "LAYERS", "check": "Number" },
        { "type": "input_value", "name": "LAYER_HEIGHT", "check": "Number" }
      ],
      "message6": "Aprox.PLACE(mm) %1 Espera(s) %2 HOME (opcional) %3",
      "args6": [
        { "type": "input_value", "name": "PLACE_APPROACH_HEIGHT", "check": "Number" },
        { "type": "input_value", "name": "PLACE_WAIT_TIME", "check": "Number" },
        { "type": "input_value", "name": "HOME_POS", "check": ["pose", "point"] }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 200,
      "tooltip": "Paletizado por 3 puntos (P1, P2, P3)\n\n" +
             "Orden correcto:\n" +
             "• P1 = ORIGEN (fila 0, col 0)\n" +
             "• P2 = dirección COLUMNAS: misma fila que P1 (fila 0), col 1\n" +
             "• P3 = dirección FILAS: misma col que P1 (col 0), fila 1\n\n" +
             "Esquema:\n" +
             "P3 ●\n" +
             "   │  (filas: P1→P3)\n" +
             "P1 ●──● P2\n" +
             "   (columnas: P1→P2)\n\n" +
             "Cálculo:\n" +
             "P = P1 + col·(P2−P1) + row·(P3−P1) (+ capa·altura)\n\n" +
             "Consejo:\n" +
             "P1→P2 y P1→P3 deberían formar ~90°. Si no, revisa puntos."
    },

    // Bloque de Pinza RG2 (URCap)
    {
      "type": "rg2_grip_set",
      "message0": "🧲 Pinza RG2 (URCap) – Configurar ancho(mm) %1 fuerza %2",
      "args0": [
        { "type": "input_value", "name": "WIDTH_MM", "check": "Number" },
        { "type": "input_value", "name": "FORCE", "check": "Number" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 260,
      "tooltip": "Configura la pinza activa con ancho y fuerza."
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
      "tooltip": "Define una pose con posición en mm y orientación en grados. La interfaz convierte automáticamente la orientación al formato requerido por cada robot."
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
      "tooltip": "Define un punto (X, Y, Z)\n\nSolo posición, sin orientación\nÚsalo cuando solo importa dónde"
    },
    
    // Bloque de frames (sistemas de coordenadas)
    {
      "type": "define_frame",
      "message0": "🗺️ Definir Frame %1",
      "args0": [
        { "type": "field_input", "name": "NAME", "text": "frame1" }
      ],
      "message1": "Origen: X:%1 Y:%2 Z:%3",
      "args1": [
        { "type": "input_value", "name": "X", "check": "Number" },
        { "type": "input_value", "name": "Y", "check": "Number" },
        { "type": "input_value", "name": "Z", "check": "Number" }
      ],
      "message2": "Rotación: Rx:%1 Ry:%2 Rz:%3",
      "args2": [
        { "type": "input_value", "name": "RX", "check": "Number" },
        { "type": "input_value", "name": "RY", "check": "Number" },
        { "type": "input_value", "name": "RZ", "check": "Number" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 280,
      "tooltip": "Define un sistema de referencia. La posición se introduce en mm y la orientación en grados."
    }
  ]);

  /* Bloques Dinámicos de Poses y Puntos */
  
  // Bloque dinámico para usar una pose guardada
  Blockly.Blocks['use_pose'] = {
    init: function() {
      const getPoseOptions = () => {
        const options = [];
        const poses = Object.keys(savedPoses);
        const isXmlLoading = (typeof window !== 'undefined' && window.__fpLoadingWorkspaceFromXml === true);
        
        if (poses.length === 0) {
          options.push(['(ninguna pose definida)', '']);
        } else {
          poses.forEach(name => {
            options.push([name, name]);
          });
        }
        
        // Durante XML load: incluir todos los valores pendientes para evitar warnings de Blockly
        if (isXmlLoading && typeof window !== 'undefined') {
          const pendingGlobal = window.__fpPendingXmlDropdownValuesByTypeField?.['use_pose']?.['POSE_NAME'];
          if (Array.isArray(pendingGlobal)) {
            pendingGlobal.forEach((pendingValue) => {
              if (pendingValue && !poses.includes(pendingValue) && !options.some((opt) => opt[1] === pendingValue)) {
                options.push([pendingValue, pendingValue]);
              }
            });
          }
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
          `Rx: ${pose.rx ?? 0}°\n` +
          `Ry: ${pose.ry ?? 180}°\n` +
          `Rz: ${pose.rz ?? 0}°`
        );
      } else {
        this.setTooltip(`Usa una pose definida previamente\n\nPosición en mm y orientación en grados\nLa interfaz convierte automáticamente la orientación al formato requerido por cada robot.`);
      }
    }
  };

  // Bloque dinámico para usar un punto guardado
  Blockly.Blocks['use_point'] = {
    init: function() {
      const getPointOptions = () => {
        const options = [];
        const points = Object.keys(savedPoints);
        const isXmlLoading = (typeof window !== 'undefined' && window.__fpLoadingWorkspaceFromXml === true);
        
        if (points.length === 0) {
          options.push(['(ningún punto definido)', '']);
        } else {
          points.forEach(name => {
            options.push([name, name]);
          });
        }
        
        // Durante XML load: incluir todos los valores pendientes para evitar warnings de Blockly
        if (isXmlLoading && typeof window !== 'undefined') {
          const pendingGlobal = window.__fpPendingXmlDropdownValuesByTypeField?.['use_point']?.['POINT_NAME'];
          if (Array.isArray(pendingGlobal)) {
            pendingGlobal.forEach((pendingValue) => {
              if (pendingValue && !points.includes(pendingValue) && !options.some((opt) => opt[1] === pendingValue)) {
                options.push([pendingValue, pendingValue]);
              }
            });
          }
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
        this.setTooltip(`Usa un punto definido previamente\n\nSolo posición\nRecomendado cuando no necesitas controlar la orientación`);
      }
    }
  };

  // Bloque dinámico para usar un frame guardado
  Blockly.Blocks['use_frame'] = {
    init: function() {
      const getFrameOptions = () => {
        const options = [['WORLD (Base Robot)', 'WORLD']];
        const frames = Object.keys(savedFrames);
        frames.forEach(name => {
          options.push([name, name]);
        });
        
        const isXmlLoading = (typeof window !== 'undefined' && window.__fpLoadingWorkspaceFromXml === true);
        
        // Durante XML load: incluir todos los valores pendientes para evitar warnings de Blockly
        if (isXmlLoading && typeof window !== 'undefined') {
          const pendingGlobal = window.__fpPendingXmlDropdownValuesByTypeField?.['use_frame']?.['FRAME_NAME'];
          if (Array.isArray(pendingGlobal)) {
            pendingGlobal.forEach((pendingValue) => {
              if (pendingValue && pendingValue !== 'WORLD' && !frames.includes(pendingValue) && !options.some((opt) => opt[1] === pendingValue)) {
                options.push([pendingValue, pendingValue]);
              }
            });
          }
        }
        
        return options;
      };

      this.appendDummyInput()
          .appendField("🗺️ Activar Frame:")
          .appendField(new Blockly.FieldDropdown(getFrameOptions, (newValue) => {
            this.updateTooltip_(newValue);
            return newValue;
          }), 'FRAME_NAME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(280);
      this.updateTooltip_('WORLD');
    },
    
    updateTooltip_: function(frameName) {
      if (frameName === 'WORLD') {
        this.setTooltip('Usa el frame WORLD para mover en coordenadas globales');
      } else {
        const frame = savedFrames[frameName];
        if (frame) {
          this.setTooltip(
            `Frame: ${frameName}\n` +
            `Origen: X:${frame.x ?? 0}, Y:${frame.y ?? 0}, Z:${frame.z ?? 0}\n` +
            `Rotación: Rx:${frame.rx ?? 0}°, Ry:${frame.ry ?? 0}°, Rz:${frame.rz ?? 0}°`
          );
        } else {
          this.setTooltip('Define un sistema de referencia. La posición se introduce en mm y la orientación en grados.');
        }
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

        const toolLibrary = (typeof window !== 'undefined' && window.ToolLibrary) ? window.ToolLibrary : {};
        const rg2 = toolLibrary.onrobot_rg2_urcap;
        if (rg2) {
          options.push(['OnRobot RG2 (URCap)', rg2.id]);
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
      this.setTooltip(
        "Define el TCP de la herramienta. La posición se introduce en mm y la orientación en grados.\n\n" +
        "La interfaz convierte automáticamente la orientación al formato requerido por cada robot."
      );
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
            .appendField('Orientación TCP:')
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
function getVal(block, name, registries) {
  const registriesToUse = registries || serializationRegistries;
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
    const pose = (registriesToUse?.poses || savedPoses)[poseName];
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
    if (poseName) {
      return {
        type: 'pose',
        name: poseName
      };
    }
  }
  
  // Manejar bloques use_point
  if (t.type === 'use_point') {
    const pointName = t.getFieldValue('POINT_NAME');
    const point = (registriesToUse?.points || savedPoints)[pointName];
    if (point) {
      return {
        type: 'point',
        name: pointName,
        x: point.x,
        y: point.y,
        z: point.z
      };
    }
    if (pointName) {
      return {
        type: 'point',
        name: pointName
      };
    }
  }
  
  return null;
}

/* Reconstruir registros guardados desde el workspace */
function rebuildSavedRegistriesFromWorkspace(workspace) {
  Object.keys(savedPoses).forEach(key => delete savedPoses[key]);
  Object.keys(savedPoints).forEach(key => delete savedPoints[key]);
  Object.keys(savedFrames).forEach(key => delete savedFrames[key]);

  if (!workspace) {
    return {
      points: savedPoints,
      poses: savedPoses,
      frames: savedFrames
    };
  }
  const allBlocks = workspace.getAllBlocks(false) || [];

  allBlocks.forEach(block => {
    if (!block || !block.type) return;

    if (block.type === 'define_point') {
      const name = block.getFieldValue('NAME');
      if (!name) return;
      savedPoints[name] = {
        x: getVal(block, 'X') ?? 0,
        y: getVal(block, 'Y') ?? 0,
        z: getVal(block, 'Z') ?? 0
      };
      return;
    }

    if (block.type === 'define_pose') {
      const name = block.getFieldValue('NAME');
      if (!name) return;
      savedPoses[name] = {
        x: getVal(block, 'X') ?? 0,
        y: getVal(block, 'Y') ?? 0,
        z: getVal(block, 'Z') ?? 0,
        rx: getVal(block, 'RX') ?? 0,
        ry: getVal(block, 'RY') ?? 180,
        rz: getVal(block, 'RZ') ?? 0
      };
      return;
    }

    if (block.type === 'define_frame') {
      const name = block.getFieldValue('NAME');
      if (!name) return;
      savedFrames[name] = {
        x: getVal(block, 'X') ?? 0,
        y: getVal(block, 'Y') ?? 0,
        z: getVal(block, 'Z') ?? 0,
        rx: getVal(block, 'RX') ?? 0,
        ry: getVal(block, 'RY') ?? 0,
        rz: getVal(block, 'RZ') ?? 0
      };
    }
  });

  return {
    points: savedPoints,
    poses: savedPoses,
    frames: savedFrames
  };
}

let registryRebuildTimer = null;
function scheduleRegistryRebuild(ws) {
  const targetWorkspace = ws || (typeof workspace !== 'undefined' ? workspace : null);
  if (!targetWorkspace) return;

  const suppressDuringXmlLoad = (typeof window !== 'undefined' && window.__fpSuppressRegistryRebuildDuringXmlLoad === true);
  if (suppressDuringXmlLoad) {
    if (registryRebuildTimer) {
      clearTimeout(registryRebuildTimer);
      registryRebuildTimer = null;
    }
    console.log('[XML DROPDOWN] scheduleRegistryRebuild suppressed during XML load');
    return;
  }

  if (registryRebuildTimer) {
    clearTimeout(registryRebuildTimer);
  }

  registryRebuildTimer = setTimeout(() => {
    const suppressedAtExecution = (typeof window !== 'undefined' && window.__fpSuppressRegistryRebuildDuringXmlLoad === true);
    if (suppressedAtExecution) {
      console.log('[XML DROPDOWN] scheduleRegistryRebuild suppressed during XML load');
      registryRebuildTimer = null;
      return;
    }
    rebuildSavedRegistriesFromWorkspace(targetWorkspace);
    if (typeof updatePosePointDropdowns === 'function') {
      updatePosePointDropdowns(targetWorkspace);
    }
    registryRebuildTimer = null;
  }, 75);
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

/* Función auxiliar para convertir una cadena de statement blocks a lista */
function statementToJSONList(firstBlock) {
  const list = [];
  let current = firstBlock;
  let index = 0;
  const debugEnabled = (() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('fp_debug') === 'true';
    } catch (error) {
      return false;
    }
  })();
  while (current) {
    const serialized = blockToJSON(current);
    if (debugEnabled) {
      const nextBlock = typeof current.getNextBlock === 'function' ? current.getNextBlock() : null;
      const blockString = (typeof current.toString === 'function') ? String(current.toString()) : '';
      console.debug('[SIM STATEMENT CHAIN]', {
        index,
        id: current.id,
        type: current.type,
        text: blockString,
        next: nextBlock ? nextBlock.type : null,
        json: serialized
      });
    }
    if (serialized) list.push(serialized);
    else if (debugEnabled) console.warn('[SIM PREP] blockToJSON returned null', current.type, current.id);
    current = current.getNextBlock();
    index += 1;
  }
  return list;
}

function serializeStatementList(block, inputName) {
  const first = block.getInputTargetBlock(inputName);
  return statementToJSONList(first);
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
    obj.zone = block.getFieldValue('ZONE') || 'z50'; // Por defecto z50
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
    obj.zone = block.getFieldValue('ZONE') || 'z50'; // Por defecto z50
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
    obj.do = statementToJSONList(doBlock);
    
    // Procesar rama ELSE (sino) - opcional
    const elseBlock = block.getInputTargetBlock('ELSE');
    obj.else = statementToJSONList(elseBlock);
  }
  // Procesamiento del bloque WHILE
  else if (block.type === 'while_block') {
    // Procesar la condición
    obj.condition = processCondition(block.getInputTargetBlock('COND'));
    
    // Procesar rama DO (cuerpo del bucle), con fallback al primer statement input real
    let doInputName = 'DO';
    let doBlock = block.getInputTargetBlock(doInputName);
    if (!doBlock) {
      const statementInput = (block.inputList || []).find((input) => input && input.connection && input.connection.type === 3);
      if (statementInput && statementInput.name) {
        doInputName = statementInput.name;
        doBlock = block.getInputTargetBlock(doInputName);
      }
    }
    obj.do = statementToJSONList(doBlock);
  }
  // Procesamiento del bloque FOR
  else if (block.type === 'for_block') {
    obj.variable = block.getField('VAR') ? block.getField('VAR').getText() : 'i';
    obj.from = getVal(block, 'FROM');
    obj.to = getVal(block, 'TO');
    
    // Procesar cuerpo del bucle
    const doBlock = block.getInputTargetBlock('DO');
    obj.do = statementToJSONList(doBlock);
  }
  // Procesamiento del bloque LOOP simple (mantener compatibilidad)
  else if (block.type === 'loop_block') {
    obj.count = getVal(block, 'COUNT');
    
    const doBlock = block.getInputTargetBlock('DO');
    obj.do = statementToJSONList(doBlock);
  }
  // Procesamiento del bloque PALLETIZE (Pick & Place completo)
  else if (block.type === 'palletize_block') {
    // Posición de recogida (PICK)
    obj.pick_pose = getVal(block, 'PICK_POS');
    obj.pick_approach_height = getVal(block, 'PICK_APPROACH_HEIGHT');
    obj.pick_wait_time = getVal(block, 'PICK_WAIT_TIME');

    // Hooks de pinza (opcional)
    obj.grip_close_actions = serializeStatementList(block, 'GRIP_CLOSE_ACTIONS');
    obj.grip_open_actions = serializeStatementList(block, 'GRIP_OPEN_ACTIONS');

    // Configuración del palet (3 puntos - método industrial)
    obj.pallet_p1_pose = getVal(block, 'PALLET_P1');
    obj.pallet_p2 = getVal(block, 'PALLET_P2');
    obj.pallet_p3 = getVal(block, 'PALLET_P3');
    obj.rows = getVal(block, 'ROWS');
    obj.cols = getVal(block, 'COLS');
    obj.layers = getVal(block, 'LAYERS');
    obj.layer_height = getVal(block, 'LAYER_HEIGHT');
    obj.place_approach_height = getVal(block, 'PLACE_APPROACH_HEIGHT');
    obj.place_wait_time = getVal(block, 'PLACE_WAIT_TIME');
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
  // Procesamiento de bloques de variables
  else if (
    block.type === 'variable_set'
    || block.type === 'variables_set'
    || block.type === 'variables_set_dynamic'
    || block.type === 'set_variable'
    || block.type === 'custom_variable_set'
    || block.type === 'data_setvariableto'
  ) {
    obj.type = 'variable_set';
    const varFieldText = (typeof block.getField === 'function' && block.getField('VAR') && typeof block.getField('VAR').getText === 'function')
      ? String(block.getField('VAR').getText()).trim()
      : '';
    obj.varName = varFieldText || block.getFieldValue('VARNAME') || block.getFieldValue('VAR') || block.getFieldValue('NAME') || 'i';
    obj.value = getVal(block, 'VALUE') ?? getVal(block, 'VAR') ?? getVal(block, 'NAME');
  }
  // Procesamiento de funciones con parámetros
  else if (block.type === 'function_def_params') {
    obj.funcname = block.getFieldValue('FUNCNAME');
    obj.params = block.getFieldValue('PARAMS').split(',').map(p => p.trim()).filter(p => p);
    
    const doBlock = block.getInputTargetBlock('DO');
    obj.do = statementToJSONList(doBlock);
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
  // Procesamiento de bloque define_frame
  else if (block.type === 'define_frame') {
    obj.name = block.getFieldValue('NAME');
    obj.x = getVal(block, "X");
    obj.y = getVal(block, "Y");
    obj.z = getVal(block, "Z");
    obj.rx = getVal(block, "RX");
    obj.ry = getVal(block, "RY");
    obj.rz = getVal(block, "RZ");
    
    if (obj.name) {
      savedFrames[obj.name] = {
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        z: obj.z ?? 0,
        rx: obj.rx ?? 0,
        ry: obj.ry ?? 0,
        rz: obj.rz ?? 0
      };
    }
  }
  // Procesamiento de bloque use_pose
  else if (block.type === 'use_pose') {
    obj.poseName = block.getFieldValue('POSE_NAME');
    const pose = (serializationRegistries?.poses || savedPoses)[obj.poseName];
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
    const point = (serializationRegistries?.points || savedPoints)[obj.pointName];
    if (point) {
      obj.x = point.x;
      obj.y = point.y;
      obj.z = point.z;
    }
  }
  // Procesamiento de bloque use_frame
  else if (block.type === 'use_frame') {
    obj.frameName = block.getFieldValue('FRAME_NAME');
    if (obj.frameName === 'WORLD') {
      obj.x = 0;
      obj.y = 0;
      obj.z = 0;
      obj.rx = 0;
      obj.ry = 0;
      obj.rz = 0;
    } else {
      const frame = (serializationRegistries?.frames || savedFrames)[obj.frameName];
      if (frame) {
        obj.x = frame.x;
        obj.y = frame.y;
        obj.z = frame.z;
        obj.rx = frame.rx;
        obj.ry = frame.ry;
        obj.rz = frame.rz;
      }
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
  // Procesamiento de bloque RG2 (URCap)
  else if (block.type === 'rg2_grip_set') {
    obj.type = 'gripper_set';
    obj.tool_id = 'onrobot_rg2_urcap';
    obj.width_mm = getVal(block, 'WIDTH_MM');
    obj.force = getVal(block, 'FORCE');
  }

  // No procesar el siguiente bloque en la cadena aquí
  // workspaceToProgram() ya maneja el seguimiento de la cadena mediante getNextBlock()
  
  return obj;
}

/* Conversión del Workspace Completo a un Programa JSON */
function workspaceToProgram(workspace) {
  // Reconstruir registros antes de procesar
  const registries = rebuildSavedRegistriesFromWorkspace(workspace);
  serializationRegistries = registries;
  const serializationDebugEnabled = (() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('fp_debug') === 'true';
    } catch (error) {
      return false;
    }
  })();
  
  // Procesar cadenas top-level completas (incluye bloques conectados por getNextBlock)
  const program = [];
  if (workspace) {
    const topBlocks = workspace.getTopBlocks(false);
    const visited = new Set();

    if (serializationDebugEnabled) {
      const allBlocks = workspace.getAllBlocks(false) || [];
      const variableLikeBlocks = allBlocks.filter((block) => /variable|data/i.test(String(block?.type || '')));
      variableLikeBlocks.forEach((block) => {
        const parentType = (typeof block.getParent === 'function' && block.getParent()) ? block.getParent().type : null;
        const previousType = (block.previousConnection && typeof block.previousConnection.targetBlock === 'function' && block.previousConnection.targetBlock())
          ? block.previousConnection.targetBlock().type
          : null;
        const nextType = (typeof block.getNextBlock === 'function' && block.getNextBlock()) ? block.getNextBlock().type : null;
        const xy = (typeof block.getRelativeToSurfaceXY === 'function') ? block.getRelativeToSurfaceXY() : null;
        console.debug('[SIM VARIABLE BLOCK FOUND]', {
          type: block.type,
          id: block.id,
          parent: parentType,
          previous: previousType,
          next: nextType,
          xy
        });
      });
    }

    for (const topBlock of topBlocks) {
      let current = topBlock;
      let index = 0;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const serialized = blockToJSON(current);
        if (serializationDebugEnabled) {
          const nextBlock = typeof current.getNextBlock === 'function' ? current.getNextBlock() : null;
          const blockString = (typeof current.toString === 'function') ? String(current.toString()) : '';
          console.debug('[SIM CHAIN STEP]', {
            index,
            id: current.id,
            type: current.type,
            text: blockString,
            next: nextBlock ? nextBlock.type : null,
            json: serialized
          });
        }
        if (serialized) {
          program.push(serialized);
        } else if (serializationDebugEnabled) {
          console.warn('[SIM PREP] blockToJSON returned null', current.type, current.id);
        }
        current = current.getNextBlock();
        index += 1;
      }
    }

    const unresolvedTopLevel = (workspace.getAllBlocks(false) || [])
      .filter((block) => block && !visited.has(block.id) && typeof block.getParent === 'function' && !block.getParent())
      .sort((left, right) => {
        const leftPos = typeof left.getRelativeToSurfaceXY === 'function' ? left.getRelativeToSurfaceXY() : { x: 0, y: 0 };
        const rightPos = typeof right.getRelativeToSurfaceXY === 'function' ? right.getRelativeToSurfaceXY() : { x: 0, y: 0 };
        return (leftPos.y - rightPos.y) || (leftPos.x - rightPos.x);
      });

    for (const block of unresolvedTopLevel) {
      const serialized = blockToJSON(block);
      if (serializationDebugEnabled) {
        const nextBlock = typeof block.getNextBlock === 'function' ? block.getNextBlock() : null;
        const blockString = (typeof block.toString === 'function') ? String(block.toString()) : '';
        console.debug('[SIM CHAIN STEP]', {
          index: program.length,
          id: block.id,
          type: block.type,
          text: blockString,
          next: nextBlock ? nextBlock.type : null,
          json: serialized,
          fallback: true
        });
      }
      if (serialized) {
        program.push(serialized);
      } else if (serializationDebugEnabled) {
        console.warn('[SIM PREP] blockToJSON returned null', block.type, block.id);
      }
      visited.add(block.id);
    }

    if (serializationDebugEnabled) {
      const allBlocks = workspace.getAllBlocks(false) || [];
      const unresolvedBlocks = allBlocks.filter((block) => block && !visited.has(block.id));
      if (unresolvedBlocks.length > 0) {
        console.debug('[SIM PREP] unresolved blocks', unresolvedBlocks.map((block) => ({
          id: block.id,
          type: block.type,
          parent: block.getParent?.()?.type || null
        })));
      }
    }
  }

  if (serializationDebugEnabled) {
    console.log(`[PROGRAM JSON] program length: ${program.length}`);
    console.log(`[PROGRAM JSON] types: [${program.map((instr) => instr?.type).filter(Boolean).join(', ')}]`);
    program.forEach((instr) => {
      if (instr && instr.type === 'while_block') {
        console.log(`[PROGRAM JSON] while do length: ${Array.isArray(instr.do) ? instr.do.length : 0}`);
      }
    });
  }

  serializationRegistries = null;
  let lastToolId = null;

  function scanToolId(node) {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(scanToolId);
      return;
    }
    if (typeof node !== 'object') {
      return;
    }
    if (node.type === 'set_tool' && node.tool_id) {
      lastToolId = node.tool_id;
    }
    Object.keys(node).forEach((key) => {
      scanToolId(node[key]);
    });
  }

  program.forEach(scanToolId);
  if (lastToolId) {
    program.tool_id = lastToolId;
  }
  
  // Actualizar los dropdowns de los bloques use_pose y use_point
  updatePosePointDropdowns(workspace);
  
  return program;
}

if (typeof window !== 'undefined') {
  window.rebuildSavedRegistriesFromWorkspace = rebuildSavedRegistriesFromWorkspace;
  window.scheduleRegistryRebuild = scheduleRegistryRebuild;
}

/* Actualizar Dropdowns de Poses y Puntos */
function updatePosePointDropdowns(workspace) {
  if (!workspace) return;

  const dropdownDebugEnabled = (() => {
    try {
      return localStorage.getItem('fp_debug') === 'true';
    } catch (error) {
      return false;
    }
  })();

  const isXmlLoading = (typeof window !== 'undefined' && window.__fpLoadingWorkspaceFromXml === true);
  const pendingValues = (typeof window !== 'undefined' && window.__fpPendingXmlDropdownValues && typeof window.__fpPendingXmlDropdownValues === 'object')
    ? window.__fpPendingXmlDropdownValues
    : null;

  function getPendingValue(blockId, fieldName, fallbackValue) {
    const pending = pendingValues?.[blockId]?.[fieldName];
    if (pending !== undefined && pending !== null) return String(pending);
    return String(fallbackValue ?? '');
  }

  function hasOption(options, value) {
    const normalized = String(value ?? '');
    return Array.isArray(options) && options.some((option) => Array.isArray(option) && String(option[1]) === normalized);
  }

  function ensureOption(options, value, fieldName, blockType) {
    const normalized = String(value ?? '');
    if (!normalized) return options;
    const currentOptions = Array.isArray(options) ? options.slice() : [];
    if (hasOption(currentOptions, normalized)) return currentOptions;
    currentOptions.push([normalized, normalized]);
    if (dropdownDebugEnabled) {
      console.log(`[XML DROPDOWN FALLBACK] added missing option field=${fieldName} value=${normalized}`);
    }
    if (isXmlLoading && dropdownDebugEnabled) {
      console.log(`[XML DROPDOWN PRESERVE] block=${blockType} field=${fieldName} value=${normalized}`);
    }
    return currentOptions;
  }
  
  workspace.getAllBlocks(false).forEach(block => {
    try {
      if (block.type === 'use_pose') {
        const dropdown = block.getField('POSE_NAME');
        if (dropdown) {
          const poses = Object.keys(savedPoses);
          let newOptions = poses.length > 0 
            ? poses.map(name => [name, name])
            : [['(ninguna pose definida)', '']];

          const currentValue = dropdown.getValue();
          const preferredValue = isXmlLoading
            ? getPendingValue(block.id, 'POSE_NAME', currentValue)
            : String(currentValue ?? '');

          if (isXmlLoading && preferredValue && !savedPoses[preferredValue]) {
            newOptions = ensureOption(newOptions, preferredValue, 'POSE_NAME', block.type);
          }

          dropdown.menuGenerator_ = newOptions;

          if (isXmlLoading && preferredValue) {
            try {
              dropdown.setValue(preferredValue);
            } catch (error) {
              // Se intentará restaurar luego con loadWorkspaceFromXML.
            }
          }

          const effectiveValue = isXmlLoading ? preferredValue : String(dropdown.getValue() ?? '');
          
          if (effectiveValue && !savedPoses[effectiveValue]) {
            block.setWarningText(`No se encuentra la pose "${effectiveValue}". Revisa sus definiciones.`);
          } else {
            block.setWarningText(null);
            block.updateTooltip_(effectiveValue);
          }

          if (!isXmlLoading && !savedPoses[effectiveValue] && poses.length > 0) {
            dropdown.setValue(poses[0]);
          }
        }
      } else if (block.type === 'use_point') {
        const dropdown = block.getField('POINT_NAME');
        if (dropdown) {
          const points = Object.keys(savedPoints);
          let newOptions = points.length > 0 
            ? points.map(name => [name, name])
            : [['(ningún punto definido)', '']];

          const currentValue = dropdown.getValue();
          const preferredValue = isXmlLoading
            ? getPendingValue(block.id, 'POINT_NAME', currentValue)
            : String(currentValue ?? '');

          if (isXmlLoading && preferredValue && !savedPoints[preferredValue]) {
            newOptions = ensureOption(newOptions, preferredValue, 'POINT_NAME', block.type);
          }

          dropdown.menuGenerator_ = newOptions;

          if (isXmlLoading && preferredValue) {
            try {
              dropdown.setValue(preferredValue);
            } catch (error) {
              // Se intentará restaurar luego con loadWorkspaceFromXML.
            }
          }

          const effectiveValue = isXmlLoading ? preferredValue : String(dropdown.getValue() ?? '');
          
          if (effectiveValue && !savedPoints[effectiveValue]) {
            block.setWarningText(`No se encuentra el punto "${effectiveValue}". Revisa sus definiciones.`);
          } else {
            block.setWarningText(null);
            block.updateTooltip_(effectiveValue);
          }

          if (!isXmlLoading && !savedPoints[effectiveValue] && points.length > 0) {
            dropdown.setValue(points[0]);
          } else if (!isXmlLoading && !savedPoints[effectiveValue] && points.length === 0) {
            dropdown.setValue('');
          }
        }
      } else if (block.type === 'use_frame') {
        const dropdown = block.getField('FRAME_NAME');
        if (dropdown) {
          const frames = Object.keys(savedFrames);
          let newOptions = [['WORLD (Base Robot)', 'WORLD']];
          frames.forEach(name => {
            newOptions.push([name, name]);
          });

          const currentValue = dropdown.getValue();
          const preferredValue = isXmlLoading
            ? getPendingValue(block.id, 'FRAME_NAME', currentValue || 'WORLD')
            : String(currentValue ?? 'WORLD');

          if (isXmlLoading && preferredValue && preferredValue !== 'WORLD' && !savedFrames[preferredValue]) {
            newOptions = ensureOption(newOptions, preferredValue, 'FRAME_NAME', block.type);
          }

          dropdown.menuGenerator_ = newOptions;

          if (isXmlLoading && preferredValue) {
            try {
              dropdown.setValue(preferredValue);
            } catch (error) {
              // Se intentará restaurar luego con loadWorkspaceFromXML.
            }
          }

          const effectiveValue = isXmlLoading ? preferredValue : String(dropdown.getValue() ?? 'WORLD');
          
          if (effectiveValue && effectiveValue !== 'WORLD' && !savedFrames[effectiveValue]) {
            block.setWarningText(`No se encuentra el frame "${effectiveValue}". Revisa sus definiciones.`);
          } else {
            block.setWarningText(null);
            block.updateTooltip_(effectiveValue);
          }

          if (!isXmlLoading && !savedFrames[effectiveValue] && effectiveValue !== 'WORLD' && frames.length > 0) {
            dropdown.setValue(frames[0]);
          }
        }
      } else if (block.type === 'set_tool') {
        const dropdown = block.getField('TOOL_ID');
        if (dropdown) {
          let newOptions = [];
          if (typeof dropdown.getOptions === 'function') {
            try {
              const refreshed = dropdown.getOptions(true);
              if (Array.isArray(refreshed)) newOptions = refreshed.slice();
            } catch (error) {
              // Continuar con menuGenerator_ si existe.
            }
          }
          if (newOptions.length === 0 && Array.isArray(dropdown.menuGenerator_)) {
            newOptions = dropdown.menuGenerator_.slice();
          }

          const currentValue = dropdown.getValue();
          const preferredValue = isXmlLoading
            ? getPendingValue(block.id, 'TOOL_ID', currentValue)
            : String(currentValue ?? '');

          if (isXmlLoading && preferredValue && !hasOption(newOptions, preferredValue)) {
            newOptions = ensureOption(newOptions, preferredValue, 'TOOL_ID', block.type);
          }

          if (newOptions.length > 0) {
            dropdown.menuGenerator_ = newOptions;
          }

          if (isXmlLoading && preferredValue) {
            try {
              dropdown.setValue(preferredValue);
              if (dropdownDebugEnabled) {
                console.log(`[XML DROPDOWN PRESERVE] block=${block.type} field=TOOL_ID value=${preferredValue}`);
              }
            } catch (error) {
              // Se intentará restaurar luego con loadWorkspaceFromXML.
            }
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
  const robot = document.getElementById('robotSelect')?.value || '';
  const toolLibrary = (typeof window !== 'undefined' && window.ToolLibrary) ? window.ToolLibrary : {};
  const normalizedRobot = (() => {
    if (!robot) return '';
    if (robot.toUpperCase().includes('UR')) return 'UR';
    if (robot.toUpperCase().includes('ABB')) return 'ABB';
    if (robot.toUpperCase().includes('FANUC')) return 'FANUC';
    return robot;
  })();

  const toolByBlockId = new Map();
  const topBlocks = workspace.getTopBlocks(true);
  topBlocks.forEach(top => {
    let currentTool = null;
    let cur = top;
    while (cur) {
      if (cur.type === 'set_tool') {
        currentTool = cur.getFieldValue('TOOL_ID');
      }
      toolByBlockId.set(cur.id, currentTool);
      cur = cur.getNextBlock();
    }
  });

  const ensureDidacticMenuForMovement = (block) => {
    if (block.didacticSuggestionContextMenuPatched_) return;
    const prevCustomContextMenu = block.customContextMenu;
    block.customContextMenu = function(options) {
      if (typeof prevCustomContextMenu === 'function') {
        prevCustomContextMenu.call(this, options);
      }

      const key = this.didacticSuggestionCurrentKey_;
      if (!key) return;

      const isHidden = this.didacticSuggestionHiddenKey_ === key;
      if (isHidden) {
        options.push({
          text: 'Volver a mostrar esta sugerencia',
          enabled: true,
          callback: () => {
            this.didacticSuggestionHiddenKey_ = null;
            updateBlockWarnings(workspace);
          }
        });
      } else {
        options.push({
          text: 'Ocultar esta sugerencia',
          enabled: true,
          callback: () => {
            this.didacticSuggestionHiddenKey_ = key;
            updateBlockWarnings(workspace);
          }
        });
      }
    };
    block.didacticSuggestionContextMenuPatched_ = true;
  };

  const applyMovementWarning = (block, technicalWarning, suggestionWarning, suggestionKey) => {
    if (technicalWarning) {
      block.didacticSuggestionCurrentKey_ = null;
      block.setWarningText(technicalWarning);
      return;
    }

    block.didacticSuggestionCurrentKey_ = suggestionKey || null;
    const isHidden = suggestionWarning && suggestionKey && block.didacticSuggestionHiddenKey_ === suggestionKey;
    block.setWarningText(isHidden ? null : (suggestionWarning || null));
  };

  allBlocks.forEach(block => {
    try {
      if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_J) {
        ensureDidacticMenuForMovement(block);
        const target = getVal(block, 'TARGET');
        const suggestionWarning = (target?.type === 'point')
          ? 'Movimiento con punto: solo defines posición. Si importa la orientación, usa pose'
          : null;
        const suggestionKey = (target?.type === 'point')
          ? `move_j_point:${target?.name || ''}`
          : null;
        applyMovementWarning(block, null, suggestionWarning, suggestionKey);
      } else if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
        ensureDidacticMenuForMovement(block);
        const target = getVal(block, 'TARGET');
        const yVal = target?.y;
        let technicalWarning = null;
        let suggestionWarning = null;
        let suggestionKey = null;

        if (checkSingularityWarning(yVal)) {
          technicalWarning = "Posible singularidad: al mover lineal cerca de Y=0 el robot puede limitar el movimiento.";
        }

        if (!technicalWarning && target?.type === 'point') {
          suggestionWarning = 'Movimiento lineal con punto: la orientación puede heredarse del movimiento anterior';
          suggestionKey = `move_l_point:${target?.name || ''}`;
        }

        applyMovementWarning(block, technicalWarning, suggestionWarning, suggestionKey);
      } else if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
        ensureDidacticMenuForMovement(block);
        const viaTarget = getVal(block, 'VIA_TARGET');
        const endTarget = getVal(block, 'END_TARGET');
        const viaYVal = viaTarget?.y;
        const endYVal = endTarget?.y;
        let technicalWarning = null;
        let suggestionWarning = null;
        let suggestionKey = null;

        if (checkSingularityWarning(viaYVal) || checkSingularityWarning(endYVal)) {
          technicalWarning = "Posible singularidad: al mover en círculo cerca de Y=0 el robot puede limitar el movimiento.";
        }

        const viaHasCoords = viaTarget && typeof viaTarget === 'object' &&
          Number.isFinite(Number(viaTarget.x)) && Number.isFinite(Number(viaTarget.y)) && Number.isFinite(Number(viaTarget.z));
        const endHasCoords = endTarget && typeof endTarget === 'object' &&
          Number.isFinite(Number(endTarget.x)) && Number.isFinite(Number(endTarget.y)) && Number.isFinite(Number(endTarget.z));

        if (!technicalWarning && viaHasCoords && endHasCoords) {
          const dx = Number(viaTarget.x) - Number(endTarget.x);
          const dy = Number(viaTarget.y) - Number(endTarget.y);
          const dz = Number(viaTarget.z) - Number(endTarget.z);
          const viaEndDist = dist3(dx, dy, dz);
          if (viaEndDist < 1) {
            suggestionWarning = 'Movimiento circular: revisa el punto intermedio y el punto final';
            suggestionKey = `move_c_geom:${viaTarget?.name || ''}|${endTarget?.name || ''}`;
          }
        }

        applyMovementWarning(block, technicalWarning, suggestionWarning, suggestionKey);
      } else if (block.type === 'palletize_block') {
        const warnings = [];
        const missing = [];
        const addWarning = (message) => {
          if (!warnings.includes(message)) warnings.push(message);
        };

        const pickPos = getVal(block, 'PICK_POS');
        const palletP1 = getVal(block, 'PALLET_P1');
        const palletP2 = getVal(block, 'PALLET_P2');
        const palletP3 = getVal(block, 'PALLET_P3');
        const rows = getVal(block, 'ROWS');
        const cols = getVal(block, 'COLS');
        const layers = getVal(block, 'LAYERS');
        const layerHeight = getVal(block, 'LAYER_HEIGHT');

        if (!pickPos) missing.push('PICK');
        if (!palletP1) missing.push('P1');
        if (!palletP2) missing.push('P2');
        if (!palletP3) missing.push('P3');
        if (rows == null) missing.push('Filas');
        if (cols == null) missing.push('Cols');
        if (layers == null) missing.push('Capas');

        if (missing.length > 0) {
          addWarning('Faltan datos de paletizado; se usarán valores por defecto al generar código');
        }

        if (rows != null && Number(rows) <= 0) {
          addWarning('Filas debe ser mayor que 0');
        }
        if (cols != null && Number(cols) <= 0) {
          addWarning('Columnas debe ser mayor que 0');
        }
        if (layers != null && Number(layers) <= 0) {
          addWarning('Capas debe ser mayor que 0');
        }
        if (layerHeight != null && Number(layerHeight) < 0) {
          addWarning('Altura de capa no puede ser negativa');
        }

        const toXYZ = (value) => {
          if (!value || typeof value !== 'object') return null;
          const x = Number(value.x);
          const y = Number(value.y);
          const z = Number(value.z);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
          return { x, y, z };
        };

        const p1 = toXYZ(palletP1);
        const p2 = toXYZ(palletP2);
        const p3 = toXYZ(palletP3);

        const dist = (a, b) => {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        };

        const MIN_DIST = 0.001;
        let d12 = null;
        let d13 = null;
        let p2Coincides = false;
        let p3Coincides = false;

        if (p1 && p2) {
          if (p1.x === p2.x && p1.y === p2.y && p1.z === p2.z) {
            p2Coincides = true;
            addWarning('P2 no puede coincidir con P1');
          }
          d12 = dist(p1, p2);
          if (d12 < MIN_DIST && !p2Coincides) {
            addWarning('Distancia P1-P2 muy pequeña; separa mejor las columnas');
          }
        }

        if (p1 && p3) {
          if (p1.x === p3.x && p1.y === p3.y && p1.z === p3.z) {
            p3Coincides = true;
            addWarning('P3 no puede coincidir con P1');
          }
          d13 = dist(p1, p3);
          if (d13 < MIN_DIST && !p3Coincides) {
            addWarning('Distancia P1-P3 muy pequeña; separa mejor las filas');
          }
        }

        if (p1 && p2 && p3 && d12 != null && d13 != null && d12 >= MIN_DIST && d13 >= MIN_DIST) {
          const v12x = p2.x - p1.x;
          const v12y = p2.y - p1.y;
          const v12z = p2.z - p1.z;
          const v13x = p3.x - p1.x;
          const v13y = p3.y - p1.y;
          const v13z = p3.z - p1.z;

          const cx = v12y * v13z - v12z * v13y;
          const cy = v12z * v13x - v12x * v13z;
          const cz = v12x * v13y - v12y * v13x;
          const crossNorm = Math.sqrt(cx * cx + cy * cy + cz * cz);
          const sinTheta = crossNorm / (d12 * d13);

          if (sinTheta < 0.01) {
            addWarning('P1, P2 y P3 no deben estar alineados');
          }
        }

        if (warnings.length > 0) {
          block.setWarningText(warnings.join('\n'));
        } else {
          block.setWarningText(null);
        }
      } else if (block.type === 'rg2_grip_set') {
        const expectedToolId = 'onrobot_rg2_urcap';
        const activeToolId = toolByBlockId.get(block.id) || null;

        if (normalizedRobot !== 'UR') {
          block.setWarningText('Este bloque de pinza requiere un robot compatible con la herramienta activa.');
        } else if (activeToolId !== expectedToolId) {
          block.setWarningText('La herramienta activa no coincide con este bloque de pinza. Selecciona la herramienta correspondiente.');
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
  const toolLibrary = (typeof window !== 'undefined' && window.ToolLibrary) ? window.ToolLibrary : {};

  const normalizedRobot = (() => {
    if (!robot) return '';
    if (robot.toUpperCase().includes('UR')) return 'UR';
    if (robot.toUpperCase().includes('ABB')) return 'ABB';
    if (robot.toUpperCase().includes('FANUC')) return 'FANUC';
    return robot;
  })();

  const buildSuggestion = (supportedRobots) => {
    if (Array.isArray(supportedRobots) && supportedRobots.length > 0) {
      return 'Sugerencia: seleccione un robot compatible para usar esta herramienta.';
    }
    return 'Sugerencia: cambie a una herramienta compatible con el robot seleccionado.';
  };

  const withSuggestion = (message, suggestion) => {
    if (!suggestion) return message;
    return `${message}\n<div class="tool-warning-suggestion">${suggestion}</div>`;
  };

  allBlocks.forEach(block => {
    if (block.type === 'set_tool') {
      const toolId = block.getFieldValue('TOOL_ID');
      const toolMeta = toolLibrary[toolId];
      const tool = TOOL_DATABASE[toolId];

      if (!toolMeta && !tool && toolId && toolId !== 'manual') {
        const message = `Herramienta no disponible: ${toolId}.`;
        const suggestion = 'Sugerencia: revise la versión del proyecto o la librería de herramientas.';
        block.setWarningText(withSuggestion(message, suggestion));
        block.setColour(errorColour);
        return;
      }

      if (toolMeta?.supportedRobots) {
        const isSupported = toolMeta.supportedRobots.includes(robot) || toolMeta.supportedRobots.includes(normalizedRobot);
        if (!isSupported) {
          const message = `La herramienta "${toolMeta.name}" no es compatible con el robot seleccionado.`;
          const suggestion = buildSuggestion(toolMeta.supportedRobots);
          block.setWarningText(withSuggestion(message, suggestion));
          block.setColour(errorColour);
        } else {
          block.setWarningText(null);
          block.setColour(originalToolColour);
        }
        return;
      }

      if (tool && toolId !== 'manual' && !tool.compatibleWith.includes(robot)) {
        const message = `La herramienta "${tool.name}" no es compatible con el robot seleccionado.`;
        const suggestion = buildSuggestion([]);
        block.setWarningText(withSuggestion(message, suggestion));
        block.setColour(errorColour);
      } else {
        block.setWarningText(null);
        block.setColour(originalToolColour);
      }
    }
  });
}
