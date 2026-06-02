/*═══════════════════════════════════════════════════════════════════════════════
  ÍNDICE DE SECCIONES - script.js
═══════════════════════════════════════════════════════════════════════════════

  001 - Punto de Entrada y Constantes Globales
  002 - Definición de Límites de Alcance (Reach) por Robot
  003 - Umbral para Advertencia de Singularidad
  004 - Base de Datos de Herramientas
  005 - Lógica de Divisores de Paneles Horizontales (Splitters)
  006 - Lógica del Splitter Vertical
  007 - Referencia Global al Espacio de Trabajo de Blockly
  008 - Almacén Global de Poses y Puntos Definidos
  009 - Funciones Auxiliares de Interfaz de Usuario (UI)
  010 - Definición de Bloques Visuales Personalizados para Blockly
  011 - Bloques Dinámicos de Poses y Puntos
  012 - Bloque Dinámico de Herramienta
  013 - Función Auxiliar para Obtener Valores de Bloques (getVal)
  014 - Conversión de un Bloque a Formato JSON Intermedio
  015 - Conversión del Workspace Completo a un Programa JSON
  016 - Actualizar Dropdowns de Poses y Puntos
  017 - Funciones Auxiliares (Matemáticas y Advertencias)
  018 - Conversión de Ángulos Euler a Cuaternión
  019 - Detección y Visualización de Advertencias
  020 - Generador de Código Principal (Función Router)
  021 - Generador de Código Industrial para UR3e (URScript)
  022 - Generador de Código Industrial para ABB IRC5 (RAPID)
  023 - Función Principal de Actualización de la Interfaz
  024 - Manejador de Redimensionamiento de Paneles
  025 - Listener de Cambios en el Workspace de Blockly
  026 - Carga de Bloques de Ejemplo al Iniciar
  027 - Actualización Inicial de Salidas al Cargar la Página
  028 - Listeners para los Controles de la Interfaz de Usuario
  029 - Listener del Botón de Copiar Código
  030 - Listener del Botón de Simulación
  031 - Funciones de Guardar y Cargar Workspace
  032 - Listeners de Botones de Guardar/Cargar

═══════════════════════════════════════════════════════════════════════════════*/

/* SECCIÓN 001: Punto de Entrada y Constantes Globales */
window.addEventListener('load', () => {
  // Define constantes para evitar "magic strings" (cadenas de texto repetidas) y facilitar el mantenimiento.
  const CONSTANTS = {
    ROBOTS: { UR3E: 'UR3e', ABB: 'ABB IRC5', FANUC: 'Fanuc LR Mate' },
    MODES: { EDUCATIONAL: 'educativo', INDUSTRIAL: 'industrial' },
    BLOCK_TYPES: { MOVE_J: 'move_block', MOVE_L: 'move_linear_block', MOVE_C: 'move_circular_block', WAIT: 'wait_block', SET_DO: 'set_do_block', WAIT_DI: 'wait_di_block' }
  };
  
  /* SECCIÓN 002: Definición de Límites de Alcance (Reach) por Robot */
  const ROBOT_REACH_LIMITS = {
    [CONSTANTS.ROBOTS.UR3E]: 500,
    [CONSTANTS.ROBOTS.ABB]: 700,
    [CONSTANTS.ROBOTS.FANUC]: 550
  };

  /* SECCIÓN 003: Umbral para Advertencia de Singularidad */
  // Límite en mm para considerar que se está "cerca" del plano Y=0, una zona de riesgo para singularidades en muchos robots.
  const SINGULARITY_THRESHOLD_Y_MM = 1;

  /* SECCIÓN 004: Base de Datos de Herramientas */
  const TOOL_DATABASE = {
    'manual': {
      name: 'Herramienta Manual/Casera',
      manufacturer: 'Custom',
      compatibleWith: [CONSTANTS.ROBOTS.UR3E, CONSTANTS.ROBOTS.ABB, CONSTANTS.ROBOTS.FANUC],
      tcp: null,
      payload_kg: null
    },
    'schunk_egp40': {
      name: 'Pinza Schunk EGP 40',
      manufacturer: 'Schunk',
      compatibleWith: [CONSTANTS.ROBOTS.UR3E, CONSTANTS.ROBOTS.FANUC],
      tcp: { x: 0, y: 0, z: 120, rx: 0, ry: 180, rz: 0 },
      payload_kg: 0.5
    },
    'onrobot_rg2': {
      name: 'Pinza OnRobot RG2',
      manufacturer: 'OnRobot',
      compatibleWith: [CONSTANTS.ROBOTS.UR3E],
      tcp: { x: 0, y: 0, z: 158, rx: 0, ry: 180, rz: 0 },
      payload_kg: 2.0
    },
    'abb_weldgun': {
      name: 'Pistola Soldadura ABB',
      manufacturer: 'ABB',
      compatibleWith: [CONSTANTS.ROBOTS.ABB],
      tcp: { x: 50, y: 0, z: 250, rx: 0, ry: 180, rz: 0 },
      payload_kg: 4.5
    }
  };

  /* SECCIÓN 005: Lógica de Divisores de Paneles Horizontales (Splitters) */
  // Implementa la funcionalidad de arrastrar los divisores para redimensionar los paneles principales.
  (function() {
    const splitters = Array.from(document.querySelectorAll('.splitter'));
    splitters.forEach(splitter => {
      let dragging = false, startX = 0, leftPanel = null, rightPanel = null, leftPanelWidth = 0, rightPanelWidth = 0;
      
      splitter.addEventListener('mousedown', e => {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        leftPanel = splitter.previousElementSibling;
        rightPanel = splitter.nextElementSibling;
        if (!leftPanel || !rightPanel) return;
        
        leftPanelWidth = leftPanel.getBoundingClientRect().width;
        rightPanelWidth = rightPanel.getBoundingClientRect().width;
        
        document.body.style.cursor = 'col-resize';
        
        function onMouseMove(e) {
          if (!dragging) return;
          
          const dx = e.clientX - startX;
          let newLeftWidth = leftPanelWidth + dx;
          let newRightWidth = rightPanelWidth - dx;
          
          const minWidth = 140;
          
          // Obtener el ancho total del contenedor
          const container = document.getElementById('container');
          const containerWidth = container.getBoundingClientRect().width;
          const containerPadding = 20; // 10px × 2
          
          // Contar todos los splitters
          const allSplitters = document.querySelectorAll('.splitter, .vertical-splitter');
          const totalSplitterWidth = Array.from(allSplitters).reduce((sum, s) => {
            return sum + s.getBoundingClientRect().width;
          }, 0);
          
          // Espacio disponible para TODOS los paneles
          const maxAvailableWidth = containerWidth - containerPadding - totalSplitterWidth;
          
          // Identificar qué splitter se está arrastrando
          const splitterIndex = Array.from(splitters).indexOf(splitter);
          
          if (splitterIndex === 0) {
            // Splitter entre panel-1 (Config) y panel-2 (Bloques)
            const rightGroup = document.getElementById('right-panel-group');
            const rightGroupWidth = rightGroup ? rightGroup.getBoundingClientRect().width : 0;
            
            // Espacio disponible para panel-1 + panel-2
            const availableForTheseTwo = maxAvailableWidth - rightGroupWidth;
            
            // Validar límites
            if (newLeftWidth > availableForTheseTwo - minWidth) {
              newLeftWidth = availableForTheseTwo - minWidth;
              newRightWidth = availableForTheseTwo - newLeftWidth;
            }
            if (newRightWidth > availableForTheseTwo - minWidth) {
              newRightWidth = availableForTheseTwo - minWidth;
              newLeftWidth = availableForTheseTwo - newRightWidth;
            }
            if (newLeftWidth < minWidth) {
              newLeftWidth = minWidth;
              newRightWidth = availableForTheseTwo - newLeftWidth;
            }
            if (newRightWidth < minWidth) {
              newRightWidth = minWidth;
              newLeftWidth = availableForTheseTwo - newRightWidth;
            }
            
          } else if (splitterIndex === 1) {
            // Splitter entre panel-2 (Bloques) y right-panel-group
            const panel1 = document.getElementById('panel-1');
            const panel1Width = panel1 ? panel1.getBoundingClientRect().width : 0;
            
            // Espacio disponible para panel-2 + right-panel-group
            const availableForTheseTwo = maxAvailableWidth - panel1Width;
            
            // El right-panel-group NO puede superar el espacio disponible
            const maxRightGroupWidth = availableForTheseTwo - minWidth;
            
            // Validar límites
            if (newLeftWidth > availableForTheseTwo - minWidth) {
              newLeftWidth = availableForTheseTwo - minWidth;
              newRightWidth = minWidth;
            }
            if (newRightWidth > maxRightGroupWidth) {
              newRightWidth = maxRightGroupWidth;
              newLeftWidth = availableForTheseTwo - newRightWidth;
            }
            if (newLeftWidth < minWidth) {
              newLeftWidth = minWidth;
              newRightWidth = availableForTheseTwo - newLeftWidth;
            }
            if (newRightWidth < minWidth) {
              newRightWidth = minWidth;
              newLeftWidth = availableForTheseTwo - newRightWidth;
            }
          }
          
          leftPanel.style.flex = `0 0 ${newLeftWidth}px`;
          rightPanel.style.flex = `0 0 ${newRightWidth}px`;
          if (window.onPanelsResized) window.onPanelsResized();
        }
        
        function onMouseUp() {
          dragging = false;
          document.body.style.cursor = 'default';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          if (window.onPanelsResized) window.onPanelsResized();
        }
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    });
  })();

  /* SECCIÓN 006: Lógica del Splitter Vertical (entre Modo Educativo y Modo Industrial) */
  // Permite redimensionar independientemente los paneles de código educativo e industrial.
  (function() {
    const verticalSplitter = document.querySelector('.vertical-splitter');
    if (!verticalSplitter) return;
    
    let dragging = false;
    let startX = 0;
    let leftPanel = null;
    let rightPanel = null;
    let leftPanelWidth = 0;
    let rightPanelWidth = 0;
    
    verticalSplitter.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      
      leftPanel = verticalSplitter.previousElementSibling;
      rightPanel = verticalSplitter.nextElementSibling;
      
      if (!leftPanel || !rightPanel) return;
      
      leftPanelWidth = leftPanel.getBoundingClientRect().width;
      rightPanelWidth = rightPanel.getBoundingClientRect().width;
      
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      function onMouseMove(e) {
        if (!dragging) return;
        
        const dx = e.clientX - startX;
        let newLeftWidth = leftPanelWidth + dx;
        let newRightWidth = rightPanelWidth - dx;
        
        const minWidth = 150;
        
        // Calcular ancho total disponible
        const totalAvailableWidth = leftPanelWidth + rightPanelWidth;
        
        // Validar que ningún panel supere el espacio total
        if (newLeftWidth > totalAvailableWidth - minWidth) {
          newLeftWidth = totalAvailableWidth - minWidth;
          newRightWidth = minWidth;
        }
        if (newRightWidth > totalAvailableWidth - minWidth) {
          newRightWidth = totalAvailableWidth - minWidth;
          newLeftWidth = minWidth;
        }
        
        // Validar límites mínimos
        if (newLeftWidth < minWidth) {
          newLeftWidth = minWidth;
          newRightWidth = totalAvailableWidth - newLeftWidth;
        }
        if (newRightWidth < minWidth) {
          newRightWidth = minWidth;
          newLeftWidth = totalAvailableWidth - newRightWidth;
        }
        
        leftPanel.style.flex = `0 0 ${newLeftWidth}px`;
        rightPanel.style.flex = `0 0 ${newRightWidth}px`;
      }
      
      function onMouseUp() {
        dragging = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }
      
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  })();

  /* SECCIÓN 007: Referencia Global al Espacio de Trabajo de Blockly */
  let workspace = null;

  /* SECCIÓN 008: Almacén Global de Poses y Puntos Definidos */
  // Almacena poses definidas: {nombre: {x, y, z, rx, ry, rz}}
  const savedPoses = {};
  // Almacena puntos definidos: {nombre: {x, y, z}}
  const savedPoints = {};

  /* SECCIÓN 009: Funciones Auxiliares de Interfaz de Usuario (UI) */
  // Obtiene la velocidad por defecto configurada
  function currentDefaultSpeed() {
    const v = Number(document.getElementById("defaultSpeed").value || 100);
    return isFinite(v) && v > 0 ? v : 100;
  }
  
  // Muestra un mensaje temporal (toast) en la pantalla
  function showToast(message) {
    const t = document.getElementById("toast");
    t.textContent = message;
    t.classList.add("show");
    setTimeout(() => { t.classList.remove("show"); }, 3000);
  }

  /* SECCIÓN 010: Definición de Bloques Visuales Personalizados para Blockly */
  // Utiliza el formato JSON de Blockly para definir la apariencia y estructura de cada bloque personalizado.
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
      { "type": "if_block", "message0": "Si %1 entonces %2", "args0": [ { "type": "input_value", "name": "COND" }, { "type": "input_statement", "name": "DO" } ], "previousStatement": null, "nextStatement": null, "colour": 120 },
      { "type": "loop_block", "message0": "Repetir %1 veces %2", "args0": [ { "type": "input_value", "name": "COUNT" }, { "type": "input_statement", "name": "DO" } ], "previousStatement": null, "nextStatement": null, "colour": 20 },
      
      // Bloques de E/S
      { "type": "set_do_block", "message0": "Poner Salida Digital (DO) %1 en %2", "args0": [ { "type": "field_number", "name": "PIN", "value": 1, "min": 0 }, { "type": "field_dropdown", "name": "STATE", "options": [ [ "ON", "1" ], [ "OFF", "0" ] ] } ], "previousStatement": null, "nextStatement": null, "colour": 60, "tooltip": "Activa o desactiva una salida digital." },
      { "type": "wait_di_block", "message0": "Esperar Entrada Digital (DI) %1 a %2", "args0": [ { "type": "field_number", "name": "PIN", "value": 1, "min": 0 }, { "type": "field_dropdown", "name": "STATE", "options": [ [ "ON", "1" ], [ "OFF", "0" ] ] } ], "previousStatement": null, "nextStatement": null, "colour": 60, "tooltip": "Detiene el programa hasta que la entrada digital especificada alcance el estado deseado." },
      
      // Bloques de variables y funciones
      { "type": "comment_block", "message0": "Comentario %1", "args0": [ { "type": "field_input", "name": "TEXT", "text": "nota" } ], "previousStatement": null, "nextStatement": null, "colour": 300 },
      { "type": "variable_set", "message0": "Variable %1 = %2", "args0": [ { "type": "field_input", "name": "VARNAME", "text": "x" }, { "type": "input_value", "name": "VALUE" } ], "previousStatement": null, "nextStatement": null, "colour": 330 },
      { "type": "variable_get", "message0": "usar variable %1", "args0": [ { "type": "field_input", "name": "VARNAME", "text": "x" } ], "output": null, "colour": 330 },
      { "type": "function_def", "message0": "Función %1 %2 %3", "args0": [ { "type": "field_input", "name": "FUNCNAME", "text": "miFuncion" }, { "type": "input_dummy" }, { "type": "input_statement", "name": "DO" } ], "previousStatement": null, "nextStatement": null, "colour": 290 },
      { "type": "function_call", "message0": "Llamar %1", "args0": [ { "type": "field_input", "name": "FUNCNAME", "text": "miFuncion" } ], "previousStatement": null, "nextStatement": null, "colour": 290 },
      { "type": "math_number", "message0": "%1", "args0": [ { "type": "field_number", "name": "NUM", "value": 0 } ], "output": null, "colour": 230 },
      
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

    /* SECCIÓN 011: Bloques Dinámicos de Poses y Puntos */
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

    /* SECCIÓN 012: Bloque Dinámico de Herramienta */
    // Definición dinámica del bloque de herramienta para que sus opciones cambien según el robot
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
        this.setTooltip("Selecciona la herramienta activa del robot. La lista de herramientas compatibles cambia según el robot seleccionado. Si seleccionas TCP Manual, puedes configurar la posición (X, Y, Z en mm) y orientación (Rx, Ry, Rz según la convención del robot).");
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
  
  /* SECCIÓN 013: Función Auxiliar para Obtener Valores de Bloques (getVal) */
  // Extrae de forma segura un valor de un campo de un bloque, ya sea numérico, pose o punto
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

  /* SECCIÓN 014: Conversión de un Bloque a Formato JSON Intermedio */
  // Convierte un bloque de Blockly a un objeto JSON simple y neutral
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
    // Procesamiento de bloques de E/S
    else if (block.type === CONSTANTS.BLOCK_TYPES.SET_DO || block.type === CONSTANTS.BLOCK_TYPES.WAIT_DI) {
      obj.pin = block.getFieldValue('PIN');
      obj.state = block.getFieldValue('STATE');
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

    // No procesar el siguiente bloque en la cadena aquí
    // workspaceToProgram() ya maneja el seguimiento de la cadena mediante getNextBlock()
    
    return obj;
  }

  /* SECCIÓN 015: Conversión del Workspace Completo a un Programa JSON */
  // Recorre los bloques principales del workspace y los convierte en un array de objetos JSON
  function workspaceToProgram() {
    // Limpiar los almacenes antes de procesar
    Object.keys(savedPoses).forEach(key => delete savedPoses[key]);
    Object.keys(savedPoints).forEach(key => delete savedPoints[key]);
    
    // Procesar solo bloques conectados a partir de los bloques de nivel superior (sin padre)
    // que tienen next() conectado, excluyendo bloques flotantes desconectados.
    const topBlocks = workspace ? workspace.getTopBlocks(!0) : [];
    const connectedProgram = [];
    
    // DEBUG: Contar bloques de movimiento reales en el workspace
    let realMotionCount = 0;
    if (workspace) {
      const allBlocks = workspace.getAllBlocks(!1);
      realMotionCount = allBlocks.filter(b => ['move_j', 'move_l', 'move_c'].includes(b.type)).length;
    }
    console.log(`[GEN DEBUG] Workspace real motion blocks = ${realMotionCount}`);
    
    for (const topBlock of topBlocks) {
      // Solo procesar bloques que son parte de la cadena principal
      // (recorrer desde este bloque hacia adelante siguiendo next)
      let current = topBlock;
      const alreadyAdded = new Set();
      
      while (current && !alreadyAdded.has(current)) {
        alreadyAdded.add(current);
        const json = blockToJSON(current);
        if (json) {
          connectedProgram.push(json);
        }
        // Mover al siguiente bloque en la cadena
        current = current.getNextBlock();
      }
      // Solo procesar el primer grupo conectado; los demás son bloques huérfanos
      break;
    }
    
    // DEBUG: Contar movimientos en programPlano
    const motionInProgram = connectedProgram.filter(item => 
      ['move_j', 'move_l', 'move_c'].includes(item.type) ||
      (item.type === 'move_sequence' && item.moves && item.moves.length > 0)
    ).length;
    console.log(`[GEN DEBUG] programPlano motion items = ${motionInProgram}`);
    
    // Actualizar los dropdowns de los bloques use_pose y use_point
    updatePosePointDropdowns();
    
    return connectedProgram;
  }
  
  /* SECCIÓN 016: Actualizar Dropdowns de Poses y Puntos */
  // Actualiza las opciones de los bloques use_pose y use_point cuando cambian las poses/puntos definidos
  function updatePosePointDropdowns() {
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
  
  /* SECCIÓN 017: Funciones Auxiliares (Matemáticas y Advertencias) */
  // Calcula la distancia euclidiana desde el origen
  function dist3(x, y, z) {
    return Math.sqrt((x || 0) ** 2 + (y || 0) ** 2 + (z || 0) ** 2);
  }
  
  // Comprueba si un punto está fuera del alcance definido para un robot específico
  function warnIfOutOfReach(robot, x, y, z) {
    const d = dist3(x, y, z);
    const limit = ROBOT_REACH_LIMITS[robot] || 0;
    return limit && d > limit ? { d, limit } : null;
  }

  /* SECCIÓN 018: Conversión de Ángulos Euler a Cuaternión */
  // Necesario para robots ABB
  function eulerToQuaternion(rx, ry, rz) {
    const degToRad = Math.PI / 180;
    const yaw = rz * degToRad;
    const pitch = ry * degToRad;
    const roll = rx * degToRad;
    const cy = Math.cos(yaw * 0.5);
    const sy = Math.sin(yaw * 0.5);
    const cp = Math.cos(pitch * 0.5);
    const sp = Math.sin(pitch * 0.5);
    const cr = Math.cos(roll * 0.5);
    const sr = Math.sin(roll * 0.5);
    const q = [
      (cr * cp * cy + sr * sp * sy),
      (sr * cp * cy - cr * sp * sy),
      (cr * sp * cy + sr * cp * sy),
      (cr * cp * sy - sr * sp * cy)
    ];
    return q.map(val => Number(val.toFixed(7)));
  }

  /* SECCIÓN 019: Detección y Visualización de Advertencias */
  // Revisa si un valor Y está peligrosamente cerca de 0 para advertir de singularidad
  function checkSingularityWarning(yValue) {
    if (yValue === null || typeof yValue === 'undefined') {
      return false;
    }
    return Math.abs(yValue) < SINGULARITY_THRESHOLD_Y_MM;
  }

  // Recorre todos los bloques de movimiento y aplica o limpia las advertencias de singularidad
  function updateBlockWarnings() {
    if (!workspace) return;
    const allBlocks = workspace.getAllBlocks(false);
    allBlocks.forEach(block => {
      try {
        if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_L) {
          const yVal = getVal(block, 'Y');
          if (checkSingularityWarning(yVal)) {
            block.setWarningText("Riesgo de Singularidad: Mover linealmente cerca de Y=0 puede causar un paro protector.");
          } else {
            block.setWarningText(null);
          }
        } else if (block.type === CONSTANTS.BLOCK_TYPES.MOVE_C) {
          const viaYVal = getVal(block, 'VIA_Y');
          const endYVal = getVal(block, 'END_Y');
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
  function updateToolWarnings() {
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

  /* SECCIÓN 023: Función Principal de Actualización de la Interfaz */
  // Se llama cada vez que hay un cambio en el workspace. Orquesta la regeneración de código y la actualización de la UI.
  function updateOutputs() {
    try {
      const robot = document.getElementById("robotSelect").value;
      const mode = document.getElementById("modeSelect").value;
      const program = workspaceToProgram();
      
      // DEBUG: Log program structure
      const programMotions = program.filter(item => 
        ['move_j', 'move_l', 'move_c'].includes(item.type)
      ).length;
      console.log(`[GEN DEBUG] program passed to generators has ${programMotions} motion blocks`);
      console.log(`[GEN DEBUG] program structure:`, JSON.stringify(program, null, 2).substring(0, 500));
      
      // 1. Actualizar JSON
      document.getElementById("jsonOutput").textContent = JSON.stringify(program, null, 2);
      
      // 2. Generar y mostrar el código en modo educativo.
      const codeEducativo = generateCodeForSelectedRobot(robot, program, CONSTANTS.MODES.EDUCATIONAL);
      const educMotions = (codeEducativo.match(/\b(?:movej|movel|movec)\s*\(/gi) || []).length;
      console.log(`[GEN DEBUG] Educational mode generated ${educMotions} motion commands`);
      document.getElementById("codeEducativo").textContent = codeEducativo;
      
      // 3. Generar y mostrar el código específico del robot para el modo industrial.
      const codeIndustrial = generateCodeForSelectedRobot(robot, program, CONSTANTS.MODES.INDUSTRIAL);
      const indMotions = (codeIndustrial.match(/\b(?:movej|movel|movec)\s*\(/gi) || []).length;
      console.log(`[GEN DEBUG] Industrial mode generated ${indMotions} motion commands`);
      document.getElementById("codeIndustrial").textContent = codeIndustrial;
      
      // 4. Actualizar el encabezado para mostrar el robot seleccionado.
      document.getElementById("robotHeader").textContent = `Robot: ${robot}`;

      // 5. Actualizar Advertencias en Bloques
      updateBlockWarnings();
      updateToolWarnings(); // Llamamos a la nueva función de advertencia de herramientas
      
      // Si el último cambio fue la selección de robot, refrescamos los bloques de herramienta.
      // Si es así, necesitamos actualizar las opciones del dropdown y la forma del bloque (TCP manual).
      const lastEvent = workspace.lastUndoStackOp;
      if (lastEvent && lastEvent.element === 'change' && lastEvent.name === 'robotSelect') {
        workspace.getAllBlocks(false).forEach(block => {
          if (block.type === 'set_tool') {
            const dropdown = block.getField('TOOL_ID');
            const currentValue = dropdown.getValue();
            // Forzamos la recarga de las opciones del dropdown y la actualización de la forma del bloque.
            // Esto es importante para que el dropdown muestre las opciones correctas para el nuevo robot
            // y para que los campos de TCP manual aparezcan/desaparezcan si es necesario.
            dropdown.getOptions(true); // 'true' para forzar la recarga de opciones
            block.updateShape_(currentValue === 'manual');
          }
        });
        // La función updateToolWarnings() ya se ha llamado antes para establecer el estado de advertencia.
      }
      
    } catch (e) {
      console.error("Error al actualizar:", e);
      document.getElementById("codeIndustrial").textContent = `Error al generar código:\n${e.message}`;
    }
  }

  /* SECCIÓN 024: Manejador de Redimensionamiento de Paneles */
  window.onPanelsResized = function() {
    try {
      workspace && Blockly.svgResize(workspace);
    } catch (e) { }
  };

  /* SECCIÓN  217: Inicialización Principal de Blockly */
  defineBlocks();
  workspace = Blockly.inject('blocklyDiv', {
    toolbox: document.getElementById('toolbox'),
    scrollbars: true,
    trashcan: true,
    zoom: { controls: true, wheel: true }
  });

  /* SECCIÓN 025: Listener de Cambios en el Workspace de Blockly */
  // Este es el "corazón" de la aplicación. Se activa con cualquier cambio en los bloques.
  workspace.addChangeListener((event) => {
    // Filtramos eventos de UI puros (como zoom, clic) que no cambian la lógica
    if (event.type == Blockly.Events.UI) {
      return;
    }
    try {
      updateOutputs();
    } catch (e) { }
  });

  /* SECCIÓN 026: Carga de Bloques de Ejemplo al Iniciar */
  // XML de ejemplo (con el nuevo bloque move_linear_block y un caso y=0)
  const exampleXML = `
  <xml xmlns="https://developers.google.com/blockly/xml">
    <block type="define_point" x="20" y="20">
      <field name="NAME">punto1</field>
      <value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="Y"><shadow type="math_number"><field name="NUM">300</field></shadow></value>
      <value name="Z"><shadow type="math_number"><field name="NUM">150</field></shadow></value>
      <next>
        <block type="move_block">
          <value name="TARGET">
            <block type="use_point">
              <field name="POINT_NAME"></field>
            </block>
          </value>
          <value name="SPEED"><shadow type="math_number"><field name="NUM">50</field></shadow></value>
          <next>
            <block type="wait_block">
              <value name="TIME"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
            </block>
          </next>
        </block>
      </next>
    </block>
  </xml>`;
  try {
    const xml = Blockly.utils.xml.textToDom(exampleXML);
    Blockly.Xml.domToWorkspace(xml, workspace);
  } catch (e) { console.error("Error al cargar XML de ejemplo", e); }
  
  /* SECCIÓN 027: Actualización Inicial de Salidas al Cargar la Página */
  updateOutputs(); // Primera ejecución al cargar

  /* SECCIÓN 028: Listeners para los Controles de la Interfaz de Usuario */
  // Función centralizada para manejar el cambio de robot
  function handleRobotChange() {
    // 1. Refrescar las opciones de los bloques de herramienta
    workspace.getAllBlocks(false).forEach(block => {
      if (block.type === 'set_tool') {
        const dropdown = block.getField('TOOL_ID');
        if (dropdown) {
          // Forzar la recarga de las opciones del desplegable.
          // Esto es crucial para que se muestren las herramientas compatibles con el nuevo robot.
          dropdown.getOptions(true); 
        }
      }
    });

    // 2. Una vez actualizados los bloques, generar todo el código de nuevo.
    updateOutputs();
  }

  // Asignar el manejador de eventos al selector de robot
  document.getElementById('robotSelect').addEventListener('change', handleRobotChange);
  document.getElementById('modeSelect').addEventListener('change', updateOutputs);
  document.getElementById('defaultSpeed').addEventListener('input', updateOutputs);

  /* SECCIÓN 029: Listener del Botón de Copiar Código */
  document.getElementById('copyBtn').addEventListener('click', async () => { const robot = document.getElementById("robotSelect").value, mode = document.getElementById("modeSelect").value, code = generateCodeForSelectedRobot(robot, workspaceToProgram(), mode); try { await navigator.clipboard.writeText(code); showToast("¡Código copiado al portapapeles!"); } catch (e) { showToast("Error al copiar: " + e.message); } });

  /* SECCIÓN 030: Listener del Botón de Simulación */
  // Prepara los datos del programa y los envía al simulador.
  document.getElementById('simulateBtn').addEventListener('click', () => {
    const program = workspaceToProgram();

    // Convertimos la estructura de objetos anidados a un array plano.
    // Esto es más seguro para pasar entre páginas.
    const flatProgram = [];
    function flatten(block) {
      if (!block) return;
      const { next, ...rest } = block; // Separa el bloque actual de su "siguiente"
      flatProgram.push(rest);          // Añade el bloque actual al array
      flatten(next);                   // Llama recursivamente a la función para el siguiente
    }
    program.forEach(flatten);

    if (flatProgram.length === 0) {
        showToast("No hay bloques para simular.");
        return;
    }

    // Guardamos el programa (ya plano) en el almacenamiento local para que simulator.html pueda leerlo.
    localStorage.setItem('robotProgramForSimulation', JSON.stringify(flatProgram));

    // Abrimos la página del simulador en una nueva pestaña
    window.open('simulator.html', '_blank');
  });

  /* SECCIÓN 031: Funciones de Guardar y Cargar Workspace */

  /**
   * Descarga el workspace actual como archivo XML
   */
  function downloadWorkspaceAsXML() {
    try {
      // Convertir el workspace a XML
      const xml = Blockly.Xml.workspaceToDom(workspace);
      const xmlText = Blockly.Xml.domToText(xml);
      
      // Crear un blob con el contenido XML
      const blob = new Blob([xmlText], { type: 'text/xml;charset=utf-8' });
      
      // Generar nombre de archivo con fecha y hora
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `robot_program_${timestamp}.xml`;
      
      // Crear enlace de descarga temporal
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      
      // Disparar la descarga
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Limpiar el objeto URL
      URL.revokeObjectURL(link.href);
      
      showToast(`Bloques guardados como "${filename}"`);
    } catch (e) {
      console.error("Error al guardar bloques:", e);
      showToast("Error al guardar bloques: " + e.message);
    }
  }

  /**
   * Carga bloques desde un archivo XML
   */
  function loadWorkspaceFromXML(file) {
    // Verificar que sea un archivo XML
    if (!file.name.endsWith('.xml')) {
      showToast("Por favor selecciona un archivo XML válido");
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const xmlText = e.target.result;
        
        // Validar que el contenido sea XML válido
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Verificar si hay errores de parseo
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
          throw new Error('El archivo XML está mal formado');
        }
        
        // Confirmar antes de sobrescribir
        const hasBlocks = workspace.getAllBlocks(false).length > 0;
        if (hasBlocks) {
          const confirmed = confirm(
            'Esto reemplazará todos los bloques actuales.\n\n' +
            '¿Estás seguro de que quieres continuar?'
          );
          if (!confirmed) {
            showToast("Carga cancelada");
            return;
          }
        }
        
        // Limpiar workspace actual
        workspace.clear();
        
        // Cargar los nuevos bloques
        const xml = Blockly.utils.xml.textToDom(xmlText);
        Blockly.Xml.domToWorkspace(xml, workspace);
        
        showToast(`Bloques cargados desde "${file.name}"`);
        
        // Actualizar las salidas de código
        updateOutputs();
        
      } catch (e) {
        console.error("Error al cargar bloques:", e);
        showToast("Error al cargar bloques: " + e.message);
      }
    };
    
    reader.onerror = function() {
      showToast("Error al leer el archivo");
    };
    
    // Leer el archivo como texto
    reader.readAsText(file);
  }

  /* SECCIÓN 032: Listeners de Botones de Guardar/Cargar */

  // Listener del Botón de Guardar Bloques
  document.getElementById('saveBtn').addEventListener('click', () => {
    const hasBlocks = workspace.getAllBlocks(false).length > 0;
    if (!hasBlocks) {
      showToast("No hay bloques para guardar");
      return;
    }
    downloadWorkspaceAsXML();
  });

  // Listener del Botón de Cargar Bloques
  document.getElementById('loadBtn').addEventListener('click', () => {
    // Disparar el selector de archivos
    document.getElementById('fileInput').click();
  });

  // Listener del Input de Archivo (oculto)
  document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      loadWorkspaceFromXML(file);
    }
    // Limpiar el input para permitir cargar el mismo archivo de nuevo
    event.target.value = '';
  });
});