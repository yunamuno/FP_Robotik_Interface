/**
 * ============================================================================
 * UI.JS - MANEJO DE INTERFAZ DE USUARIO
 * ============================================================================
 * Este archivo contiene las funciones relacionadas con la interfaz de usuario:
 * - Mensajes toast (notificaciones temporales)
 * - Splitters horizontales y verticales para redimensionar paneles
 * - Funciones de guardado y carga de workspace (XML)
 * - Toggle para mostrar/ocultar panel JSON
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

async function saveTextFileWithPicker(filename, content, mimeType) {
  if (typeof window.showSaveFilePicker !== 'function') {
    return { saved: false, usedPicker: false, cancelled: false };
  }

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: 'Archivo XML de Blockly',
          accept: {
            'application/xml': ['.xml']
          }
        }
      ]
    });

    const writable = await handle.createWritable();
    await writable.write({ type: 'write', data: content });
    await writable.close();

    return { saved: true, usedPicker: true, cancelled: false, handle };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { saved: false, usedPicker: true, cancelled: true };
    }
    throw error;
  }
}

function downloadTextFileFallback(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(link.href);
}

/**
 * Inicializa el toggle para mostrar/ocultar el panel JSON
 */
function initJsonPanelToggle() {
  const toggleCheckbox = document.getElementById('toggleJsonPanel');
  const jsonPanel = document.getElementById('panel-3');
  
  if (!toggleCheckbox || !jsonPanel) return;

  jsonPanel.classList.toggle('hidden', !toggleCheckbox.checked);
  
  toggleCheckbox.addEventListener('change', function() {
    jsonPanel.classList.toggle('hidden', !toggleCheckbox.checked);
    if (toggleCheckbox.checked) {
      jsonPanel.style.flex = '0 1 400px';
    }
    
    // Forzar redimensionamiento de Blockly
    if (typeof window.onPanelsResized === 'function') {
      window.onPanelsResized();
    }
  });
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
async function downloadWorkspaceAsXML(workspace) {
  try {
    // Convertir el workspace a XML
    const xml = Blockly.Xml.workspaceToDom(workspace);

    const PROGRAM_SNAPSHOT_STORAGE_KEY = 'fp_program_snapshot_id';
    const SNAPSHOT_ID_STORAGE_KEY = 'fp_snapshot_id';
    const SNAPSHOT_SHORT_STORAGE_KEY = 'fp_snapshot_short';
    const UR_INSTRUMENTATION_KEY = 'ur_instrumentation_enabled';
    const UR_SOCKET_IP_KEY = 'fp_socket_ip';
    const UR_SOCKET_PORT_KEY = 'fp_socket_port';

    // ✅ Leer nombre del programa una sola vez (usado tanto para el atributo como para el nombre de archivo)
    const programNameInput = document.getElementById('programName');
    const activeName = (programNameInput?.value || '').trim();
    const robotSelect = document.getElementById('robotSelect');
    const selectedRobot = String(robotSelect?.value || '').trim();
    const instrumentationToggle = document.getElementById('urInstrumentationToggle');
    const instrumentationEnabled = instrumentationToggle
      ? instrumentationToggle.checked === true
      : localStorage.getItem(UR_INSTRUMENTATION_KEY) === 'true';

    function parseSnapshotFromIndustrialCode() {
      const codeEl = document.getElementById('codeIndustrial');
      const code = String(codeEl?.textContent || '');
      const idMatch = code.match(/#\s*snapshot_id\s*=\s*([^\r\n]+)/i);
      const shortMatch = code.match(/#\s*snapshot_short\s*=\s*(\d+)/i);
      const parsedId = String(idMatch?.[1] || '').trim();
      const parsedShort = Number(shortMatch?.[1]);
      return {
        snapshot_id: parsedId || null,
        snapshot_short: Number.isFinite(parsedShort) ? (parsedShort & 0xFFFF) : null
      };
    }

    const metaFromMain = (typeof window.getActiveProgramSnapshotMeta === 'function')
      ? (window.getActiveProgramSnapshotMeta() || {})
      : {};
    const metaFromCode = parseSnapshotFromIndustrialCode();
    const storedSnapshotId = String(
      localStorage.getItem(PROGRAM_SNAPSHOT_STORAGE_KEY)
      || localStorage.getItem(SNAPSHOT_ID_STORAGE_KEY)
      || ''
    ).trim();

    const resolvedSnapshotId = String(
      metaFromMain.program_snapshot_id
      || metaFromMain.snapshot_id
      || metaFromCode.snapshot_id
      || storedSnapshotId
      || ''
    ).trim();

    const resolvedSnapshotShortRaw = Number(
      metaFromMain.snapshot_short
      ?? metaFromCode.snapshot_short
      ?? localStorage.getItem(SNAPSHOT_SHORT_STORAGE_KEY)
    );

    // snapshot_short es válido solo si es finito, >0 y <=65535.
    // Number(null) y Number('') devuelven 0 (no válido), por tanto
    // en esos casos se intenta calcular desde snapshot_id.
    const resolvedSnapshotShortValid = Number.isFinite(resolvedSnapshotShortRaw)
      && resolvedSnapshotShortRaw > 0
      && resolvedSnapshotShortRaw <= 65535;

    const resolvedSnapshotShort = resolvedSnapshotShortValid
      ? (resolvedSnapshotShortRaw & 0xFFFF)
      : (resolvedSnapshotId && typeof window.computeSnapshotShortId === 'function'
          ? (() => {
              const computed = Number(window.computeSnapshotShortId(resolvedSnapshotId));
              return (Number.isFinite(computed) && computed > 0) ? (computed & 0xFFFF) : null;
            })()
          : null);

    const hasValidSnapshotId = Boolean(resolvedSnapshotId);
    const hasValidSnapshotShort = Number.isFinite(resolvedSnapshotShort)
      && resolvedSnapshotShort > 0
      && resolvedSnapshotShort <= 65535;
    const includeSnapshotMetadata = instrumentationEnabled && hasValidSnapshotId;

    const socketHost = String(localStorage.getItem(UR_SOCKET_IP_KEY) || '').trim();
    const socketPortRaw = Number(localStorage.getItem(UR_SOCKET_PORT_KEY));
    const socketPort = Number.isFinite(socketPortRaw) && socketPortRaw > 0 && socketPortRaw <= 65535
      ? socketPortRaw
      : null;
    const socketLabel = (socketHost && Number.isFinite(socketPort))
      ? `${socketHost}:${socketPort}`
      : 'null';

    // ✅ Persistir el nombre humano del programa como atributo en el XML
    if (activeName) {
      xml.setAttribute('program_name', activeName);
    }

    if (selectedRobot) {
      xml.setAttribute('robot', selectedRobot);
    }

    xml.setAttribute('instrumentation_enabled', instrumentationEnabled ? 'true' : 'false');

    if (includeSnapshotMetadata) {
      xml.setAttribute('program_snapshot_id', resolvedSnapshotId);
      xml.setAttribute('snapshot_id', resolvedSnapshotId);

      if (hasValidSnapshotShort) {
        xml.setAttribute('snapshot_short', String(resolvedSnapshotShort));
      }

      if (socketHost) {
        xml.setAttribute('telemetry_socket_host', socketHost);
      }
      if (Number.isFinite(socketPort)) {
        xml.setAttribute('telemetry_socket_port', String(socketPort));
      }

      console.log(
        `[XML SAVE INSTRUMENTATION] enabled=true snapshot_id=${resolvedSnapshotId} ` +
        `snapshot_short=${hasValidSnapshotShort ? resolvedSnapshotShort : 'null'} socket=${socketLabel}`
      );
    } else {
      xml.removeAttribute('program_snapshot_id');
      xml.removeAttribute('snapshot_id');
      xml.removeAttribute('snapshot_short');
      xml.removeAttribute('telemetry_socket_host');
      xml.removeAttribute('telemetry_socket_port');

      if (instrumentationEnabled) {
        console.log('[XML SAVE INSTRUMENTATION] enabled=true but no valid snapshot_id; snapshot metadata not written');
      } else {
        console.log('[XML SAVE INSTRUMENTATION] enabled=false; snapshot metadata omitted');
      }
    }

    console.log(
      `[XML SAVE] program_name=${activeName || '-'} robot=${selectedRobot || '-'} ` +
      `instrumentation_enabled=${instrumentationEnabled} ` +
      `snapshot_id=${includeSnapshotMetadata ? resolvedSnapshotId : '-'} ` +
      `snapshot_short=${includeSnapshotMetadata && hasValidSnapshotShort ? resolvedSnapshotShort : '-'}`
    );

    const xmlText = Blockly.Xml.domToText(xml);
    
    // Generar nombre de archivo: priorizar nombre humano del programa
    let filename;
    if (activeName) {
      const safe = activeName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_').replace(/[. ]+$/g, '');
      filename = `${safe || 'programa'}.xml`;
    } else {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
      filename = `robot_program_${timestamp}.xml`;
    }
    
    const saveResult = await saveTextFileWithPicker(filename, xmlText, 'application/xml;charset=utf-8');
    if (saveResult.cancelled) {
      return;
    }

    if (saveResult.saved) {
      showToast(`Bloques guardados como "${filename}"`);
      return;
    }

    console.warn('[XML SAVE FALLBACK] File System Access API no disponible; el navegador puede descargar una copia como "(1)" si ya existe un archivo con ese nombre.');
    downloadTextFileFallback(filename, xmlText, 'application/xml;charset=utf-8');
    showToast(`Bloques guardados como "${filename}" (descarga clásica; el navegador puede crear una copia tipo (1)).`);
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
 * @param {Function} [onNameResolved] - Opcional. Recibe el nombre del programa extraído del XML
 *   (o el nombre del archivo sin extensión como fallback). Úsalo para actualizar el campo #programName.
 * @param {Function} [onSnapshotResolved] - Opcional. Recibe metadatos de snapshot extraídos del XML.
 */
function loadWorkspaceFromXML(file, workspace, updateCallback, onNameResolved, onSnapshotResolved) {
  // Verificar que sea un archivo XML
  if (!file.name.endsWith('.xml')) {
    showToast("Por favor selecciona un archivo XML válido");
    return;
  }
  
  const reader = new FileReader();

  function isXmlDebugEnabled() {
    try {
      return localStorage.getItem('fp_debug') === 'true';
    } catch (error) {
      return false;
    }
  }

  function xmlDebugLog(message) {
    if (isXmlDebugEnabled()) {
      console.log(message);
    }
  }

  function captureXmlFieldState(xmlRoot) {
    const captured = [];
    if (!xmlRoot || typeof xmlRoot.querySelectorAll !== 'function') return captured;

    // Incluir tanto <block> como <shadow> para capturar bloques dinámicos
    // dentro de inputs de palletize_block (que usan <shadow>)
    const blockNodes = xmlRoot.querySelectorAll('block, shadow');
    blockNodes.forEach((blockNode) => {
      const blockId = blockNode.getAttribute('id') || '';
      const blockType = blockNode.getAttribute('type') || '';
      Array.from(blockNode.childNodes || []).forEach((childNode) => {
        if (!childNode || childNode.nodeType !== 1) return;
        if (String(childNode.tagName || '').toLowerCase() !== 'field') return;

        const fieldName = childNode.getAttribute('name') || '';
        const fieldValue = String(childNode.textContent || '');
        if (!blockId || !fieldName) return;

        captured.push({
          blockId,
          blockType,
          fieldName,
          fieldValue
        });
        xmlDebugLog(`[XML DROPDOWN CAPTURE] block=${blockType || '-'} id=${blockId} field=${fieldName} value=${fieldValue}`);

        if (
          blockType === 'palletize_block'
          || blockType === 'use_pose'
          || blockType === 'use_point'
          || blockType === 'use_frame'
          || blockType === 'set_tool'
        ) {
          xmlDebugLog(`[XML FIELD RAW] blockType=${blockType} blockId=${blockId} field=${fieldName} value=${fieldValue}`);
        }
      });
    });

    return captured;
  }

  function getPalletChildFieldName(childType) {
    if (childType === 'use_pose') return 'POSE_NAME';
    if (childType === 'use_point') return 'POINT_NAME';
    if (childType === 'use_frame') return 'FRAME_NAME';
    return '';
  }

  function getDirectChildBlockNode(valueNode) {
    if (!valueNode) return null;
    const children = Array.from(valueNode.childNodes || []).filter((node) => node && node.nodeType === 1);

    const directBlock = children.find((node) => String(node.tagName || '').toLowerCase() === 'block');
    if (directBlock) return directBlock;

    const shadowNode = children.find((node) => String(node.tagName || '').toLowerCase() === 'shadow');
    if (!shadowNode) return null;

    const shadowChildren = Array.from(shadowNode.childNodes || []).filter((node) => node && node.nodeType === 1);
    const nestedBlock = shadowChildren.find((node) => String(node.tagName || '').toLowerCase() === 'block');
    return nestedBlock || shadowNode;
  }

  function getDirectFieldValue(blockNode, fieldName) {
    if (!blockNode) return '';
    const fieldNodes = Array.from(blockNode.childNodes || []).filter((node) => {
      if (!node || node.nodeType !== 1) return false;
      return String(node.tagName || '').toLowerCase() === 'field';
    });

    if (fieldName) {
      const byName = fieldNodes.find((node) => String(node.getAttribute('name') || '') === String(fieldName));
      if (byName) return String(byName.textContent || '');
    }

    const fallback = fieldNodes[0] || null;
    return fallback ? String(fallback.textContent || '') : '';
  }

  function capturePalletizeInputsFromXml(xmlRoot) {
    const captured = [];
    if (!xmlRoot || typeof xmlRoot.querySelectorAll !== 'function') return captured;

    const palletInputs = ['PICK_POS', 'PALLET_P1', 'PALLET_P2', 'PALLET_P3'];
    const palletNodes = xmlRoot.querySelectorAll('block[type="palletize_block"]');

    palletNodes.forEach((palletNode) => {
      const palletBlockId = String(palletNode.getAttribute('id') || '').trim();
      if (!palletBlockId) return;

      const valueNodes = Array.from(palletNode.childNodes || []).filter((node) => {
        if (!node || node.nodeType !== 1) return false;
        return String(node.tagName || '').toLowerCase() === 'value';
      });

      palletInputs.forEach((inputName) => {
        const valueNode = valueNodes.find((node) => String(node.getAttribute('name') || '') === inputName);
        if (!valueNode) return;

        const childBlockNode = getDirectChildBlockNode(valueNode);
        if (!childBlockNode) return;

        const childType = String(childBlockNode.getAttribute('type') || '').trim();
        const childFieldName = getPalletChildFieldName(childType);
        const childFieldValue = getDirectFieldValue(childBlockNode, childFieldName);

        captured.push({
          palletBlockId,
          inputName,
          childType,
          childFieldName,
          childFieldValue
        });

        xmlDebugLog(
          `[XML PALLET CAPTURE] pallet=${palletBlockId} input=${inputName} ` +
          `child=${childType || '(none)'} field=${childFieldName || '(none)'} value=${childFieldValue}`
        );
      });
    });

    return captured;
  }

  function getDropdownOptions(field) {
    if (!field) return [];
    try {
      if (typeof field.getOptions === 'function') {
        const options = field.getOptions(true);
        if (Array.isArray(options)) return options.slice();
      }
    } catch (error) {
      // Ignorar: algunos FieldDropdown pueden lanzar mientras reconstruyen opciones.
    }

    if (Array.isArray(field.menuGenerator_)) {
      return field.menuGenerator_.slice();
    }

    return [];
  }

  function ensureDropdownOption(field, savedValue, fieldName) {
    if (!field) return false;
    const normalizedValue = String(savedValue ?? '');
    if (!normalizedValue) return false;

    const options = getDropdownOptions(field);
    const exists = options.some((option) => Array.isArray(option) && String(option[1]) === normalizedValue);
    if (exists) return true;

    const nextOptions = options.concat([[normalizedValue, normalizedValue]]);
    field.menuGenerator_ = nextOptions;
    xmlDebugLog(`[XML DROPDOWN FALLBACK] added missing option field=${fieldName} value=${normalizedValue}`);
    return true;
  }

  function getCapturedFieldValue(capturedFields, blockId, fieldName) {
    if (!Array.isArray(capturedFields) || !blockId || !fieldName) return null;
    const found = capturedFields.find((entry) =>
      String(entry?.blockId || '') === String(blockId)
      && String(entry?.fieldName || '') === String(fieldName)
    );
    return found ? String(found.fieldValue ?? '') : null;
  }

  function restoreDynamicDropdownField(block, fieldName, savedValue, targetWorkspace) {
    if (!block || !fieldName) return false;
    const field = block.getField(fieldName);
    if (!field) return false;

    const normalizedValue = String(savedValue ?? '').trim();
    if (!normalizedValue) return false;

    const optionsBefore = getDropdownOptions(field);
    const hasValueBefore = optionsBefore.some((option) => Array.isArray(option) && String(option[1]) === normalizedValue);
    const isSentinel = normalizedValue.toUpperCase() === 'NONE' || normalizedValue === '__none__';
    if (isSentinel && !hasValueBefore) {
      return false;
    }

    if (!hasValueBefore) {
      ensureDropdownOption(field, normalizedValue, fieldName);
    }

    let restored = false;
    try {
      field.setValue(normalizedValue);
      restored = String(field.getValue ? field.getValue() : '') === normalizedValue;
    } catch (error) {
      restored = false;
    }

    if (!restored) {
      ensureDropdownOption(field, normalizedValue, fieldName);
      try {
        field.setValue(normalizedValue);
        restored = String(field.getValue ? field.getValue() : '') === normalizedValue;
      } catch (error) {
        restored = false;
      }
    }

    try {
      field.forceRerender?.();
      block.render?.();
      targetWorkspace?.render?.();
    } catch (error) {
      // Rerender opcional.
    }

    return restored;
  }

  function restorePalletizeInputsFromCapturedXml(targetWorkspace, capturedPalletInputs) {
    if (!targetWorkspace) return;
    if (!Array.isArray(capturedPalletInputs) || capturedPalletInputs.length === 0) return;

    capturedPalletInputs.forEach((entry) => {
      const palletBlockId = String(entry?.palletBlockId || '').trim();
      const inputName = String(entry?.inputName || '').trim();
      const expectedValue = String(entry?.childFieldValue ?? '');
      if (!palletBlockId || !inputName) return;

      const palletBlock = targetWorkspace.getBlockById(palletBlockId);
      if (!palletBlock || palletBlock.type !== 'palletize_block') {
        xmlDebugLog(
          `[XML PALLET RESTORE] pallet=${palletBlockId} input=${inputName} ` +
          `child=${entry?.childType || '(none)'} field=${entry?.childFieldName || '(none)'} ` +
          `expected=${expectedValue} actual= ok=false`
        );
        return;
      }

      const child = palletBlock.getInputTargetBlock(inputName);
      if (!child) {
        xmlDebugLog(
          `[XML PALLET RESTORE] pallet=${palletBlockId} input=${inputName} ` +
          `child=(none) field=${entry?.childFieldName || '(none)'} expected=${expectedValue} actual= ok=false`
        );
        return;
      }

      const fieldName = getPalletChildFieldName(child.type);
      if (!fieldName) {
        xmlDebugLog(
          `[XML PALLET RESTORE] pallet=${palletBlockId} input=${inputName} ` +
          `child=${child.type} field=(none) expected=${expectedValue} actual= ok=false`
        );
        return;
      }

      const ok = restoreDynamicDropdownField(child, fieldName, expectedValue, targetWorkspace);
      const actualValue = String(child.getField(fieldName)?.getValue?.() ?? '');

      try {
        child.render?.();
        palletBlock.render?.();
      } catch (error) {
        // Ignorar: render opcional.
      }

      xmlDebugLog(
        `[XML PALLET RESTORE] pallet=${palletBlockId} input=${inputName} ` +
        `child=${child.type} field=${fieldName} expected=${expectedValue} actual=${actualValue} ok=${ok && actualValue === expectedValue}`
      );
    });

    try {
      targetWorkspace.render?.();
    } catch (error) {
      // Ignorar si render no está disponible.
    }
  }

  function restoreCapturedFieldState(targetWorkspace, capturedFields, options = {}) {
    if (!targetWorkspace || !Array.isArray(capturedFields) || capturedFields.length === 0) return;

    const emitSummary = options.emitSummary !== false;
    let restoredCount = 0;
    let failedCount = 0;

    capturedFields.forEach((entry) => {
      const block = targetWorkspace.getBlockById(entry.blockId);
      if (!block) {
        failedCount += 1;
        xmlDebugLog(`[XML DROPDOWN RESTORE] block=${entry.blockType || '-'} id=${entry.blockId} field=${entry.fieldName} value=${entry.fieldValue} ok=false`);
        return;
      }

      const field = block.getField(entry.fieldName);
      if (!field) {
        failedCount += 1;
        xmlDebugLog(`[XML DROPDOWN RESTORE] block=${entry.blockType || block.type || '-'} id=${entry.blockId} field=${entry.fieldName} value=${entry.fieldValue} ok=false`);
        return;
      }

      let restored = false;
      try {
        field.setValue(entry.fieldValue);
        restored = String(field.getValue ? field.getValue() : '') === String(entry.fieldValue);
      } catch (error) {
        restored = false;
      }

      if (!restored) {
        ensureDropdownOption(field, entry.fieldValue, entry.fieldName);
        try {
          field.setValue(entry.fieldValue);
          restored = String(field.getValue ? field.getValue() : '') === String(entry.fieldValue);
        } catch (error) {
          restored = false;
        }
      }

      if (restored && typeof block.updateTooltip_ === 'function') {
        try {
          block.updateTooltip_(entry.fieldValue);
        } catch (error) {
          // Tooltip opcional, no bloquear restauración.
        }
      }

      if (restored) {
        restoredCount += 1;
      } else {
        failedCount += 1;
      }
      xmlDebugLog(`[XML DROPDOWN RESTORE] block=${entry.blockType || block.type || '-'} id=${entry.blockId} field=${entry.fieldName} value=${entry.fieldValue} ok=${restored}`);
    });

    if (emitSummary) {
      console.log(`[XML DROPDOWN RESTORE] completed restored=${restoredCount} failed=${failedCount}`);
    }
  }

  function getRelevantFieldNames(blockType) {
    if (blockType === 'use_pose') return ['POSE_NAME'];
    if (blockType === 'use_point') return ['POINT_NAME'];
    if (blockType === 'use_frame') return ['FRAME_NAME'];
    if (blockType === 'set_tool') return ['TOOL_ID'];
    if (blockType === 'palletize_block') return [];
    return [];
  }

  function collectBlockFields(block) {
    if (!block) return [];
    const fieldNames = getRelevantFieldNames(block.type);
    if (fieldNames.length > 0) {
      return fieldNames
        .map((name) => {
          const field = block.getField(name);
          if (!field) return null;
          let value = '';
          try {
            value = String(field.getValue ? field.getValue() : '');
          } catch (error) {
            value = '';
          }
          return { name, value };
        })
        .filter(Boolean);
    }

    // Fallback para bloques sin lista explícita: inspeccionar inputList
    const scanned = [];
    (block.inputList || []).forEach((input) => {
      (input.fieldRow || []).forEach((field) => {
        const name = field?.name;
        if (!name) return;
        let value = '';
        try {
          value = String(field.getValue ? field.getValue() : '');
        } catch (error) {
          value = '';
        }
        scanned.push({ name, value });
      });
    });
    return scanned;
  }

  function logWorkspaceRelevantFields(targetWorkspace, stageLabel) {
    if (!targetWorkspace) return;
    const relevantTypes = new Set(['palletize_block', 'use_pose', 'use_point', 'use_frame', 'set_tool']);

    targetWorkspace.getAllBlocks(false).forEach((block) => {
      if (!relevantTypes.has(block.type)) return;
      const fields = collectBlockFields(block);
      if (fields.length === 0) {
        console.log(`[${stageLabel}] blockType=${block.type} blockId=${block.id} field=(none) value=`);
      } else {
        fields.forEach((entry) => {
          console.log(`[${stageLabel}] blockType=${block.type} blockId=${block.id} field=${entry.name} value=${entry.value}`);
        });
      }
    });
  }

  function logPalletizeInputs(targetWorkspace) {
    if (!targetWorkspace) return;
    const palletInputs = ['PICK_POS', 'PALLET_P1', 'PALLET_P2', 'PALLET_P3'];

    targetWorkspace.getAllBlocks(false).forEach((block) => {
      if (block.type !== 'palletize_block') return;

      palletInputs.forEach((inputName) => {
        const child = block.getInputTargetBlock(inputName);
        if (!child) {
          xmlDebugLog(`[PALLET INPUT] input=${inputName} childType=(none) childId=(none) fields=[]`);
          return;
        }

        const childFields = collectBlockFields(child)
          .map((entry) => `${entry.name}:${entry.value}`)
          .join(', ');
        xmlDebugLog(`[PALLET INPUT] input=${inputName} childType=${child.type} childId=${child.id} fields=[${childFields}]`);
      });
    });
  }

  function buildPendingXmlDropdownValues(capturedFields) {
    const pending = {};
    if (!Array.isArray(capturedFields)) return pending;

    capturedFields.forEach((entry) => {
      const blockId = String(entry?.blockId || '').trim();
      const fieldName = String(entry?.fieldName || '').trim();
      if (!blockId || !fieldName) return;
      if (!pending[blockId]) pending[blockId] = {};
      pending[blockId][fieldName] = String(entry?.fieldValue ?? '');
    });

    return pending;
  }
  
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
      
      const capturedFields = captureXmlFieldState(xmlDoc);
      const capturedPalletInputs = capturePalletizeInputsFromXml(xmlDoc);
      const pendingXmlDropdownValues = buildPendingXmlDropdownValues(capturedFields);
      const instrumentationToggle = document.getElementById('urInstrumentationToggle');
      const xmlUrInstrumentationRaw = String(
        xmlDoc?.documentElement?.getAttribute('instrumentation_enabled')
        || xmlDoc?.documentElement?.getAttribute('ur_instrumentation_enabled')
        || xmlDoc?.documentElement?.getAttribute('ur_instrumentation')
        || ''
      ).trim().toLowerCase();
      const hasXmlUrInstrumentation = xmlUrInstrumentationRaw === 'true' || xmlUrInstrumentationRaw === 'false';

      const legacySnapshotId = String(
        xmlDoc?.documentElement?.getAttribute('program_snapshot_id')
        || xmlDoc?.documentElement?.getAttribute('snapshot_id')
        || ''
      ).trim();
      const legacySnapshotShortRaw = Number(xmlDoc?.documentElement?.getAttribute('snapshot_short'));
      const legacyHasSnapshotMetadata = Boolean(legacySnapshotId)
        || (Number.isFinite(legacySnapshotShortRaw) && legacySnapshotShortRaw > 0);

      const storedUrInstrumentationRaw = localStorage.getItem('ur_instrumentation_enabled');
      const hasStoredUrInstrumentation = storedUrInstrumentationRaw === 'true' || storedUrInstrumentationRaw === 'false';
      const currentToggleUrInstrumentation = instrumentationToggle ? instrumentationToggle.checked === true : false;

      const hasToggleUrInstrumentation = Boolean(instrumentationToggle);
      let instrumentationSource = 'default';
      let desiredUrInstrumentation = false;
      if (hasXmlUrInstrumentation) {
        desiredUrInstrumentation = xmlUrInstrumentationRaw === 'true';
        instrumentationSource = 'xml';
      } else if (legacyHasSnapshotMetadata) {
        desiredUrInstrumentation = true;
        instrumentationSource = 'legacy';
      } else if (hasStoredUrInstrumentation) {
        desiredUrInstrumentation = storedUrInstrumentationRaw === 'true';
        instrumentationSource = 'localStorage';
      } else if (hasToggleUrInstrumentation) {
        desiredUrInstrumentation = currentToggleUrInstrumentation;
        instrumentationSource = 'toggle';
      }

      window.__fpLoadingWorkspaceFromXml = true;
      window.__fpSuppressUpdateOutputsDuringXmlLoad = true;
      window.__fpSuppressInstrumentationToggleUpdateDuringXmlLoad = true;
      window.__fpPendingUpdateOutputsAfterXmlLoad = false;
      window.__fpSuppressedUpdateOutputsCount = 0;
      window.__fpSuppressRegistryRebuildDuringXmlLoad = true;
      window.__fpPendingXmlDropdownValues = pendingXmlDropdownValues;

      let xmlLoadChangeListenerAttached = false;
      let xmlLoadCleaned = false;

      const cleanupXmlLoadFlags = (options = {}) => {
        if (xmlLoadCleaned) return;
        xmlLoadCleaned = true;
        if (xmlLoadChangeListenerAttached && typeof workspace.removeChangeListener === 'function') {
          workspace.removeChangeListener(xmlLoadChangeListener);
        }

        const keepUpdateSuppressed = options.keepUpdateSuppressed === true;
        if (!keepUpdateSuppressed) {
          window.__fpSuppressUpdateOutputsDuringXmlLoad = false;
          window.__fpSuppressInstrumentationToggleUpdateDuringXmlLoad = false;
          window.__fpPendingUpdateOutputsAfterXmlLoad = false;
          window.__fpLoadingWorkspaceFromXml = false;
          window.__fpPendingXmlDropdownValues = null;
          window.__fpSuppressRegistryRebuildDuringXmlLoad = false;
        }
      };

      const xmlLoadChangeListener = (event) => {
        if (!event) return;
        const isChangeEvent = (
          event.type === Blockly.Events.BLOCK_CHANGE
          || event.type === Blockly.Events.CHANGE
          || String(event.type).toLowerCase() === 'change'
        );
        if (!isChangeEvent) return;

        const changedFieldName = event.name || event.element;
        const isFieldChange = String(event.element || '').toLowerCase() === 'field' || Boolean(event.name);
        if (!isFieldChange) return;

        const block = event.blockId ? workspace.getBlockById(event.blockId) : null;
        const blockType = block?.type || '-';
        const oldValue = event.oldValue;
        const newValue = event.newValue;
        xmlDebugLog(`[XML FIELD CHANGE] block=${blockType} id=${event.blockId || '-'} field=${changedFieldName || '-'} old=${String(oldValue)} new=${String(newValue)} eventType=${event.type}`);
      };

      try {
        if (typeof workspace.addChangeListener === 'function') {
          workspace.addChangeListener(xmlLoadChangeListener);
          xmlLoadChangeListenerAttached = true;
        }

        // Limpiar workspace actual
        workspace.clear();
      
        // Construir estructura global de valores pendientes por tipo/field
        // antes de domToWorkspace para evitar warnings de dropdown
        window.__fpPendingXmlDropdownValuesByTypeField = {};

        function addPendingByTypeField(blockType, fieldName, fieldValue) {
          const bt = String(blockType || '').trim();
          const fn = String(fieldName || '').trim();
          const fv = String(fieldValue || '').trim();
          if (!bt || !fn || !fv) return;
          if (!window.__fpPendingXmlDropdownValuesByTypeField[bt]) {
            window.__fpPendingXmlDropdownValuesByTypeField[bt] = {};
          }
          if (!Array.isArray(window.__fpPendingXmlDropdownValuesByTypeField[bt][fn])) {
            window.__fpPendingXmlDropdownValuesByTypeField[bt][fn] = [];
          }
          if (!window.__fpPendingXmlDropdownValuesByTypeField[bt][fn].includes(fv)) {
            window.__fpPendingXmlDropdownValuesByTypeField[bt][fn].push(fv);
          }
        }

        // Fuente 1: campos capturados directamente desde <block> y <shadow>
        if (Array.isArray(capturedFields)) {
          capturedFields.forEach((entry) => {
            addPendingByTypeField(entry?.blockType, entry?.fieldName, entry?.fieldValue);
          });
        }

        // Fuente 2: inputs de palletize capturados (use_pose/use_point como <shadow>)
        // Garantiza que pick, place_p1, p2, p3... lleguen aunque no estuvieran en capturedFields
        if (Array.isArray(capturedPalletInputs)) {
          capturedPalletInputs.forEach((entry) => {
            addPendingByTypeField(entry?.childType, entry?.childFieldName, entry?.childFieldValue);
          });
        }

        if (isXmlDebugEnabled()) {
          Object.entries(window.__fpPendingXmlDropdownValuesByTypeField).forEach(([bt, fields]) => {
            Object.entries(fields).forEach(([fn, values]) => {
              console.log(`[XML DROPDOWN OPTIONS] block=${bt} field=${fn} pending=${values.join(',')}`);
            });
          });
        }

        // Cargar los nuevos bloques
        const xml = Blockly.utils.xml.textToDom(xmlText);
        Blockly.Xml.domToWorkspace(xml, workspace);
        if (isXmlDebugEnabled()) {
          logWorkspaceRelevantFields(workspace, 'XML AFTER DOM');
          logPalletizeInputs(workspace);
        }

        if (typeof window.rebuildSavedRegistriesFromWorkspace === 'function') {
          window.rebuildSavedRegistriesFromWorkspace(workspace);
        }
        if (isXmlDebugEnabled()) {
          logWorkspaceRelevantFields(workspace, 'XML AFTER REGISTRY');
          logPalletizeInputs(workspace);
        }
        if (typeof updatePosePointDropdowns === 'function') {
          updatePosePointDropdowns(workspace);
        }
        if (isXmlDebugEnabled()) {
          logWorkspaceRelevantFields(workspace, 'XML AFTER DROPDOWN UPDATE');
          logPalletizeInputs(workspace);
        }

        workspace.getAllBlocks(false).forEach((block) => {
          if (block.type === 'set_tool') {
            const dropdown = block.getField('TOOL_ID');
            if (dropdown && typeof dropdown.getOptions === 'function') {
              try {
                dropdown.getOptions(true);
              } catch (error) {
                // Ignorar refresco fallido puntual.
              }
            }
          }
        });

        restoreCapturedFieldState(workspace, capturedFields, { emitSummary: false });
        restorePalletizeInputsFromCapturedXml(workspace, capturedPalletInputs);
        if (isXmlDebugEnabled()) {
          logWorkspaceRelevantFields(workspace, 'XML AFTER RESTORE');
          logPalletizeInputs(workspace);
        }

        capturedFields.forEach((entry) => {
          const block = workspace.getBlockById(entry.blockId);
          const field = block?.getField?.(entry.fieldName);
          const actual = field?.getValue ? String(field.getValue()) : '';
          const expected = String(entry.fieldValue ?? '');
          const ok = actual === expected;
          if (
            entry.blockType === 'palletize_block'
            || entry.blockType === 'use_pose'
            || entry.blockType === 'use_point'
            || entry.blockType === 'use_frame'
            || entry.blockType === 'set_tool'
          ) {
            xmlDebugLog(`[XML AFTER RESTORE] blockType=${entry.blockType} blockId=${entry.blockId} field=${entry.fieldName} expected=${expected} actual=${actual} ok=${ok}`);
          }
        });

        // ✅ Resolver nombre del programa: atributo del XML > nombre de archivo sin extensión
        const xmlProgramName = (xml.getAttribute('program_name') || '').trim();
        const fileBaseName = file.name.replace(/\.xml$/i, '').trim();
        const resolvedName = xmlProgramName || fileBaseName;
        if (resolvedName && typeof onNameResolved === 'function') {
          onNameResolved(resolvedName);
        }

        const PROGRAM_SNAPSHOT_STORAGE_KEY = 'fp_program_snapshot_id';
        const SNAPSHOT_ID_STORAGE_KEY = 'fp_snapshot_id';
        const SNAPSHOT_SHORT_STORAGE_KEY = 'fp_snapshot_short';

        const xmlSnapshotId = String(
          xml.getAttribute('program_snapshot_id')
          || xml.getAttribute('snapshot_id')
          || ''
        ).trim();
        const xmlSnapshotShortRaw = Number(xml.getAttribute('snapshot_short'));
        let xmlSnapshotShort = Number.isFinite(xmlSnapshotShortRaw)
          ? (xmlSnapshotShortRaw & 0xFFFF)
          : null;

        const hasValidXmlSnapshotShort = Number.isFinite(xmlSnapshotShort)
          && xmlSnapshotShort > 0
          && xmlSnapshotShort <= 65535;

        if (desiredUrInstrumentation && !hasValidXmlSnapshotShort && xmlSnapshotId && typeof window.computeSnapshotShortId === 'function') {
          const computedRaw = Number(window.computeSnapshotShortId(xmlSnapshotId));
          if (Number.isFinite(computedRaw)) {
            const normalizedComputed = (computedRaw & 0xFFFF) || 1;
            xmlSnapshotShort = normalizedComputed;
            console.log(`[XML LOAD] snapshot_short invalid/missing, computed=${normalizedComputed} from snapshot_id=${xmlSnapshotId}`);
          }
        }

        const finalSnapshotShort = Number.isFinite(xmlSnapshotShort)
          && xmlSnapshotShort > 0
          && xmlSnapshotShort <= 65535
          ? xmlSnapshotShort
          : null;

        const effectiveSnapshotId = desiredUrInstrumentation ? xmlSnapshotId : '';
        const effectiveSnapshotShort = desiredUrInstrumentation ? finalSnapshotShort : null;
        const instrumentationAuditSnapshotId = effectiveSnapshotId || null;
        const instrumentationAuditSnapshotShort = Number.isFinite(effectiveSnapshotShort)
          ? effectiveSnapshotShort
          : null;

        console.log(
          `[XML INSTRUMENTATION] source=${instrumentationSource} enabled=${desiredUrInstrumentation} ` +
          `snapshot_id=${instrumentationAuditSnapshotId ?? 'null'} snapshot_short=${instrumentationAuditSnapshotShort ?? 'null'}`
        );

        console.log(
          `[XML LOAD] program_name=${xmlProgramName || resolvedName || ''} ` +
          `instrumentation_enabled=${desiredUrInstrumentation} ` +
          `snapshot_id=${effectiveSnapshotId || 'null'} snapshot_short=${Number.isFinite(effectiveSnapshotShort) ? effectiveSnapshotShort : 'null'}`
        );

        localStorage.setItem('ur_instrumentation_enabled', desiredUrInstrumentation ? 'true' : 'false');

        if (desiredUrInstrumentation && effectiveSnapshotId) {
          localStorage.setItem(PROGRAM_SNAPSHOT_STORAGE_KEY, effectiveSnapshotId);
          localStorage.setItem(SNAPSHOT_ID_STORAGE_KEY, effectiveSnapshotId);
          if (Number.isFinite(effectiveSnapshotShort)) {
            localStorage.setItem(SNAPSHOT_SHORT_STORAGE_KEY, String(effectiveSnapshotShort));
          }
        } else {
          localStorage.removeItem(PROGRAM_SNAPSHOT_STORAGE_KEY);
          localStorage.removeItem(SNAPSHOT_ID_STORAGE_KEY);
          localStorage.removeItem(SNAPSHOT_SHORT_STORAGE_KEY);
          if (!desiredUrInstrumentation) {
            console.log('[XML INSTRUMENTATION] clearing snapshot metadata because instrumentation is disabled');
          }
        }

        if (desiredUrInstrumentation && !effectiveSnapshotId) {
          console.log('[XML INSTRUMENTATION] enabled without snapshot metadata');
        }

        if (typeof onSnapshotResolved === 'function') {
          Promise.resolve(onSnapshotResolved({
            program_name: xmlProgramName || resolvedName || null,
            program_snapshot_id: desiredUrInstrumentation ? (effectiveSnapshotId || null) : null,
            snapshot_id: desiredUrInstrumentation ? (effectiveSnapshotId || null) : null,
            snapshot_short: desiredUrInstrumentation && Number.isFinite(effectiveSnapshotShort)
              ? effectiveSnapshotShort
              : null,
            instrumentation_enabled: desiredUrInstrumentation
          })).catch((callbackError) => {
            console.warn('[ui] onSnapshotResolved failed:', callbackError);
          });
        }

        showToast(`Bloques cargados desde "${file.name}"`);

        setTimeout(() => {
          try {
            window.__fpLoadingWorkspaceFromXml = true;
            window.__fpSuppressRegistryRebuildDuringXmlLoad = true;
            window.__fpPendingXmlDropdownValues = pendingXmlDropdownValues;

            if (typeof window.rebuildSavedRegistriesFromWorkspace === 'function') {
              window.rebuildSavedRegistriesFromWorkspace(workspace);
            }
            if (typeof updatePosePointDropdowns === 'function') {
              updatePosePointDropdowns(workspace);
            }

            workspace.getAllBlocks(false).forEach((block) => {
              if (block.type === 'set_tool') {
                const dropdown = block.getField('TOOL_ID');
                if (dropdown && typeof dropdown.getOptions === 'function') {
                  try {
                    dropdown.getOptions(true);
                  } catch (error) {
                    // Ignorar refresco fallido puntual.
                  }
                }
              }
            });

            restoreCapturedFieldState(workspace, capturedFields, { emitSummary: true });
            restorePalletizeInputsFromCapturedXml(workspace, capturedPalletInputs);
            if (isXmlDebugEnabled()) {
              logWorkspaceRelevantFields(workspace, 'XML AFTER RESTORE');
              logPalletizeInputs(workspace);
            }

            capturedFields.forEach((entry) => {
              const block = workspace.getBlockById(entry.blockId);
              const field = block?.getField?.(entry.fieldName);
              const actual = field?.getValue ? String(field.getValue()) : '';
              const expected = String(entry.fieldValue ?? '');
              const ok = actual === expected;
              if (
                entry.blockType === 'palletize_block'
                || entry.blockType === 'use_pose'
                || entry.blockType === 'use_point'
                || entry.blockType === 'use_frame'
                || entry.blockType === 'set_tool'
              ) {
                xmlDebugLog(`[XML AFTER RESTORE] blockType=${entry.blockType} blockId=${entry.blockId} field=${entry.fieldName} expected=${expected} actual=${actual} ok=${ok}`);
              }
            });
          } catch (deferredError) {
            console.error('[xml-load] deferred final restore failed:', deferredError);
          } finally {
            cleanupXmlLoadFlags({ keepUpdateSuppressed: true });
            if (updateCallback && typeof updateCallback === 'function') {
              if (window.__fpUpdateOutputsTimer) {
                clearTimeout(window.__fpUpdateOutputsTimer);
                window.__fpUpdateOutputsTimer = null;
              }
              const suppressedCount = Number(window.__fpSuppressedUpdateOutputsCount || 0);
              if (instrumentationToggle) {
                instrumentationToggle.checked = desiredUrInstrumentation;
              }
              localStorage.setItem('ur_instrumentation_enabled', desiredUrInstrumentation ? 'true' : 'false');
              const socketConfig = document.getElementById('urSocketConfig');
              if (socketConfig) {
                socketConfig.style.display = desiredUrInstrumentation ? 'flex' : 'none';
              }
              window.__fpAllowFinalXmlUpdateOutputs = true;
              window.__fpCurrentUpdateOutputsReason = 'xml_load_final';
              console.log(`[XML LOAD] suppressed updateOutputs requests=${suppressedCount}`);
              console.log('[XML LOAD] final updateOutputs after restore');
              try {
                updateCallback();
              } finally {
                window.__fpAllowFinalXmlUpdateOutputs = false;
                window.__fpSuppressedUpdateOutputsCount = 0;
                window.__fpPostXmlLoadQuietPeriod = true;
                setTimeout(() => {
                  window.__fpPostXmlLoadQuietPeriod = false;
                }, 300);
                window.__fpPendingXmlDropdownValues = null;
                window.__fpPendingXmlDropdownValuesByTypeField = null;
                window.__fpSuppressRegistryRebuildDuringXmlLoad = false;
                window.__fpSuppressUpdateOutputsDuringXmlLoad = false;
                window.__fpSuppressInstrumentationToggleUpdateDuringXmlLoad = false;
                window.__fpLoadingWorkspaceFromXml = false;
                window.__fpPendingUpdateOutputsAfterXmlLoad = false;
              }
            } else {
              window.__fpSuppressUpdateOutputsDuringXmlLoad = false;
              window.__fpSuppressInstrumentationToggleUpdateDuringXmlLoad = false;
              window.__fpLoadingWorkspaceFromXml = false;
              window.__fpPendingUpdateOutputsAfterXmlLoad = false;
              window.__fpPendingXmlDropdownValues = null;
              window.__fpPendingXmlDropdownValuesByTypeField = null;
              window.__fpSuppressRegistryRebuildDuringXmlLoad = false;
              window.__fpSuppressedUpdateOutputsCount = 0;
            }
          }
        }, 150);
      } catch (innerError) {
        cleanupXmlLoadFlags();
        throw innerError;
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
