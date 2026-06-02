/*═══════════════════════════════════════════════════════════════════════════════
  ORQUESTACIÓN PRINCIPAL - main.js
  
  Este archivo:
  - Inicializa toda la aplicación
  - Configura el workspace de Blockly
  - Gestiona eventos de la interfaz
  - Coordina actualizaciones de código
═══════════════════════════════════════════════════════════════════════════════*/

// --------------------------------------------------
// UI CONFIG / FLAGS
// --------------------------------------------------
const DEBUG_MODE = window.fp_debug === true || window.localStorage.getItem("fp_debug") === "true";
const UR_INSTRUMENTATION_KEY = 'ur_instrumentation_enabled';
const UR_SOCKET_IP_KEY = 'fp_socket_ip';
const UR_SOCKET_PORT_KEY = 'fp_socket_port';
const DEFAULT_SPEED_STORAGE_KEY = 'fp_default_speed';
const PROGRAM_NAME_STORAGE_KEY = 'fp_program_name';
const ROBOT_SELECT_STORAGE_KEY = 'fp_robot_select';
const PROGRAM_SNAPSHOT_STORAGE_KEY = 'fp_program_snapshot_id';
const SNAPSHOT_ID_STORAGE_KEY = 'fp_snapshot_id';
const SNAPSHOT_SHORT_STORAGE_KEY = 'fp_snapshot_short';
// UI warning ID for palletize angle validation (~90° check)
const ANGLE_WARNING_ID = "PALLET_POINTS_NOT_ORTHOGONAL_UI";
// Debounce timings (ms) for UI updates
const REGISTRY_REBUILD_DEBOUNCE_MS = 75;
const PALLET_WARNING_DEBOUNCE_MS = 75;

if (DEBUG_MODE) {
  window.addEventListener("load", () => {
    setTimeout(() => {
      try {
        console.groupCollapsed("Auto RG2 Debug Run");
        console.log("Debug mode active (fp_debug=true)");
        console.time("RG2 Driver Tests Duration");
        runRG2Demo();
        console.timeEnd("RG2 Driver Tests Duration");
        console.groupEnd();
      } catch (err) {
        console.error("RG2 auto debug run failed:", err);
      }
    }, 0);
  });
}

window.addEventListener('load', () => {
  /* Variable Global del Workspace */
  let workspace = null;

  function getUrInstrumentationEnabled() {
    const toggle = document.getElementById('urInstrumentationToggle');
    if (toggle) {
      return toggle.checked === true;
    }
    return localStorage.getItem(UR_INSTRUMENTATION_KEY) === 'true';
  }

  function setUrInstrumentationEnabled(enabled) {
    localStorage.setItem(UR_INSTRUMENTATION_KEY, enabled ? 'true' : 'false');
  }

  function initUrInstrumentationToggle() {
    const toggle = document.getElementById('urInstrumentationToggle');
    if (!toggle) return;
    if (localStorage.getItem(UR_INSTRUMENTATION_KEY) === null) {
      localStorage.setItem(UR_INSTRUMENTATION_KEY, 'false');
    }
    toggle.checked = getUrInstrumentationEnabled();
    const socketConfig = document.getElementById('urSocketConfig');
    if (socketConfig) socketConfig.style.display = toggle.checked ? 'flex' : 'none';
    toggle.addEventListener('change', () => {
      if (window.__fpSuppressInstrumentationToggleUpdateDuringXmlLoad) {
        if (DEBUG_MODE) {
          console.log('[XML LOAD] ur instrumentation toggle update suppressed');
        }
        return;
      }
      setUrInstrumentationEnabled(toggle.checked);
      if (socketConfig) socketConfig.style.display = toggle.checked ? 'flex' : 'none';
      requestUpdateOutputs('ur_instrumentation_toggle');
    });
  }

  function getUrSocketConfig() {
    const rawIp = (localStorage.getItem(UR_SOCKET_IP_KEY) || '').trim();
    const rawPort = parseInt(localStorage.getItem(UR_SOCKET_PORT_KEY), 10);
    const ip = rawIp || '192.168.0.50';
    const port = (Number.isFinite(rawPort) && rawPort >= 1 && rawPort <= 65535) ? rawPort : 5000;
    return { ip, port };
  }

  function initUrSocketConfig() {
    const ipEl = document.getElementById('urSocketIp');
    const portEl = document.getElementById('urSocketPort');
    if (!ipEl || !portEl) return;

    const stored = getUrSocketConfig();
    ipEl.value = stored.ip;
    portEl.value = stored.port;

    ipEl.addEventListener('input', () => {
      const v = ipEl.value.trim();
      if (v) localStorage.setItem(UR_SOCKET_IP_KEY, v);
      requestUpdateOutputs('ur_socket_ip_input');
    });
    portEl.addEventListener('input', () => {
      const v = parseInt(portEl.value, 10);
      if (Number.isFinite(v) && v >= 1 && v <= 65535) localStorage.setItem(UR_SOCKET_PORT_KEY, String(v));
      requestUpdateOutputs('ur_socket_port_input');
    });
  }

  function initDefaultSpeedField() {
    const input = document.getElementById('defaultSpeed');
    if (!input) return;

    const currentValue = Number(input.value);
    const hasCurrentValid = Number.isFinite(currentValue) && currentValue > 0;

    const storedRaw = localStorage.getItem(DEFAULT_SPEED_STORAGE_KEY);
    const storedValue = Number(storedRaw);
    const hasStoredValid = Number.isFinite(storedValue) && storedValue > 0;

    if (hasCurrentValid) {
      localStorage.setItem(DEFAULT_SPEED_STORAGE_KEY, String(currentValue));
    } else if (hasStoredValid) {
      input.value = String(storedValue);
    } else {
      input.value = '100';
      localStorage.setItem(DEFAULT_SPEED_STORAGE_KEY, '100');
    }

    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v > 0) {
        localStorage.setItem(DEFAULT_SPEED_STORAGE_KEY, String(v));
      }
    });
  }

  function formatProgramTimestamp(dateObj) {
    const pad2 = (value) => String(value).padStart(2, '0');
    const y = dateObj.getFullYear();
    const m = pad2(dateObj.getMonth() + 1);
    const d = pad2(dateObj.getDate());
    const hh = pad2(dateObj.getHours());
    const mm = pad2(dateObj.getMinutes());
    return `${y}${m}${d}_${hh}${mm}`;
  }

  function buildDefaultProgramName() {
    return `Programa_${formatProgramTimestamp(new Date())}`;
  }

  function getActiveProgramName() {
    const input = document.getElementById('programName');
    const raw = (input?.value || '').trim();
    if (raw) {
      localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, raw);
      return raw;
    }
    const stored = (localStorage.getItem(PROGRAM_NAME_STORAGE_KEY) || '').trim();
    const fallback = stored || buildDefaultProgramName();
    localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, fallback);
    return fallback;
  }

  function getCurrentProgramNameSafe() {
    const input = document.getElementById('programName');
    const fromInput = input && input.value ? input.value.trim() : '';
    if (fromInput) return fromInput;

    const fromStorage = (localStorage.getItem(PROGRAM_NAME_STORAGE_KEY) || '').trim();
    if (fromStorage) return fromStorage;

    return 'programa_robot';
  }

  function getActiveWorkspaceSafe() {
    if (workspace && typeof workspace.getAllBlocks === 'function') {
      return workspace;
    }
    if (window.workspace && typeof window.workspace.getAllBlocks === 'function') {
      return window.workspace;
    }
    if (typeof Blockly?.getMainWorkspace === 'function') {
      const mainWorkspace = Blockly.getMainWorkspace();
      if (mainWorkspace && typeof mainWorkspace.getAllBlocks === 'function') {
        return mainWorkspace;
      }
    }
    return null;
  }

  function sanitizeProgramNameForFilename(programName) {
    const safe = String(programName || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[. ]+$/g, '');
    return safe || 'programa';
  }

  function initRobotSelect() {
    const select = document.getElementById('robotSelect');
    if (!select) return;
    const stored = localStorage.getItem(ROBOT_SELECT_STORAGE_KEY);
    if (!stored) return;
    // Solo restaurar si el valor existe como opción válida en el <select>
    const valid = Array.from(select.options).some(opt => opt.value === stored);
    if (valid) select.value = stored;
  }

  function initProgramNameField() {
    const input = document.getElementById('programName');
    if (!input) return;

    const current = (input.value || '').trim();
    const stored = (localStorage.getItem(PROGRAM_NAME_STORAGE_KEY) || '').trim();
    const initial = current || stored || buildDefaultProgramName();
    input.value = initial;
    localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, initial);

    input.addEventListener('input', () => {
      const value = (input.value || '').trim();
      if (value) {
        localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, value);
      } else {
        localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, buildDefaultProgramName());
      }
      requestUpdateOutputs('program_name_input');
    });
  }

  let lastInstrumentedSnapshotSignature = '';
  let lastInstrumentedSnapshotId = '';
  let restoredSnapshotFromXml = null;

  function normalizeSnapshotShort(snapshotShort, snapshotId) {
    const shortNum = Number(snapshotShort);
    if (Number.isFinite(shortNum)) {
      return shortNum & 0xFFFF;
    }
    if (snapshotId && typeof window.computeSnapshotShortId === 'function') {
      const computed = Number(window.computeSnapshotShortId(snapshotId));
      if (Number.isFinite(computed)) {
        return computed & 0xFFFF;
      }
    }
    return null;
  }

  function buildWorkspaceFingerprint(ws) {
    if (!ws || !window.Blockly?.Xml) return '';
    try {
      const xmlDom = Blockly.Xml.workspaceToDom(ws);
      return Blockly.Xml.domToText(xmlDom);
    } catch (err) {
      console.warn('[main] No se pudo calcular fingerprint del workspace:', err);
      return '';
    }
  }

  function getWorkspacePlannedStepsCount(ws) {
    try {
      const compiler = window.CompilerAPI?.compilePlanFromProgram
        || window.compilePlanFromProgram
        || window.SimulatorAPI?.compilePlanFromProgram;
      if (typeof compiler !== 'function') return null;

      const program = workspaceToProgram(ws);
      const compiled = compiler(program);
      const count = Number(compiled?.plannedSteps?.length);
      return Number.isFinite(count) && count >= 0 ? count : null;
    } catch (error) {
      console.warn('[main] No se pudo calcular plannedSteps_count para resolver snapshot activo:', error);
      return null;
    }
  }

  async function resolveSnapshotFromShortWithContext(snapshotShort, context = {}) {
    const shortNum = normalizeSnapshotShort(snapshotShort, null);
    if (!Number.isFinite(shortNum) || shortNum <= 0) return null;

    const payload = {
      program_name: String(context?.program_name || '').trim() || null,
      plannedSteps_count: Number.isFinite(Number(context?.plannedSteps_count))
        ? Number(context.plannedSteps_count)
        : null
    };

    if (typeof window.resolveSnapshotByShortWithContext === 'function') {
      return window.resolveSnapshotByShortWithContext(shortNum, payload);
    }
    if (typeof window.resolveSnapshotByShort === 'function') {
      return window.resolveSnapshotByShort(shortNum);
    }
    return null;
  }

  function persistActiveSnapshotInStorage(snapshotId, snapshotShort, programName) {
    const normalizedId = String(snapshotId || '').trim();
    const normalizedShort = normalizeSnapshotShort(snapshotShort, normalizedId);
    const normalizedName = String(programName || '').trim();

    if (normalizedId) {
      localStorage.setItem(PROGRAM_SNAPSHOT_STORAGE_KEY, normalizedId);
      localStorage.setItem(SNAPSHOT_ID_STORAGE_KEY, normalizedId);
    }
    if (Number.isFinite(normalizedShort)) {
      localStorage.setItem(SNAPSHOT_SHORT_STORAGE_KEY, String(normalizedShort));
    }
    if (normalizedName) {
      localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, normalizedName);
    }
  }

  window.getActiveProgramSnapshotMeta = function () {
    const programName = getActiveProgramName();
    const snapshotId = String(lastInstrumentedSnapshotId || localStorage.getItem(PROGRAM_SNAPSHOT_STORAGE_KEY) || localStorage.getItem(SNAPSHOT_ID_STORAGE_KEY) || '').trim();
    const snapshotShort = normalizeSnapshotShort(localStorage.getItem(SNAPSHOT_SHORT_STORAGE_KEY), snapshotId);
    return {
      program_name: programName || null,
      program_snapshot_id: snapshotId || null,
      snapshot_id: snapshotId || null,
      snapshot_short: Number.isFinite(snapshotShort) ? snapshotShort : null
    };
  };

  function buildInstrumentedSnapshotSignature(plannedSteps, contextSummary) {
    const payload = {
      plannedSteps: Array.isArray(plannedSteps) ? plannedSteps : [],
      contextSummary: contextSummary || {}
    };
    try {
      return JSON.stringify(payload);
    } catch (err) {
      console.warn('[main] No se pudo serializar firma de snapshot:', err);
      return '';
    }
  }

  function requestUpdateOutputs(reason = 'unknown') {
    const normalizedReason = String(reason || 'unknown');
    if (DEBUG_MODE) {
      console.log(`[UPDATE OUTPUTS] requested reason=${normalizedReason}`);
    }

    if (window.__fpPostXmlLoadQuietPeriod && normalizedReason.startsWith('blockly_event')) {
      if (DEBUG_MODE) {
        console.log('[XML LOAD] post-load blockly_event suppressed');
      }
      return;
    }

    if (window.__fpSuppressUpdateOutputsDuringXmlLoad || window.__fpLoadingWorkspaceFromXml) {
      window.__fpPendingUpdateOutputsAfterXmlLoad = true;
      window.__fpSuppressedUpdateOutputsCount = Number(window.__fpSuppressedUpdateOutputsCount || 0) + 1;
      if (DEBUG_MODE) {
        console.log(`[XML LOAD] updateOutputs request suppressed reason=${normalizedReason}`);
      }
      return;
    }

    if (window.__fpUpdateOutputsTimer) {
      clearTimeout(window.__fpUpdateOutputsTimer);
    }

    window.__fpUpdateOutputsTimer = setTimeout(() => {
      window.__fpUpdateOutputsTimer = null;
      window.__fpCurrentUpdateOutputsReason = normalizedReason;
      updateOutputs();
    }, 50);
  }

  /* Función Principal de Actualización de la Interfaz */
  function updateOutputs() {
    const suppressed = window.__fpSuppressUpdateOutputsDuringXmlLoad || window.__fpLoadingWorkspaceFromXml;
    if (suppressed && !window.__fpAllowFinalXmlUpdateOutputs) {
      window.__fpPendingUpdateOutputsAfterXmlLoad = true;
      if (DEBUG_MODE) {
        console.log('[XML LOAD] direct updateOutputs suppressed');
      }
      return;
    }

    if (window.__fpUpdateOutputsRunning === true) {
      window.__fpPendingUpdateOutputsAfterXmlLoad = true;
      return;
    }

    window.__fpPendingUpdateOutputsAfterXmlLoad = false;
    window.__fpUpdateOutputsRunning = true;
    const executionReason = String(window.__fpCurrentUpdateOutputsReason || (window.__fpAllowFinalXmlUpdateOutputs ? 'xml_load_final' : 'direct'));
    if (DEBUG_MODE) {
      console.log(`[UPDATE OUTPUTS] executed reason=${executionReason}`);
    }

    try {
      const robot = document.getElementById("robotSelect").value;
      const programPlano = workspaceToProgram(workspace);
      const activeProgramName = getActiveProgramName();
      const instrumentationEnabled = getUrInstrumentationEnabled();

      // 1. Actualizar JSON
      document.getElementById("jsonOutput").textContent = JSON.stringify(programPlano, null, 2);

      // 2. Generar y mostrar el código en modo educativo
      document.getElementById("codeEducativo").textContent = generateCodeForSelectedRobot(
        robot,
        programPlano,
        CONSTANTS.MODES.EDUCATIONAL,
        { instrumentation: false, mode: "flat" }
      );

      // 3. Generar y mostrar el código industrial (UR: flat o planned)
      let codeIndustrial = "";
      let modeLabel = "Modo: Industrial (bucles)";
      let snapshotLabel = "";
      let stepCountForLog = programPlano.length;

      if (robot === CONSTANTS.ROBOTS.UR3E && instrumentationEnabled) {
        const compiler = window.CompilerAPI?.compilePlanFromProgram
          || window.compilePlanFromProgram
          || window.SimulatorAPI?.compilePlanFromProgram;
        if (typeof compiler === "function") {
          if (DEBUG_MODE) {
            console.log("[main] typeof programPlano =", typeof programPlano);
            console.log("[main] isArray programPlano =", Array.isArray(programPlano));
            if (Array.isArray(programPlano)) {
              console.log("[main] programPlano.length =", programPlano.length);
              console.log("[main] first =", programPlano[0]);
            } else if (programPlano && typeof programPlano === "object") {
              console.log("[main] programPlano keys =", Object.keys(programPlano));
            } else if (typeof programPlano === "string") {
              console.log("[main] programPlano string head =", programPlano.slice(0, 120));
            }
          }
          window.__DEBUG_programPlano = programPlano;
          const compilation = compiler(programPlano);
          if (DEBUG_MODE) {
            console.log("[main] compiled.plannedSteps.length =", compilation?.plannedSteps?.length);
          }
          if (!compilation || !Array.isArray(compilation.plannedSteps)) {
            console.warn("UR mode: industrial | invalid plannedSteps from compiler");
            codeIndustrial = generateCodeForSelectedRobot(
              robot,
              programPlano,
              CONSTANTS.MODES.INDUSTRIAL,
              { instrumentation: false, mode: "flat" }
            );
            modeLabel = "Modo: Industrial (bucles)";
            snapshotLabel = "⚠️ Instrumentación no disponible";
          } else {
            const plannedSteps = compilation.plannedSteps;
            const compiledSnapshotId = compilation?.program_snapshot_id || "";
            const contextSummary = compilation?.contextSummary;
            const signature = buildInstrumentedSnapshotSignature(plannedSteps, contextSummary);
            const canReuseSnapshot = Boolean(
              signature
              && lastInstrumentedSnapshotSignature
              && lastInstrumentedSnapshotSignature === signature
              && lastInstrumentedSnapshotId
            );
            const currentWorkspaceFingerprint = buildWorkspaceFingerprint(workspace);
            const hasXmlRestoreCandidate = Boolean(
              restoredSnapshotFromXml?.snapshotId
              && restoredSnapshotFromXml?.workspaceFingerprint
              && currentWorkspaceFingerprint
              && restoredSnapshotFromXml.workspaceFingerprint === currentWorkspaceFingerprint
            );

            if (restoredSnapshotFromXml && !hasXmlRestoreCandidate && currentWorkspaceFingerprint) {
              restoredSnapshotFromXml = null;
            }

            const snapshotId = canReuseSnapshot
              ? lastInstrumentedSnapshotId
              : (hasXmlRestoreCandidate ? restoredSnapshotFromXml.snapshotId : compiledSnapshotId);

            if (hasXmlRestoreCandidate && snapshotId) {
              console.log(`[SNAPSHOT RESTORE] reused snapshot_id from XML: ${snapshotId}`);
            }

            const snapshotShort = normalizeSnapshotShort(
              hasXmlRestoreCandidate ? restoredSnapshotFromXml?.snapshotShort : null,
              snapshotId
            );

            if (snapshotId && signature) {
              lastInstrumentedSnapshotId = snapshotId;
              lastInstrumentedSnapshotSignature = signature;
            }

            if (snapshotId && typeof window.saveSnapshot === 'function') {
              window.saveSnapshot({
                snapshot_id: snapshotId,
                snapshot_short: snapshotShort,
                program_name: activeProgramName,
                created_at: Date.now(),
                plannedSteps,
                contextSummary
              }).catch((err) => {
                console.warn('[main] saveSnapshot failed:', err);
              });
            }

            const { ip: _sip, port: _sport } = getUrSocketConfig();
            codeIndustrial = generateCodeForSelectedRobot(
              robot,
              programPlano,
              CONSTANTS.MODES.INDUSTRIAL,
              {
                instrumentation: true,
                executionMode: "planned",
                plannedSteps,
                program_snapshot_id: snapshotId,
                contextSummary,
                socket_host: _sip,
                socket_port: _sport
              }
            );

            if (plannedSteps.length === 0) {
              codeIndustrial = `# ⚠️ plannedSteps=0 (compilación vacía)\n${codeIndustrial}`;
            } else {
              codeIndustrial = `# plannedSteps=${plannedSteps.length} snapshot=${snapshotId}\n${codeIndustrial}`;
            }

            modeLabel = "Modo: Verificación (instrumentado)";
            snapshotLabel = snapshotId ? `Snapshot: ${snapshotId}` : "";
            stepCountForLog = plannedSteps.length;

            if (snapshotId) {
              persistActiveSnapshotInStorage(snapshotId, snapshotShort, activeProgramName);
            }

            if (DEBUG_MODE) {
              console.log(`UR mode: instrumented | steps: ${stepCountForLog}`);
            }
          }
        } else {
          codeIndustrial = generateCodeForSelectedRobot(
            robot,
            programPlano,
            CONSTANTS.MODES.INDUSTRIAL,
            { instrumentation: false, mode: "flat" }
          );
          modeLabel = "Modo: Industrial (bucles)";
          snapshotLabel = "⚠️ Instrumentación no disponible";
          console.warn("UR mode: industrial | steps: 0 | compilePlanFromProgram unavailable");
        }
      } else {
        codeIndustrial = generateCodeForSelectedRobot(
          robot,
          programPlano,
          CONSTANTS.MODES.INDUSTRIAL,
          { instrumentation: false, mode: "flat" }
        );
        if (robot === CONSTANTS.ROBOTS.UR3E) {
          console.log(`UR mode: industrial | steps: ${stepCountForLog}`);
        }
      }

      const modeEl = document.getElementById("urModeLabel");
      if (modeEl) modeEl.textContent = modeLabel;

      const snapshotEl = document.getElementById("urSnapshotLabel");
      if (snapshotEl) snapshotEl.textContent = snapshotLabel;

      document.getElementById("codeIndustrial").textContent = codeIndustrial;

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
      programPlano.forEach(flatten);
      localStorage.setItem('robotProgramForSimulation', JSON.stringify(flatProgram));
      localStorage.setItem('robotProgramNameForSimulation', activeProgramName);
      
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
    } finally {
      window.__fpUpdateOutputsRunning = false;
      window.__fpCurrentUpdateOutputsReason = '';
    }
  }

  /* Advertencias de ángulo en bloque de paletizado */
  function updatePalletizeAngleWarnings(targetWorkspace) {
    const ws = targetWorkspace || workspace;
    if (!ws) return;

    const registries = (typeof window.rebuildSavedRegistriesFromWorkspace === 'function')
      ? window.rebuildSavedRegistriesFromWorkspace(ws)
      : null;
    const points = registries?.points || {};

    const epsilon = 1e-6;
    const angleDegBetweenXY = (v1, v2) => {
      const mag1 = Math.hypot(v1.x ?? 0, v1.y ?? 0);
      const mag2 = Math.hypot(v2.x ?? 0, v2.y ?? 0);
      if (mag1 <= epsilon || mag2 <= epsilon) return null;
      const dot = (v1.x ?? 0) * (v2.x ?? 0) + (v1.y ?? 0) * (v2.y ?? 0);
      let cos = dot / (mag1 * mag2);
      cos = Math.max(-1, Math.min(1, cos));
      return Math.acos(cos) * 180 / Math.PI;
    };

    const getPointNameFromInput = (block, inputName) => {
      const target = block.getInputTargetBlock(inputName);
      if (!target || target.type !== 'use_point') return null;
      return target.getFieldValue('POINT_NAME');
    };

    ws.getAllBlocks(false).forEach(block => {
      if (block.type !== 'palletize_block') return;

      const p1Name = getPointNameFromInput(block, 'PALLET_P1');
      const p2Name = getPointNameFromInput(block, 'PALLET_P2');
      const p3Name = getPointNameFromInput(block, 'PALLET_P3');

      if (!p1Name || !p2Name || !p3Name) {
        block.setWarningText(null, ANGLE_WARNING_ID);
        return;
      }

      const p1 = points[p1Name];
      const p2 = points[p2Name];
      const p3 = points[p3Name];

      const isFinitePoint = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z);
      if (!isFinitePoint(p1) || !isFinitePoint(p2) || !isFinitePoint(p3)) {
        block.setWarningText(null, ANGLE_WARNING_ID);
        return;
      }

      const dx = { x: (p2.x ?? 0) - (p1.x ?? 0), y: (p2.y ?? 0) - (p1.y ?? 0) };
      const dy = { x: (p3.x ?? 0) - (p1.x ?? 0), y: (p3.y ?? 0) - (p1.y ?? 0) };
      const angle = angleDegBetweenXY(dx, dy);

      if (angle == null) {
        block.setWarningText(null, ANGLE_WARNING_ID);
        return;
      }

      if (angle < 80 || angle > 100) {
        block.setWarningText(
          `⚠ Ángulo P1→P2 vs P1→P3 = ${angle.toFixed(1)}° (esperado ~90°). ` +
          'Revisa: P2=columnas, P3=filas.',
          ANGLE_WARNING_ID
        );
      } else {
        block.setWarningText(null, ANGLE_WARNING_ID);
      }
    });
  }

  let palletizeWarnTimer = null;
  function schedulePalletizeAngleWarnings(targetWorkspace) {
    const ws = targetWorkspace || workspace;
    if (!ws) return;
    if (palletizeWarnTimer) clearTimeout(palletizeWarnTimer);
    palletizeWarnTimer = setTimeout(() => {
      updatePalletizeAngleWarnings(ws);
      palletizeWarnTimer = null;
    }, PALLET_WARNING_DEBOUNCE_MS);
  }

  window.runRG2Demo = function runRG2Demo() {
    const results = [];
    function assert(name, condition) {
      results.push({ name, ok: !!condition });
    }

    const demoProgram = [
      { type: 'set_tool', tool_id: 'onrobot_rg2_urcap' },
      { type: 'gripper_set', tool_id: 'onrobot_rg2_urcap', width_mm: 40, force: 20 }
    ];

    const demoProgramNoTool = [
      { type: 'gripper_set', tool_id: 'onrobot_rg2_urcap', width_mm: 40, force: 20 }
    ];

    const demoProgramWrongTool = [
      { type: 'set_tool', tool_id: 'manual' },
      { type: 'gripper_set', tool_id: 'onrobot_rg2_urcap', width_mm: 40, force: 20 }
    ];

    const demoProgramMissingParams = [
      { type: 'set_tool', tool_id: 'onrobot_rg2_urcap' },
      { type: 'gripper_set', tool_id: 'onrobot_rg2_urcap' }
    ];

    const demoPlannedOpenClose = [
      {
        type: 'tool',
        action: 'gripper_close',
        tool_id: 'onrobot_rg2_urcap',
        meta: { tool_context: { activeToolId: 'onrobot_rg2_urcap', seenSetTool: true } }
      },
      {
        type: 'tool',
        action: 'gripper_open',
        tool_id: 'onrobot_rg2_urcap',
        meta: { tool_context: { activeToolId: 'onrobot_rg2_urcap', seenSetTool: true } }
      }
    ];

    const demoProgramAbb = [
      { type: 'gripper_set', tool_id: 'onrobot_rg2_urcap', width_mm: 40, force: 20 }
    ];

    const planned = window.CompilerAPI?.compilePlanFromProgram
      ? window.CompilerAPI.compilePlanFromProgram(demoProgram)
      : null;

    const plannedAbb = window.CompilerAPI?.compilePlanFromProgram
      ? window.CompilerAPI.compilePlanFromProgram(demoProgramAbb)
      : null;

    const urScript = generateCodeForSelectedRobot(
      CONSTANTS.ROBOTS.UR3E,
      demoProgram,
      CONSTANTS.MODES.INDUSTRIAL,
      { instrumentation: false, mode: 'flat' }
    );

    const urScriptNoTool = generateCodeForSelectedRobot(
      CONSTANTS.ROBOTS.UR3E,
      demoProgramNoTool,
      CONSTANTS.MODES.INDUSTRIAL,
      { instrumentation: false, mode: 'flat' }
    );

    const urScriptWrongTool = generateCodeForSelectedRobot(
      CONSTANTS.ROBOTS.UR3E,
      demoProgramWrongTool,
      CONSTANTS.MODES.INDUSTRIAL,
      { instrumentation: false, mode: 'flat' }
    );

    const urScriptMissingParams = generateCodeForSelectedRobot(
      CONSTANTS.ROBOTS.UR3E,
      demoProgramMissingParams,
      CONSTANTS.MODES.INDUSTRIAL,
      { instrumentation: false, mode: 'flat' }
    );

    const urScriptOpenClose = generateCodeForSelectedRobot(
      CONSTANTS.ROBOTS.UR3E,
      [],
      CONSTANTS.MODES.INDUSTRIAL,
      { instrumentation: false, executionMode: 'planned', plannedSteps: demoPlannedOpenClose }
    );

    const abbPlannedScript = generateCodeForSelectedRobot(
      CONSTANTS.ROBOTS.ABB,
      demoProgramAbb,
      CONSTANTS.MODES.INDUSTRIAL,
      { instrumentation: false, executionMode: 'planned', plannedSteps: plannedAbb?.plannedSteps || [] }
    );

    const hasRgGrip = typeof urScript === 'string' && urScript.includes('rg_grip(40, 20)');
    const hasToolStep = Array.isArray(planned?.plannedSteps)
      && planned.plannedSteps.some(step => {
        const isTool = step?.type === 'tool' || step?.kind === 'tool';
        return isTool && step?.action === 'grip_set' && step?.width_mm === 40 && step?.force === 20;
      });

    const hasRgGripNoTool = typeof urScriptNoTool === 'string' && urScriptNoTool.includes('rg_grip(');
    const hasWarningNoTool = typeof urScriptNoTool === 'string' && urScriptNoTool.includes('# ADVERTENCIA:');
    const hasWarningWrongTool = typeof urScriptWrongTool === 'string' && urScriptWrongTool.includes('# ADVERTENCIA:');
    const hasWarningMissingParams = typeof urScriptMissingParams === 'string' && urScriptMissingParams.includes('# ADVERTENCIA: Bloque RG2 sin width/force válidos');
    const hasRgGripMissingParams = typeof urScriptMissingParams === 'string' && urScriptMissingParams.includes('rg_grip(');
    const hasRgGripClose = typeof urScriptOpenClose === 'string' && urScriptOpenClose.includes('rg_grip(50, 40)');
    const hasRgGripOpen = typeof urScriptOpenClose === 'string' && urScriptOpenClose.includes('rg_grip(110, 10)');

    const hasAbbGripStep = Array.isArray(plannedAbb?.plannedSteps)
      && plannedAbb.plannedSteps.some(step => step?.action === 'grip_set');
    const hasAbbWarning = typeof abbPlannedScript === 'string' && abbPlannedScript.includes('ADVERTENCIA');
    const hasAbbRgGrip = typeof abbPlannedScript === 'string' && abbPlannedScript.includes('rg_grip(');

    assert("Case A emits rg_grip", hasRgGrip === true);
    assert("Case B no warning sin set_tool", hasWarningNoTool === false);
    assert("Case C warning tool distinta", hasWarningWrongTool === true);
    assert("Case D grip_set missing params warns", hasWarningMissingParams === true);
    assert("Case D grip_set missing params omits", hasRgGripMissingParams === false);
    assert("Case D planned gripper_close defaults", hasRgGripClose === true);
    assert("Case E planned gripper_open defaults", hasRgGripOpen === true);
    assert("Case D planned step present", hasAbbGripStep === true);
    assert("Case D ABB warning present", hasAbbWarning === true);
    assert("Case D no rg_grip in ABB", hasAbbRgGrip === false);

    if (DEBUG_MODE) {
      console.group("RG2 Driver Tests");

      results.forEach(r => {
        if (r.ok) {
          console.log("✔", r.name);
        } else {
          console.error("✘", r.name);
        }
      });

      const okCount = results.filter(r => r.ok).length;
      console.log(`RG2 Driver Tests: ${okCount}/${results.length} OK`);

      console.groupEnd();
    }

    return results;
  };

  const isDebugRegressionEnabled = () => {
    try {
      return window.fp_debug === true || window.localStorage.getItem('fp_debug') === 'true';
    } catch (_err) {
      return window.fp_debug === true;
    }
  };

  if (isDebugRegressionEnabled()) {
    window.runPalletizeGripperRegressionTest = async function runPalletizeGripperRegressionTest() {
      console.log('[TEST] palletize gripper regression start');

      const robot = CONSTANTS?.ROBOTS?.UR3E;
      const mode = CONSTANTS?.MODES?.INDUSTRIAL;
      const compilePlan = window.CompilerAPI?.compilePlanFromProgram;
      if (!robot || !mode || typeof compilePlan !== 'function' || typeof generateCodeForSelectedRobot !== 'function') {
        const msg = '[TEST][setup] dependencias no disponibles (CONSTANTS/CompilerAPI/generator)';
        console.error(msg);
        throw new Error(msg);
      }

      const mkPalletBlock = (overrides = {}) => ({
        id: overrides.id || 'blk_pallet_regression',
        type: 'palletize_block',
        pick_pose: { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 },
        pallet_p1_pose: { x: 0, y: 300, z: 0, rx: 0, ry: 180, rz: 0 },
        pallet_p2: { x: 100, y: 300, z: 0 },
        pallet_p3: { x: 0, y: 400, z: 0 },
        rows: 1,
        cols: 1,
        layers: 1,
        layer_height: 60,
        pick_approach_height: 50,
        place_approach_height: 50,
        pick_wait_time: 0.5,
        place_wait_time: 0.3,
        grip_close_actions: [],
        grip_open_actions: [],
        ...overrides
      });

      const generateBothRoutes = (program, caseId) => {
        const compiled = compilePlan(program);
        const plannedSteps = Array.isArray(compiled?.plannedSteps) ? compiled.plannedSteps : [];

        return {
          industrial: generateCodeForSelectedRobot(robot, program, mode, {
            instrumentation: false,
            executionMode: 'flat'
          }),
          instrumentada: generateCodeForSelectedRobot(robot, program, mode, {
            instrumentation: true,
            executionMode: 'planned',
            plannedSteps,
            programSnapshotId: `t_snap_pallet_gripper_${caseId.toLowerCase()}`,
            snapshotShort: 12345
          })
        };
      };

      const assertRoutes = (caseId, outputs, conditionLabel, predicate) => {
        Object.entries(outputs).forEach(([route, code]) => {
          const safeCode = typeof code === 'string' ? code : '';
          if (!predicate(safeCode)) {
            const errorMsg = `[TEST][Case ${caseId}][${route}] ${conditionLabel}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
        });
      };

      try {
        const outputsA = generateBothRoutes([
          mkPalletBlock({ id: 'case_a_no_gripper' })
        ], 'A');

        assertRoutes('A', outputsA, 'DO inesperado', (code) => !code.includes('set_standard_digital_out('));
        assertRoutes('A', outputsA, 'comentario inesperado PICK cerrar pinza', (code) => !code.includes('# PICK: Cerrar pinza'));
        assertRoutes('A', outputsA, 'comentario inesperado PLACE abrir pinza', (code) => !code.includes('# PLACE: Abrir pinza'));
        assertRoutes('A', outputsA, 'sleep inesperado de cierre', (code) => !code.includes('sleep(0.5)'));
        assertRoutes('A', outputsA, 'sleep inesperado de apertura', (code) => !code.includes('sleep(0.3)'));
        assertRoutes('A', outputsA, 'etiqueta ausente Gripper: NONE', (code) => code.includes('#   Gripper: NONE'));

        const outputsB = generateBothRoutes([
          mkPalletBlock({
            id: 'case_b_digital_do1',
            pick_wait_time: 0.5,
            place_wait_time: 0.3,
            grip_close_actions: [{ type: 'set_do_block', pin: 1, state: 1 }],
            grip_open_actions: [{ type: 'set_do_block', pin: 1, state: 0 }]
          })
        ], 'B');

        assertRoutes('B', outputsB, 'falta cierre digital DO1', (code) => code.includes('set_standard_digital_out(1, True)'));
        assertRoutes('B', outputsB, 'falta sleep(0.5) tras cierre DO1', (code) => code.includes('sleep(0.5)'));
        assertRoutes('B', outputsB, 'falta apertura digital DO1', (code) => code.includes('set_standard_digital_out(1, False)'));
        assertRoutes('B', outputsB, 'falta sleep(0.3) tras apertura DO1', (code) => code.includes('sleep(0.3)'));
        assertRoutes('B', outputsB, 'etiqueta ausente gripper digital output DO1', (code) => code.includes('#   Gripper: digital output DO1'));

        const outputsC = generateBothRoutes([
          { id: 'case_c_set_tool_rg2', type: 'set_tool', tool_id: 'onrobot_rg2_urcap' },
          mkPalletBlock({
            id: 'case_c_rg2_urcap',
            grip_close_actions: [{ type: 'rg2_grip_set', width_mm: 50, force: 40, wait_s: 0.25 }],
            grip_open_actions: [{ type: 'rg2_grip_set', width_mm: 110, force: 10, wait_s: 0.15 }]
          })
        ], 'C');

        assertRoutes('C', outputsC, 'DO inesperado por defecto en cierre', (code) => !code.includes('set_standard_digital_out(1, True)'));
        assertRoutes('C', outputsC, 'DO inesperado por defecto en apertura', (code) => !code.includes('set_standard_digital_out(1, False)'));
        assertRoutes('C', outputsC, 'llamada RG2/URCap ausente', (code) => code.includes('rg_grip('));
        assertRoutes('C', outputsC, 'falta sleep(0.25) tras cierre RG2', (code) => code.includes('sleep(0.25)'));
        assertRoutes('C', outputsC, 'falta sleep(0.15) tras apertura RG2', (code) => code.includes('sleep(0.15)'));
        assertRoutes('C', outputsC, 'etiqueta ausente RG2/URCap', (code) => code.includes('#   Gripper: RG2/URCap'));

        console.log('✓ Regresión palletize_block pinza: casos A/B/C OK en UR industrial + instrumentada');
        return 'OK';
      } catch (err) {
        if (!(err instanceof Error)) {
          const msg = `[TEST][unknown] ${String(err)}`;
          console.error(msg);
          throw new Error(msg);
        }
        throw err;
      }
    };

    window.debugEducationalPalletizingTest = function debugEducationalPalletizingTest() {
      const checks = [];
      const missing = [];

      const addCheck = (name, ok, detail = '') => {
        checks.push({ name, ok, detail });
        if (!ok) missing.push(name);
      };

      const robot = CONSTANTS?.ROBOTS?.UR3E;
      const modeEducational = CONSTANTS?.MODES?.EDUCATIONAL;
      if (!robot || !modeEducational || typeof generateCodeForSelectedRobot !== 'function') {
        const setupError = 'dependencias no disponibles (CONSTANTS/generator)';
        addCheck('setup', false, setupError);
        return {
          ok: false,
          checks,
          missing,
          orderOk: false
        };
      }

      const palletBlock = {
        id: 'blk_pallet_edu_regression',
        type: 'palletize_block',
        pick_pose: { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 },
        pallet_p1_pose: { x: 200, y: 300, z: 250, rx: 0, ry: 180, rz: 0 },
        pallet_p2: { x: 300, y: 300, z: 250 },
        pallet_p3: { x: 200, y: 400, z: 250 },
        rows: 1,
        cols: 1,
        layers: 1,
        layer_height: 60,
        pick_approach_height: 50,
        place_approach_height: 50,
        pick_wait_time: 0.5,
        place_wait_time: 0.3,
        grip_close_actions: [{ type: 'set_do_block', pin: 1, state: 1 }],
        grip_open_actions: [{ type: 'set_do_block', pin: 1, state: 0 }]
      };

      const code = String(generateCodeForSelectedRobot(
        robot,
        [palletBlock],
        modeEducational,
        { instrumentation: false, mode: 'flat' }
      ) || '');

      const mustContain = [
        'Mover Articular a aproximación PICK',
        'Mover Lineal a PICK',
        'Mover Lineal a aproximación PICK',
        '3. 🟢 Acción herramienta (Activar)',
        '9. ⚪ Acción herramienta (Desactivar)',
        'P = P1 + columna·(P2-P1) + fila·(P3-P1) + capa·altura'
      ];
      mustContain.forEach((text) => {
        addCheck(`contains: ${text}`, code.includes(text));
      });

      const placeStep6 = code.indexOf('6. Mover Articular a altura segura PALET');
      const placeStep7 = code.indexOf('7. Mover Lineal a aproximación PALET');
      const placeStep8 = code.indexOf('8. Mover Lineal a PALET');
      const placeStep11 = code.indexOf('11. Mover Lineal a aproximación PALET');
      const orderOk = placeStep6 >= 0
        && placeStep7 > placeStep6
        && placeStep8 > placeStep7
        && placeStep11 > placeStep8;
      addCheck('order PLACE 6->7->8->11', orderOk);

      const expectedSequence = [
        /\b1\.\s+Mover Articular a aproximación PICK/,
        /\b2\.\s+Mover Lineal a PICK/,
        /\b3\.\s+🟢\s+Acción herramienta \(Activar\)/,
        /\b4\.\s+.*Esperar/i,
        /\b5\.\s+Mover Lineal a aproximación PICK/,
        /\b6\.\s+Mover Articular a altura segura PALET/,
        /\b7\.\s+Mover Lineal a aproximación PALET/,
        /\b8\.\s+Mover Lineal a PALET/,
        /\b9\.\s+⚪\s+Acción herramienta \(Desactivar\)/,
        /\b10\.\s+.*Esperar/i,
        /\b11\.\s+Mover Lineal a aproximación PALET/
      ];
      const sequence11Ok = expectedSequence.every((rx) => rx.test(code));
      addCheck('sequence 1..11 present', sequence11Ok);

      const expectedSafetyZ = (palletBlock.pallet_p1_pose.z + (0 * palletBlock.layer_height) + 100).toFixed(1);
      const safetyLineMatch = code.match(/6\.\s+Mover Articular a altura segura PALET\s*\(([^)]*)\)/);
      let safetyZOk = false;
      if (safetyLineMatch && safetyLineMatch[1]) {
        const coords = safetyLineMatch[1].split(',').map((part) => part.trim());
        const zText = coords[2] || '';
        const parsedZ = Number(zText);
        safetyZOk = Number.isFinite(parsedZ) && Math.abs(parsedZ - Number(expectedSafetyZ)) < 0.001;
      }
      addCheck(`safetyZ mm == ${expectedSafetyZ}`, safetyZOk);

      const ok = checks.every((item) => item.ok);
      const result = {
        ok,
        checks,
        missing,
        orderOk
      };

      if (ok) {
        console.log('✓ Educational palletize regression OK', result);
      } else {
        console.error('✗ Educational palletize regression FAILED', result);
      }
      return result;
    };

    window.debugEducationalIndustrialSimpleMovesAudit = function debugEducationalIndustrialSimpleMovesAudit() {
      const checks = [];
      const missing = [];
      const warnings = [];

      const addCheck = (entry) => {
        checks.push(entry);
        if (!entry.ok) {
          missing.push(entry.block);
        }
      };

      const robot = CONSTANTS?.ROBOTS?.UR3E;
      const modeEdu = CONSTANTS?.MODES?.EDUCATIONAL;
      const modeInd = CONSTANTS?.MODES?.INDUSTRIAL;
      if (!robot || !modeEdu || !modeInd || typeof generateCodeForSelectedRobot !== 'function') {
        const detail = 'dependencias no disponibles (CONSTANTS/generator)';
        addCheck({ block: 'setup', educational: '', industrial: '', ok: false, issue: detail });
        return { ok: false, checks, missing, warnings };
      }

      const program = [
        {
          id: 'audit_set_tool_manual',
          type: 'set_tool',
          tool_id: 'manual',
          tcp_x: 100,
          tcp_y: 20,
          tcp_z: 150,
          tcp_rx: 0,
          tcp_ry: 180,
          tcp_rz: 0
        },
        {
          id: 'audit_define_pose',
          type: 'define_pose',
          name: 'P_AUDIT_POSE',
          x: 450,
          y: 120,
          z: 300,
          rx: 10,
          ry: 170,
          rz: 5
        },
        {
          id: 'audit_define_point',
          type: 'define_point',
          name: 'PT_AUDIT_POINT',
          x: 420,
          y: -80,
          z: 260
        },
        {
          id: 'audit_use_pose',
          type: 'use_pose',
          poseName: 'P_AUDIT_POSE',
          x: 450,
          y: 120,
          z: 300,
          rx: 10,
          ry: 170,
          rz: 5
        },
        {
          id: 'audit_use_point',
          type: 'use_point',
          pointName: 'PT_AUDIT_POINT',
          x: 420,
          y: -80,
          z: 260
        },
        {
          id: 'audit_movej',
          type: CONSTANTS?.BLOCK_TYPES?.MOVE_J || 'move_j',
          x: 450,
          y: 120,
          z: 300,
          rx: 10,
          ry: 170,
          rz: 5,
          sourceType: 'pose',
          sourceName: 'P_AUDIT_POSE',
          speed: 50,
          zone: 'fine'
        },
        {
          id: 'audit_movel',
          type: CONSTANTS?.BLOCK_TYPES?.MOVE_L || 'move_l',
          x: 420,
          y: -80,
          z: 260,
          sourceType: 'point',
          sourceName: 'PT_AUDIT_POINT',
          speed: 120,
          zone: 'fine'
        },
        {
          id: 'audit_movec',
          type: CONSTANTS?.BLOCK_TYPES?.MOVE_C || 'move_c',
          via_x: 430,
          via_y: -30,
          via_z: 280,
          end_x: 460,
          end_y: 40,
          end_z: 290,
          speed: 90,
          zone: 'fine',
          via_sourceType: 'point',
          via_sourceName: 'PT_AUDIT_POINT',
          end_sourceType: 'pose',
          end_sourceName: 'P_AUDIT_POSE'
        }
      ];

      const educational = String(generateCodeForSelectedRobot(robot, program, modeEdu, {
        instrumentation: false,
        mode: 'flat'
      }) || '');
      const industrial = String(generateCodeForSelectedRobot(robot, program, modeInd, {
        instrumentation: false,
        executionMode: 'flat'
      }) || '');

      const pushContainsCheck = (block, eduNeedle, indNeedle, issue) => {
        const eduOk = eduNeedle ? educational.includes(eduNeedle) : true;
        const indOk = indNeedle ? industrial.includes(indNeedle) : true;
        addCheck({
          block,
          educational: eduNeedle || '',
          industrial: indNeedle || '',
          ok: eduOk && indOk,
          issue: eduOk && indOk ? '' : issue
        });
      };

      pushContainsCheck(
        'set_tool/manual',
        'Seleccionar Herramienta: Manual',
        '# Selección de herramienta: Manual',
        'Desalineación en etiqueta de herramienta manual entre educativo e industrial.'
      );
      pushContainsCheck(
        'set_tool/tcp',
        'TCP Manual: (X:100, Y:20, Z:150, Rx:0, Ry:180, Rz:0)',
        'set_tcp(p[0.1, 0.02, 0.15, 0, 3.141592653589793, 0])',
        'TCP manual o conversión mm→m / grados→radianes no coincide.'
      );

      pushContainsCheck(
        'define_pose',
        'Definir Pose: P_AUDIT_POSE (X: 450, Y: 120, Z: 300, Rx: 10, Ry: 170, Rz: 5)',
        '',
        'El texto educativo de define_pose no coincide con el esperado.'
      );
      if (!industrial.includes('P_AUDIT_POSE')) {
        warnings.push('define_pose no emite línea explícita en industrial (esperable si es metadata de edición).');
      }

      pushContainsCheck(
        'define_point',
        'Definir Punto: PT_AUDIT_POINT (X: 420, Y: -80, Z: 260)',
        '',
        'El texto educativo de define_point no coincide con el esperado.'
      );
      if (!industrial.includes('PT_AUDIT_POINT')) {
        warnings.push('define_point no emite línea explícita en industrial (esperable si es metadata de edición).');
      }

      pushContainsCheck(
        'use_pose',
        'Usar Pose: P_AUDIT_POSE (X: 450, Y: 120, Z: 300, Rx: 10, Ry: 170, Rz: 5)',
        '',
        'El texto educativo de use_pose no coincide con el esperado.'
      );
      if (!industrial.includes('P_AUDIT_POSE')) {
        warnings.push('use_pose no aparece literal en industrial; la pose se refleja en comandos move* resultantes.');
      }

      pushContainsCheck(
        'use_point',
        'Usar Punto: PT_AUDIT_POINT (X: 420, Y: -80, Z: 260)',
        '',
        'El texto educativo de use_point no coincide con el esperado.'
      );
      if (!industrial.includes('PT_AUDIT_POINT')) {
        warnings.push('use_point no aparece literal en industrial; el punto se refleja en comandos move* resultantes.');
      }

      pushContainsCheck(
        'movej',
        'Mover Articular a (X: 450, Y: 120, Z: 300)',
        'movej(',
        'Educativo no marca movej como articular o industrial no genera movej.'
      );

      const movejPoseMetersOk = industrial.includes('p[0.45000, 0.12000, 0.30000');
      addCheck({
        block: 'movej/mm_to_m',
        educational: 'X:450,Y:120,Z:300 mm',
        industrial: 'p[0.45000, 0.12000, 0.30000, ...]',
        ok: movejPoseMetersOk,
        issue: movejPoseMetersOk ? '' : 'Conversión mm→m en movej no encontrada como se esperaba.'
      });

      const movejRads = [0.17453, 2.96706, 0.08727];
      const hasMovejRads = movejRads.every((value) => industrial.includes(value.toFixed(5)));
      addCheck({
        block: 'movej/degrees_to_radians',
        educational: 'Rx:10,Ry:170,Rz:5 (grados)',
        industrial: `rx/ry/rz ≈ ${movejRads.map(v => v.toFixed(5)).join(', ')}`,
        ok: hasMovejRads,
        issue: hasMovejRads ? '' : 'No se detecta conversión consistente grados→radianes en movej.'
      });

      pushContainsCheck(
        'movel',
        'Mover Lineal a (X: 420, Y: -80, Z: 260)',
        'movel(',
        'Educativo no marca movel como lineal o industrial no genera movel.'
      );

      const movelMetersOk = industrial.includes('p[0.42000, -0.08000, 0.26000');
      addCheck({
        block: 'movel/mm_to_m',
        educational: 'X:420,Y:-80,Z:260 mm',
        industrial: 'p[0.42000, -0.08000, 0.26000, ...]',
        ok: movelMetersOk,
        issue: movelMetersOk ? '' : 'Conversión mm→m en movel no encontrada como se esperaba.'
      });

      pushContainsCheck(
        'movec',
        'Mover Circular vía (X: 430, Y: -30, Z: 280)',
        'movec(',
        'Educativo no describe movec o industrial no genera movec.'
      );

      const movecMetersOk = industrial.includes('p[0.43000, -0.03000, 0.28000')
        && industrial.includes('p[0.46000, 0.04000, 0.29000');
      addCheck({
        block: 'movec/mm_to_m',
        educational: 'via/end en mm',
        industrial: 'via/end en metros',
        ok: movecMetersOk,
        issue: movecMetersOk ? '' : 'Conversión mm→m en movec no encontrada como se esperaba.'
      });

      const ok = checks.every(c => c.ok);
      const result = { ok, checks, missing, warnings };

      try {
        console.group('[AUDIT] Educational vs Industrial simple moves');
        console.table(checks.map(c => ({ block: c.block, ok: c.ok, issue: c.issue || '' })));
        if (warnings.length > 0) console.warn('[AUDIT][warnings]', warnings);
        console.groupEnd();
      } catch (_err) {
      }

      return result;
    };

    window.debugIndustrialVerificationAudit = function debugIndustrialVerificationAudit() {
      const checks = [];
      const missing = [];
      const warnings = [];

      const addCheck = (check, ok, failureDetail, successDetail = '') => {
        const passed = !!ok;
        checks.push({
          check,
          ok: passed,
          detail: passed ? successDetail : (failureDetail || 'Check failed')
        });
        if (!passed) {
          missing.push({ check, issue: failureDetail || 'Check failed' });
        }
      };

      const robot = CONSTANTS?.ROBOTS?.UR3E;
      const modeIndustrial = CONSTANTS?.MODES?.INDUSTRIAL;
      const compilePlan = window.CompilerAPI?.compilePlanFromProgram;
      if (!robot || !modeIndustrial || typeof generateCodeForSelectedRobot !== 'function' || typeof compilePlan !== 'function') {
        addCheck('setup/dependencies', false, 'dependencias no disponibles (CONSTANTS/generator/CompilerAPI)');
        return { ok: false, checks, missing, warnings };
      }

      const program = [
        {
          id: 'audit_set_tool_manual_iv',
          type: 'set_tool',
          tool_id: 'manual',
          tcp_x: 80,
          tcp_y: 10,
          tcp_z: 140,
          tcp_rx: 0,
          tcp_ry: 180,
          tcp_rz: 0
        },
        {
          id: 'audit_define_pose_iv',
          type: 'define_pose',
          name: 'P_IV_POSE',
          x: 460,
          y: 100,
          z: 280,
          rx: 15,
          ry: 165,
          rz: 5
        },
        {
          id: 'audit_define_point_iv',
          type: 'define_point',
          name: 'PT_IV_POINT',
          x: 420,
          y: -60,
          z: 250
        },
        {
          id: 'audit_movej_iv',
          type: CONSTANTS?.BLOCK_TYPES?.MOVE_J || 'move_j',
          x: 460,
          y: 100,
          z: 280,
          rx: 15,
          ry: 165,
          rz: 5,
          sourceType: 'pose',
          sourceName: 'P_IV_POSE',
          speed: 60,
          zone: 'fine'
        },
        {
          id: 'audit_movel_iv',
          type: CONSTANTS?.BLOCK_TYPES?.MOVE_L || 'move_l',
          x: 420,
          y: -60,
          z: 250,
          sourceType: 'point',
          sourceName: 'PT_IV_POINT',
          speed: 120,
          zone: 'fine'
        },
        {
          id: 'audit_movec_iv',
          type: CONSTANTS?.BLOCK_TYPES?.MOVE_C || 'move_c',
          via_x: 430,
          via_y: -20,
          via_z: 270,
          end_x: 470,
          end_y: 30,
          end_z: 285,
          speed: 100,
          zone: 'fine',
          via_sourceType: 'point',
          via_sourceName: 'PT_IV_POINT',
          end_sourceType: 'pose',
          end_sourceName: 'P_IV_POSE'
        },
        {
          id: 'audit_pallet_iv',
          type: 'palletize_block',
          pick_pose: { x: 500, y: 0, z: 100, rx: 0, ry: 180, rz: 0 },
          pallet_p1_pose: { x: 100, y: 300, z: 0, rx: 0, ry: 180, rz: 0 },
          pallet_p2: { x: 200, y: 300, z: 0 },
          pallet_p3: { x: 100, y: 400, z: 0 },
          rows: 2,
          cols: 2,
          layers: 1,
          layer_height: 60,
          pick_approach_height: 50,
          place_approach_height: 50,
          safety_margin: 100,
          pick_wait_time: 0.5,
          place_wait_time: 0.3,
          grip_close_actions: [{ type: 'set_do_block', pin: 1, state: 1 }],
          grip_open_actions: [{ type: 'set_do_block', pin: 1, state: 0 }]
        }
      ];

      const compiled = compilePlan(program);
      const plannedSteps = Array.isArray(compiled?.plannedSteps) ? compiled.plannedSteps : [];
      const snapshotId = 'audit_industrial_verification_snapshot';

      const industrialNormal = String(generateCodeForSelectedRobot(robot, program, modeIndustrial, {
        instrumentation: false,
        executionMode: 'flat'
      }) || '');

      const verification = String(generateCodeForSelectedRobot(robot, program, modeIndustrial, {
        instrumentation: true,
        executionMode: 'planned',
        plannedSteps,
        program_snapshot_id: snapshotId,
        snapshot_id: snapshotId
      }) || '');

      const countMatches = (text, regex) => {
        const match = text.match(regex);
        return match ? match.length : 0;
      };

      // A) Instrumentación
      addCheck('instr/step_end presence', verification.includes('step_end('), 'No aparece step_end(...) en verificación.');
      addCheck('instr/snapshot_short presence', verification.includes('snapshot_short='), 'No aparece snapshot_short en verificación.');
      addCheck('instr/step_id payload presence', verification.includes('step_id') || verification.includes('fp_last_step_id'), 'No aparece step_id/fp_last_step_id en verificación.');
      const hasTelemetryBlock = verification.includes('SOCKET TELEMETRY')
        && verification.includes('socket_open(')
        && verification.includes('socket_send_line(')
        && verification.includes('thread fp_sender_thread()');
      addCheck('instr/telemetry block presence', hasTelemetryBlock, 'No se detecta bloque de telemetría por socket esperado.');

      // snapshot_short coherente en comentarios/global
      const snapComment = verification.match(/# snapshot_short=(\d+)/);
      const snapGlobal = verification.match(/global fp_snapshot_short = (\d+)/);
      const snapshotConsistent = !!snapComment && !!snapGlobal && snapComment[1] === snapGlobal[1];
      addCheck('instr/snapshot_short consistency', snapshotConsistent, 'snapshot_short comentario/global no coincide.');

      // B) Movimientos equivalentes
      const normalMoveJ = countMatches(industrialNormal, /\bmovej\(/g);
      const normalMoveL = countMatches(industrialNormal, /\bmovel\(/g);
      const normalMoveC = countMatches(industrialNormal, /\bmovec\(/g);
      const verifyMoveJ = countMatches(verification, /\bmovej\(/g);
      const verifyMoveL = countMatches(verification, /\bmovel\(/g);
      const verifyMoveC = countMatches(verification, /\bmovec\(/g);

      addCheck('moves/movej present both', normalMoveJ > 0 && verifyMoveJ > 0, 'movej no está presente en ambos modos.');
      addCheck('moves/movel present both', normalMoveL > 0 && verifyMoveL > 0, 'movel no está presente en ambos modos.');
      addCheck('moves/movec present both', normalMoveC > 0 && verifyMoveC > 0, 'movec no está presente en ambos modos.');

      if (normalMoveJ !== verifyMoveJ || normalMoveL !== verifyMoveL || normalMoveC !== verifyMoveC) {
        warnings.push(`Conteos de movimiento difieren (aceptable si hay expansión/plan): normal J/L/C=${normalMoveJ}/${normalMoveL}/${normalMoveC}, verificación J/L/C=${verifyMoveJ}/${verifyMoveL}/${verifyMoveC}.`);
      }

      // C) Unidades y orientación
      addCheck(
        'units/meters movej both',
        industrialNormal.includes('p[0.46000, 0.10000, 0.28000') && verification.includes('p[0.46000, 0.10000, 0.28000'),
        'No se detecta coordenada en metros esperada para movej en ambos modos.'
      );
      addCheck(
        'units/meters movel both',
        industrialNormal.includes('p[0.42000, -0.06000, 0.25000') && verification.includes('p[0.42000, -0.06000, 0.25000'),
        'No se detecta coordenada en metros esperada para movel en ambos modos.'
      );
      const radTriplet = [0.2618, 2.87979, 0.08727].map(v => v.toFixed(5));
      const normalHasRads = radTriplet.every(v => industrialNormal.includes(v));
      const verifyHasRads = radTriplet.every(v => verification.includes(v));
      addCheck('orientation/radians both', normalHasRads && verifyHasRads, 'No se detecta orientación en radianes consistente en ambos modos.');

      // D) Paletizado estrategia y equivalencia lógica
      const palletLoopNormal = industrialNormal.includes('while layer < 1:') && industrialNormal.includes('while row < 2:') && industrialNormal.includes('while col < 2:');
      const palletLoopVerify = verification.includes('while layer < 1:') && verification.includes('while row < 2:') && verification.includes('while col < 2:');
      if (!palletLoopNormal || !palletLoopVerify) {
        warnings.push('No se detectaron exactamente los bucles esperados 2x2x1 en alguno de los modos (puede ser expansión equivalente).');
      }

      const strategyMarkers = [
        '# PICK: Aproximación',
        '# PICK: Descenso',
        '# PICK: Retirada local a aproximación',
        '# PLACE: Movimiento articular a XY a altura segura',
        '# PLACE: Descenso a aproximación',
        '# PLACE: Descenso final',
        '# PLACE: Levantar'
      ];
      const strategyNormalOk = strategyMarkers.every(m => industrialNormal.includes(m));
      const strategyVerifyOk = strategyMarkers.every(m => verification.includes(m));
      addCheck('pallet/strategy markers both', strategyNormalOk && strategyVerifyOk, 'Estrategia esperada de paletizado no detectada completa en ambos modos.');

      addCheck(
        'pallet/formula place_x both',
        industrialNormal.includes('place_x = p1_x + col * dx_x + row * dy_x') && verification.includes('place_x = p1_x + col * dx_x + row * dy_x'),
        'Fórmula de place_x no coincide entre modos.'
      );
      addCheck(
        'pallet/formula place_z both',
        industrialNormal.includes('place_z = p1_z + col * dx_z + row * dy_z + layer * step_z') && verification.includes('place_z = p1_z + col * dx_z + row * dy_z + layer * step_z'),
        'Fórmula de place_z no coincide entre modos.'
      );

      // E) Orden y step_end
      const verificationLines = verification.split('\n');
      const firstMoveLineIndex = verificationLines.findIndex(line => /\bmovej\(|\bmovel\(|\bmovec\(/.test(line));
      const earlyStepEndEntries = [];
      for (let i = 0; i < verificationLines.length; i += 1) {
        if (!verificationLines[i].includes('step_end(')) continue;
        if (firstMoveLineIndex >= 0 && i >= firstMoveLineIndex) continue;
        earlyStepEndEntries.push({ idx: i, line: verificationLines[i].trim() });
      }

      const isExpectedEarlyStepEnd = (entry) => {
        const line = entry.line;
        if (/^def\s+step_end\(/.test(line)) return true;
        if (/^step_end\(10000\)/.test(line) || /^step_end\(20000\)/.test(line)) return true;

        const ctxStart = Math.max(0, entry.idx - 6);
        const ctx = verificationLines.slice(ctxStart, entry.idx + 1).join('\n');
        return /INSTRUMENTATION SECTION|SOCKET TELEMETRY|def cycle_start\(|def cycle_end\(|snapshot_short|fp_last_step_id|verify_count|verify_ids/.test(ctx);
      };

      const unexpectedEarlyStepEnd = earlyStepEndEntries.filter(entry => !isExpectedEarlyStepEnd(entry));
      if (unexpectedEarlyStepEnd.length > 0) {
        warnings.push(`step_end temprano sin contexto reconocible: ${unexpectedEarlyStepEnd.map(e => `${e.idx + 1}:${e.line}`).join(' | ')}`);
      }

      const stepEndLines = verificationLines.map(l => l.trim());
      let orderStepEndOk = true;
      for (let i = 0; i < stepEndLines.length; i += 1) {
        const line = stepEndLines[i];
        if (!line.startsWith('step_end(')) continue;
        if (line.startsWith('step_end(10000)') || line.startsWith('step_end(20000)')) continue;
        const windowStart = Math.max(0, i - 6);
        const context = stepEndLines.slice(windowStart, i + 1).join('\n');
        const looksLinked = /movej\(|movel\(|movec\(|_sid\s*=/.test(context);
        if (!looksLinked) {
          orderStepEndOk = false;
          break;
        }
      }
      addCheck('order/step_end after verifiable action', orderStepEndOk, 'Se detectó step_end sin contexto de movimiento/sid cercano.');

      const hasStepIdFlow = verification.includes('global fp_last_step_id = step_id')
        && verification.includes('local_step_id = fp_last_step_id')
        && verification.includes('to_str(local_step_id)');
      addCheck('order/step_id flow coherence', hasStepIdFlow, 'No se detecta flujo coherente de step_id en telemetría.');

      const ok = missing.length === 0 && checks.every(c => c.ok);
      const result = { ok, checks, missing, warnings };

      try {
        console.group('[AUDIT] Industrial normal vs Verification/Instrumented');
        console.table(checks);
        if (warnings.length > 0) {
          console.warn('[AUDIT][warnings]', warnings);
        }
        if (missing.length > 0) {
          console.error('[AUDIT][missing]', missing);
        }
        console.groupEnd();
      } catch (_err) {
      }

      return result;
    };
  } else if (typeof window.runPalletizeGripperRegressionTest === 'function') {
    try {
      delete window.runPalletizeGripperRegressionTest;
    } catch (_err) {
      window.runPalletizeGripperRegressionTest = undefined;
    }
  }

  if (!isDebugRegressionEnabled() && typeof window.debugEducationalPalletizingTest === 'function') {
    try {
      delete window.debugEducationalPalletizingTest;
    } catch (_err) {
      window.debugEducationalPalletizingTest = undefined;
    }
  }

  if (!isDebugRegressionEnabled() && typeof window.debugEducationalIndustrialSimpleMovesAudit === 'function') {
    try {
      delete window.debugEducationalIndustrialSimpleMovesAudit;
    } catch (_err) {
      window.debugEducationalIndustrialSimpleMovesAudit = undefined;
    }
  }

  if (!isDebugRegressionEnabled() && typeof window.debugIndustrialVerificationAudit === 'function') {
    try {
      delete window.debugIndustrialVerificationAudit;
    } catch (_err) {
      window.debugIndustrialVerificationAudit = undefined;
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
      if (typeof scheduleUndoRedoPosition === 'function') {
        scheduleUndoRedoPosition();
      }
    } catch (e) { }
  };

  /* Inicialización de Splitters y Toggle de Panel JSON */
  initSplitters();
  initVerticalSplitter();
  initJsonPanelToggle();
  initUrInstrumentationToggle();
  initUrSocketConfig();
  initDefaultSpeedField();
  initRobotSelect();
  initProgramNameField();


  /* Inicialización Principal de Blockly */
  defineBlocks();
  workspace = Blockly.inject('blocklyDiv', {
    toolbox: document.getElementById('toolbox'),
    scrollbars: true,
    trashcan: true,
    zoom: { controls: true, wheel: true }
  });
  window.workspace = workspace;

  function hideBlocklyCenterControl() {
    const root = document.querySelector('.blockly-editor-shell');
    if (!root) return;

    const selectors = [
      '.blocklyZoomReset',
      '.blocklyZoomToFit',
      '[aria-label="Zoom to fit"]',
      '[aria-label="Center blocks"]',
      '[title="Zoom to fit"]',
      '[title="Center blocks"]'
    ];

    selectors.forEach((selector) => {
      root.querySelectorAll(selector).forEach((node) => {
        node.style.display = 'none';
        node.style.pointerEvents = 'none';
      });
    });
  }

  function ensureUndoRedoControlsContainer() {
    const blocklyDiv = document.getElementById('blocklyDiv');
    const controls = document.querySelector('.blockly-undo-redo-native');
    if (!blocklyDiv || !controls) return null;

    if (controls.parentElement !== blocklyDiv) {
      blocklyDiv.appendChild(controls);
    }

    return controls;
  }

  function positionUndoRedoControls() {
    const root = document.getElementById('blocklyDiv');
    const controls = ensureUndoRedoControlsContainer();
    if (!root || !controls) return;

    const rootRect = root.getBoundingClientRect();
    const rightZoneMin = rootRect.right - 180;
    const bottomZoneMin = rootRect.top + (rootRect.height * 0.45);

    const visibleNodes = (selectors) => Array.from(root.querySelectorAll(selectors)).filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });

    const bottomRightNodes = (nodes) => nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      return centerX >= rightZoneMin && rect.top >= bottomZoneMin;
    });

    const zoomInCandidates = visibleNodes(
      '.blocklyZoomIn, [aria-label="Zoom in"], [title="Zoom in"], [aria-label="Aumentar zoom"], [title="Aumentar zoom"]'
    );
    const zoomOutCandidates = visibleNodes(
      '.blocklyZoomOut, [aria-label="Zoom out"], [title="Zoom out"], [aria-label="Reducir zoom"], [title="Reducir zoom"]'
    );
    const fallbackCandidates = visibleNodes('.blocklyZoom, [class*="blocklyZoom"]');
    const pickLowestVisible = (nodes) => nodes
      .slice()
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        if (rightRect.top !== leftRect.top) return rightRect.top - leftRect.top;
        return rightRect.right - leftRect.right;
      })[0];

    const zoomInBottomRight = bottomRightNodes(zoomInCandidates);
    const zoomOutBottomRight = bottomRightNodes(zoomOutCandidates);
    const fallbackBottomRight = bottomRightNodes(fallbackCandidates);

    let anchorNode = pickLowestVisible(zoomInBottomRight) || pickLowestVisible(zoomInCandidates);
    if (!anchorNode) {
      const stackedCandidates = [...zoomOutBottomRight, ...fallbackBottomRight, ...zoomOutCandidates, ...fallbackCandidates]
        .slice()
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          if (rightRect.top !== leftRect.top) return rightRect.top - leftRect.top;
          return rightRect.right - leftRect.right;
        });

      if (stackedCandidates.length >= 2) {
        const lowestTop = stackedCandidates[0].getBoundingClientRect().top;
        const secondTop = stackedCandidates[1].getBoundingClientRect().top;
        const closePair = Math.abs(lowestTop - secondTop) <= 96;
        anchorNode = closePair ? stackedCandidates[1] : stackedCandidates[0];
      } else {
        anchorNode = stackedCandidates[0] || null;
      }
    }

    const gap = 0;

    if (!anchorNode) {
      controls.style.right = '16px';
      controls.style.bottom = '72px';
      controls.style.left = 'auto';
      controls.style.top = 'auto';
      return;
    }

    const anchorRect = anchorNode.getBoundingClientRect();

    requestAnimationFrame(() => {
      const controlsWidth = controls.offsetWidth || 36;
      const right = Math.max(12, Math.round(rootRect.right - anchorRect.right + ((anchorRect.width - controlsWidth) / 2)));
      const bottom = Math.max(12, Math.round(rootRect.bottom - anchorRect.top + gap));
      controls.style.right = `${right}px`;
      controls.style.bottom = `${bottom}px`;
      controls.style.left = 'auto';
      controls.style.top = 'auto';
    });
  }

  function scheduleUndoRedoPosition() {
    requestAnimationFrame(() => {
      positionUndoRedoControls();
    });
  }

  requestAnimationFrame(() => {
    hideBlocklyCenterControl();
    ensureUndoRedoControlsContainer();
    positionUndoRedoControls();
  });

  setTimeout(() => {
    hideBlocklyCenterControl();
    ensureUndoRedoControlsContainer();
    positionUndoRedoControls();
  }, 150);

  window.addEventListener('resize', scheduleUndoRedoPosition);

  if (typeof ResizeObserver === 'function') {
    const blocklyResizeRoot = document.getElementById('blocklyDiv');
    if (blocklyResizeRoot) {
      const undoRedoResizeObserver = new ResizeObserver(() => {
        scheduleUndoRedoPosition();
      });
      undoRedoResizeObserver.observe(blocklyResizeRoot);
    }
  }

  function isTypingInFormField() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable
    );
  }

  // Blockly mantiene internamente una pila de undo/redo.
  // undo(false) = deshacer, undo(true) = rehacer.
  const undoBtn = document.getElementById('blocklyUndoBtn');
  const redoBtn = document.getElementById('blocklyRedoBtn');

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (workspace && typeof workspace.undo === 'function') {
        workspace.undo(false);
      }
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      if (workspace && typeof workspace.undo === 'function') {
        workspace.undo(true);
      }
    });
  }

  document.addEventListener('keydown', function (event) {
    if (isTypingInFormField()) return;
    if (!workspace || typeof workspace.undo !== 'function') return;

    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

    if (!ctrlOrCmd) return;

    const key = event.key.toLowerCase();

    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      workspace.undo(false);
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      workspace.undo(true);
    }
  });

  /* Listener de Cambios en el Workspace de Blockly */
  workspace.addChangeListener((event) => {
    if (event.type == Blockly.Events.UI) {
      return;
    }
    try {
      requestUpdateOutputs('blockly_event');
    } catch (e) { }

    if (event.type === Blockly.Events.BLOCK_MOVE) {
      return;
    }

    if (typeof scheduleRegistryRebuild === 'function') {
      if (event.type === Blockly.Events.BLOCK_DELETE) {
        scheduleRegistryRebuild(workspace);
        schedulePalletizeAngleWarnings(workspace);
        return;
      }

      if (
        event.type === Blockly.Events.BLOCK_CREATE ||
        event.type === Blockly.Events.BLOCK_CHANGE
      ) {
        const block = event.blockId ? workspace.getBlockById(event.blockId) : null;
        const blockType = block?.type;
        if (
          blockType === 'define_point' ||
          blockType === 'define_pose' ||
          blockType === 'define_frame'
        ) {
          scheduleRegistryRebuild(workspace);
        }

        if (blockType === 'define_point' || blockType === 'palletize_block' || blockType === 'use_point') {
          schedulePalletizeAngleWarnings(workspace);
        } else if (blockType) {
          let parent = block.getParent();
          while (parent) {
            if (parent.type === 'palletize_block') {
              schedulePalletizeAngleWarnings(workspace);
              break;
            }
            parent = parent.getParent();
          }
        }
      }
    }
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
  /* Carga de Bloques de Ejemplo al Iniciar — DESACTIVADO: workspace vacío por defecto */
  // const exampleXML = `...`; // bloques de demo eliminados del arranque
  
  /* Actualización Inicial de Salidas al Cargar la Página */
  updateOutputs();

  /* Listeners para los Controles de la Interfaz de Usuario */
  
  // Función centralizada para manejar el cambio de robot
  function handleRobotChange() {
    const select = document.getElementById('robotSelect');
    if (select?.value) localStorage.setItem(ROBOT_SELECT_STORAGE_KEY, select.value);
    workspace.getAllBlocks(false).forEach(block => {
      if (block.type === 'set_tool') {
        const dropdown = block.getField('TOOL_ID');
        if (dropdown) {
          dropdown.getOptions(true); 
        }
      }
    });
    requestUpdateOutputs('robot_change');
  }

  document.getElementById('robotSelect').addEventListener('change', handleRobotChange);
  // ❌ ELIMINAR ESTA LÍNEA:
  // document.getElementById('modeSelect').addEventListener('change', updateOutputs);
  document.getElementById('defaultSpeed').addEventListener('input', () => requestUpdateOutputs('default_speed_input'));

  window.requestUpdateOutputs = requestUpdateOutputs;
  window.updateOutputs = updateOutputs;

  /* Listener del Botón de Copiar Código */
  document.getElementById('copyBtn').addEventListener('click', async () => {
    const robot = document.getElementById("robotSelect").value;
    const options = { instrumentation: getUrInstrumentationEnabled() };
    // ✅ Siempre usar modo INDUSTRIAL
    const code = generateCodeForSelectedRobot(robot, workspaceToProgram(workspace), CONSTANTS.MODES.INDUSTRIAL, options);
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
    const activeProgramName = getActiveProgramName();
    const code = document.getElementById("codeIndustrial")?.textContent || '';
    const codeToDownload = robot === CONSTANTS.ROBOTS.UR3E
      ? (() => {
          // Partimos del texto visible para evitar divergencias con snapshot_id.
          let s = String(code || '');

          // Quitar cabeceras UI si aparecen en la vista copiada.
          s = s
            .replace(/^Modo:\s.*(?:\r?\n)?/m, '')
            .replace(/^Snapshot:\s.*(?:\r?\n)?/m, '')
            .replace(/^#\s*plannedSteps=.*(?:\r?\n)?/m, '')
            .replace(/^#\s*plannedSteps=0\s*\(compilación vacía\)(?:\r?\n)?/m, '');

          const lines = s.split('\n');

          const defIdx = lines.findIndex(line => line.trim() === 'def program():');
          if (defIdx !== -1) {
            lines.splice(defIdx, 1);

            let tail = lines.length - 1;
            while (tail >= 0 && lines[tail].trim() === '') tail--;
            if (tail >= 0 && lines[tail].trim() === 'program()') {
              lines.splice(tail, 1);
            }

            tail = lines.length - 1;
            while (tail >= 0 && lines[tail].trim() === '') tail--;
            if (tail >= 0 && lines[tail].trim() === 'end') {
              lines.splice(tail, 1);
            }

            const dedented = lines.map(line => line.startsWith(' ') ? line.slice(1) : line);
            s = dedented.join('\n');
          }

          return s.replace(/\n{3,}/g, '\n\n').trimEnd();
        })()
      : code;
    
    if (!codeToDownload || codeToDownload.trim() === '') {
      showToast("No hay código para descargar");
      return;
    }
    
    // Determinar la extensión del archivo según el robot
    let extension = '.txt';
    
    if (robot === CONSTANTS.ROBOTS.UR3E) {
      extension = '.script';
    } else if (robot === CONSTANTS.ROBOTS.ABB) {
      extension = '.mod';
    } else if (robot === CONSTANTS.ROBOTS.FANUC) {
      extension = '.ls';
    }
    
    // Crear blob y descargar
    const blob = new Blob([codeToDownload], { type: 'text/plain;charset=utf-8' });
    const filename = `${sanitizeProgramNameForFilename(activeProgramName)}${extension}`;
    
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
    console.debug('[SIM BUTTON CLICK]');

    let flatProgram = [];

    try {
      const programName = getCurrentProgramNameSafe();
      const activeWorkspace = getActiveWorkspaceSafe();
      const program = typeof workspaceToProgram === 'function'
        ? workspaceToProgram(activeWorkspace)
        : [];

      if (localStorage.getItem('fp_debug') === 'true') {
        const allBlocks = activeWorkspace && typeof activeWorkspace.getAllBlocks === 'function'
          ? activeWorkspace.getAllBlocks(false)
          : [];
        const topBlocksFalse = activeWorkspace && typeof activeWorkspace.getTopBlocks === 'function'
          ? activeWorkspace.getTopBlocks(false)
          : [];
        const topBlocksTrue = activeWorkspace && typeof activeWorkspace.getTopBlocks === 'function'
          ? activeWorkspace.getTopBlocks(true)
          : [];
        console.debug('[SIM PREP] workspace exists', !!activeWorkspace);
        console.debug('[SIM PREP] workspace id', activeWorkspace && activeWorkspace.id);
        console.debug('[SIM PREP] all blocks', allBlocks.map((block) => block?.type));
        console.debug('[SIM PREP] top blocks false', topBlocksFalse.map((block) => block?.type));
        console.debug('[SIM PREP] top blocks true', topBlocksTrue.map((block) => block?.type));
        console.debug('[SIM PREP] program JSON raw', program);
      }

      function flatten(block) {
        if (!block) return;
        const { next, ...rest } = block;
        flatProgram.push(rest);
        flatten(next);
      }

      if (Array.isArray(program)) {
        program.forEach(flatten);
      }

      localStorage.setItem('robotProgramForSimulation', JSON.stringify(flatProgram));
      localStorage.setItem('robotProgramNameForSimulation', programName);

      if (localStorage.getItem('fp_debug') === 'true') {
        console.debug('[SIM SEND PROGRAM]', program.map((block) => block?.type));
        console.debug('[SIM SEND PROGRAM LENGTH]', program.length);
      }

      if (program.length === 0 && localStorage.getItem('fp_debug') === 'true') {
        console.warn('[SIM PREP] program is empty');
      }
    } catch (error) {
      console.error('[SIM BUTTON ERROR]', error);
      alert('Error al preparar la simulación. Revisa la consola.');
      return;
    }

    const simWindow = window.open('simulator.html', '_blank');
    if (!simWindow) {
      console.warn('[SIM BUTTON POPUP BLOCKED]');
      window.location.href = 'simulator.html';
    }
    showToast('✅ Simulador abierto. Los cambios se sincronizan automáticamente.');
  });

  /* Listener del Botón de Guardar Bloques */
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const hasBlocks = workspace.getAllBlocks(false).length > 0;
    if (!hasBlocks) {
      showToast("No hay bloques para guardar");
      return;
    }
    await downloadWorkspaceAsXML(workspace);
  });

  /* Listener del Botón de Cargar Bloques */
  document.getElementById('loadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  /* Listener del Input de Archivo (oculto) */
  document.getElementById('fileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      // ✅ onNameResolved: actualiza el campo y localStorage con el nombre extraído del XML
      const onNameResolved = (resolvedName) => {
        const input = document.getElementById('programName');
        if (input) input.value = resolvedName;
        localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, resolvedName);
      };
      const onSnapshotResolved = async (snapshotMeta) => {
        const programName = String(snapshotMeta?.program_name || '').trim();
        let snapshotId = String(
          snapshotMeta?.program_snapshot_id
          || snapshotMeta?.snapshot_id
          || ''
        ).trim();
        let snapshotShort = normalizeSnapshotShort(snapshotMeta?.snapshot_short, snapshotId);
        const instrumentationEnabled = snapshotMeta?.instrumentation_enabled === true;

        if (instrumentationEnabled && Number.isFinite(snapshotShort) && snapshotShort > 0) {
          try {
            const plannedStepsCount = getWorkspacePlannedStepsCount(workspace);
            const resolvedByShort = await resolveSnapshotFromShortWithContext(snapshotShort, {
              program_name: programName || getActiveProgramName(),
              plannedSteps_count: plannedStepsCount
            });

            const resolvedSnapshotId = String(
              resolvedByShort?.snapshot_id
              || resolvedByShort?.program_snapshot_id
              || ''
            ).trim();

            if (resolvedSnapshotId) {
              snapshotId = resolvedSnapshotId;
              snapshotShort = normalizeSnapshotShort(
                resolvedByShort?.snapshot_short ?? snapshotShort,
                snapshotId
              );
            }

            console.debug(
              `[SNAPSHOT ACTIVE] loaded snapshot_short=${snapshotShort ?? 'null'} ` +
              `resolved snapshot_id=${snapshotId || 'null'} currentProgramSnapshotId=${snapshotId || 'null'}`
            );
          } catch (error) {
            console.warn('[SNAPSHOT ACTIVE] error resolving snapshot_short during XML load:', error);
          }
        }

        // Log con información de instrumentación correcta
        if (instrumentationEnabled) {
          console.log(`[XML LOAD] program_name=${programName || '-'} instrumentation_enabled=true snapshot_id=${snapshotId || 'null'} snapshot_short=${Number.isFinite(snapshotShort) ? snapshotShort : 'null'}`);
        } else {
          console.log(`[XML LOAD] program_name=${programName || '-'} instrumentation_enabled=false snapshot_id=null snapshot_short=null`);
        }

        if (programName) {
          localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, programName);
        }

        if (snapshotId) {
          persistActiveSnapshotInStorage(snapshotId, snapshotShort, programName || getActiveProgramName());
          lastInstrumentedSnapshotId = snapshotId;
          lastInstrumentedSnapshotSignature = '';

          const workspaceFingerprint = buildWorkspaceFingerprint(workspace);
          restoredSnapshotFromXml = {
            snapshotId,
            snapshotShort,
            workspaceFingerprint
          };

          if (typeof window.getSnapshot === 'function') {
            const existingSnapshot = await window.getSnapshot(snapshotId).catch(() => null);
            if (existingSnapshot) {
              const existingShort = normalizeSnapshotShort(existingSnapshot?.snapshot_short, snapshotId);
              if (Number.isFinite(existingShort)) {
                restoredSnapshotFromXml.snapshotShort = existingShort;
                localStorage.setItem(SNAPSHOT_SHORT_STORAGE_KEY, String(existingShort));
              }
              console.log(`[SNAPSHOT RESTORE] reused snapshot_id from XML: ${snapshotId}`);
            } else {
              console.warn(`[SNAPSHOT RESTORE] XML snapshot_id not found in IDB, will recreate on next compile: ${snapshotId}`);
            }
          }
        }
      };
      loadWorkspaceFromXML(file, workspace, updateOutputs, onNameResolved, onSnapshotResolved);
    }
    event.target.value = '';
  });
});
