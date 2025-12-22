/**
 * ============================================================================
 * UI.JS - MANEJO DE INTERFAZ DE USUARIO
 * ============================================================================
 * Este archivo contiene las funciones relacionadas con la interfaz de usuario:
 * - Mensajes toast (notificaciones temporales)
 * - Splitters horizontales y verticales para redimensionar paneles
 * - Funciones de guardado y carga de workspace (XML)
 */

/**
 * Muestra un mensaje temporal (toast) en la pantalla
 * @param {string} message - El mensaje a mostrar
 */
function showToast(message) {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => { t.classList.remove("show"); }, 3000);
}

/**
 * Inicializa los divisores de paneles horizontales (splitters)
 * Permite redimensionar los paneles principales arrastrando los divisores
 */
function initSplitters() {
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
}

/**
 * Inicializa el splitter vertical entre Modo Educativo y Modo Industrial
 * Permite redimensionar independientemente los paneles de código
 */
function initVerticalSplitter() {
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
}

/**
 * Descarga el workspace actual como archivo XML
 * @param {Object} workspace - El workspace de Blockly a exportar
 */
function downloadWorkspaceAsXML(workspace) {
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
 * Carga bloques desde un archivo XML al workspace
 * @param {File} file - El archivo XML a cargar
 * @param {Object} workspace - El workspace de Blockly donde cargar los bloques
 * @param {Function} updateCallback - Función callback a ejecutar después de cargar (ej: updateOutputs)
 */
function loadWorkspaceFromXML(file, workspace, updateCallback) {
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
      
      // Actualizar las salidas de código (si se proporciona callback)
      if (updateCallback && typeof updateCallback === 'function') {
        updateCallback();
      }
      
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
