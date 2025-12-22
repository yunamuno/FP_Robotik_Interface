/*═══════════════════════════════════════════════════════════════════════════════
  ORQUESTACIÓN PRINCIPAL - main.js
  
  Este archivo:
  - Inicializa toda la aplicación
  - Configura el workspace de Blockly
  - Gestiona eventos de la interfaz
  - Coordina actualizaciones de código
═══════════════════════════════════════════════════════════════════════════════*/

window.addEventListener('load', () => {
  /* Variable Global del Workspace */
  let workspace = null;

  /* Función Principal de Actualización de la Interfaz */
  function updateOutputs() {
    try {
      const robot = document.getElementById("robotSelect").value;
      const program = workspaceToProgram(workspace);
      
      // 1. Actualizar JSON
      document.getElementById("jsonOutput").textContent = JSON.stringify(program, null, 2);
      
      // 2. Generar y mostrar el código en modo educativo
      document.getElementById("codeEducativo").textContent = generateCodeForSelectedRobot(robot, program, CONSTANTS.MODES.EDUCATIONAL);
      
      // 3. Generar y mostrar el código específico del robot para el modo industrial
      // ✅ VOLVER A textContent (no innerHTML)
      document.getElementById("codeIndustrial").textContent = generateCodeForSelectedRobot(robot, program, CONSTANTS.MODES.INDUSTRIAL);
      
      // 4. Actualizar el encabezado para mostrar el robot seleccionado
      document.getElementById("robotHeader").textContent = `Robot: ${robot}`;

      // 5. Actualizar Advertencias en Bloques
      updateBlockWarnings(workspace);
      updateToolWarnings(workspace);
      
      // 6. ✅ NUEVO: Guardar automáticamente en localStorage para el simulador
      const flatProgram = [];
      function flatten(block) {
        if (!block) return;
        const { next, ...rest } = block;
        flatProgram.push(rest);
        flatten(next);
      }
      program.forEach(flatten);
      localStorage.setItem('robotProgramForSimulation', JSON.stringify(flatProgram));
      
      // Si el último cambio fue la selección de robot, refrescamos los bloques de herramienta
      const lastEvent = workspace.lastUndoStackOp;
      if (lastEvent && lastEvent.element === 'change' && lastEvent.name === 'robotSelect') {
        workspace.getAllBlocks(false).forEach(block => {
          if (block.type === 'set_tool') {
            const dropdown = block.getField('TOOL_ID');
            const currentValue = dropdown.getValue();
            dropdown.getOptions(true);
            block.updateShape_(currentValue === 'manual');
          }
        });
      }
      
    } catch (e) {
      console.error("Error al actualizar:", e);
      document.getElementById("codeIndustrial").textContent = `Error al generar código:\n${e.message}`;
    }
  }

  // ❌ ELIMINAR todas estas funciones si las añadiste:
  /*
  function generateCodeWithMarkers(robot, program, mode) { ... }
  function estimateLineCount(instr, robot, mode) { ... }
  function escapeHtml(text) { ... }
  function attachCodeClickHandlers() { ... }
  function highlightBlock(blockId) { ... }
  function clearBlockHighlight() { ... }
  function selectBlock(blockId) { ... }
  function highlightCodeForSelectedBlock(blockId) { ... }
  */

  /* Manejador de Redimensionamiento de Paneles */
  window.onPanelsResized = function() {
    try {
      workspace && Blockly.svgResize(workspace);
    } catch (e) { }
  };

  /* Inicialización de Splitters */
  initSplitters();
  initVerticalSplitter();

  /* Inicialización Principal de Blockly */
  defineBlocks();
  workspace = Blockly.inject('blocklyDiv', {
    toolbox: document.getElementById('toolbox'),
    scrollbars: true,
    trashcan: true,
    zoom: { controls: true, wheel: true }
  });

  /* Listener de Cambios en el Workspace de Blockly */
  workspace.addChangeListener((event) => {
    if (event.type == Blockly.Events.UI) {
      return;
    }
    try {
      updateOutputs();
    } catch (e) { }
  });
  
  // ❌ ELIMINAR este listener si lo añadiste:
  /*
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.SELECTED) {
      highlightCodeForSelectedBlock(event.newElementId);
    }
    
    if (event.type !== Blockly.Events.UI) {
      updateOutputs();
    }
  });
  */

  /* Carga de Bloques de Ejemplo al Iniciar */
  const exampleXML = `<xml xmlns="https://developers.google.com/blockly/xml"><block type="move_block" x="20" y="20"><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">300</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">150</field></shadow></value><value name="SPEED"><shadow type="math_number"><field name="NUM">50</field></shadow></value><next><block type="move_linear_block"><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">400</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">150</field></shadow></value><value name="SPEED"><shadow type="math_number"><field name="NUM">100</field></shadow></value><next><block type="wait_block"><value name="TIME"><shadow type="math_number"><field name="NUM">1</field></shadow></value><next><block type="move_linear_block"><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">150</field></shadow></value><value name="SPEED"><shadow type="math_number"><field name="NUM">100</field></shadow></value></block></next></block></next></block></next></block></xml>`;
  try {
    const xml = Blockly.utils.xml.textToDom(exampleXML);
    Blockly.Xml.domToWorkspace(xml, workspace);
  } catch (e) { console.error("Error al cargar XML de ejemplo", e); }
  
  /* Actualización Inicial de Salidas al Cargar la Página */
  updateOutputs();

  /* Listeners para los Controles de la Interfaz de Usuario */
  
  // Función centralizada para manejar el cambio de robot
  function handleRobotChange() {
    workspace.getAllBlocks(false).forEach(block => {
      if (block.type === 'set_tool') {
        const dropdown = block.getField('TOOL_ID');
        if (dropdown) {
          dropdown.getOptions(true); 
        }
      }
    });
    updateOutputs();
  }

  document.getElementById('robotSelect').addEventListener('change', handleRobotChange);
  // ❌ ELIMINAR ESTA LÍNEA:
  // document.getElementById('modeSelect').addEventListener('change', updateOutputs);
  document.getElementById('defaultSpeed').addEventListener('input', updateOutputs);

  /* Listener del Botón de Copiar Código */
  document.getElementById('copyBtn').addEventListener('click', async () => {
    const robot = document.getElementById("robotSelect").value;
    // ✅ Siempre usar modo INDUSTRIAL
    const code = generateCodeForSelectedRobot(robot, workspaceToProgram(workspace), CONSTANTS.MODES.INDUSTRIAL);
    try {
      await navigator.clipboard.writeText(code);
      showToast("¡Código copiado al portapapeles!");
    } catch (e) {
      showToast("Error al copiar: " + e.message);
    }
  });

  /* ✅ NUEVO: Listener del Botón de Descargar Código Industrial */
  document.getElementById('downloadCodeBtn').addEventListener('click', () => {
    const robot = document.getElementById("robotSelect").value;
    const program = workspaceToProgram(workspace);
    const code = generateCodeForSelectedRobot(robot, program, CONSTANTS.MODES.INDUSTRIAL);
    
    if (!code || code.trim() === '') {
      showToast("No hay código para descargar");
      return;
    }
    
    // Determinar la extensión del archivo según el robot
    let extension = '.txt';
    let prefix = 'program';
    
    if (robot === CONSTANTS.ROBOTS.UR3E) {
      extension = '.script';
      prefix = 'ur_program';
    } else if (robot === CONSTANTS.ROBOTS.ABB) {
      extension = '.mod';
      prefix = 'abb_program';
    } else if (robot === CONSTANTS.ROBOTS.FANUC) {
      extension = '.ls';
      prefix = 'fanuc_program';
    }
    
    // Crear blob y descargar
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${prefix}_${timestamp}${extension}`;
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(link.href);
    showToast(`Código descargado: ${filename}`);
  });

  /* Listener del Botón de Simulación */
  document.getElementById('simulateBtn').addEventListener('click', () => {
    const program = workspaceToProgram(workspace);

    // Verificar que hay bloques
    const flatProgram = [];
    function flatten(block) {
      if (!block) return;
      const { next, ...rest } = block;
      flatProgram.push(rest);
      flatten(next);
    }
    program.forEach(flatten);

    if (flatProgram.length === 0) {
        showToast("No hay bloques para simular.");
        return;
    }

    // ✅ Ya no guardamos aquí porque updateOutputs() lo hace automáticamente
    // Simplemente abrimos el simulador
    window.open('simulator.html', '_blank');
    showToast("✅ Simulador abierto. Los cambios se sincronizan automáticamente.");
  });

  /* Listener del Botón de Guardar Bloques */
  document.getElementById('saveBtn').addEventListener('click', () => {
    const hasBlocks = workspace.getAllBlocks(false).length > 0;
    if (!hasBlocks) {
      showToast("No hay bloques para guardar");
      return;
    }
    downloadWorkspaceAsXML(workspace);
  });

  /* Listener del Botón de Cargar Bloques */
  document.getElementById('loadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  /* Listener del Input de Archivo (oculto) */
  document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      loadWorkspaceFromXML(file, workspace, updateOutputs);
    }
    event.target.value = '';
  });
});
