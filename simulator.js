// SECCIÓN 500: Importación de Módulos de Three.js
// Carga de la librería THREE.js y el controlador OrbitControls para la navegación 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// SECCIÓN 501: Configuración Inicial y Referencias al DOM
// Referencias a elementos de la interfaz y variables globales para el estado de la simulación.
const statusText = document.getElementById('status-text');
const runBtn = document.getElementById('runSimulationBtn');
const pauseBtn = document.getElementById('pauseSimulationBtn');
const clearBtn = document.getElementById('clearTrajectoryBtn');
const currentBlockText = document.getElementById('current-block-text');
const comparisonTbody = document.getElementById('comparison-tbody');
const btnCompareMqttRun = document.getElementById('btnCompareMqttRun');
const comparisonRunInfo = document.getElementById('comparisonRunInfo');
const persistedRunSelect = document.getElementById('persistedRunSelect');
const btnCompareSelectedRun = document.getElementById('btnCompareSelectedRun');
const toggleComparisonDetailsBtn = document.getElementById('toggleComparisonDetailsBtn');
const comparisonDetailsContainer = document.getElementById('comparisonDetailsContainer');

// Función para actualizar el estado con historial
function updateStatus(text, isActive = true) {
    const line = document.createElement('div');
    line.className = `status-line ${isActive ? 'active' : 'completed'}`;
    const parts = String(text || '').split('\n');
    if (parts.length <= 1) {
        line.textContent = text;
    } else {
        const primaryLine = document.createElement('div');
        primaryLine.className = 'status-line-primary';
        primaryLine.textContent = parts[0];
        line.appendChild(primaryLine);

        for (let index = 1; index < parts.length; index += 1) {
            const secondaryLine = document.createElement('div');
            secondaryLine.className = 'status-line-secondary';
            secondaryLine.textContent = parts[index];
            line.appendChild(secondaryLine);
        }
    }
    
    // Marcar la línea anterior como completada si existe
    const previousActive = statusText.querySelector('.status-line.active');
    if (previousActive) {
        previousActive.classList.remove('active');
        previousActive.classList.add('completed');
    }
    
    statusText.appendChild(line);
    line.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

let scene, camera, renderer, controls;
let tcpObject;
let tcpVisualGroup;
let trajectoryGroup;
let palletPreviewGroup;
let worldFrameObject;
let tcpOrientationDebugFirstPalletStepLogged = false;
// Convención visual del simulador:
// El usuario trabaja en coordenadas robóticas Z-up.
// Three.js usa Y-up internamente.
// Por eso se convierten posiciones Robot(X,Y,Z) -> Three(X,Z,-Y).
function robotToThreePosition(p) {
    return new THREE.Vector3(
        (p?.x ?? 0) / 1000,
        (p?.z ?? 0) / 1000,
        -((p?.y ?? 0) / 1000)
    );
}

const initialPosition = robotToThreePosition({ x: 0, y: 0, z: 200 });

const TCP_NEUTRAL_LOGICAL_ROTATION = new THREE.Euler(0, 0, 0);

function normalizeRotationUnit(unit = 'degrees') {
    const normalized = String(unit || 'degrees').trim().toLowerCase();
    if (normalized === 'radians' || normalized === 'rad' || normalized === 'ur-rad') {
        return 'radians';
    }
    return 'degrees';
}

function toRotationVectorRadians(rx = 0, ry = 0, rz = 0, unit = 'degrees') {
    const resolvedUnit = normalizeRotationUnit(unit);
    if (resolvedUnit === 'radians') {
        return {
            rx: Number.isFinite(rx) ? rx : 0,
            ry: Number.isFinite(ry) ? ry : 0,
            rz: Number.isFinite(rz) ? rz : 0
        };
    }
    return {
        rx: (Number.isFinite(rx) ? rx : 0) * Math.PI / 180,
        ry: (Number.isFinite(ry) ? ry : 0) * Math.PI / 180,
        rz: (Number.isFinite(rz) ? rz : 0) * Math.PI / 180
    };
}

// Maps a direction vector from robot coordinates (X,Y,Z) to Three.js (X,Y-up,Z with robot Y -> -Z).
function robotDirToThreeDir(direction) {
    return new THREE.Vector3(
        direction?.x ?? 0,
        direction?.z ?? 0,
        -(direction?.y ?? 0)
    );
}

// UR rotation vector (robot frame) -> Three.js quaternion.
function urRotationVectorToThreeQuaternion(rx = 0, ry = 0, rz = 0, unit = 'degrees') {
    const rotvecRad = toRotationVectorRadians(rx, ry, rz, unit);
    const rotvecRobot = new THREE.Vector3(rotvecRad.rx, rotvecRad.ry, rotvecRad.rz);
    const angle = rotvecRobot.length();
    if (angle < 1e-9) {
        return new THREE.Quaternion();
    }
    const axisRobot = rotvecRobot.clone().normalize();
    const axisThree = robotDirToThreeDir(axisRobot).normalize();
    return new THREE.Quaternion().setFromAxisAngle(axisThree, angle);
}

function urRotationVectorToThreeEuler(rx = 0, ry = 0, rz = 0, unit = 'degrees') {
    const rotvecQuat = urRotationVectorToThreeQuaternion(rx, ry, rz, unit);
    return new THREE.Euler().setFromQuaternion(rotvecQuat, 'XYZ');
}

function createWorldFrameAxesVisualization(axisLength = 0.15, coneRadius = 0.015, coneLength = 0.12) {
    const axesGroup = new THREE.Group();
    const coneOffset = axisLength + (coneLength / 2);

    const axes = new THREE.AxesHelper(axisLength);
    axes.rotation.x = -Math.PI / 2;
    axesGroup.add(axes);

    const coneGeometryX = new THREE.ConeGeometry(coneRadius, coneLength, 8);
    const coneMaterialX = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const coneX = new THREE.Mesh(coneGeometryX, coneMaterialX);
    coneX.position.x = coneOffset;
    coneX.rotation.z = -Math.PI / 2;
    axesGroup.add(coneX);

    const coneGeometryY = new THREE.ConeGeometry(coneRadius, coneLength, 8);
    const coneMaterialY = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const coneY = new THREE.Mesh(coneGeometryY, coneMaterialY);
    coneY.position.z = -coneOffset;
    coneY.rotation.x = -Math.PI / 2;
    axesGroup.add(coneY);

    const coneGeometryZ = new THREE.ConeGeometry(coneRadius, coneLength, 8);
    const coneMaterialZ = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const coneZ = new THREE.Mesh(coneGeometryZ, coneMaterialZ);
    coneZ.position.y = coneOffset;
    axesGroup.add(coneZ);

    return axesGroup;
}

function createTcpAxesVisualization(axisLength = 0.1, coneRadius = 0.01, coneLength = 0.08) {
    const axesGroup = new THREE.Group();
    const coneOffset = axisLength + (coneLength / 2);

    const axisDefinitions = [
        { color: 0xff0000, directionRobot: new THREE.Vector3(1, 0, 0) },
        { color: 0x00ff00, directionRobot: new THREE.Vector3(0, 1, 0) },
        { color: 0x0000ff, directionRobot: new THREE.Vector3(0, 0, 1) }
    ];

    axisDefinitions.forEach((axisDef) => {
        const axisDirectionThree = robotDirToThreeDir(axisDef.directionRobot).normalize();

        const axisLineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            axisDirectionThree.clone().multiplyScalar(axisLength)
        ]);
        const axisLineMaterial = new THREE.LineBasicMaterial({ color: axisDef.color });
        const axisLine = new THREE.Line(axisLineGeometry, axisLineMaterial);
        axesGroup.add(axisLine);

        const coneGeometry = new THREE.ConeGeometry(coneRadius, coneLength, 8);
        const coneMaterial = new THREE.MeshBasicMaterial({ color: axisDef.color });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.copy(axisDirectionThree.clone().multiplyScalar(coneOffset));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisDirectionThree);
        axesGroup.add(cone);
    });

    return axesGroup;
}

function createLabeledAxesVisualization(frameName, axesVisualization, origin, rotation) {
    const frameGroup = new THREE.Group();
    frameGroup.add(axesVisualization);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(frameName, 10, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const labelGeometry = new THREE.PlaneGeometry(0.08, 0.02);
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.set(0, 0.18, 0);
    frameGroup.add(label);

    frameGroup.position.copy(origin);
    frameGroup.rotation.copy(rotation);
    return frameGroup;
}

function createFrameLabelMesh(frameName) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dcecff';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#8bb4df';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(frameName, 10, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const labelGeometry = new THREE.PlaneGeometry(0.09, 0.024);
    labelGeometry.translate(-0.045, 0.012, 0);
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.set(0, 0, 0);
    return label;
}

// Logical neutral orientation used by simulation math (not by visual-only correction).
const initialRotation = TCP_NEUTRAL_LOGICAL_ROTATION.clone();
let currentPosition = initialPosition.clone();
// ✅ NUEVO: Almacenar también la orientación actual
let currentRotation = initialRotation.clone();
let isSimulating = false;
let isPaused = false;
let currentStepIndex = 0;
let simCancelToken = 0;

// Variables para tooltips
let tooltipDiv, raycaster, mouse;

// SECCIÓN 501b: Estados de Entradas/Salidas
// Límite de iteraciones del while simulado para evitar bucles infinitos
const SIM_MAX_WHILE_ITERATIONS = 200;
const SIM_MAX_FOR_ITERATIONS = 10000;
const SIM_MAX_REPEAT_ITERATIONS = 10000;

const ioState = window.ioState = window.ioState || {
    DI: Array(9).fill(false), // índice 1..8
    DO: Array(9).fill(false), // índice 1..8
    AI: Array(5).fill(0),     // índice 1..4
    AO: Array(5).fill(0)      // índice 1..4
};
if (!Array.isArray(ioState.DI) || ioState.DI.length < 9) ioState.DI = Array(9).fill(false);
if (!Array.isArray(ioState.DO) || ioState.DO.length < 9) ioState.DO = Array(9).fill(false);
if (!Array.isArray(ioState.AI) || ioState.AI.length < 5) ioState.AI = Array(5).fill(0);
if (!Array.isArray(ioState.AO) || ioState.AO.length < 5) ioState.AO = Array(5).fill(0);

window.getSimulatedDigitalInput = function(index) {
    const pin = Number(index);
    return pin >= 1 && pin <= 8 ? !!ioState.DI[pin] : false;
};

window.setSimulatedDigitalInput = function(index, value) {
    const i = Number(index);
    if (i < 1 || i > 8) return;
    ioState.DI[i] = !!value;
    const cb = document.getElementById(`di${i}`);
    if (cb) cb.checked = !!value;
    const label = document.getElementById(`di${i}-label`);
    if (label) {
        label.textContent = value ? 'ON' : 'OFF';
        label.style.color = value ? '#16a34a' : '#9ca3af';
        label.style.fontWeight = value ? '700' : '400';
    }
    if (localStorage.getItem('fp_debug') === 'true') {
        console.log(`[SIM IO] DI${i} → ${!!value}`);
    }
};

// ✅ FRAMES: Variables para gestionar sistemas de coordenadas
let activeFrame = null; // Frame actualmente activo (null = WORLD)
const definedFrames = {}; // Diccionario de frames definidos {nombre: {origin: Vector3, rotation: Euler, visualObject: Group}}

// SECCIÓN 501c: Sistema de Planificación y Registro de Resultados
// Variables para el sistema de compilación de plan y registro de ejecución
let programSnapshotId = null;  // ID único del snapshot del programa compilado
let currentProgramSnapshotId = null; // Snapshot activo del programa cargado
let currentSnapshotShort = null;     // snapshot_short activo del programa cargado
let currentRunId = null;        // ID único de la ejecución actual
let runStartTime = null;        // Timestamp de inicio de la ejecución
let persistedRunId = null;      // ID persistido del run_sim en IndexedDB
let persistedStepPromises = []; // Promesas pendientes de persistencia por step
let activeMqttRunId = null;     // run_id del run MQTT activo (cambia con snapshot_id recibido)
let robotLiveStatusTimeout = null;
let activeComparisonRunId = null;
let activeComparisonMode = null; // "latest" | "selected" | null
let comparisonLockedByUser = false;

const plannedSteps = [];        // Array de pasos planificados con step_id
const actualResults = [];       // Array de resultados reales de ejecución
const runs = [];                // Historial de ejecuciones con metadata

// Contador global de movimientos reales ejecutados en la ruta interpretada.
// Se inicializa a 0 al inicio de cada simulación y se incrementa por cada
// movimiento de tipo move_block / move_linear_block / move_circular_block.
// Garantiza step_id 1..N sin reiniciarse en bucles ni ramas de control.
let interpretedStepCounter = 0;

// Entorno de variables para la ruta interpretada del JSON neutral.
// Se reinicia al inicio de cada simulación.
const simVariables = {};

function lockComparisonView(runId, mode) {
    activeComparisonRunId = runId || null;
    activeComparisonMode = mode || null;
    comparisonLockedByUser = Boolean(runId);
    if (comparisonLockedByUser) {
        console.log(`[COMPARE VIEW] locked run=${activeComparisonRunId}`);
    }
}

function unlockComparisonView() {
    activeComparisonRunId = null;
    activeComparisonMode = null;
    comparisonLockedByUser = false;
}

// Debug opcional de persistencia IndexedDB
const DEBUG_IDB = false;
const PROGRAM_NAME_STORAGE_KEY = 'fp_program_name';
const PROGRAM_NAME_SIM_STORAGE_KEY = 'robotProgramNameForSimulation';
const PROGRAM_SNAPSHOT_STORAGE_KEY = 'fp_program_snapshot_id';
const SNAPSHOT_ID_STORAGE_KEY = 'fp_snapshot_id';
const SNAPSHOT_SHORT_STORAGE_KEY = 'fp_snapshot_short';

// Wrapper seguro para llamadas a IndexedDB (no rompe la simulación si falla)
function safeIdbCall(callFn) {
    try {
        if (typeof callFn !== 'function') return;
        const result = callFn();
        if (result && typeof result.catch === 'function') {
            result.catch((error) => console.warn('IndexedDB error', error));
        }
    } catch (error) {
        console.warn('IndexedDB error', error);
    }
}

function normalizeSnapshotShortForSimulator(snapshotShort, snapshotId = null) {
    const parsed = Number(snapshotShort);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed & 0xFFFF;
    }
    const normalizedId = String(snapshotId || '').trim();
    if (normalizedId && typeof window.computeSnapshotShortId === 'function') {
        const computed = Number(window.computeSnapshotShortId(normalizedId));
        if (Number.isFinite(computed) && computed > 0 && computed <= 65535) {
            return computed & 0xFFFF;
        }
    }
    return null;
}

function normalizeProgramNameForMatch(name) {
    return String(name || '').trim().toLowerCase();
}

function getPlannedStepsCountFromSnapshot(snapshot) {
    if (Array.isArray(snapshot?.plannedSteps)) return snapshot.plannedSteps.length;
    const count = Number(snapshot?.plannedSteps_count);
    return Number.isFinite(count) && count >= 0 ? count : null;
}

function snapshotMatchesProgramContext(snapshot, { programName, plannedStepsCount } = {}) {
    if (!snapshot) return false;
    const targetProgramName = normalizeProgramNameForMatch(programName);
    const snapshotProgramName = normalizeProgramNameForMatch(snapshot?.program_name);
    const targetCount = Number(plannedStepsCount);
    const hasTargetCount = Number.isFinite(targetCount) && targetCount >= 0;
    const snapshotCount = getPlannedStepsCountFromSnapshot(snapshot);

    const programNameOk = targetProgramName ? snapshotProgramName === targetProgramName : true;
    const plannedCountOk = hasTargetCount ? snapshotCount === targetCount : true;
    return programNameOk && plannedCountOk;
}

function syncCurrentSnapshotState(snapshotId, snapshotShort, options = {}) {
    const normalizedId = String(snapshotId || '').trim() || null;
    const normalizedShort = normalizeSnapshotShortForSimulator(snapshotShort, normalizedId);

    currentProgramSnapshotId = normalizedId;
    currentSnapshotShort = Number.isFinite(normalizedShort) ? normalizedShort : null;
    programSnapshotId = normalizedId;

    const shouldPersist = options.persist !== false;
    if (shouldPersist) {
        if (normalizedId) {
            localStorage.setItem(PROGRAM_SNAPSHOT_STORAGE_KEY, normalizedId);
            localStorage.setItem(SNAPSHOT_ID_STORAGE_KEY, normalizedId);
        }
        if (Number.isFinite(currentSnapshotShort) && currentSnapshotShort > 0) {
            localStorage.setItem(SNAPSHOT_SHORT_STORAGE_KEY, String(currentSnapshotShort));
        }
    }

    return {
        snapshotId: normalizedId,
        snapshotShort: Number.isFinite(currentSnapshotShort) ? currentSnapshotShort : null
    };
}

function getStoredSnapshotMeta() {
    const storedSnapshotId = String(
        localStorage.getItem(PROGRAM_SNAPSHOT_STORAGE_KEY)
        || localStorage.getItem(SNAPSHOT_ID_STORAGE_KEY)
        || ''
    ).trim();
    const storedSnapshotShort = normalizeSnapshotShortForSimulator(
        localStorage.getItem(SNAPSHOT_SHORT_STORAGE_KEY),
        storedSnapshotId
    );
    return {
        snapshotId: storedSnapshotId || null,
        snapshotShort: Number.isFinite(storedSnapshotShort) ? storedSnapshotShort : null
    };
}

async function resolveActiveProgramSnapshot({ programName, plannedStepsCount, compiledSnapshotId }) {
    const stored = getStoredSnapshotMeta();
    let resolvedSnapshot = null;
    let reason = 'compiled_new_snapshot';

    if (Number.isFinite(stored.snapshotShort) && stored.snapshotShort > 0 && typeof window.resolveSnapshotByShortWithContext === 'function') {
        try {
            resolvedSnapshot = await window.resolveSnapshotByShortWithContext(stored.snapshotShort, {
                program_name: programName,
                plannedSteps_count: plannedStepsCount
            });
        } catch (error) {
            console.warn('[SIM SNAPSHOT] error resolving snapshot_short with context:', error);
        }
    }

    if (!resolvedSnapshot && stored.snapshotId && typeof window.getSnapshot === 'function') {
        try {
            const byIdSnapshot = await window.getSnapshot(stored.snapshotId);
            if (snapshotMatchesProgramContext(byIdSnapshot, { programName, plannedStepsCount })) {
                resolvedSnapshot = byIdSnapshot;
            }
        } catch (error) {
            console.warn('[SIM SNAPSHOT] error loading stored snapshot_id:', error);
        }
    }

    const resolvedSnapshotId = String(
        resolvedSnapshot?.snapshot_id
        || resolvedSnapshot?.program_snapshot_id
        || ''
    ).trim();

    if (resolvedSnapshotId) {
        const resolvedShort = normalizeSnapshotShortForSimulator(
            resolvedSnapshot?.snapshot_short ?? stored.snapshotShort,
            resolvedSnapshotId
        );

        console.debug(
            `[SNAPSHOT ACTIVE] loaded snapshot_short=${stored.snapshotShort ?? 'null'} ` +
            `resolved snapshot_id=${resolvedSnapshotId} currentProgramSnapshotId=${resolvedSnapshotId}`
        );

        reason = 'loaded_snapshot_matches_program_context';
        return {
            snapshotId: resolvedSnapshotId,
            snapshotShort: resolvedShort,
            reusedExisting: true,
            createdNewVersion: false,
            reason
        };
    }

    const fallbackSnapshotId = String(compiledSnapshotId || '').trim() || null;
    const fallbackSnapshotShort = normalizeSnapshotShortForSimulator(stored.snapshotShort, fallbackSnapshotId);
    const hadLoadedSnapshotContext = Boolean(stored.snapshotId || stored.snapshotShort);

    return {
        snapshotId: fallbackSnapshotId,
        snapshotShort: fallbackSnapshotShort,
        reusedExisting: false,
        createdNewVersion: hadLoadedSnapshotContext,
        reason: hadLoadedSnapshotContext
            ? 'loaded_snapshot_context_mismatch_or_missing'
            : reason
    };
}

// Genera IDs únicos con prefijo (usa UUID si está disponible; de lo contrario, fallback con timestamp y aleatorio)
function updateRobotLiveStatus(type, message) {
    const el = document.getElementById('robot-live-status');
    if (!el) return;

    // Estilo compacto homogéneo con el indicador MQTT
    el.style.cssText = 'font-size:12px;margin:2px 0;padding:0;background:none;border:none;font-weight:normal;';
    el.title = 'Estado de recepción de ejecuciones reales del robot. Cambia cuando llegan mensajes MQTT válidos con snapshot_short reconocido.';
    el.textContent = message;
}

let mqttUiConnectingSince = 0;
let mqttUiPendingConnectedTimer = null;
let mqttUiLastStatus = 'disconnected';
const MQTT_BROKER_STORAGE_KEY = 'fp_mqtt_broker_url';
const MQTT_TOPIC_STORAGE_KEY = 'fp_mqtt_topic';
const MQTT_DEFAULT_BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_DEFAULT_TOPIC = 'salesianos/robot/iban/step_capture';

function getStoredMqttBrokerUrl() {
    const value = String(localStorage.getItem(MQTT_BROKER_STORAGE_KEY) || '').trim();
    return value || MQTT_DEFAULT_BROKER_URL;
}

function getStoredMqttTopic() {
    const value = String(localStorage.getItem(MQTT_TOPIC_STORAGE_KEY) || '').trim();
    return value || MQTT_DEFAULT_TOPIC;
}

function ensureMqttConfigUi(anchorEl) {
    if (!anchorEl) return;
    let toggleBtn = document.getElementById('mqttConfigToggleBtn');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'mqttConfigToggleBtn';
        toggleBtn.type = 'button';
        toggleBtn.textContent = '⚙ configurar';
        toggleBtn.style.cssText = 'margin-left:6px;font-size:11px;padding:2px 6px;color:#333;background:#f3f4f6;border:1px solid #bbb;border-radius:4px;cursor:pointer;font-family:inherit;transition:background 0.2s,border-color 0.2s;';
        toggleBtn.onmouseover = () => {
            toggleBtn.style.background = '#e5e7eb';
            toggleBtn.style.borderColor = '#888';
        };
        toggleBtn.onmouseout = () => {
            toggleBtn.style.background = '#f3f4f6';
            toggleBtn.style.borderColor = '#bbb';
        };
        anchorEl.insertAdjacentElement('afterend', toggleBtn);
    }

    let configRow = document.getElementById('mqttConfigRow');
    if (!configRow) {
        configRow = document.createElement('div');
        configRow.id = 'mqttConfigRow';
        configRow.style.cssText = 'display:none;margin:4px 0 0 0;font-size:11px;opacity:0.9;flex-direction:column;gap:4px;';

        // Fila 1: Broker
        const brokerRow = document.createElement('div');
        brokerRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const brokerLabel = document.createElement('span');
        brokerLabel.textContent = 'Broker:';
        brokerLabel.style.cssText = 'min-width:48px;font-size:11px;';
        const brokerInput = document.createElement('input');
        brokerInput.id = 'mqttBrokerInput';
        brokerInput.type = 'text';
        brokerInput.style.cssText = 'width:250px;max-width:100%;font-size:11px;';
        brokerRow.appendChild(brokerLabel);
        brokerRow.appendChild(brokerInput);

        // Fila 2: Topic
        const topicRow = document.createElement('div');
        topicRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
        const topicLabel = document.createElement('span');
        topicLabel.textContent = 'Topic:';
        topicLabel.style.cssText = 'min-width:48px;font-size:11px;';
        const topicInput = document.createElement('input');
        topicInput.id = 'mqttTopicInput';
        topicInput.type = 'text';
        topicInput.style.cssText = 'width:250px;max-width:100%;font-size:11px;';
        topicRow.appendChild(topicLabel);
        topicRow.appendChild(topicInput);

        // Fila 3: Botones
        const buttonsRow = document.createElement('div');
        buttonsRow.style.cssText = 'display:flex;gap:6px;margin-left:52px;';
        const saveBtn = document.createElement('button');
        saveBtn.id = 'mqttConfigSaveBtn';
        saveBtn.type = 'button';
        saveBtn.textContent = 'Guardar';
        saveBtn.style.cssText = 'font-size:11px;padding:1px 6px;';
        const connectBtn = document.createElement('button');
        connectBtn.id = 'mqttConfigConnectBtn';
        connectBtn.type = 'button';
        connectBtn.textContent = 'Conectar';
        connectBtn.style.cssText = 'font-size:11px;padding:1px 6px;';
        buttonsRow.appendChild(saveBtn);
        buttonsRow.appendChild(connectBtn);

        // Fila 4: Mensaje de estado
        const notice = document.createElement('span');
        notice.id = 'mqttConfigNotice';
        notice.style.cssText = 'font-size:11px;opacity:0.75;';

        configRow.appendChild(brokerRow);
        configRow.appendChild(topicRow);
        configRow.appendChild(buttonsRow);
        configRow.appendChild(notice);

        toggleBtn.insertAdjacentElement('afterend', configRow);

        toggleBtn.addEventListener('click', () => {
            const isVisible = configRow.style.display !== 'none';
            configRow.style.display = isVisible ? 'none' : 'flex';
            brokerInput.value = getStoredMqttBrokerUrl();
            topicInput.value = getStoredMqttTopic();
            notice.textContent = '';
        });

        saveBtn.addEventListener('click', () => {
            const brokerValue = String(brokerInput.value || '').trim() || MQTT_DEFAULT_BROKER_URL;
            const topicValue = String(topicInput.value || '').trim() || MQTT_DEFAULT_TOPIC;
            localStorage.setItem(MQTT_BROKER_STORAGE_KEY, brokerValue);
            localStorage.setItem(MQTT_TOPIC_STORAGE_KEY, topicValue);

            const needsReconnect = ['connecting', 'connected', 'subscribed', 'reconnecting'].includes(mqttUiLastStatus);
            notice.textContent = needsReconnect
                ? 'Cambios guardados. Reconecta MQTT para aplicar.'
                : 'Configuración MQTT guardada.';

            updateMqttStatusIndicator({ status: mqttUiLastStatus, brokerUrl: brokerValue, topic: topicValue });
        });

        connectBtn.addEventListener('click', () => {
            notice.textContent = 'Conectando MQTT...';
            if (typeof window.TelemetryAPI?.connectMqttTelemetry === 'function') {
                window.TelemetryAPI.connectMqttTelemetry();
            }
        });
    }
}

function updateMqttStatusIndicator(statusInfo) {
    const liveStatusEl = document.getElementById('robot-live-status');
    if (!liveStatusEl) { console.warn('[MQTT UI] robot live status container not found'); return; }
    let indicator = document.getElementById('mqttStatusIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'mqttStatusIndicator';
        indicator.style.cssText = 'font-size:12px;margin:2px 0 4px 0;display:flex;align-items:center;flex-wrap:wrap;gap:4px;';
        liveStatusEl.insertAdjacentElement('beforebegin', indicator);
    }
    ensureMqttConfigUi(indicator);

    const status = String(statusInfo?.status || 'disconnected').toLowerCase();
    mqttUiLastStatus = status;
    const labels = {
        disconnected: 'MQTT: 🔴 desconectado',
        connecting: 'MQTT: 🟠 conectando...',
        connected: 'MQTT: 🟢 conectado',
        subscribed: 'MQTT: 🟢 conectado',
        reconnecting: 'MQTT: 🟡 reconectando...',
        offline: 'MQTT: 🔴 sin conexión',
        error: 'MQTT: 🔴 error'
    };

    const applyText = (text) => {
        indicator.textContent = text;
        console.log(`[MQTT UI] indicator text=${text}`);
    };

    if (mqttUiPendingConnectedTimer) {
        clearTimeout(mqttUiPendingConnectedTimer);
        mqttUiPendingConnectedTimer = null;
    }

    if (status === 'connecting') {
        mqttUiConnectingSince = Date.now();
        applyText(labels.connecting);
    } else if (status === 'reconnecting') {
        mqttUiConnectingSince = Date.now();
        applyText(labels.reconnecting);
    } else if (status === 'connected' || status === 'subscribed') {
        const elapsed = mqttUiConnectingSince ? (Date.now() - mqttUiConnectingSince) : 9999;
        const delay = Math.max(0, 300 - elapsed);
        if (delay > 0) {
            mqttUiPendingConnectedTimer = setTimeout(() => {
                applyText(labels.connected);
                mqttUiPendingConnectedTimer = null;
            }, delay);
        } else {
            applyText(labels.connected);
        }
    } else {
        applyText(labels[status] || labels.disconnected);
    }

    const brokerUrl = `Broker: ${statusInfo?.brokerUrl || getStoredMqttBrokerUrl()}`;
    const topic = `Topic: ${statusInfo?.topic || getStoredMqttTopic()}`;
    const clientId = statusInfo?.clientId ? `ClientId: ${statusInfo.clientId}` : '';
    indicator.title = [brokerUrl, topic, clientId].filter(Boolean).join('\n');
}

function makeId(prefix) {
    const base = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    return `${prefix}_${base}`;
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

function getActiveProgramNameForSimulation(incomingName) {
    const incoming = String(incomingName || '').trim();
    if (incoming) {
        localStorage.setItem(PROGRAM_NAME_SIM_STORAGE_KEY, incoming);
        localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, incoming);
        return incoming;
    }

    const storedSim = String(localStorage.getItem(PROGRAM_NAME_SIM_STORAGE_KEY) || '').trim();
    const storedMain = String(localStorage.getItem(PROGRAM_NAME_STORAGE_KEY) || '').trim();
    const resolved = storedSim || storedMain || buildDefaultProgramName();

    localStorage.setItem(PROGRAM_NAME_SIM_STORAGE_KEY, resolved);
    localStorage.setItem(PROGRAM_NAME_STORAGE_KEY, resolved);
    return resolved;
}

// Context de compilación (state que afecta a pasos subsiguientes)
const compilationContext = {
    activeFrame: null,
    activeTool: null,
    definedFrames: {},
    definedPoses: {},
    definedPoints: {}
};

// SECCIÓN 502: Definición de Materiales para las Trayectorias
// Se definen colores distintos para cada tipo de movimiento para una fácil identificación visual.
const moveJMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff }); // Azul continuo
const moveLMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Verde continuo
const moveCMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Magenta

// SECCIÓN 502b: Material para el Primer Tramo (Desde Home Simulado)
// El primer tramo desde la posición home visual del simulador es solo una referencia visual.
// No representa necesariamente la posición inicial real del robot.
// Se dibuja con gris medio visible, no negro, para mantener discreción visual.
const firstSegmentMaterial = new THREE.LineBasicMaterial({
    color: 0x666666, // Gris medio visible (no negro)
    transparent: true,
    opacity: 0.85,
    linewidth: 2
});

const palletPreviewGeometry = new THREE.SphereGeometry(0.01, 8, 8);
const palletPreviewMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.4
});

// SECCIÓN 503: Geometría y Material para los Puntos de Parada
// Esfera pequeña que se usará para marcar los puntos donde el robot se detiene.
const pointGeometry = new THREE.SphereGeometry(0.015, 16, 8);
const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Negro
const approachPointMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 }); // Gris para puntos de aproximación

// SECCIÓN 503b: Geometría y Material para la Posición Inicial Simulada (Home)
// Esfera diferenciada para marcar la posición inicial visual del simulador.
// El marcador "Inicio simulado" es una referencia visual y no representa necesariamente
// la posición inicial real del robot.
// No se muestra etiqueta permanente para mantener la escena limpia.
// El tooltip aparecerá al pasar el ratón sobre la esfera.
const simulatedHomeGeometry = new THREE.SphereGeometry(0.025, 16, 8);
const simulatedHomeMaterial = new THREE.MeshBasicMaterial({
    color: 0x555555, // Gris medio-oscuro visible
    transparent: true,
    opacity: 0.9,
    wireframe: false
});

let initialReferenceSegmentPending = true;
let initialReferenceSegmentAnnounced = false;

function resetInitialReferenceSegmentState() {
    initialReferenceSegmentPending = true;
    initialReferenceSegmentAnnounced = false;
}

function consumeInitialReferenceSegmentMaterial(defaultMaterial) {
    if (!initialReferenceSegmentPending) {
        return defaultMaterial;
    }

    initialReferenceSegmentPending = false;
    if (!initialReferenceSegmentAnnounced) {
        initialReferenceSegmentAnnounced = true;
        updateStatus('Tramo inicial de referencia\nReferencia HOME → primer punto', false);
    }

    // Initial HOME-to-first-point segment is visual reference only. The real robot starts from its current TCP position, not necessarily HOME.
    return firstSegmentMaterial;
}

// SECCIÓN 503b: Inicialización del Panel de I/O
function initIOPanel() {
    // Entradas Digitales (DI)
    for (let i = 1; i <= 8; i++) {
        const checkbox = document.getElementById(`di${i}`);
        const stateLabel = document.getElementById(`di${i}-label`);
        if (checkbox) {
            // Función auxiliar para actualizar el label visual ON/OFF
            const updateDILabel = (checked) => {
                if (!stateLabel) return;
                stateLabel.textContent = checked ? 'ON' : 'OFF';
                stateLabel.style.color = checked ? '#16a34a' : '#9ca3af';
                stateLabel.style.fontWeight = checked ? '700' : '400';
            };
            checkbox.addEventListener('change', (e) => {
                ioState.DI[i] = e.target.checked;
                updateDILabel(e.target.checked);
                if (localStorage.getItem('fp_debug') === 'true') {
                    console.log(`[SIM IO] DI${i} → ${e.target.checked}`);
                }
            });
            updateDILabel(checkbox.checked); // estado inicial
        }
    }
    
    // Entradas Analógicas (AI)
    for (let i = 1; i <= 4; i++) {
        const slider = document.getElementById(`ai${i}`);
        const valueSpan = document.getElementById(`ai${i}-value`);
        if (slider && valueSpan) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                ioState.AI[i] = value;
                valueSpan.textContent = `${value.toFixed(1)}V`;
                console.log(`AI[${i}] = ${value}V`);
            });
        }
    }
}

// Funciones para controlar las salidas desde el código
function setDO(pin, value) {
    if (pin >= 1 && pin <= 8) {
        ioState.DO[pin] = value;
        const led = document.getElementById(`do${pin}`);
        if (led) {
            if (value) {
                led.classList.add('active');
            } else {
                led.classList.remove('active');
            }
        }
        console.log(`DO[${pin}] = ${value}`);
    }
}

function setAO(pin, value) {
    if (pin >= 1 && pin <= 4) {
        ioState.AO[pin] = value;
        const fill = document.getElementById(`ao${pin}-fill`);
        const valueSpan = document.getElementById(`ao${pin}-value`);
        if (fill && valueSpan) {
            const percentage = (value / 10) * 100;
            fill.style.width = `${percentage}%`;
            valueSpan.textContent = `${value.toFixed(1)}V`;
        }
        console.log(`AO[${pin}] = ${value}V`);
    }
}

// Función para resetear todas las entradas/salidas a su estado de reposo
function resetIO() {
    // Resetear salidas digitales
    for (let i = 1; i <= 8; i++) {
        setDO(i, false);
    }
    
    // Resetear salidas analógicas
    for (let i = 1; i <= 4; i++) {
        setAO(i, 0);
    }
    
    // ✅ Las entradas digitales (DI) NO se resetean aquí: son controladas por el usuario
    // en el panel lateral y deben mantener su estado entre ejecuciones para que
    // while_block pueda evaluarlas correctamente al inicio de la simulación.
    
    // Resetear entradas analógicas (sliders a 0)
    for (let i = 1; i <= 4; i++) {
        const slider = document.getElementById(`ai${i}`);
        const valueSpan = document.getElementById(`ai${i}-value`);
        if (slider && valueSpan) {
            slider.value = 0;
            ioState.AI[i] = 0;
            valueSpan.textContent = '0.0V';
        }
    }
}

function getDI(pin) {
    if (pin >= 1 && pin <= 8) {
        return ioState.DI[pin];
    }
    return false;
}

function getAI(pin) {
    if (pin >= 1 && pin <= 4) {
        return ioState.AI[pin];
    }
    return 0;
}

// SECCIÓN 504: Inicialización de la Escena 3D
// Crea la escena, cámara, renderer, luces, suelo, grid, y los objetos iniciales.
function init3D() {
    console.log('🎬 Iniciando init3D...');
    const container = document.getElementById('webgl-container');
    if (!container) {
        console.error('❌ ERROR: No se encontró el contenedor #webgl-container');
        return;
    }
    console.log('✅ Contenedor WebGL encontrado:', container);
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 10, 50);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(1.5, 1, 1.5);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    console.log('✅ Renderer creado:', renderer.domElement);
    container.appendChild(renderer.domElement);
    console.log('✅ Renderer añadido al DOM');
    
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x888888, 1.5);
    scene.add(hemiLight);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    console.log('✅ Plano de simulación añadido');
    
    const gridHelper = new THREE.GridHelper(5, 10, 0x888888, 0xbbbbbb);
    scene.add(gridHelper);
    console.log('✅ Grid helper añadido');

    worldFrameObject = createLabeledAxesVisualization(
        'BASE',
        createWorldFrameAxesVisualization(),
        new THREE.Vector3(0, 0, 0),
        new THREE.Euler(0, 0, 0)
    );
    const worldBaseLabel = worldFrameObject.children.find(child => child.type === 'Mesh' && child.geometry && child.geometry.type === 'PlaneGeometry');
    if (worldBaseLabel) {
        const anchoredBaseLabelGeometry = new THREE.PlaneGeometry(0.09, 0.024);
        anchoredBaseLabelGeometry.translate(-0.045, 0.012, 0);
        worldBaseLabel.geometry.dispose();
        worldBaseLabel.geometry = anchoredBaseLabelGeometry;
        worldBaseLabel.position.set(0, 0, 0);
        worldBaseLabel.rotation.set(0, 0, 0);
    }
    scene.add(worldFrameObject);
    console.log('✅ World/base axes añadidos');
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.5, 0.2, 0);
    controls.update();
    console.log('✅ OrbitControls inicializado');
    
    // ✅ NUEVO: Grupo TCP con AxesHelper + Cono direccional
    tcpObject = new THREE.Group();
    tcpVisualGroup = createTcpAxesVisualization();
    tcpObject.add(tcpVisualGroup);

    tcpObject.position.copy(currentPosition);
    tcpObject.rotation.copy(initialRotation);
    currentRotation.copy(initialRotation);
    scene.add(tcpObject);
    console.log('✅ TCP Object creado y añadido a la escena');
    
    trajectoryGroup = new THREE.Group();
    scene.add(trajectoryGroup);
    console.log('✅ Trajectory group creado');

    palletPreviewGroup = new THREE.Group();
    scene.add(palletPreviewGroup);
    console.log('✅ Pallet preview group creado');
    
    // Inicializar tooltips
    initTooltips();
    
    statusText.textContent = "Listo para simular trayectoria.";
    console.log('✅ init3D() completado. Iniciando animate()...');
    schedulePalletPreviewUpdate();
    animate();
}
// SECCIÓN 504b: Sistema de Tooltips para Puntos
function initTooltips() {
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    tooltipDiv = document.createElement('div');
    tooltipDiv.style.position = 'absolute';
    tooltipDiv.style.display = 'none';
    tooltipDiv.style.background = 'rgba(0,0,0,0.8)';
    tooltipDiv.style.color = 'white';
    tooltipDiv.style.padding = '5px 10px';
    tooltipDiv.style.borderRadius = '3px';
    tooltipDiv.style.fontSize = '12px';
    tooltipDiv.style.pointerEvents = 'none';
    tooltipDiv.style.zIndex = '10000';
    document.body.appendChild(tooltipDiv);
    
    document.getElementById('webgl-container').addEventListener('mousemove', (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        // Detectar tanto puntos normales como la esfera del home simulado
        const allObjects = trajectoryGroup.children.filter(c => 
            c.geometry === pointGeometry || c.userData.type === 'simulated_home'
        );
        const intersects = raycaster.intersectObjects(allObjects);
        
        if (intersects.length > 0 && intersects[0].object.userData.pointName) {
            tooltipDiv.textContent = intersects[0].object.userData.pointName;
            if (intersects[0].object.userData.description) {
                tooltipDiv.textContent += '\n' + intersects[0].object.userData.description;
                tooltipDiv.style.whiteSpace = 'pre-wrap';
            }
            tooltipDiv.style.display = 'block';
            tooltipDiv.style.left = (event.clientX + 10) + 'px';
            tooltipDiv.style.top = (event.clientY + 10) + 'px';
        } else {
            tooltipDiv.style.display = 'none';
        }
    });
}

let palletPreviewTimer = null;
function schedulePalletPreviewUpdate() {
    if (palletPreviewTimer) clearTimeout(palletPreviewTimer);
    palletPreviewTimer = setTimeout(() => {
        updatePalletPreview();
        palletPreviewTimer = null;
    }, 75);
}

function updatePalletPreview() {
    if (!palletPreviewGroup) return;

    while (palletPreviewGroup.children.length > 0) {
        palletPreviewGroup.remove(palletPreviewGroup.children[0]);
    }

    const programJSON = localStorage.getItem('robotProgramForSimulation');
    if (!programJSON) return;

    let program;
    try {
        program = JSON.parse(programJSON);
    } catch (error) {
        console.warn('⚠️ Error parsing program for pallet preview:', error);
        return;
    }

    if (!Array.isArray(program)) return;

    program.forEach(block => {
        if (block?.type !== 'palletize_block') return;

        const p1 = block.pallet_p1_pose || block.pallet_p1;
        const p2 = block.pallet_p2;
        const p3 = block.pallet_p3;
        if (!p1 || !p2 || !p3) return;

        const isFinitePoint = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z);
        if (!isFinitePoint(p1) || !isFinitePoint(p2) || !isFinitePoint(p3)) return;

        const rows = Number.isFinite(block.rows) ? Math.max(0, Math.floor(block.rows)) : 0;
        const cols = Number.isFinite(block.cols) ? Math.max(0, Math.floor(block.cols)) : 0;
        const layers = Number.isFinite(block.layers) ? Math.max(0, Math.floor(block.layers)) : 0;
        const layerHeight = Number.isFinite(block.layer_height) ? block.layer_height : 0;
        if (rows === 0 || cols === 0 || layers === 0) return;

        const dx = {
            x: (p2.x ?? 0) - (p1.x ?? 0),
            y: (p2.y ?? 0) - (p1.y ?? 0),
            z: (p2.z ?? 0) - (p1.z ?? 0)
        };
        const dy = {
            x: (p3.x ?? 0) - (p1.x ?? 0),
            y: (p3.y ?? 0) - (p1.y ?? 0),
            z: (p3.z ?? 0) - (p1.z ?? 0)
        };

        for (let layer = 0; layer < layers; layer++) {
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const pos = {
                        x: (p1.x ?? 0) + col * dx.x + row * dy.x,
                        y: (p1.y ?? 0) + col * dx.y + row * dy.y,
                        z: (p1.z ?? 0) + col * dx.z + row * dy.z + layer * layerHeight
                    };

                    const marker = new THREE.Mesh(palletPreviewGeometry, palletPreviewMaterial);
                    marker.position.copy(robotToThreePosition(pos));
                    palletPreviewGroup.add(marker);
                }
            }
        }
    });
}

window.addEventListener('storage', (event) => {
    if (event.key === 'robotProgramForSimulation') {
        schedulePalletPreviewUpdate();
    }
});

// SECCIÓN 505: Bucle de Animación (Render Loop)
// Se ejecuta en cada frame para actualizar los controles y renderizar la escena.
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// SECCIÓN 506: Animación del Movimiento del TCP
// ✅ ACTUALIZADO: Ahora anima posición Y rotación, y respeta la pausa
function animateTCPMove(targetPosition, targetRotation, duration, logicalTargetRotation = null) {
    return new Promise(resolve => {
        const startPosition = tcpObject.position.clone();
        const startRotation = tcpObject.rotation.clone();
        const startTime = performance.now();
        let pausedTime = 0;
        let pauseStartTime = null;
        
        function animationLoop(currentTime) {
            // Manejar pausa
            if (isPaused) {
                if (!pauseStartTime) {
                    pauseStartTime = currentTime;
                }
                requestAnimationFrame(animationLoop);
                return;
            } else if (pauseStartTime) {
                pausedTime += currentTime - pauseStartTime;
                pauseStartTime = null;
            }
            
            const elapsedTime = currentTime - startTime - pausedTime;
            let progress = duration > 0 ? Math.min(elapsedTime / duration, 1) : 1;
            
            // Interpolar posición
            tcpObject.position.lerpVectors(startPosition, targetPosition, progress);
            
            // ✅ NUEVO: Interpolar rotación (Euler)
            tcpObject.rotation.x = THREE.MathUtils.lerp(startRotation.x, targetRotation.x, progress);
            tcpObject.rotation.y = THREE.MathUtils.lerp(startRotation.y, targetRotation.y, progress);
            tcpObject.rotation.z = THREE.MathUtils.lerp(startRotation.z, targetRotation.z, progress);
            
            if (progress < 1 && isSimulating) {
                requestAnimationFrame(animationLoop);
            } else {
                tcpObject.position.copy(targetPosition);
                tcpObject.rotation.copy(targetRotation);
                currentPosition.copy(targetPosition);
                if (logicalTargetRotation) {
                    currentRotation.copy(logicalTargetRotation);
                } else {
                    currentRotation.copy(targetRotation);
                }
                resolve();
            }
        }
        requestAnimationFrame(animationLoop);
    });
}

// SECCIÓN 507: Dibujo de Líneas de Trayectoria
// Añade un segmento de línea a la escena para visualizar el recorrido del robot.
function drawTrajectoryLine(startPoint, endPoint, material) {
    if (startPoint.distanceToSquared(endPoint) < 0.000001) { return; }
    const points = [startPoint.clone(), endPoint.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    // Ya no necesitamos 'computeLineDistances' porque todos los materiales son LineBasicMaterial
    trajectoryGroup.add(line);
}

// SECCIÓN 508: Marcado de Puntos de Detención
// Crea y añade una esfera negra para marcar un punto de detención en la trayectoria.
function markPoint(position, name = null, isApproach = false) {
    const material = isApproach ? approachPointMaterial : pointMaterial;
    const pointMesh = new THREE.Mesh(pointGeometry, material);
    pointMesh.position.copy(position);
    // Guardar nombre del punto para tooltip
    if (name) {
        pointMesh.userData.pointName = name;
    }
    trajectoryGroup.add(pointMesh);
}

// SECCIÓN 508a: Marcado de la Posición Inicial Simulada (Home Visual)
// Crea y añade una esfera gris oscuro para marcar la posición inicial del simulador.
// El marcador "Inicio simulado" es una referencia visual y no representa necesariamente
// la posición inicial real del robot.
// No se muestra etiqueta permanente para no saturar la escena visual.
// El tooltip aparecerá al pasar el ratón sobre la esfera.
function markSimulatedHome(position) {
    // Crear esfera gris oscura como marcador del inicio simulado
    const homeMesh = new THREE.Mesh(simulatedHomeGeometry, simulatedHomeMaterial);
    homeMesh.position.copy(position);
    
    // Metadata para identificación y tooltips
    homeMesh.userData.pointName = 'Inicio simulado';
    homeMesh.userData.type = 'simulated_home';
    homeMesh.userData.description = 'Posición inicial visual del simulador; no representa necesariamente la posición real del robot';
    
    trajectoryGroup.add(homeMesh);
}

// SECCIÓN 508bis: Transformación de Coordenadas con Frames
// Aplica la transformación del frame activo o del frame indicado
function applyFrameTransform(localPos, localRot, frameId = null) {
    const frameName = frameId || activeFrame;
    if (!frameName || frameName === 'WORLD') {
        // Sin frame activo, devolver coordenadas directamente
        return { position: localPos.clone(), rotation: localRot.clone() };
    }
    
    const frameData = definedFrames[frameName];
    if (!frameData) {
        console.warn(`Frame '${frameName}' no definido, usando WORLD`);
        return { position: localPos.clone(), rotation: localRot.clone() };
    }
    
    // Crear matriz de transformación del frame
    const frameMatrix = new THREE.Matrix4();
    frameMatrix.makeRotationFromEuler(frameData.rotation);
    frameMatrix.setPosition(frameData.origin);
    
    // Transformar posición local a coordenadas globales
    const globalPos = localPos.clone().applyMatrix4(frameMatrix);
    
    // Combinar rotaciones (frame + local)
    const globalRot = new THREE.Euler();
    const frameQuat = new THREE.Quaternion().setFromEuler(frameData.rotation);
    const localQuat = new THREE.Quaternion().setFromEuler(localRot);
    const combinedQuat = frameQuat.multiply(localQuat);
    globalRot.setFromQuaternion(combinedQuat);
    
    return { position: globalPos, rotation: globalRot };
}

// SECCIÓN 508ter: Crear Visualización de Frame
// Crea un objeto 3D que representa un sistema de coordenadas (frame)
function createFrameVisualization(frameName, origin, rotation) {
    const frameGroup = new THREE.Group();
    frameGroup.add(createWorldFrameAxesVisualization());
    frameGroup.add(createFrameLabelMesh(frameName));

    frameGroup.position.copy(origin);
    frameGroup.rotation.copy(rotation);
    return frameGroup;
}

function clearFrameVisuals() {
    Object.keys(definedFrames).forEach(frameName => {
        const frameData = definedFrames[frameName];
        if (frameData && frameData.visualObject) {
            scene && scene.remove(frameData.visualObject);
        }
    });
    Object.keys(definedFrames).forEach(key => delete definedFrames[key]);
}

function syncFramesFromProgram(program) {
    if (!Array.isArray(program)) return;
    if (!scene) return;

    clearFrameVisuals();

    program.forEach(block => {
        if (block.type !== 'define_frame') return;
        const frameName = block.name || 'frame_sin_nombre';

        const origin3d = new THREE.Vector3(
            (block.x ?? 0),
            (block.y ?? 0),
            (block.z ?? 0)
        );
        const origin3dMapped = robotToThreePosition(origin3d);
        // rotation3d: used by applyFrameTransform math. Must match visualRotation3d convention.
        const rotation3d = new THREE.Euler(
            (block.rx ?? 0) * Math.PI / 180,
            (block.ry ?? 0) * Math.PI / 180,
            (block.rz ?? 0) * Math.PI / 180
        );
        // visualRotation3d: used only for 3D display. No -90 Ry bias so neutral frame aligns with WORLD.
        const visualRotation3d = new THREE.Euler(
            (block.rx ?? 0) * Math.PI / 180,
            (block.ry ?? 0) * Math.PI / 180,
            (block.rz ?? 0) * Math.PI / 180
        );

        const frameVisual = createFrameVisualization(frameName, origin3dMapped, visualRotation3d);
        scene.add(frameVisual);

        definedFrames[frameName] = {
            origin: origin3dMapped,
            rotation: rotation3d,
            rotationInputDeg: {
                rx: block.rx ?? 0,
                ry: block.ry ?? 0,
                rz: block.rz ?? 0
            },
            visualObject: frameVisual
        };
    });
}


// SECCIÓN 509: Limpieza de la Trayectoria y Reseteo del Simulador
// Elimina todos los objetos de la trayectoria, resetea la posición del TCP y limpia el historial.
// @param {boolean} clearFrames - Si true, también limpia los frames definidos. Si false, mantiene los frames visibles.
function clearTrajectory(clearFrames = true) {
    // Protección: si algo falló antes de init3D, reintenta inicializar
    if (!trajectoryGroup || !tcpObject || !scene) {
        try { init3D(); } catch (e) {
            console.error('No se pudo re-inicializar la escena:', e);
            updateStatus('No se pudo limpiar: escena no inicializada.');
            return;
        }
    }
    
    // Vaciar geometrías y materiales de las trayectorias
    while(trajectoryGroup.children.length > 0){
        const object = trajectoryGroup.children[0];
        if (object.geometry && object.geometry !== pointGeometry) {
             object.geometry.dispose();
        }
        if (object.material && object.material.dispose) {
             object.material.dispose();
        }
        trajectoryGroup.remove(object);
    }
    currentPosition.set(0, 0.2, 0);
    tcpObject.position.copy(currentPosition);
    resetInitialReferenceSegmentState();
    tcpObject.rotation.copy(initialRotation);
    currentRotation.copy(initialRotation);
    tcpOrientationDebugFirstPalletStepLogged = false;
    
    // ✅ FRAMES: Limpiar frames solo si se especifica (clearFrames = true)
    if (clearFrames) {
        Object.keys(definedFrames).forEach(frameName => {
            if (definedFrames[frameName].visualObject) {
                scene.remove(definedFrames[frameName].visualObject);
            }
        });
        Object.keys(definedFrames).forEach(key => delete definedFrames[key]);
        activeFrame = null;
    }
    
    // Resetear todas las entradas/salidas
    resetIO();
    
    // Limpiar tabla de comparación (solo visual)
    comparisonTbody && (comparisonTbody.innerHTML = '');
    unlockComparisonView();
    updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');

    statusText.innerHTML = '';
    updateStatus("Trayectoria limpiada.");
    currentBlockText.textContent = "-";
}

// Función auxiliar para mover el TCP a una posición (usado en paletizado)
async function moveToPosition(targetPos, material, numSegments = 10, isApproach = false) {
    if (!isSimulating) return;
    
    const startPoint = currentPosition.clone();
    const lineMaterial = consumeInitialReferenceSegmentMaterial(material);
    const curve = new THREE.LineCurve3(startPoint, targetPos);
    const points = curve.getPoints(numSegments);
    
    for (let i = 1; i < points.length; i++) {
        if (!isSimulating) break;
        await animateTCPMove(points[i], currentRotation, 80, currentRotation);
        if (i === 1) drawTrajectoryLine(startPoint, currentPosition, lineMaterial);
    }
    
    if (isSimulating) {
        tcpObject.position.copy(targetPos);
        currentPosition.copy(targetPos);
        markPoint(currentPosition, null, isApproach);
    }
}

// SECCIÓN 509: Sistema de Compilación de Plan y Registro de Resultados
// Funciones para compilar el programa a pasos planificados y registrar resultados de ejecución

// Parsea la zona (fine, z1, z5, z10, z50...) a mm y radio UR en metros
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

/**
 * @deprecated Usar siempre window.CompilerAPI.compilePlanFromProgram(program).
 * Este compilador solo se invoca como fallback de emergencia cuando CompilerAPI
 * no está disponible en el contexto del simulador.
 * TODO: remove legacy simulator compiler fallback once CompilerAPI is always available
 *
 * @param {Array} program - Array de bloques del programa
 * @returns {Object} - {program_snapshot_id, plannedSteps, contextSummary}
 */
function compilePlanFromProgram_legacyThree(program) {
    programSnapshotId = makeId('snap');
    unlockComparisonView();
    updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');
    const steps = [];
    let stepIdCounter = 0;
    
    // Reset compilation context
    const ctx = {
        activeFrame: null,
        activeTool: null,
        definedFrames: {...definedFrames},
        definedPoses: {},
        definedPoints: {}
    };
    
    console.log(`🔨 Compilando programa [${programSnapshotId}]...`);
    
    for (const block of program) {
        // Bloques de definición: actualizan contexto, no generan steps
        if (block.type === 'define_frame') {
            ctx.definedFrames[block.name] = {
                origin: {x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0},
                rotation: {rx: block.rx ?? 0, ry: block.ry ?? 0, rz: block.rz ?? 0}
            };
            
            // ✅ También sincronizar con definedFrames global del simulador (formato THREE.js)
            const origin3d = new THREE.Vector3(
                (block.x ?? 0),
                (block.y ?? 0),
                (block.z ?? 0)
            );
            const origin3dMapped = robotToThreePosition(origin3d);
            // rotation3d: used by applyFrameTransform math. Must match visualRotation3d convention.
            const rotation3d = new THREE.Euler(
                (block.rx ?? 0) * Math.PI / 180,
                (block.ry ?? 0) * Math.PI / 180,
                (block.rz ?? 0) * Math.PI / 180
            );
            // visualRotation3d: used only for 3D display. No -90 Ry bias so neutral frame aligns with WORLD.
            const visualRotation3d = new THREE.Euler(
                (block.rx ?? 0) * Math.PI / 180,
                (block.ry ?? 0) * Math.PI / 180,
                (block.rz ?? 0) * Math.PI / 180
            );

            // Crear visualización del frame
            const frameVisual = createFrameVisualization(block.name, origin3dMapped, visualRotation3d);
            scene.add(frameVisual);
            
            definedFrames[block.name] = {
                origin: origin3dMapped,
                rotation: rotation3d,
                rotationInputDeg: {
                    rx: block.rx ?? 0,
                    ry: block.ry ?? 0,
                    rz: block.rz ?? 0
                },
                visualObject: frameVisual
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
            continue;
        }
        
        // ✅ Activar frame (use_frame)
        if (block.type === 'use_frame') {
            ctx.activeFrame = block.frameName || null;
            continue;
        }
        
        // Expansión de paletizado
        if (block.type === 'palletize_block') {
            const palletSteps = expandPalletizeBlock(block, ctx, stepIdCounter);
            steps.push(...palletSteps);
            stepIdCounter += palletSteps.length;
            continue;
        }
        
        // Movimiento circular (2 steps: via + end)
        if (block.type === 'move_circular_block') {
            steps.push(createPlannedStep(
                stepIdCounter++,
                'MoveL',  // Via point como lineal
                block.sourceName ? `${block.sourceName}_Via` : null,
                {x: block.via_x ?? 0, y: block.via_y ?? 0, z: block.via_z ?? 0},
                {rx: block.via_rx ?? 0, ry: block.via_ry ?? 180, rz: block.via_rz ?? 0},
                ctx,
                {circular_phase: 'via', origin_block_id: block.id},
                block.zone
            ));
            
            steps.push(createPlannedStep(
                stepIdCounter++,
                'MoveL',
                block.sourceName ? `${block.sourceName}_End` : null,
                {x: block.end_x ?? 0, y: block.end_y ?? 0, z: block.end_z ?? 0},
                {rx: block.end_rx ?? 0, ry: block.end_ry ?? 180, rz: block.end_rz ?? 0},
                ctx,
                {circular_phase: 'end', origin_block_id: block.id},
                block.zone
            ));
            continue;
        }
        
        // Movimientos estándar
        if (block.type === 'move_block' || 
            block.type === 'move_linear_block' ||
            block.type === 'use_pose' ||
            block.type === 'use_point') {
            
            // Resolver pose/punto si es referencia
            let resolvedPos, resolvedRot;
            
            if (block.type === 'use_pose' && block.poseName) {
                const pose = ctx.definedPoses[block.poseName];
                if (!pose) {
                    console.warn(`⚠️ Pose "${block.poseName}" no definida`);
                    continue;
                }
                resolvedPos = {x: pose.x, y: pose.y, z: pose.z};
                resolvedRot = {rx: pose.rx, ry: pose.ry, rz: pose.rz};
            } else if (block.type === 'use_point' && block.pointName) {
                const point = ctx.definedPoints[block.pointName];
                if (!point) {
                    console.warn(`⚠️ Punto "${block.pointName}" no definido`);
                    continue;
                }
                resolvedPos = {x: point.x, y: point.y, z: point.z};
                resolvedRot = {rx: block.rx ?? 0, ry: block.ry ?? 180, rz: block.rz ?? 0};
            } else {
                resolvedPos = {x: block.x ?? 0, y: block.y ?? 0, z: block.z ?? 0};
                resolvedRot = {rx: block.rx ?? 0, ry: block.ry ?? 180, rz: block.rz ?? 0};
            }
            
            const moveType = (block.type === 'move_block') ? 'MoveJ' : 'MoveL';
            
            steps.push(createPlannedStep(
                stepIdCounter++,
                moveType,
                block.pointName || block.poseName || block.sourceName || null,
                resolvedPos,
                resolvedRot,
                ctx,
                {origin_block_id: block.id},
                block.zone
            ));
        }
        
        // Bloques de IO y Wait no generan steps de movimiento
    }
    
    console.log(`✅ Plan compilado: ${steps.length} steps ejecutables`);
    console.log('🧪 Frames en contexto de compilación:', Object.keys(ctx.definedFrames));
    console.log('🧪 Frames globales en simulador:', Object.keys(definedFrames));

    const contextSummary = {
        frames: Object.keys(ctx.definedFrames),
        poses: Object.keys(ctx.definedPoses),
        points: Object.keys(ctx.definedPoints),
        activeTool: ctx.activeTool
    };

    // Guardar snapshot compilado en IndexedDB (no bloqueante)
    safeIdbCall(() => {
        if (typeof idbSaveSnapshot !== 'function') return null;
        return idbSaveSnapshot({
            program_snapshot_id: programSnapshotId,
            createdAt: Date.now(),
            plannedSteps: steps,
            contextSummary: contextSummary,
            source: 'sim'
        });
    });
    
    return {
        program_snapshot_id: programSnapshotId,
        plannedSteps: steps,
        contextSummary: contextSummary
    };
}

/**
 * Crea un step planificado normalizado
 */
function createPlannedStep(stepId, type, pointName, position, orientation, ctx, extraMeta, zoneStr) {
    const zoneInfo = parseZone(zoneStr);
    const explicitUnit = extraMeta?.orientation_unit;
    const orientationUnit = explicitUnit
        ? normalizeRotationUnit(explicitUnit)
        : 'degrees';

    return {
        step_id: stepId,
        type: type,  // 'MoveJ' o 'MoveL'
        target_pose: {
            x: position.x,
            y: position.y,
            z: position.z,
            rx: orientation.rx,
            ry: orientation.ry,
            rz: orientation.rz
        },
        target_joints: null,  // Por ahora no usamos joint space
        tool_id: ctx.activeTool || 'default',
        frame_id: ctx.activeFrame || 'WORLD',
        pointName: pointName,
        meta: {...extraMeta, ...zoneInfo, orientation_unit: orientationUnit}
    };
}

// Crea un step de IO (digital out) para el gripper
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

/**
 * Expande un bloque de paletizado a N pasos individuales (patrón realista industrial)
 * 
 * Patrón por cada pieza = 11 steps (pick=6 + place=5):
 * PICK:
 * 1. approach_global_pick: MoveJ a punto seguro alto
 * 2. approach_pick: MoveL a (PICK + z_offset)
 * 3. target_pick: MoveL fine a PICK
 * 4. io_pick: cerrar pinza
 * 5. wait_pick: espera corta
 * 6. retract_pick: MoveL a (PICK + z_offset)
 * 
 * TRANSFER:
 * 7. approach_global_place: MoveJ a aproximación PALET
 * 
 * PLACE:
 * 8. target_place: MoveL fine a PALET
 * 9. io_place: abrir pinza
 * 10. wait_place: espera corta
 * 11. retract_place: MoveL a (PALET + z_offset)
 */
function expandPalletizeBlock(block, ctx, startStepId) {
    const steps = [];
    let stepId = startStepId;

    // === Resolución de parámetros ===
    let pickPos = block.pick_pose || block.pick_pos || { x: 500, y: 0, z: 100 };
    let homePos = block.home_pos || null;
    const pickApproach = block.pick_approach_height ?? 50;
    const placeApproach = block.place_approach_height ?? 50;
    const approachOffset = block.approach_offset_mm ?? 50;
    const gripperPin = block.gripper_pin ?? 1;
    const pickWait = block.pick_wait_time ?? 0.5;
    const placeWait = block.place_wait_time ?? 0.3;
    const blockZone = block.zone || 'z5';  // Zona del bloque (para approach/retract)

    // Método de 3 puntos (industrial)
    let p1 = block.pallet_p1_pose || block.pallet_p1 || { x: 0, y: 300, z: 0 };
    let p2 = block.pallet_p2 || { x: 400, y: 300, z: 0 };
    let p3 = block.pallet_p3 || { x: 0, y: 600, z: 0 };
    
    // ✅ Transformar TODOS los puntos del paletizado según el frame activo
    if (ctx.activeFrame && ctx.activeFrame !== 'WORLD' && ctx.definedFrames[ctx.activeFrame]) {
        const frameData = ctx.definedFrames[ctx.activeFrame];
        const frameOrigin = frameData.origin;
        const frameRotation = frameData.rotation;
        
        // Crear matriz de transformación (similar a applyFrameTransform pero para coordenadas 3D puras)
        const transformPoint = (point) => {
            if (!point) return point;
            
            // Aplicar traducción relativa al frame
            let x = point.x - frameOrigin.x;
            let y = point.y - frameOrigin.y;
            let z = point.z - frameOrigin.z;
            
            // Aplicar rotación (Euler angles)
            // Para simplificar: rotación Rz → Ry → Rx (ZYX order)
            const rx = frameRotation.rx ?? 0;
            const ry = frameRotation.ry ?? 0;
            const rz = frameRotation.rz ?? 0;
            
            // Rotación Z
            let x_rot = x * Math.cos(rz) - y * Math.sin(rz);
            let y_rot = x * Math.sin(rz) + y * Math.cos(rz);
            x = x_rot;
            y = y_rot;
            
            // Rotación Y
            let x_rot2 = x * Math.cos(ry) + z * Math.sin(ry);
            let z_rot = -x * Math.sin(ry) + z * Math.cos(ry);
            x = x_rot2;
            z = z_rot;
            
            // Rotación X
            let y_rot2 = y * Math.cos(rx) - z * Math.sin(rx);
            let z_rot2 = y * Math.sin(rx) + z * Math.cos(rx);
            y = y_rot2;
            z = z_rot2;
            
            // Sumar de vuelta la traducción del frame para obtener coordenadas globales
            return { 
                x: frameOrigin.x + x, 
                y: frameOrigin.y + y, 
                z: frameOrigin.z + z 
            };
        };
        
        // Transformar todos los puntos base
        p1 = transformPoint(p1);
        p2 = transformPoint(p2);
        p3 = transformPoint(p3);
        pickPos = transformPoint(pickPos);
        if (homePos) homePos = transformPoint(homePos);
        
        console.log('🔄 Paletizado transformado a frame ' + ctx.activeFrame + ':', {p1, p2, p3, pickPos});
    }
    
    const rows = block.rows ?? 3;
    const cols = block.cols ?? 4;
    const layers = block.layers ?? 2;
    const layerHeight = block.layer_height ?? 60;
    
    const baseName = block.base_name || 'Pallet';
    
    const baseRot = {
        rx: pickPos?.rx ?? block.pick_rx ?? block.rx ?? 0,
        ry: pickPos?.ry ?? block.pick_ry ?? block.ry ?? 180,
        rz: pickPos?.rz ?? block.pick_rz ?? block.rz ?? 0
    };

    const palletPoseForOrientation = block.pallet_p1_pose || block.place_p1_pose || p1;
    const palletRot = {
        rx: palletPoseForOrientation?.rx ?? block.pallet_rx ?? block.place_rx ?? baseRot.rx,
        ry: palletPoseForOrientation?.ry ?? block.pallet_ry ?? block.place_ry ?? baseRot.ry,
        rz: palletPoseForOrientation?.rz ?? block.pallet_rz ?? block.place_rz ?? baseRot.rz
    };
    
    // === Cálculo de punto seguro global ===
    const safePointZ = Math.max(
        (p1.z || 0) + Math.max(pickApproach, placeApproach, approachOffset),
        (pickPos.z || 0) + pickApproach
    ) + 100;
    const safePosGlobal = { x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: safePointZ };
    
    // HOME opcional al inicio
    if (homePos) {
        steps.push(createPlannedStep(
            stepId++,
            'MoveJ',
            `${baseName}_HOME`,
            {x: homePos.x ?? 0, y: homePos.y ?? 0, z: homePos.z ?? 0},
            {rx: homePos.rx ?? 0, ry: homePos.ry ?? 180, rz: homePos.rz ?? 0},
            ctx,
            {stage: 'home', phase: 'home', motion: 'MoveJ'}
        ));
    }
    
    // === Vectores direccionales ===
    const colVectorX = (p2.x - p1.x) / cols;
    const colVectorY = (p2.y - p1.y) / cols;
    const colVectorZ = (p2.z - p1.z) / cols;
    
    const rowVectorX = (p3.x - p1.x) / rows;
    const rowVectorY = (p3.y - p1.y) / rows;
    const rowVectorZ = (p3.z - p1.z) / rows;
    
    // === Prelude de seguridad (solo una vez si hay celdas) ===
    const totalCells = rows * cols * layers;
    let preludeLogged = false;
    if (totalCells > 0) {
        steps.push(createPlannedStep(
            stepId++,
            'MoveJ',
            `${baseName}_Pick_Safe_Prelude`,
            safePosGlobal,
            baseRot,
            ctx,
            {phase: 'approach_global_pick', motion: 'MoveJ'},
            'z10'
        ));
        console.log('🧪 Prelude: approach_global_pick');
        preludeLogged = true;
    }

    // === Contador global de celdas y logs de verificación ===
    let cellIndex = 0;
    let firstCellLogged = false;
    let secondCellLogged = false;
    
    for (let layer = 0; layer < layers; layer++) {
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const isFirstCell = cellIndex === 0;
                const isSecondCell = cellIndex === 1;
                const cellStartIndex = steps.length;
                
                const palletMeta = {
                    pallet: {
                        row: row + 1,
                        col: col + 1,
                        layer: layer + 1
                    },
                    approach_offset_mm: approachOffset,
                    origin_block_id: block.id
                };
                
                // === PICK SEQUENCE (6 steps) ===
                
                // 1. approach_pick: MoveJ a (PICK + z_offset)
                const pickStep2 = createPlannedStep(
                    stepId++,
                    'MoveJ',
                    `${baseName}_Pick_Approach_J_L${layer+1}_R${row+1}_C${col+1}`,
                    {x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: (pickPos.z ?? 0) + pickApproach},
                    baseRot,
                    ctx,
                    {...palletMeta, phase: 'approach_pick', motion: 'MoveJ'},
                    'z10'
                );
                steps.push(pickStep2);
                
                // 3. target_pick: MoveL fine a PICK (tolerancia estricta)
                const pickStep3 = createPlannedStep(
                    stepId++,
                    'MoveL',
                    `${baseName}_Pick_Target_L${layer+1}_R${row+1}_C${col+1}`,
                    {x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: pickPos.z ?? 0},
                    baseRot,
                    ctx,
                    {...palletMeta, phase: 'target_pick', motion: 'MoveL'},
                    'fine'  // FORZAR FINE para target
                );
                steps.push(pickStep3);
                
                // 4. io_pick: cerrar pinza
                const pickStep4 = createIOStep(
                    stepId++,
                    gripperPin,
                    true,
                    0,  // sin espera en el IO
                    ctx,
                    {...palletMeta, phase: 'io_pick', motion: 'IO', action: 'close_gripper'}
                );
                steps.push(pickStep4);
                
                // 5. wait_pick: espera corta
                const pickStep5 = createIOStep(
                    stepId++,
                    gripperPin,
                    true,
                    pickWait,
                    ctx,
                    {...palletMeta, phase: 'wait_pick', motion: 'IO', action: 'wait'}
                );
                steps.push(pickStep5);
                
                // 6. retract_pick: MoveL a (PICK + z_offset)
                const pickStep6 = createPlannedStep(
                    stepId++,
                    'MoveL',
                    `${baseName}_Pick_Retract_L${layer+1}_R${row+1}_C${col+1}`,
                    {x: pickPos.x ?? 0, y: pickPos.y ?? 0, z: (pickPos.z ?? 0) + pickApproach},
                    baseRot,
                    ctx,
                    {...palletMeta, phase: 'retract_pick', motion: 'MoveL'},
                    blockZone
                );
                steps.push(pickStep6);
                
                // === TRANSFER (1 step) ===
                
                // 7. approach_global_place: MoveJ a aproximación PALET
                const placePos = {
                    x: p1.x + col * colVectorX + row * rowVectorX,
                    y: p1.y + col * colVectorY + row * rowVectorY,
                    z: p1.z + col * colVectorZ + row * rowVectorZ + layer * layerHeight
                };
                
                const placeSafePos = { 
                    x: placePos.x, 
                    y: placePos.y, 
                    z: placePos.z + placeApproach + 50 
                };
                
                const placeStep1 = createPlannedStep(
                    stepId++,
                    'MoveJ',
                    `${baseName}_Place_Safe_L${layer+1}_R${row+1}_C${col+1}`,
                    placeSafePos,
                    palletRot,
                    ctx,
                    {...palletMeta, phase: 'approach_global_place', motion: 'MoveJ'},
                    'z10'
                );
                steps.push(placeStep1);
                
                // === PLACE (4 steps) ===
                
                // 8. target_place: MoveL fine a PALET (tolerancia estricta)
                const placeStep2 = createPlannedStep(
                    stepId++,
                    'MoveL',
                    `${baseName}_Place_Target_L${layer+1}_R${row+1}_C${col+1}`,
                    placePos,
                    palletRot,
                    ctx,
                    {...palletMeta, phase: 'target_place', motion: 'MoveL'},
                    'fine'  // FORZAR FINE para target
                );
                steps.push(placeStep2);
                
                // 9. io_place: abrir pinza
                const placeStep3 = createIOStep(
                    stepId++,
                    gripperPin,
                    false,
                    0,
                    ctx,
                    {...palletMeta, phase: 'io_place', motion: 'IO', action: 'open_gripper'}
                );
                steps.push(placeStep3);
                
                // 10. wait_place: espera corta
                const placeStep4 = createIOStep(
                    stepId++,
                    gripperPin,
                    false,
                    placeWait,
                    ctx,
                    {...palletMeta, phase: 'wait_place', motion: 'IO', action: 'wait'}
                );
                steps.push(placeStep4);
                
                // 11. retract_place: MoveL a (PALET + z_offset)
                const placeStep5 = createPlannedStep(
                    stepId++,
                    'MoveL',
                    `${baseName}_Place_Retract_L${layer+1}_R${row+1}_C${col+1}`,
                    {x: placePos.x, y: placePos.y, z: placePos.z + placeApproach},
                    palletRot,
                    ctx,
                    {...palletMeta, phase: 'retract_place', motion: 'MoveL'},
                    blockZone
                );
                steps.push(placeStep5);
                
                // === LOG de verificación (primeras 2 celdas) ===
                const cellSteps = steps.slice(cellStartIndex);
                const logData = cellSteps.map((s) => ({
                    step_id: s.step_id,
                    type: s.type,
                    phase: s.meta?.phase || 'N/A',
                    motion: s.meta?.motion || 'N/A',
                    zone: s.meta?.zone || s.meta?.ur_r_m !== undefined ? s.meta?.zone : 'N/A',
                    zone_mm: s.meta?.zone_mm ?? 'N/A'
                }));
                if (isFirstCell && !firstCellLogged) {
                    console.log('🧪 Paletizado celda #0 (empieza con approach_pick):', logData);
                    firstCellLogged = true;
                }
                if (isSecondCell && !secondCellLogged) {
                    console.log('🧪 Paletizado celda #1 (sin approach_global_pick):', logData);
                    secondCellLogged = true;
                }

                cellIndex += 1;
            }
        }
    }
    
    return steps;
}

/**
 * Registra el resultado de un step ejecutado
 */
function recordStepResult({source, run_id, step_id, pose, timestamp, frame, meta}) {
    const plannedStep = plannedSteps.find(s => s.step_id === step_id) || null;
    const stepType = plannedStep?.type ?? meta?.type ?? null;
    const phase = plannedStep?.meta?.phase ?? meta?.phase ?? null;
    const zone = plannedStep?.meta?.zone ?? meta?.zone ?? null;
    const isMotion = stepType === 'MoveJ' || stepType === 'MoveL' || stepType === 'MoveC';

    const resultObj = {
        source: source,
        run_id: run_id,
        step_id: step_id,
        pose: pose,
        timestamp: timestamp,
        frame: frame || 'WORLD',
        meta: meta || {},
        step_type: stepType,
        phase: phase,
        zone: zone,
        is_motion: isMotion
    };

    actualResults.push(resultObj);

    // Guardar resultado incremental en IndexedDB (no bloqueante)
    safeIdbCall(() => {
        if (typeof idbAddResult !== 'function') return null;
        return idbAddResult({
            ...resultObj,
            program_snapshot_id: programSnapshotId
        });
    });

    // Guardar resultado por step en run persistido (no bloqueante)
    const stepResultCompatible = {
        step_id: step_id,
        pose: pose,
        timestamp: Date.now(),
        source: 'sim'
    };

    console.log('[SIM STEP SAVE]', {
        persistedRunId,
        step_id: stepResultCompatible?.step_id,
        pose: stepResultCompatible?.pose,
        stepResultCompatible
    });

    safeIdbCall(() => {
        if (!persistedRunId || typeof window.upsertRunStepResult !== 'function') return null;
        console.log('[SIM STEP UPSERT CALL]', persistedRunId);
        const persistPromise = Promise.resolve(window.upsertRunStepResult(persistedRunId, stepResultCompatible))
            .then(() => {
                return window.getRun?.(persistedRunId);
            })
            .then((savedRun) => {
                console.log('[SIM STEP AFTER UPSERT]', {
                    persistedRunId,
                    stepCount: Object.keys(savedRun?.resultsByStep || {}).length,
                    stepIds: Object.keys(savedRun?.resultsByStep || {})
                });
            })
            .catch((err) => {
                console.error('[SIM STEP AFTER UPSERT ERROR]', err);
            });

        persistedStepPromises.push(persistPromise);
        return persistPromise;
    });

    if (DEBUG_IDB) {
        console.log('IDB save result', {
            step_id: step_id,
            step_type: stepType,
            phase: phase
        });
    }
}

/**
 * Obtiene los resultados de una ejecución específica
 */
function getLastRunResults(run_id) {
    if (run_id) {
        return actualResults.filter(r => r.run_id === run_id);
    }
    return actualResults.filter(r => r.run_id === currentRunId);
}

/**
 * Obtiene el pose actual del simulador en formato estándar
 */
function getCurrentSimPose() {
    return {
        x: currentPosition.x * 1000,      // Three.js metros a mm
        y: -currentPosition.z * 1000,     // Conversión de ejes
        z: currentPosition.y * 1000,
        rx: currentRotation.x * 180 / Math.PI,
        ry: (currentRotation.y + Math.PI/2) * 180 / Math.PI,
        rz: currentRotation.z * 180 / Math.PI
    };
}

/**
 * Ejecuta un step planificado (MoveJ o MoveL)
 * @param {Object} step - Paso planificado con step_id, type, target_pose, etc.
 */
async function executeStep(step) {
    const simState = (typeof window !== 'undefined')
        ? (window.simState || (window.simState = {}))
        : {};

    const isToolStep = step?.kind === 'tool' || step?.type === 'tool' || !!step?.action;
    if (isToolStep) {
        const action = step?.action;
        if (action === 'gripper_close') {
            simState.gripper = 'closed';
            updateStatus('Gripper CLOSE');
        } else if (action === 'gripper_open') {
            simState.gripper = 'open';
            updateStatus('Gripper OPEN');
        } else if (action === 'grip_set') {
            const width = step?.width_mm;
            const force = step?.force;
            simState.gripperWidth = width;
            simState.gripperForce = force;
            updateStatus(`RG2 grip_set (${width ?? ''}, ${force ?? ''})`);
        } else {
            updateStatus(`Tool action ${action || 'unknown'}`);
        }

        recordStepResult({
            source: 'sim',
            run_id: currentRunId,
            step_id: step.step_id,
            pose: getCurrentSimPose(),
            timestamp: Date.now() - runStartTime,
            frame: step.frame_id,
            meta: step.meta
        });
        return;
    }

    const isWaitStep = step?.kind === 'wait' || step?.type === 'WAIT' || step?.type === 'wait';
    if (isWaitStep) {
        const waitSeconds = step?.seconds ?? step?.duration_s ?? step?.meta?.wait_s ?? 0;
        const waitMs = Math.max(0, Number(waitSeconds) * 1000);
        updateStatus(`WAIT ${waitMs}ms`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        recordStepResult({
            source: 'sim',
            run_id: currentRunId,
            step_id: step.step_id,
            pose: getCurrentSimPose(),
            timestamp: Date.now() - runStartTime,
            frame: step.frame_id,
            meta: step.meta
        });
        return;
    }

    // Pasos de IO (gripper ON/OFF)
    if (step.type === 'IO_DO') {
        const pin = step.meta?.pin ?? 1;
        const value = !!step.meta?.value;
        const waitMs = Math.max(0, (step.meta?.wait_s ?? 0) * 1000);
        updateStatus(`DO[${pin}] = ${value ? 'ON' : 'OFF'}${waitMs ? ` (espera ${waitMs}ms)` : ''}`);
        setDO(pin, value);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        // Registrar resultado con pose actual
        recordStepResult({
            source: 'sim',
            run_id: currentRunId,
            step_id: step.step_id,
            pose: getCurrentSimPose(),
            timestamp: Date.now() - runStartTime,
            frame: step.frame_id,
            meta: step.meta
        });
        return;
    }

    // Mostrar información del step
    let blockInfo = `Step ${step.step_id + 1}: ${step.type}`;
    
    if (step.pointName) {
        blockInfo += ` → ${step.pointName}`;
    }
    
    const pose = step.target_pose;
    if (!pose) {
        updateStatus(`Step ${step.step_id + 1}: sin target_pose (skip)`);
        recordStepResult({
            source: 'sim',
            run_id: currentRunId,
            step_id: step.step_id,
            pose: getCurrentSimPose(),
            timestamp: Date.now() - runStartTime,
            frame: step.frame_id,
            meta: step.meta
        });
        return;
    }
    blockInfo += ` (X:${pose.x}, Y:${pose.y}, Z:${pose.z})`;
    
    if (step.frame_id !== "WORLD") {
        blockInfo += ` [Frame: ${step.frame_id}]`;
    }
    
    if (step.meta.pallet) {
        const p = step.meta.pallet;
        blockInfo += ` [${step.meta.phase} L${p.layer} R${p.row} C${p.col}]`;
    }
    
    currentBlockText.textContent = blockInfo;
    
    const previousPosition = currentPosition.clone();
    
    // Determinar tipo de movimiento
    const isLinearMove = (step.type === 'MoveL');
    
    updateStatus(`${step.type} a step ${step.step_id + 1}...`);
    
    const startPoint = previousPosition.clone();
    
    // Convertir pose planificada a coordenadas Three.js
    const localPos = robotToThreePosition(pose);
    
    const poseOrientationUnit = normalizeRotationUnit(step.meta?.orientation_unit || 'degrees');
    const localRot = urRotationVectorToThreeEuler(pose.rx, pose.ry, pose.rz, poseOrientationUnit);
    
    // Aplicar transformación del frame si aplica
    // Nota: activeFrame debe actualizarse según step.frame_id si es necesario
    const transformed = applyFrameTransform(localPos, localRot, step.frame_id);
    const targetPos = transformed.position;
    const targetLogicalRot = transformed.rotation;

    const tcpOrientationDebugEnabled = (typeof localStorage !== 'undefined') && localStorage.getItem('fp_debug') === 'true';
    
    // Determinar material: el primer tramo desde home simulado usa material diferenciado (gris semitransparente)
    // Los demás tramos usan el color según tipo de movimiento (azul MoveJ, verde MoveL, etc)
    const defaultLineMaterial = isLinearMove ? moveLMaterial : moveJMaterial;
    const lineMaterial = consumeInitialReferenceSegmentMaterial(defaultLineMaterial);
    
    // Animación de movimiento
    const numSegments = 15;
    const totalDuration = 1000;
    const segmentDuration = totalDuration / numSegments;
    
    let curve;
    if (isLinearMove) {
        curve = new THREE.LineCurve3(startPoint, targetPos);
    } else {
        const midPoint = new THREE.Vector3().lerpVectors(startPoint, targetPos, 0.5);
        midPoint.y += startPoint.distanceTo(targetPos) * 0.25;
        curve = new THREE.QuadraticBezierCurve3(startPoint, midPoint, targetPos);
    }
    
    const pointsOnCurve = curve.getPoints(numSegments);
    let segmentStartPoint = startPoint.clone();
    
    for (let i = 1; i < pointsOnCurve.length; i++) {
        if (!isSimulating) break;
        
        const segmentEndPoint = pointsOnCurve[i];
        await animateTCPMove(segmentEndPoint, targetLogicalRot, segmentDuration, targetLogicalRot);
        drawTrajectoryLine(segmentStartPoint, currentPosition, lineMaterial);
        segmentStartPoint.copy(currentPosition);
    }
    
    if (isSimulating) {
        tcpObject.position.copy(targetPos);
        tcpObject.rotation.copy(targetLogicalRot);
        currentPosition.copy(targetPos);
        currentRotation.copy(targetLogicalRot);

        const activeFrameNameForStep = (step.frame_id && step.frame_id !== 'WORLD') ? step.frame_id : null;
        if (tcpOrientationDebugEnabled && activeFrameNameForStep) {
            const frameData = definedFrames[activeFrameNameForStep] || null;
            const qFrame = frameData
                ? new THREE.Quaternion().setFromEuler(frameData.rotation)
                : new THREE.Quaternion();
            const qPoseLocal = urRotationVectorToThreeQuaternion(
                pose.rx,
                pose.ry,
                pose.rz,
                poseOrientationUnit
            );
            const qFinalExpected = qFrame.clone().multiply(qPoseLocal);
            const qFinal = new THREE.Quaternion().setFromEuler(targetLogicalRot);

            const tcpVisualQuat = tcpVisualGroup
                ? tcpVisualGroup.getWorldQuaternion(new THREE.Quaternion())
                : tcpObject.getWorldQuaternion(new THREE.Quaternion());
            const activeFrameQuat = frameData?.visualObject
                ? frameData.visualObject.getWorldQuaternion(new THREE.Quaternion())
                : qFrame.clone();

            const xAxisTcpVisualGroup = new THREE.Vector3(1, 0, 0).applyQuaternion(tcpVisualQuat).normalize();
            const yAxisTcpVisualGroup = new THREE.Vector3(0, 1, 0).applyQuaternion(tcpVisualQuat).normalize();
            const zAxisTcpVisualGroup = new THREE.Vector3(0, 0, 1).applyQuaternion(tcpVisualQuat).normalize();

            const xAxisActiveFrame = new THREE.Vector3(1, 0, 0).applyQuaternion(activeFrameQuat).normalize();
            const yAxisActiveFrame = new THREE.Vector3(0, 1, 0).applyQuaternion(activeFrameQuat).normalize();
            const zAxisActiveFrame = new THREE.Vector3(0, 0, 1).applyQuaternion(activeFrameQuat).normalize();

            console.debug('[TCP FRAME ORIENTATION DEBUG]', {
                step_id: step.step_id,
                activeFrameName: activeFrameNameForStep,
                frameRotationOriginal: frameData?.rotationInputDeg || {
                    rx: Number(((frameData?.rotation?.x || 0) * 180 / Math.PI).toFixed(6)),
                    ry: Number(((frameData?.rotation?.y || 0) * 180 / Math.PI).toFixed(6)),
                    rz: Number(((frameData?.rotation?.z || 0) * 180 / Math.PI).toFixed(6))
                },
                poseLocalRotation: {
                    rx: pose.rx,
                    ry: pose.ry,
                    rz: pose.rz
                },
                orientation_unit: poseOrientationUnit,
                qFrame: {
                    x: Number(qFrame.x.toFixed(6)),
                    y: Number(qFrame.y.toFixed(6)),
                    z: Number(qFrame.z.toFixed(6)),
                    w: Number(qFrame.w.toFixed(6))
                },
                qPoseLocal: {
                    x: Number(qPoseLocal.x.toFixed(6)),
                    y: Number(qPoseLocal.y.toFixed(6)),
                    z: Number(qPoseLocal.z.toFixed(6)),
                    w: Number(qPoseLocal.w.toFixed(6))
                },
                qFinalExpected: {
                    x: Number(qFinalExpected.x.toFixed(6)),
                    y: Number(qFinalExpected.y.toFixed(6)),
                    z: Number(qFinalExpected.z.toFixed(6)),
                    w: Number(qFinalExpected.w.toFixed(6))
                },
                qFinal: {
                    x: Number(qFinal.x.toFixed(6)),
                    y: Number(qFinal.y.toFixed(6)),
                    z: Number(qFinal.z.toFixed(6)),
                    w: Number(qFinal.w.toFixed(6))
                },
                xAxisTcpVisualGroup: {
                    x: Number(xAxisTcpVisualGroup.x.toFixed(6)),
                    y: Number(xAxisTcpVisualGroup.y.toFixed(6)),
                    z: Number(xAxisTcpVisualGroup.z.toFixed(6))
                },
                yAxisTcpVisualGroup: {
                    x: Number(yAxisTcpVisualGroup.x.toFixed(6)),
                    y: Number(yAxisTcpVisualGroup.y.toFixed(6)),
                    z: Number(yAxisTcpVisualGroup.z.toFixed(6))
                },
                zAxisTcpVisualGroup: {
                    x: Number(zAxisTcpVisualGroup.x.toFixed(6)),
                    y: Number(zAxisTcpVisualGroup.y.toFixed(6)),
                    z: Number(zAxisTcpVisualGroup.z.toFixed(6))
                },
                xAxisActiveFrame: {
                    x: Number(xAxisActiveFrame.x.toFixed(6)),
                    y: Number(xAxisActiveFrame.y.toFixed(6)),
                    z: Number(xAxisActiveFrame.z.toFixed(6))
                },
                yAxisActiveFrame: {
                    x: Number(yAxisActiveFrame.x.toFixed(6)),
                    y: Number(yAxisActiveFrame.y.toFixed(6)),
                    z: Number(yAxisActiveFrame.z.toFixed(6))
                },
                zAxisActiveFrame: {
                    x: Number(zAxisActiveFrame.x.toFixed(6)),
                    y: Number(zAxisActiveFrame.y.toFixed(6)),
                    z: Number(zAxisActiveFrame.z.toFixed(6))
                },
                dotProductsTcpVsActiveFrame: {
                    xDot: Number(xAxisTcpVisualGroup.dot(xAxisActiveFrame).toFixed(6)),
                    yDot: Number(yAxisTcpVisualGroup.dot(yAxisActiveFrame).toFixed(6)),
                    zDot: Number(zAxisTcpVisualGroup.dot(zAxisActiveFrame).toFixed(6))
                }
            });
        }
        
        // Registrar resultado
        const finalPose = getCurrentSimPose();
        recordStepResult({
            source: 'sim',
            run_id: currentRunId,
            step_id: step.step_id,
            pose: finalPose,
            timestamp: Date.now() - runStartTime,
            frame: step.frame_id,
            meta: step.meta
        });
        
        // Diferenciar color: negro solo para targets del paletizado; gris para aproximaciones/otros
        const isPalletStep = !!step.meta?.pallet;
        const isPalletTarget = step.meta?.phase === 'target_pick' || step.meta?.phase === 'target_place';
        const isApproachStep = isPalletStep
            ? !isPalletTarget
            : ['approach', 'approach_global', 'approach_local'].includes(step.meta?.phase);
        markPoint(currentPosition, step.pointName, isApproachStep);
    }
}

// SECCIÓN 509b: Evaluación de condiciones booleanas simuladas (usada por while/if)
// Evalúa una condición del JSON de bloques contra el estado IO simulado actual.
// Convierte cualquier representación de estado DI ("1",1,"ON",true,"true"...) a booleano
function _parseDIState(state) {
    const normalized = typeof state === 'string' ? state.trim().toLowerCase() : state;
    return normalized === '1'
        || normalized === 1
        || normalized === true
        || normalized === 'on'
        || normalized === 'true';
}

function _isSimDebugEnabled() {
    try {
        return localStorage.getItem('fp_debug') === 'true';
    } catch (error) {
        return false;
    }
}

function _formatSimVariables(vars) {
    try {
        return JSON.stringify(vars || {});
    } catch (error) {
        return '{}';
    }
}

function _normalizeExpressionOp(op) {
    const value = String(op ?? '').trim().toUpperCase();
    if (value === 'ADD' || value === '+') return 'ADD';
    if (value === 'SUBTRACT' || value === 'MINUS' || value === '-') return 'SUBTRACT';
    if (value === 'MULTIPLY' || value === '*') return 'MULTIPLY';
    if (value === 'DIVIDE' || value === '/') return 'DIVIDE';
    return value;
}

function _normalizeCompareOp(op) {
    const value = String(op ?? '').trim().toUpperCase();
    if (value === 'LT' || value === '<') return 'LT';
    if (value === 'LTE' || value === '<=' || value === 'LE') return 'LTE';
    if (value === 'GT' || value === '>') return 'GT';
    if (value === 'GTE' || value === '>=' || value === 'GE') return 'GTE';
    if (value === 'EQ' || value === '==' || value === '=') return 'EQ';
    if (value === 'NEQ' || value === '!=' || value === '<>') return 'NEQ';
    return value;
}

function _tryToNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function _resolveSimVariableName(expr) {
    const name = String(
        expr?.name
        ?? expr?.varName
        ?? expr?.variable
        ?? expr?.VARNAME
        ?? expr?.var
        ?? ''
    ).trim();
    return name;
}

function evaluateExpression(expr, vars = null) {
    if (!vars) {
        vars = (typeof simVariables !== 'undefined') ? simVariables : {};
    }
    if (expr === null || expr === undefined) return undefined;

    if (typeof expr === 'number') {
        return Number.isFinite(expr) ? expr : undefined;
    }

    if (typeof expr === 'boolean') {
        return expr;
    }

    if (typeof expr === 'string') {
        const trimmed = expr.trim();
        if (!trimmed) return undefined;
        const numeric = _tryToNumber(trimmed);
        if (numeric !== null) return numeric;
        if (Object.prototype.hasOwnProperty.call(vars, trimmed)) {
            return vars[trimmed];
        }
        return undefined;
    }

    if (typeof expr !== 'object') return undefined;

    const type = String(expr.type || '').trim();

    if (type === 'math_number') {
        const value = Number(expr.NUM ?? expr.num ?? expr.value);
        return Number.isFinite(value) ? value : undefined;
    }

    if (type === 'variable' || type === 'variable_get' || type === 'variables_get') {
        const variableName = _resolveSimVariableName(expr);
        if (!variableName) return undefined;
        const hasVar = Object.prototype.hasOwnProperty.call(vars, variableName);
        const value = hasVar ? vars[variableName] : undefined;
        if (_isSimDebugEnabled()) {
            console.log(`[SIM VAR GET] ${variableName} -> ${value !== undefined ? value : '(undefined)'}`);
            if (!hasVar) {
                console.warn(`[SIM VAR WARNING] variable ${variableName} no inicializada`, { variables: { ...vars } });
            }
        }
        return value;
    }

    if (type === 'math_arithmetic' || (!type && (expr.operator !== undefined || expr.OP !== undefined))) {
        const left = evaluateExpression(expr.a ?? expr.A ?? expr.left, vars);
        const right = evaluateExpression(expr.b ?? expr.B ?? expr.right, vars);
        if (left === undefined || right === undefined) return undefined;

        const leftNum = _tryToNumber(left);
        const rightNum = _tryToNumber(right);
        if (leftNum === null || rightNum === null) return undefined;

        const operator = _normalizeExpressionOp(expr.operator ?? expr.OP ?? expr.op);
        switch (operator) {
            case 'ADD':
                return leftNum + rightNum;
            case 'SUBTRACT':
                return leftNum - rightNum;
            case 'MULTIPLY':
                return leftNum * rightNum;
            case 'DIVIDE':
                if (rightNum === 0) return undefined;
                return leftNum / rightNum;
            default:
                return undefined;
        }
    }

    if (type === 'logic_compare') {
        return evaluateCondition(expr, vars);
    }

    if (Object.prototype.hasOwnProperty.call(expr, 'value')) {
        return evaluateExpression(expr.value, vars);
    }

    return undefined;
}

function evaluateCondition(cond, vars = null) {
    if (!vars) {
        vars = (typeof simVariables !== 'undefined') ? simVariables : {};
    }
    if (!cond) return undefined;

    if (typeof cond === 'boolean') return cond;
    if (typeof cond === 'number') return cond !== 0;

    if (typeof cond !== 'object') return undefined;

    const type = String(cond.type || '').trim();

    switch (type) {
        case 'read_di_block': {
            const pin = Number(cond.pin ?? 1);
            const expected = _parseDIState(cond.state);
            const current = !!window.ioState?.DI?.[pin];
            return current === expected;
        }
        case 'logic_boolean':
            return !!cond.value;
        case 'logic_and': {
            const left = evaluateCondition(cond.a, vars);
            const right = evaluateCondition(cond.b, vars);
            if (left === undefined || right === undefined) return undefined;
            return left && right;
        }
        case 'logic_or': {
            const left = evaluateCondition(cond.a, vars);
            const right = evaluateCondition(cond.b, vars);
            if (left === undefined || right === undefined) return undefined;
            return left || right;
        }
        case 'logic_not': {
            const inner = evaluateCondition(cond.inner ?? cond.a, vars);
            if (inner === undefined) return undefined;
            return !inner;
        }
        case 'logic_compare': {
            const leftValue = evaluateExpression(cond.a ?? cond.A ?? cond.left, vars);
            const rightValue = evaluateExpression(cond.b ?? cond.B ?? cond.right, vars);
            if (leftValue === undefined || rightValue === undefined) return undefined;

            const operator = _normalizeCompareOp(cond.operator ?? cond.OP ?? cond.op);
            const leftNum = _tryToNumber(leftValue);
            const rightNum = _tryToNumber(rightValue);

            if ((operator === 'LT' || operator === 'LTE' || operator === 'GT' || operator === 'GTE')
                && (leftNum === null || rightNum === null)) {
                return undefined;
            }

            switch (operator) {
                case 'LT':
                    return leftNum < rightNum;
                case 'LTE':
                    return leftNum <= rightNum;
                case 'GT':
                    return leftNum > rightNum;
                case 'GTE':
                    return leftNum >= rightNum;
                case 'EQ':
                    if (leftNum !== null && rightNum !== null) return leftNum === rightNum;
                    return leftValue === rightValue;
                case 'NEQ':
                    if (leftNum !== null && rightNum !== null) return leftNum !== rightNum;
                    return leftValue !== rightValue;
                default:
                    return undefined;
            }
        }
        default:
            break;
    }

    const fallback = evaluateExpression(cond, vars);
    if (typeof fallback === 'boolean') return fallback;
    if (typeof fallback === 'number') return fallback !== 0;
    return undefined;
}

function evaluateSimCondition(cond, vars = null) {
    const localVars = vars || ((typeof simVariables !== 'undefined') ? simVariables : {});
    const debugEnabled = (typeof _isSimDebugEnabled === 'function')
        ? _isSimDebugEnabled()
        : (() => {
            try {
                return localStorage.getItem('fp_debug') === 'true';
            } catch (error) {
                return false;
            }
        })();

    if (typeof evaluateCondition === 'function') {
        const result = evaluateCondition(cond, localVars);
        if (result === undefined) {
            if (debugEnabled) {
                console.warn('[SIM CONDITION] Unknown/non-evaluable condition, treating as false');
            }
            return false;
        }

        if (debugEnabled && cond && cond.type === 'read_di_block') {
            const pin = Number(cond.pin ?? 1);
            const expected = _parseDIState(cond.state);
            const current = !!window.ioState?.DI?.[pin];
            console.log(`[SIM CONDITION] read_di_block pin=${pin} expected=${expected} current=${current} result=${result}`);
            console.log(`[SIM WHILE] DI pin = ${pin} expected = ${expected} current = ${current} result = ${result}`);
        }

        return result;
    }

    if (!cond) {
        if (debugEnabled) {
            console.warn('[SIM CONDITION] Unknown condition, treating as false');
        }
        return false;
    }

    switch (cond.type) {
        case 'read_di_block': {
            const pin = Number(cond.pin ?? 1);
            const expected = _parseDIState(cond.state);
            const current = !!window.ioState?.DI?.[pin];
            const result = current === expected;
            if (debugEnabled) {
                console.log(`[SIM CONDITION] read_di_block pin=${pin} expected=${expected} current=${current} result=${result}`);
                console.log(`[SIM WHILE] DI pin = ${pin} expected = ${expected} current = ${current} result = ${result}`);
            }
            return result;
        }
        case 'logic_boolean':
            return !!cond.value;
        case 'logic_and':
            return evaluateSimCondition(cond.a, localVars) && evaluateSimCondition(cond.b, localVars);
        case 'logic_or':
            return evaluateSimCondition(cond.a, localVars) || evaluateSimCondition(cond.b, localVars);
        case 'logic_not':
            return !evaluateSimCondition(cond.inner ?? cond.a, localVars);
        default:
            if (debugEnabled) {
                console.warn('[SIM CONDITION] Unknown condition, treating as false');
            }
            return false;
    }
}

// Devuelve true si el programa contiene estructuras de control en cualquier nivel.
function hasControlStructure(program) {
    if (!Array.isArray(program)) return false;
    for (const block of program) {
        if (!block || typeof block !== 'object') continue;
        if (
            block.type === 'if_block'
            || block.type === 'while_block'
            || block.type === 'for_block'
            || block.type === 'loop_block'
            || block.type === 'repeat_block'
        ) {
            return true;
        }
        if (hasControlStructure(block.do) || hasControlStructure(block.then) || hasControlStructure(block.else)) {
            return true;
        }
    }
    return false;
}

// Tipos de pasos que cuentan como movimiento real (incrementan interpretedStepCounter).
const SIM_MOTION_TYPES = new Set(['MoveJ', 'MoveL', 'MoveC']);

// Compila una lista de bloques (sin while) a plannedSteps y los ejecuta uno a uno.
// Usa el CompilerAPI si está disponible; si no, compilePlanFromProgram_legacyThree.
// En la ruta interpretada (executeBlockListWithIO) remapea step_id de cada movimiento
// real al valor de interpretedStepCounter para obtener numeración global 1..N.
async function executeCompiledBlockList(blockList, compilationCtx) {
    const compiler = window.CompilerAPI?.compilePlanFromProgram;
    if (typeof compiler !== 'function' && typeof compilePlanFromProgram_legacyThree !== 'function') {
        updateStatus('⚠️ Compilador no disponible.');
        return;
    }
    const result = typeof compiler === 'function'
        ? compiler(blockList)
        : compilePlanFromProgram_legacyThree(blockList);
    for (const step of (result.plannedSteps || [])) {
        if (!isSimulating) break;
        while (isPaused && isSimulating) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!isSimulating) break;
        // Reasignar step_id global cuando se está en la ruta interpretada.
        // interpretedStepCounter > 0 indica que la ruta interpretada está activa.
        if (interpretedStepCounter > 0 || SIM_MOTION_TYPES.has(step.type)) {
            if (SIM_MOTION_TYPES.has(step.type)) {
                interpretedStepCounter += 1;
                step.step_id = interpretedStepCounter - 1; // step_id es 0-based internamente
                if (localStorage.getItem('fp_debug') === 'true') {
                    console.log(`[SIM INTERPRETER] assigned step_id = ${step.step_id + 1}, type = ${step.type}`);
                }
            }
        }
        await executeStep(step);
    }
}

// Intérprete de bloques con soporte real de while_block + condición DI.
// Solo se usa cuando el programa contiene while_block (detectado antes de compilar).
async function executeBlockListWithIO(blockList, vars = null) {
    if (!Array.isArray(blockList)) return;
    const localVars = vars || ((typeof simVariables !== 'undefined') ? simVariables : {});
    const simDebugEnabled = (typeof _isSimDebugEnabled === 'function')
        ? _isSimDebugEnabled
        : (() => {
            try {
                return localStorage.getItem('fp_debug') === 'true';
            } catch (error) {
                return false;
            }
        });
    const evalExpr = (typeof evaluateExpression === 'function')
        ? evaluateExpression
        : ((expr, fallbackVars) => {
            if (typeof expr === 'number') return Number.isFinite(expr) ? expr : undefined;
            if (typeof expr === 'boolean') return expr;
            if (!expr || typeof expr !== 'object') return undefined;
            if (expr.type === 'variable' || expr.type === 'variable_get' || expr.type === 'variables_get') {
                const variableName = String(expr.name ?? expr.varName ?? expr.variable ?? expr.VARNAME ?? '').trim();
                return Object.prototype.hasOwnProperty.call(fallbackVars || {}, variableName)
                    ? fallbackVars[variableName]
                    : undefined;
            }
            return undefined;
        });
    const evalCond = (typeof evaluateCondition === 'function')
        ? evaluateCondition
        : ((cond, fallbackVars) => evaluateSimCondition(cond, fallbackVars));
    const collectVariableNamesFromExpression = (expr, namesSet) => {
        if (!expr || typeof expr !== 'object') return;
        const exprType = String(expr.type || '').trim();
        if (exprType === 'variable' || exprType === 'variable_get' || exprType === 'variables_get') {
            const variableName = _resolveSimVariableName(expr);
            if (variableName) namesSet.add(variableName);
        }
        collectVariableNamesFromExpression(expr.a ?? expr.A ?? expr.left, namesSet);
        collectVariableNamesFromExpression(expr.b ?? expr.B ?? expr.right, namesSet);
        collectVariableNamesFromExpression(expr.inner, namesSet);
        collectVariableNamesFromExpression(expr.value, namesSet);
    };
    const getFirstMissingVariableInCondition = (cond, variables) => {
        const namesSet = new Set();
        collectVariableNamesFromExpression(cond, namesSet);
        for (const name of namesSet) {
            if (!Object.prototype.hasOwnProperty.call(variables || {}, name)) {
                return name;
            }
        }
        return '';
    };

    // Precalcular contexto de definiciones para pasar bloques de contexto
    const contextBlocks = [];
    const executableBlocks = [];

    // Separar bloques de definición (pose, point, frame, set_tool) de los ejecutables
    for (const block of blockList) {
        if (!block) continue;
        const t = block.type;
        if (t === 'define_pose' || t === 'define_point' || t === 'define_frame' || t === 'set_tool' || t === 'use_frame') {
            contextBlocks.push(block);
            executableBlocks.push(block); // también los ejecutamos para actualizar contexto sim
        } else {
            executableBlocks.push(block);
        }
    }

    for (const block of executableBlocks) {
        if (!isSimulating) break;
        while (isPaused && isSimulating) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!isSimulating) break;

        if (simDebugEnabled()) {
            console.log(`[SIM BLOCK EXEC] type=${block.type} varsBefore=${JSON.stringify(localVars)}`);
        }

        if (block.type === 'variable_set' || block.type === 'variables_set') {
            const varName = String(
                block.varName
                ?? block.variable
                ?? block.name
                ?? block.VARNAME
                ?? 'i'
            ).trim() || 'i';
            const valueExpr = block.value ?? block.VALUE ?? null;
            const evaluatedValue = evalExpr(valueExpr, localVars);

            if (evaluatedValue === undefined) {
                updateStatus(`[SIM VAR WARNING] no se pudo evaluar asignación de ${varName}.`, false);
                if (_isSimDebugEnabled()) {
                    console.warn('[SIM VAR WARNING] assignment not evaluable', {
                        varName,
                        valueExpr,
                        variables: { ...localVars }
                    });
                }
            } else {
                localVars[varName] = evaluatedValue;
                if (simDebugEnabled()) {
                    console.log(`[SIM VAR SET] ${varName} = ${evaluatedValue} varsAfter=${JSON.stringify(localVars)}`);
                }
            }
            continue;
        }

        if (block.type === 'while_block') {
            const cond = block.condition || block.cond || null;
            const bodyBlocks = Array.isArray(block.do) ? block.do : [];
            let iterCount = 0;
            let conditionWarning = false;
            let reachedMaxIterations = false;

            if (simDebugEnabled()) {
                console.log(`[WHILE DEBUG] varsBeforeWhile=${JSON.stringify(localVars)}`);
            }
            
            if (simDebugEnabled()) {
                console.log(`[SIM WHILE] BEFORE EVAL: localVars=${JSON.stringify(localVars)}`);
                console.log(`[SIM WHILE] evaluating condition: ${JSON.stringify(cond)}`);
            }
            
            let conditionResult = evalCond(cond, localVars);
            
            if (simDebugEnabled()) {
                console.log(`[SIM WHILE] AFTER EVAL: conditionResult=${conditionResult}`);
            }

            // Describir condición para el log
            let condDesc = 'condición desconocida';
            if (cond && cond.type === 'read_di_block') {
                const st = _parseDIState(cond.state) ? 'ON' : 'OFF';
                condDesc = `DI[${cond.pin ?? 1}] = ${st}`;
            } else if (cond && cond.type === 'logic_compare') {
                const op = _normalizeCompareOp(cond.operator ?? cond.OP ?? cond.op);
                const leftRaw = JSON.stringify(cond.a ?? cond.A ?? cond.left ?? null);
                const rightRaw = JSON.stringify(cond.b ?? cond.B ?? cond.right ?? null);
                condDesc = `${leftRaw} ${op || '?'} ${rightRaw}`;
            }
            if (simDebugEnabled()) {
                console.log(`[SIM WHILE] condition = ${JSON.stringify(cond)}`);
                console.log(`[WHILE DEBUG] condition=${JSON.stringify(cond)} variables=${_formatSimVariables(localVars)} result=${conditionResult}`);
            }

            updateStatus(`🔄 WHILE (${condDesc}): evaluando...`);
            // Ceder control al navegador antes de empezar el while
            await new Promise(resolve => setTimeout(resolve, 0));

            if (conditionResult === undefined) {
                conditionWarning = true;
                updateStatus('[WHILE WARNING] condición no evaluable.', false);
                const missingVariableName = getFirstMissingVariableInCondition(cond, localVars);
                if (missingVariableName) {
                    updateStatus(
                        `⚠️ La variable '${missingVariableName}' se usa en el while, pero no está inicializada. ` +
                        `Comprueba que el bloque 'variable ${missingVariableName} = 0' está conectado antes del bucle.`,
                        false
                    );
                }
                console.warn('[WHILE WARNING] condición no evaluable', {
                    condition: cond,
                    variables: { ...localVars }
                });
            }

            while (isSimulating && conditionResult === true) {
                if (iterCount >= SIM_MAX_WHILE_ITERATIONS) {
                    reachedMaxIterations = true;
                    updateStatus(
                        `⛔ Simulación detenida: límite de ${SIM_MAX_WHILE_ITERATIONS} ciclos while alcanzado.\n` +
                        `Desactiva la entrada digital o aumenta SIM_MAX_WHILE_ITERATIONS.`,
                        false
                    );
                    console.warn('[WHILE WARNING] posible bucle infinito: límite de iteraciones alcanzado', {
                        maxWhileIterations: SIM_MAX_WHILE_ITERATIONS,
                        condition: cond,
                        variables: { ...localVars }
                    });
                    isSimulating = false;
                    break;
                }
                iterCount++;
                updateStatus(`🔄 WHILE ciclo ${iterCount} (${condDesc})`);
                if (simDebugEnabled()) {
                    const trackedI = Object.prototype.hasOwnProperty.call(localVars, 'i') ? localVars.i : 'undefined';
                    console.log(`[SIM WHILE] entering iteration ${iterCount}`);
                    console.log(`[WHILE ITERATION] i=${trackedI}, iteration=${iterCount}`);
                }

                // Ejecutar cuerpo completo del while (sin cortar aunque cambie DI)
                await executeBlockListWithIO(bodyBlocks, localVars);

                // Ceder control al navegador entre iteraciones
                await new Promise(resolve => setTimeout(resolve, 0));

                // Re-evaluar condición al inicio de la siguiente iteración
                conditionResult = evalCond(cond, localVars);
                if (simDebugEnabled()) {
                    console.log(`[WHILE DEBUG] condition=${JSON.stringify(cond)} variables=${_formatSimVariables(localVars)} result=${conditionResult}`);
                }
                if (conditionResult === undefined) {
                    conditionWarning = true;
                    updateStatus('[WHILE WARNING] condición no evaluable durante la ejecución.', false);
                    const missingVariableName = getFirstMissingVariableInCondition(cond, localVars);
                    if (missingVariableName) {
                        updateStatus(
                            `⚠️ La variable '${missingVariableName}' se usa en el while, pero no está inicializada. ` +
                            `Comprueba que el bloque 'variable ${missingVariableName} = 0' está conectado antes del bucle.`,
                            false
                        );
                    }
                    console.warn('[WHILE WARNING] condición no evaluable durante while', {
                        condition: cond,
                        variables: { ...localVars },
                        iteration: iterCount
                    });
                    break;
                }
            }
            if (simDebugEnabled()) {
                console.log('[SIM WHILE] condition false, exiting');
            }

            if (isSimulating) {
                if (conditionWarning) {
                    updateStatus(`⚠️ WHILE detenido tras ${iterCount} ciclo(s): condición no evaluable.`, false);
                } else if (!reachedMaxIterations) {
                    updateStatus(`✅ WHILE terminado tras ${iterCount} ciclo(s): ${condDesc} es ahora falso.`);
                }
            }
            continue;
        }

        if (block.type === 'if_block') {
            const cond = block.condition || block.cond || null;
            if (localStorage.getItem('fp_debug') === 'true') {
                console.log(`[SIM IF] condition = ${JSON.stringify(cond)}`);
            }
            const conditionResult = evalCond(cond, localVars);
            if (simDebugEnabled()) {
                console.log(`[SIM IF] condition result = ${conditionResult}`);
            }
            if (conditionResult === undefined) {
                updateStatus('[IF WARNING] condición no evaluable: se omite rama do y else.', false);
                console.warn('[IF WARNING] condición no evaluable', {
                    condition: cond,
                        variables: { ...localVars }
                });
            } else if (conditionResult) {
                if (simDebugEnabled()) {
                    console.log('[SIM IF] executing do/then');
                }
                const trueBranch = Array.isArray(block.do)
                    ? block.do
                    : (Array.isArray(block.then) ? block.then : []);
                await executeBlockListWithIO(trueBranch, localVars);
            } else {
                if (simDebugEnabled()) {
                    console.log('[SIM IF] executing else');
                }
                await executeBlockListWithIO(Array.isArray(block.else) ? block.else : [], localVars);
            }
            continue;
        }

        if (block.type === 'for_block') {
            const fromRaw = Number(block.from ?? 1);
            const toRaw = Number(block.to ?? 10);
            const loopVarName = String(block.variable || 'i').trim() || 'i';
            const from = Number.isFinite(fromRaw) ? fromRaw : 1;
            const to = Number.isFinite(toRaw) ? toRaw : 10;
            const step = from <= to ? 1 : -1;
            let iterationCount = 0;

            for (let i = from; (step > 0 ? i <= to : i >= to) && isSimulating; i += step) {
                if (iterationCount >= SIM_MAX_FOR_ITERATIONS) {
                    updateStatus(
                        `⛔ Simulación detenida: límite de ${SIM_MAX_FOR_ITERATIONS} ciclos for alcanzado.`,
                        false
                    );
                    isSimulating = false;
                    break;
                }
                iterationCount++;
                localVars[loopVarName] = i;
                if (simDebugEnabled()) {
                    console.log(`[SIM FOR] iteration ${iterationCount} (i=${i}, from=${from}, to=${to})`);
                    console.log(`[SIM VAR SET] ${loopVarName} = ${i}`);
                }
                await executeBlockListWithIO(Array.isArray(block.do) ? block.do : [], localVars);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            continue;
        }

        if (block.type === 'loop_block' || block.type === 'repeat_block') {
            const rawCount = Number(block.count ?? block.times ?? block.n ?? 0);
            const count = Number.isFinite(rawCount) ? Math.floor(rawCount) : 0;
            if (count <= 0) {
                continue;
            }
            const maxIterations = Math.min(count, SIM_MAX_REPEAT_ITERATIONS);
            for (let i = 0; i < count && isSimulating; i++) {
                if (i >= maxIterations) {
                    updateStatus(
                        `⛔ Simulación detenida: límite de ${SIM_MAX_REPEAT_ITERATIONS} ciclos repeat alcanzado.`,
                        false
                    );
                    isSimulating = false;
                    break;
                }
                if (simDebugEnabled()) {
                    console.log(`[SIM REPEAT] iteration ${i + 1}/${count}`);
                }
                await executeBlockListWithIO(Array.isArray(block.do) ? block.do : [], localVars);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            continue;
        }

        // Para bloques no estructurados (movimientos, IO, wait, set_tool, etc.)
        // compilar el bloque individual y ejecutarlo
        await executeCompiledBlockList([block], null);
    }
}

// SECCIÓN 510: Ejecución Principal de la Simulación del Programa
// Lee el programa desde localStorage, compila el plan y ejecuta los pasos planificados.
async function runProgramSimulation() {
    if (isSimulating) { return; }
    persistedRunId = null;
    persistedStepPromises = [];
    
    // ✅ SIEMPRE leer desde localStorage (puede haber sido actualizado)
    const programJSON = localStorage.getItem('robotProgramForSimulation');
    
    if (!programJSON || programJSON === '[]') {
        updateStatus("⚠️ No hay programa cargado. Añade bloques en la interfaz principal.");
        return;
    }
    
    let program;
    try {
        program = JSON.parse(programJSON);
    } catch (error) {
        updateStatus("❌ Error al leer el programa. Intenta generar el código de nuevo.");
        console.error("Error parsing program:", error);
        return;
    }
    if (localStorage.getItem('fp_debug') === 'true') {
        console.log(`[SIM RECEIVE] program received, length = ${Array.isArray(program) ? program.length : 0}`);
    }

    const activeProgramName = getActiveProgramNameForSimulation();

    schedulePalletPreviewUpdate();
    
    if (!program || program.length === 0) {
        updateStatus("⚠️ El programa está vacío. Añade bloques en la interfaz principal.");
        return;
    }
    
    // ✅ Sincronizar frames para visualización (no compilación)
    syncFramesFromProgram(program);

    // ── COMPILAR PLAN ─────────────────────────────────────────────────────────
    // Fuente principal: window.CompilerAPI.compilePlanFromProgram (compiler.js).
    // Solo si no está disponible se usa el compilador legacy interno como emergencia.
    updateStatus(`🔨 Compilando programa...`);

    let compilationResult;
    const primaryCompiler = window.CompilerAPI?.compilePlanFromProgram;

    if (typeof primaryCompiler === 'function') {
        // ✅ RUTA PRINCIPAL — compiler.js (siempre preferida)
        compilationResult = primaryCompiler(program);
        console.log(`✅ Plan compilado via CompilerAPI [${compilationResult.program_snapshot_id}]: ${compilationResult.plannedSteps?.length ?? 0} steps`);
    } else {
        // ⚠️ RUTA LEGACY (fallback de emergencia) — solo si CompilerAPI no existe
        // TODO: remove legacy simulator compiler fallback once CompilerAPI is always available
        console.warn('⚠️ [LEGACY FALLBACK] window.CompilerAPI no disponible — usando compilePlanFromProgram_legacyThree. El plan puede diferir del generador industrial.');
        if (typeof compilePlanFromProgram_legacyThree !== 'function') {
            updateStatus("⚠️ Compilador no disponible en el simulador.");
            return;
        }
        compilationResult = compilePlanFromProgram_legacyThree(program);
        console.warn(`⚠️ [LEGACY FALLBACK] Plan compilado via legacy [${compilationResult.program_snapshot_id}]: ${compilationResult.plannedSteps?.length ?? 0} steps`);
    }

    const resolvedSnapshot = await resolveActiveProgramSnapshot({
        programName: activeProgramName,
        plannedStepsCount: compilationResult?.plannedSteps?.length ?? 0,
        compiledSnapshotId: compilationResult?.program_snapshot_id
    });

    const synchronizedSnapshot = syncCurrentSnapshotState(
        resolvedSnapshot.snapshotId,
        resolvedSnapshot.snapshotShort,
        { persist: true }
    );

    programSnapshotId = synchronizedSnapshot.snapshotId;

    console.debug(
        `[SIM SNAPSHOT] ${resolvedSnapshot.reusedExisting ? 'using existing snapshot' : 'creating new snapshot'} ` +
        `snapshot_id=${programSnapshotId || 'null'} reason=${resolvedSnapshot.reason}`
    );

    unlockComparisonView();
    updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');
    plannedSteps.length = 0;
    plannedSteps.push(...compilationResult.plannedSteps);
    
    console.log('🧪 Zonas (primeros 3 steps):', plannedSteps.slice(0, 3).map(step => ({
        step_id: step.step_id,
        zone: step.meta?.zone,
        zone_mm: step.meta?.zone_mm,
        ur_r_m: step.meta?.ur_r_m,
        frame_id: step.frame_id
    })));
    
    // Verificación de estructura de paletizado (si existe)
    const palletSteps = plannedSteps.filter(s => s.meta?.pallet);
    if (palletSteps.length > 0) {
        console.log('🧪 Paletizado (primeros 10 steps):', plannedSteps.slice(0, Math.min(10, plannedSteps.length)).map(step => ({
            step_id: step.step_id,
            type: step.type,
            phase: step.meta?.phase,
            pallet: step.meta?.pallet,
            motion: step.meta?.motion,
            frame_id: step.frame_id,
            target_pose: step.target_pose
        })));
    }
    
    if (plannedSteps.length === 0) {
        updateStatus("⚠️ No hay steps ejecutables en el programa compilado.");
        return;
    }
    
    updateStatus(`✅ Plan listo: ${plannedSteps.length} step(s). Iniciando ejecución...`);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // ✅ INICIAR EJECUCIÓN
    currentRunId = makeId('run');
    persistedRunId = makeId('run_sim');
    runStartTime = Date.now();
    actualResults.length = 0;

    // ✅ Cargar program_name del snapshot si existe, sino usar el activo
    // Solo se aplica el nombre del snapshot si el nombre activo es técnico (ej: .urp),
    // para no sobreescribir un nombre humano ya actualizado por el usuario.
    let runProgramName = activeProgramName;
    if (isTechnicalProgramName(activeProgramName) && programSnapshotId && typeof window.getSnapshot === 'function') {
        try {
            const existingSnapshot = await window.getSnapshot(programSnapshotId);
            if (existingSnapshot?.program_name && String(existingSnapshot.program_name).trim()) {
                runProgramName = existingSnapshot.program_name;
                console.log('[SIM RUN NAME] Nombre heredado del snapshot:', runProgramName);
            }
        } catch (err) {
            console.warn('[SIM RUN NAME] Error cargando snapshot name:', err);
        }
    }

    // Guardar run_sim persistido en IndexedDB (no bloqueante)
    safeIdbCall(() => {
        if (typeof window.saveRun !== 'function') return null;
        return window.saveRun({
            run_id: persistedRunId,
            snapshot_id: programSnapshotId || null,
            program_name: runProgramName,
            source: 'sim',
            started_at: runStartTime,
            ended_at: null,
            status: 'running',
            resultsByStep: {}
        });
    });

    // Asegurar que el snapshot asociado existe en IndexedDB (no bloqueante)
    // Evita que comparePersistedRun falle tras recargar por snapshot_id sin datos
    if (programSnapshotId && typeof window.getSnapshot === 'function' && typeof window.saveSnapshot === 'function') {
        safeIdbCall(async () => {
            const existing = await window.getSnapshot(programSnapshotId);
            if (!existing) {
                await window.saveSnapshot({
                    snapshot_id: programSnapshotId,
                    program_name: runProgramName,
                    created_at: runStartTime,
                    plannedSteps: plannedSteps.slice(),
                    contextSummary: compilationResult.contextSummary || {}
                });
                console.log('[SIM SNAPSHOT ENSURE] Snapshot guardado vía window.saveSnapshot', programSnapshotId);
            }
        });
    }

    console.log('[SIM RUN START]', { persistedRunId, programSnapshotId });
    
    // Registrar metadata de la ejecución
    const runObj = {
        run_id: currentRunId,
        program_snapshot_id: programSnapshotId,
        program_name: runProgramName,
        startedAt: runStartTime,
        source: 'sim',
        status: 'running',
        plannedSteps: plannedSteps.length,
        completedSteps: 0,
        orientationCompared: false
    };
    runs.push(runObj);

    // Guardar inicio del run en IndexedDB (no bloqueante)
    safeIdbCall(() => {
        if (typeof idbSaveRunStart !== 'function') return null;
        return idbSaveRunStart(runObj);
    });
    
    isSimulating = true;
    isPaused = false;
    runBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = '2. Pausar';
    clearBtn.disabled = true;
    currentBlockText.textContent = "Iniciando...";

    const visibleProgramName = (await resolveDisplayProgramName(runObj)) || 'Programa sin nombre';
    const snapshotLabel = programSnapshotId ? shortRunId(programSnapshotId) : '-';
    const runLabel = persistedRunId ? shortRunId(persistedRunId) : shortRunId(currentRunId);
    
    resetIO();
    clearTrajectory(false);  // ✅ No limpiar frames, solo la trayectoria anterior
    // Marcar la posición inicial del simulador con esfera gris semitransparente
    // Esta es solo una referencia visual y no representa necesariamente la posición inicial real del robot
    markSimulatedHome(currentPosition);
    const versionCompatibilityWarning = resolvedSnapshot.createdNewVersion
        ? '\n⚠️ Se ha creado una nueva versión del programa. Las ejecuciones reales anteriores pueden no ser compatibles.'
        : '';
    updateStatus(`▶️ Simulando: ${visibleProgramName}\nVersión del programa: ${snapshotLabel} · Ejecución: ${runLabel} · Pasos: ${plannedSteps.length}${versionCompatibilityWarning}`);
    currentStepIndex = 0;
    
    // ─── RUTA DE EJECUCIÓN ────────────────────────────────────────────────────
    // Si el programa tiene estructuras de control se usa el intérprete del JSON neutral completo.
    // En el resto de casos se ejecuta el plan compilado (plannedSteps) directamente.
    const isInterpretedControlProgram = hasControlStructure(program);
    interpretedStepCounter = 0; // Reiniciar contador de movimientos para esta simulación.
    Object.keys(simVariables).forEach((key) => delete simVariables[key]);
    if (isInterpretedControlProgram) {
        if (localStorage.getItem('fp_debug') === 'true') {
            console.log('[SIM ROUTE] interpreted IO route');
        }
        updateStatus('ℹ️ Programa con estructuras de control: usando intérprete del JSON neutral.');
        await executeBlockListWithIO(program, simVariables);
    } else {
        // ✅ EJECUTAR STEPS PLANIFICADOS (ruta estándar sin while)
        for (const step of plannedSteps) {
            while (isPaused && isSimulating) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!isSimulating) break;
            
            await executeStep(step);
            currentStepIndex += 1;
            
            if (!isSimulating) break;
        }
    }
    
    updateStatus(isSimulating ? "✅ Simulación completada. Orientación: N/A" : "⚠️ Simulación cancelada.", false);
    currentBlockText.textContent = isSimulating ? "FIN" : "CANCELADO";
    
    // Actualizar metadata de la ejecución
    const currentRun = runs.find(r => r.run_id === currentRunId);
    if (currentRun) {
        currentRun.completedAt = Date.now();
        currentRun.status = isSimulating ? 'completed' : 'cancelled';
        currentRun.completedSteps = actualResults.length;
        
        // Validación: en ruta interpretada los movimientos pueden expandirse dinámicamente.
        if (currentRun.status === 'completed') {
            if (isInterpretedControlProgram) {
                console.info(
                    `[SIM INTERPRETER OK] executed motion steps=${currentRun.completedSteps} ` +
                    `high-level plannedSteps=${currentRun.plannedSteps}`
                );
            } else if (currentRun.completedSteps !== currentRun.plannedSteps) {
                console.warn(
                    `⚠️ MISMATCH en run [${currentRunId}]: ` +
                    `${currentRun.completedSteps}/${currentRun.plannedSteps} steps ejecutados. ` +
                    `Se esperaba que status 'completed' tuviera todos los steps ejecutados.`
                );
            }
        }

        // Actualizar el run en IndexedDB (no bloqueante)
        safeIdbCall(() => {
            if (typeof idbUpdateRun !== 'function') return null;
            return idbUpdateRun(currentRun);
        });
    }

    if (isSimulating) {
        try {
            await Promise.all(persistedStepPromises);
        } catch (error) {
            console.error('[SIM STEP PERSIST WAIT ERROR]', error);
        }

        if (persistedRunId && typeof window.getRun === 'function' && typeof window.saveRun === 'function') {
            try {
                const persistedRun = await window.getRun(persistedRunId);
                if (persistedRun) {
                    await window.saveRun({
                        ...persistedRun,
                        ended_at: Date.now(),
                        status: 'completed'
                    });
                }
            } catch (error) {
                console.error('[SIM RUN FINALIZE ERROR]', error);
            }
        }

        try {
            let autoCompareResult = null;
            if (typeof comparePersistedRun === 'function' && persistedRunId) {
                autoCompareResult = await comparePersistedRun(persistedRunId);
            } else if (typeof compareLatestRunBySource === 'function') {
                autoCompareResult = await compareLatestRunBySource('sim');
            }

            if (autoCompareResult) {
                await renderComparisonRunInfo(autoCompareResult);
                await populatePersistedRunSelect();
                updateStatus('✅ Simulación completada. Comparación realizada automáticamente.', false);
            }
        } catch (err) {
            console.warn('[SIM AUTO COMPARE] No se pudo comparar automáticamente:', err);
            updateStatus('✅ Simulación completada. No se pudo actualizar la comparación automática.', false);
        }
    }
    
    console.log(`📊 Ejecutados ${actualResults.length}/${plannedSteps.length} steps`);
    console.log(`📋 Plan snapshot: ${programSnapshotId}`);
    console.log(`🎯 Run ID: ${currentRunId}`);
    console.log('💾 IDB verify: ejecuta SimulatorAPI.idbDebugVerifyLastRun()');
    
    // Renderizar tabla de comparación (si existe en DOM) como fallback
    if (!isSimulating) {
        renderComparisonTable(SimulatorAPI.compareSteps());
    }
    
    isSimulating = false;
    isPaused = false;
    runBtn.disabled = false;
    pauseBtn.disabled = true;
    clearBtn.disabled = false;
}

// Tolerancias y semáforo para la tabla de comparación (solo posición)
const POSITION_TOLERANCES = { OK: 1, WARNING: 5 };
const POSITION_TOLERANCE_MARGIN = 1;

function getStepStatus(item) {
    if (!item) return 'No verificado';
    if (!item.expects_telemetry) return 'No verificado';
    if (!item.actual) return 'Pendiente';
    const posErr = item.error && item.error.position;
    if (posErr === null || posErr === undefined) return 'Pendiente';
    const allowed = item.allowed_mm;

    if (allowed != null && allowed > POSITION_TOLERANCES.OK) {
        return posErr <= allowed ? 'OK' : 'NOK';
    }

    if (posErr <= POSITION_TOLERANCES.OK) return 'OK';
    return 'NOK';
}

function getStepRoleLabel(plannedStep, result) {
    const raw =
        result?.meta?.step_role ||
        result?.meta?.role ||
        result?.step_role ||
        result?.role ||
        plannedStep?.step_role ||
        plannedStep?.role ||
        plannedStep?.phase ||
        plannedStep?.type ||
        plannedStep?.meta?.step_role ||
        plannedStep?.meta?.role ||
        '';

    const value = String(raw).toLowerCase();

    if (value.includes('pick')) return 'Pick';
    if (value.includes('place')) return 'Place';
    if (value.includes('approach')) return 'Aproximación';
    if (value.includes('retreat') || value.includes('retract')) return 'Retirada';
    if (value.includes('cycle_start')) return 'Inicio ciclo';
    if (value.includes('cycle_end')) return 'Fin ciclo';

    return '-';
}

function isPlannedStepVerifiable(planned, verifyStepIdsSet) {
    if (!planned || typeof planned !== 'object') return false;

    if (planned.verify === true || planned.isVerificationTarget === true) return true;
    if (planned.meta?.verify === true || planned.meta?.isVerificationTarget === true) return true;

    const role = String(planned.role || planned.meta?.role || planned.phase || planned.meta?.phase || '').toLowerCase();
    const stepRole = String(planned.step_role || planned.meta?.step_role || '').toLowerCase();
    if (role === 'target_pick' || role === 'target_place') return true;
    if (stepRole === 'pick' || stepRole === 'place') return true;

    const stepId = planned.step_id;
    if (verifyStepIdsSet && verifyStepIdsSet.size > 0 && stepId != null && verifyStepIdsSet.has(Number(stepId))) {
        return true;
    }

    const zone = String(planned.meta?.zone || planned.zone || '').toLowerCase();
    if (zone === 'fine' && (role === 'target_pick' || role === 'target_place')) {
        return true;
    }

    return false;
}

function isMotionPlannedStep(planned) {
    if (!planned || typeof planned !== 'object') return false;
    const type = String(planned.type || planned.meta?.motion || '').trim();
    return type === 'MoveJ' || type === 'MoveL' || type === 'MoveC';
}

function updateGlobalComparisonStatus(type, message) {
    const el = document.getElementById('comparison-global-status');
    if (!el) return;

    el.classList.remove(
        'status-neutral',
        'status-global-ok',
        'status-global-warning',
        'status-global-error'
    );

    switch (type) {
        case 'ok':
            el.classList.add('status-global-ok');
            break;

        case 'warning':
            el.classList.add('status-global-warning');
            break;

        case 'error':
            el.classList.add('status-global-error');
            break;

        default:
            el.classList.add('status-neutral');
    }

    el.textContent = message;
}

// Renderiza la tabla de comparación plan vs real (visual)
function renderComparisonTable(comparison) {
    if (!comparisonTbody) return;
    comparisonTbody.innerHTML = '';
    const comparisonTable = comparisonTbody.closest('table');
    const orientationHeader = comparisonTable?.querySelector('thead th:last-child');
    if (orientationHeader && orientationHeader.textContent?.trim() === 'Orientación') {
        orientationHeader.style.display = 'none';
    }

    const zoneHeader = comparisonTable?.querySelector('thead th:nth-child(4)');
    if (zoneHeader) {
        zoneHeader.textContent = 'Zona ⓘ';
        zoneHeader.title = 'Zona planificada interna de la interfaz. En URScript no existen z10/z5/fine como en ABB RAPID. Aquí se usan como etiqueta educativa: fine = punto exacto; z10/z5 = aproximación o retirada planificada.';
    }

    const stepHeader = comparisonTable?.querySelector('thead th:nth-child(1)');
    if (stepHeader && (stepHeader.textContent?.trim() === 'Paso' || stepHeader.textContent?.trim() === 'Paso ⓘ')) {
        stepHeader.textContent = 'Paso ⓘ';
        stepHeader.title = 'ID del paso planificado usado para comparar con la telemetría real. No es necesariamente el número de fila. Debe coincidir con el step_id enviado por el robot.';
    }

    const comparisonDetailsContainer = comparisonTable?.parentElement;
    if (comparisonDetailsContainer) {
        let zoneNote = comparisonDetailsContainer.querySelector('#comparison-zone-note');
        if (!zoneNote) {
            zoneNote = document.createElement('div');
            zoneNote.id = 'comparison-zone-note';
            zoneNote.style.cssText = 'margin-top:4px;font-size:11px;opacity:0.75;line-height:1.3;';
            comparisonDetailsContainer.appendChild(zoneNote);
        }
        zoneNote.textContent = 'Nota: z10/z5/fine son etiquetas educativas del plan, no comandos URScript.';
    }

    if (!Array.isArray(comparison) || comparison.length === 0) {
        updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');
        return;
    }

    let hasPendingVerifiable = false;
    let hasNok = false;
    
    comparison.forEach(item => {
        const tr = document.createElement('tr');
        
        // Columna: Paso (UI 1-based)
        const stepCell = document.createElement('td');
        stepCell.textContent = item.step_id;

        // Columna: Tipo/Rol
        const roleCell = document.createElement('td');
        roleCell.textContent = getStepRoleLabel(item, item);
        
        // Columna: Estado (semáforo con tolerancias)
        const status = getStepStatus(item);
        if (status === 'NOK') {
            hasNok = true;
        } else if (status === 'Pendiente') {
            hasPendingVerifiable = true;
        }
        const statusCell = document.createElement('td');
        statusCell.textContent = status;
        const statusClass = `status-${String(status).toLowerCase().replace(/\s+/g, '-')}`;
        statusCell.className = statusClass;
        if (status === 'No verificado') {
            statusCell.style.backgroundColor = 'rgba(108, 117, 125, 0.08)';
            statusCell.style.color = '#6c757d';
            statusCell.style.fontStyle = 'normal';
            statusCell.title = 'Este movimiento forma parte del plan, pero no tiene captura real instrumentada.';
        }
        
        // Columna: Zona
        const zoneCell = document.createElement('td');
        zoneCell.textContent = item.zone || '-';

        // Columna: Error de Posición (mm)
        const posCell = document.createElement('td');
        if (item.error && item.error.position != null) {
            posCell.textContent = item.error.position.toFixed(2);
            if (status !== 'Pendiente' && status !== 'No verificado' && item.allowed_mm != null) {
                posCell.title = `Error: ${item.error.position.toFixed(2)}mm (tolerancia: ${item.allowed_mm}mm, ${item.zone || 'N/A'})`;
            }
        } else {
            posCell.textContent = '-';
        }
        
        tr.appendChild(stepCell);
        tr.appendChild(roleCell);
        tr.appendChild(statusCell);
        tr.appendChild(zoneCell);
        tr.appendChild(posCell);
        comparisonTbody.appendChild(tr);
    });

    if (hasNok) {
        updateGlobalComparisonStatus('error', '🔴 Diferencias importantes detectadas');
    } else if (hasPendingVerifiable) {
        updateGlobalComparisonStatus('warning', '🟡 Revisar diferencias detectadas');
    } else {
        updateGlobalComparisonStatus('ok', '🟢 Comparación correcta en puntos verificados');
    }
}

// SECCIÓN 511: Ejecución de un Bloque Individual del Programa
// Interpreta y simula un único bloque (movimiento, espera, IO, etc.).
async function executeBlock(block) {
    // Construir información del bloque para mostrar
    let blockInfo = `Tipo: ${block.type}`;
    
    // Añadir información específica según el tipo
    if (block.type === 'move_block' || block.type === 'move_linear_block') {
        blockInfo += ` → (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})`;
    } else if (block.type === 'move_circular_block') {
        blockInfo += ` → Vía(${block.via_x ?? 0},${block.via_y ?? 0},${block.via_z ?? 0}) Fin(${block.end_x ?? 0},${block.end_y ?? 0},${block.end_z ?? 0})`;
    } else if (block.type === 'wait_block') {
        blockInfo += ` (${block.time ?? 1}s)`;
    } else if (block.type === 'set_do') {
        blockInfo += ` (Pin:${block.pin} Estado:${block.state == 1 ? 'ON' : 'OFF'})`;
    }
    // ✅ NUEVO: Mostrar info de poses/puntos
    else if (block.type === 'use_pose' && block.poseName) {
        blockInfo += ` → Pose: ${block.poseName} (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})`;
    } else if (block.type === 'use_point' && block.pointName) {
        blockInfo += ` → Punto: ${block.pointName} (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})`;
    } else if (block.type === 'define_pose' && block.name) {
        blockInfo += ` → Definir: ${block.name}`;
    } else if (block.type === 'define_point' && block.name) {
        blockInfo += ` → Definir: ${block.name}`;
    } else if (block.type === 'palletize_block') {
        const rows = block.rows ?? 3;
        const cols = block.cols ?? 4;
        const layers = block.layers ?? 2;
        blockInfo += ` → Paletizado ${rows}×${cols}×${layers} (${rows*cols*layers} posiciones)`;
    }
    
    // ✅ FRAMES: Añadir indicador de frame activo en el blockInfo
    if (activeFrame) {
        blockInfo += ` [Frame: ${activeFrame}]`;
    }
    
    currentBlockText.textContent = blockInfo;
    
    const previousPosition = currentPosition.clone(); 

    // Procesar el bloque
    switch (block.type) {
        
    case 'use_pose':
    case 'use_point':
    case 'move_block':
    case 'move_linear_block':
            { 
                if (block.x === undefined || block.y === undefined || block.z === undefined) {
                    updateStatus(`⚠️ Bloque ${block.type} sin coordenadas (pose/punto no definido).`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                }
                
                const isLinearMove = block.type === 'move_linear_block' || 
                                   block.type === 'use_pose' || 
                                   block.type === 'use_point';
                
                updateStatus(`Moviendo TCP a (X:${block.x ?? 0}, Y:${block.y ?? 0}, Z:${block.z ?? 0})...`);
                
                const startPoint = previousPosition.clone();
                
                // Posición y rotación locales (relativas al frame activo)
                const localPos = new THREE.Vector3(
                    (block.x ?? 0),
                    (block.y ?? 0),
                    (block.z ?? 0)
                );
                const localPosMapped = robotToThreePosition(localPos);
                const blockOrientationUnit = normalizeRotationUnit(block.orientation_unit || block.rotation_unit || 'degrees');
                const localRot = urRotationVectorToThreeEuler(
                    (block.rx ?? 0),
                    (block.ry ?? 180),
                    (block.rz ?? 0),
                    blockOrientationUnit
                );
                
                // ✅ FRAMES: Aplicar transformación del frame activo
                const transformed = applyFrameTransform(localPosMapped, localRot);
                const targetPos = transformed.position;
                const targetLogicalRot = transformed.rotation;

                const defaultLineMaterial = isLinearMove ? moveLMaterial : moveJMaterial;
                const lineMaterial = consumeInitialReferenceSegmentMaterial(defaultLineMaterial);

                const numSegments = 15;
                const totalDuration = 1000;
                const segmentDuration = totalDuration / numSegments;
                
                let curve;
                if (isLinearMove) {
                    curve = new THREE.LineCurve3(startPoint, targetPos);
                } else {
                    const midPoint = new THREE.Vector3().lerpVectors(startPoint, targetPos, 0.5);
                    midPoint.y += startPoint.distanceTo(targetPos) * 0.25; 
                    curve = new THREE.QuadraticBezierCurve3(startPoint, midPoint, targetPos);
                }
                
                const pointsOnCurve = curve.getPoints(numSegments);
                
                let segmentStartPoint = startPoint;
                
                for (let i = 1; i < pointsOnCurve.length; i++) {
                    if (!isSimulating) break;
                    
                    const segmentEndPoint = pointsOnCurve[i];
                    // ✅ ACTUALIZADO: Pasar también la rotación
                    await animateTCPMove(segmentEndPoint, targetLogicalRot, segmentDuration, targetLogicalRot);
                    drawTrajectoryLine(segmentStartPoint, currentPosition, lineMaterial);
                    segmentStartPoint.copy(currentPosition);
                }

                if (isSimulating) {
                    tcpObject.position.copy(targetPos);
                    tcpObject.rotation.copy(targetLogicalRot);
                    currentPosition.copy(targetPos);
                    currentRotation.copy(targetLogicalRot);
                    const pointName = block.sourceName || block.pointName || block.poseName;
                    markPoint(currentPosition, pointName);
                }
            }
            break;
        
       // ✅ NUEVO: Ignorar bloques de definición (no generan movimiento)
       case 'define_pose':
       case 'define_point':
           updateStatus(`📍 Definición: ${block.name || 'sin nombre'}`);
           await new Promise(resolve => setTimeout(resolve, 200)); // Pausa breve
           break;
       
       // ✅ FRAMES: Definir un nuevo frame
       case 'define_frame':
           {
               const frameName = block.name || 'frame_sin_nombre';
               const origin = new THREE.Vector3(
                   (block.x ?? 0),
                   (block.y ?? 0),
                   (block.z ?? 0)
               );
               const originMapped = robotToThreePosition(origin);
               // rotation: used by applyFrameTransform math. Must match visualRotation convention.
               const rotation = new THREE.Euler(
                   (block.rx ?? 0) * Math.PI / 180,
                   (block.ry ?? 0) * Math.PI / 180,
                   (block.rz ?? 0) * Math.PI / 180
               );
               // visualRotation: used only for 3D display. No -90 Ry bias so neutral frame aligns with WORLD.
               const visualRotation = new THREE.Euler(
                   (block.rx ?? 0) * Math.PI / 180,
                   (block.ry ?? 0) * Math.PI / 180,
                   (block.rz ?? 0) * Math.PI / 180
               );

               // Crear visualización del frame
               const frameVisual = createFrameVisualization(frameName, originMapped, visualRotation);
               scene.add(frameVisual);
               
               // Guardar frame
               definedFrames[frameName] = {
                   origin: originMapped,
                   rotation: rotation,
                    rotationInputDeg: {
                        rx: block.rx ?? 0,
                        ry: block.ry ?? 0,
                        rz: block.rz ?? 0
                    },
                   visualObject: frameVisual
               };
               
               updateStatus(`🔷 Frame definido: ${frameName} en (${block.x ?? 0}, ${block.y ?? 0}, ${block.z ?? 0})`);
               await new Promise(resolve => setTimeout(resolve, 300));
           }
           break;
       
       // ✅ FRAMES: Activar/usar un frame
       case 'use_frame':
           {
               const frameName = block.frameName || 'WORLD';
               
               if (frameName === 'WORLD') {
                   activeFrame = null;
                   updateStatus(`🌍 Frame activo: WORLD (coordenadas absolutas)`);
               } else if (definedFrames[frameName]) {
                   activeFrame = frameName;
                   updateStatus(`🔷 Frame activo: ${frameName}`);
               } else {
                   updateStatus(`⚠️ Frame '${frameName}' no definido, usando WORLD`);
                   activeFrame = null;
               }
               
               await new Promise(resolve => setTimeout(resolve, 300));
           }
           break;
        
       // SECCIÓN 513: Simulación de Espera (Wait)
       case 'wait_block':
            const time = block.time || 1;
            updateStatus(`Esperando ${time} segundo(s)...`);
            await new Promise(resolve => setTimeout(resolve, time * 1000));
            break;

       // SECCIÓN 514: Simulación de Bloques de Entrada/Salida (IO)
       // Simula una operación de E/S con una breve espera para visualización.
       case 'set_do_block':
           {
               const pin = block.pin ?? 1;
               const value = block.value ?? true;
               setDO(pin, value);
               updateStatus(`✅ SET DO[${pin}] = ${value ? 'ON' : 'OFF'}`);
               await new Promise(resolve => setTimeout(resolve, 300));
           }
           break;
       
       case 'wait_di_block':
           {
               const pin = block.pin ?? 1;
               const expectedValue = block.value ?? true;
               updateStatus(`⏳ Esperando DI[${pin}] = ${expectedValue ? 'ON' : 'OFF'}...`);
               
               // Esperar hasta que la entrada tenga el valor esperado
               while (isSimulating && getDI(pin) !== expectedValue) {
                   await new Promise(resolve => setTimeout(resolve, 100));
               }
               
               if (isSimulating) {
                   updateStatus(`✅ DI[${pin}] alcanzó ${expectedValue ? 'ON' : 'OFF'}`);
               }
           }
           break;
       
       case 'set_ao_block':
           {
               const pin = block.pin ?? 1;
               const value = block.value ?? 0;
               setAO(pin, value);
               updateStatus(`✅ SET AO[${pin}] = ${value.toFixed(1)}V`);
               await new Promise(resolve => setTimeout(resolve, 300));
           }
           break;
       
       case 'wait_ai_block':
           {
               const pin = block.pin ?? 1;
               const threshold = block.threshold ?? 5;
               const condition = block.condition ?? 'greater'; // 'greater', 'less', 'equal'
               updateStatus(`⏳ Esperando AI[${pin}] ${condition === 'greater' ? '>' : condition === 'less' ? '<' : '='} ${threshold}V...`);
               
               // Esperar hasta que la entrada analógica cumpla la condición
               while (isSimulating) {
                   const currentValue = getAI(pin);
                   let conditionMet = false;
                   
                   if (condition === 'greater') conditionMet = currentValue > threshold;
                   else if (condition === 'less') conditionMet = currentValue < threshold;
                   else conditionMet = Math.abs(currentValue - threshold) < 0.1;
                   
                   if (conditionMet) break;
                   await new Promise(resolve => setTimeout(resolve, 100));
               }
               
               if (isSimulating) {
                   updateStatus(`✅ AI[${pin}] cumplió condición: ${getAI(pin).toFixed(1)}V`);
               }
           }
           break;
       
       // SECCIÓN 515bis: Simulación de Paletizado Completo (Pick & Place) - Método 3 Puntos
       case 'palletize_block':
           {
               const pickPos = block.pick_pose || block.pick_pos || { x: 500, y: 0, z: 100 };
               const homePos = block.home_pos || null;
               
               // ✅ MÉTODO DE 3 PUNTOS (Industrial)
               const p1 = block.pallet_p1_pose || block.pallet_p1 || { x: 0, y: 300, z: 0 };
               const p2 = block.pallet_p2 || { x: 400, y: 300, z: 0 };
               const p3 = block.pallet_p3 || { x: 0, y: 600, z: 0 };
               
               const pickApproach = block.pick_approach_height ?? 50;
               const placeApproach = block.place_approach_height ?? 50;
               const gripperPin = block.gripper_pin ?? 1;
               const pickWait = block.pick_wait_time ?? 0.5;
               const placeWait = block.place_wait_time ?? 0.3;
               
               const rows = block.rows ?? 3;
               const cols = block.cols ?? 4;
               const layers = block.layers ?? 2;
               const layerHeight = block.layer_height ?? 60;
               
               // ✅ Calcular vectores de dirección del palet (P1→P2 es columnas, P1→P3 es filas)
               const colVector = new THREE.Vector3(
                   (p2.x - p1.x) / cols,
                   (p2.y - p1.y) / cols,
                   (p2.z - p1.z) / cols
               );
               const rowVector = new THREE.Vector3(
                   (p3.x - p1.x) / rows,
                   (p3.y - p1.y) / rows,
                   (p3.z - p1.z) / rows
               );
               
               updateStatus(`🔄 Paletizado Completo (3 puntos): ${rows}×${cols}×${layers} = ${rows*cols*layers} ciclos Pick & Place`);
               await new Promise(resolve => setTimeout(resolve, 500));
               
               let cycleNum = 1;
               for (let layer = 0; layer < layers; layer++) {
                   for (let row = 0; row < rows; row++) {
                       for (let col = 0; col < cols; col++) {
                           if (!isSimulating) break;
                           
                           updateStatus(`🔄 Ciclo ${cycleNum}/${rows*cols*layers} [Capa ${layer+1}, Fila ${row+1}, Col ${col+1}]`);
                           
                           // 1. Ir a HOME (si está definido)
                           if (homePos) {
                               // ✅ FRAMES: Aplicar transformación del frame activo
                               const homeLocalPos = new THREE.Vector3(
                                   (homePos.x ?? 0),
                                   (homePos.y ?? 0),
                                   (homePos.z ?? 0)
                               );
                               const homeTransformed = applyFrameTransform(robotToThreePosition(homeLocalPos), new THREE.Euler(0, 0, 0));
                               const homeTarget = homeTransformed.position;
                               updateStatus(`🏠 HOME`);
                               await moveToPosition(homeTarget, moveJMaterial, 8, true);
                           }
                           
                           // 2. PICK - Aproximación
                           // ✅ FRAMES: Aplicar transformación del frame activo
                           const pickApproachLocalPos = new THREE.Vector3(
                               (pickPos.x ?? 0),
                               (pickPos.y ?? 0),
                               ((pickPos.z ?? 0) + pickApproach)
                           );
                           const pickApproachTransformed = applyFrameTransform(robotToThreePosition(pickApproachLocalPos), new THREE.Euler(0, 0, 0));
                           const pickApproachPos = pickApproachTransformed.position;
                           updateStatus(`⬇️ PICK Aproximación (${pickPos.x}, ${pickPos.y}, ${(pickPos.z ?? 0) + pickApproach})`);
                           await moveToPosition(pickApproachPos, moveLMaterial, 10, true);
                           
                           // 3. PICK - Descenso
                           // ✅ FRAMES: Aplicar transformación del frame activo
                           const pickLocalPos = new THREE.Vector3(
                               (pickPos.x ?? 0),
                               (pickPos.y ?? 0),
                               (pickPos.z ?? 0)
                           );
                           const pickTransformed = applyFrameTransform(robotToThreePosition(pickLocalPos), new THREE.Euler(0, 0, 0));
                           const pickTarget = pickTransformed.position;
                           updateStatus(`⬇️ PICK Descenso (${pickPos.x}, ${pickPos.y}, ${pickPos.z})`);
                           await moveToPosition(pickTarget, moveLMaterial, 12);
                           
                           // 4. PICK - Cerrar pinza
                           setDO(gripperPin, true);
                           updateStatus(`✋ Cerrar pinza (acción de herramienta)`);
                           await new Promise(resolve => setTimeout(resolve, pickWait * 1000));
                           
                           // 5. PICK - Levantar
                           updateStatus(`⬆️ PICK Levantar`);
                           await moveToPosition(pickApproachPos, moveLMaterial, 10, true);
                           
                           // 6. PLACE - Calcular posición usando los 3 puntos (método industrial)
                           // Posición = P1 + col × vectorColumna + row × vectorFila + layer × altura
                           const placeX = p1.x + col * colVector.x + row * rowVector.x;
                           const placeY = p1.y + col * colVector.y + row * rowVector.y;
                           const placeZ = p1.z + col * colVector.z + row * rowVector.z + layer * layerHeight;
                           
                           // 7. PLACE - Aproximación
                           // ✅ FRAMES: Aplicar transformación del frame activo
                           const placeApproachLocalPos = new THREE.Vector3(
                               placeX,
                               placeY,
                               (placeZ + placeApproach)
                           );
                           const placeApproachTransformed = applyFrameTransform(robotToThreePosition(placeApproachLocalPos), new THREE.Euler(0, 0, 0));
                           const placeApproachPos = placeApproachTransformed.position;
                           updateStatus(`➡️ PLACE Aproximación [${col+1},${row+1}] (${placeX.toFixed(0)}, ${placeY.toFixed(0)}, ${(placeZ + placeApproach).toFixed(0)})`);
                           await moveToPosition(placeApproachPos, moveJMaterial, 10, true);
                           
                           // 8. PLACE - Descenso
                           // ✅ FRAMES: Aplicar transformación del frame activo
                           const placeLocalPos = new THREE.Vector3(
                               placeX,
                               placeY,
                               placeZ
                           );
                           const placeTransformed = applyFrameTransform(robotToThreePosition(placeLocalPos), new THREE.Euler(0, 0, 0));
                           const placeTarget = placeTransformed.position;
                           updateStatus(`⬇️ PLACE Descenso (${placeX.toFixed(0)}, ${placeY.toFixed(0)}, ${placeZ.toFixed(0)})`);
                           await moveToPosition(placeTarget, moveLMaterial, 12);
                           
                           // 9. PLACE - Abrir pinza
                           setDO(gripperPin, false);
                           updateStatus(`🖐️ Abrir pinza (acción de herramienta)`);
                           await new Promise(resolve => setTimeout(resolve, placeWait * 1000));
                           
                           // 10. PLACE - Levantar
                           updateStatus(`⬆️ PLACE Levantar`);
                           await moveToPosition(placeApproachPos, moveLMaterial, 10, true);
                           
                           updateStatus(`✅ Ciclo ${cycleNum} completado`);
                           cycleNum++;
                       }
                       if (!isSimulating) break;
                   }
                   if (!isSimulating) break;
               }
               
               updateStatus(`🎉 Paletizado Completo Finalizado: ${cycleNum-1} ciclos`);
           }
           break;

       // SECCIÓN 515: Simulación de Movimiento Circular (MoveC)
       // Calcula una curva cuadrática usando un punto intermedio y la recorre en segmentos.
       case 'move_circular_block':
           updateStatus(`Mover Circular...`);
             
             const startPointC = previousPosition.clone();
             
             // Posiciones locales (relativas al frame)
             const viaLocal = new THREE.Vector3(
                 (block.via_x ?? 0), (block.via_y ?? 0), (block.via_z ?? 0)
             );
             const endLocal = new THREE.Vector3(
                 (block.end_x ?? 0), (block.end_y ?? 0), (block.end_z ?? 0)
             );
             const moveCircularOrientationUnit = normalizeRotationUnit(block.end_orientation_unit || block.orientation_unit || block.rotation_unit || 'degrees');
             const endRotLocal = urRotationVectorToThreeEuler(
                 (block.end_rx ?? 0),
                 (block.end_ry ?? 180),
                 (block.end_rz ?? 0),
                 moveCircularOrientationUnit
             );
             
             // ✅ FRAMES: Aplicar transformación del frame activo
             const viaTransformed = applyFrameTransform(robotToThreePosition(viaLocal), new THREE.Euler(0, 0, 0));
             const endTransformed = applyFrameTransform(robotToThreePosition(endLocal), endRotLocal);
             const viaPos = viaTransformed.position;
             const endPosC = endTransformed.position;
             const endLogicalRotC = endTransformed.rotation;

             if (isNaN(viaPos.x) || isNaN(viaPos.y) || isNaN(viaPos.z) ||
                 isNaN(endPosC.x) || isNaN(endPosC.y) || isNaN(endPosC.z)) {
                 statusText.textContent = "Error en datos de MoveC.";
                 isSimulating = false;
                 break;
             }

             const numSegmentsC = 30;
             const curveC = new THREE.QuadraticBezierCurve3(startPointC, viaPos, endPosC);
             const pointsOnCurveC = curveC.getPoints(numSegmentsC); 
             const totalArcLength = curveC.getLength();
             const speedMs = block.speed ? (block.speed / 1000) : 0.1;
             const moveDuration = (speedMs > 0 && totalArcLength > 0) ? (totalArcLength / speedMs) * 1000 : 2000;
             const segmentDurationC = moveDuration / numSegmentsC;
             const lineMaterialC = consumeInitialReferenceSegmentMaterial(moveCMaterial);

             updateStatus(`Moviendo en arco (${numSegmentsC} segmentos)...`);
             
             let segmentStartPointC = startPointC;
             
             for (let i = 1; i < pointsOnCurveC.length; i++) {
                 if (!isSimulating) break;
                 const segmentEndPointC = pointsOnCurveC[i];
                 // ✅ ACTUALIZADO: Pasar rotación
                 await animateTCPMove(segmentEndPointC, endLogicalRotC, segmentDurationC, endLogicalRotC);
                 drawTrajectoryLine(segmentStartPointC, currentPosition, lineMaterialC); 
                 segmentStartPointC.copy(currentPosition); 
             }
             
             if (isSimulating) {
                 tcpObject.position.copy(endPosC);
                 tcpObject.rotation.copy(endLogicalRotC);
                 currentPosition.copy(endPosC);
                 currentRotation.copy(endLogicalRotC);
                   // Si el step es de aproximación (paletizado), marcar en gris; si no, en negro
               const isPalletStep = !!step.meta?.pallet;
               const isPalletTarget = step.meta?.phase === 'target_pick' || step.meta?.phase === 'target_place';
               const isApproachStep = isPalletStep
                  ? !isPalletTarget
                  : ['approach', 'approach_global', 'approach_local'].includes(step.meta?.phase);
               markPoint(currentPosition, null, isApproachStep);
             }
             break;
        
       // SECCIÓN 516: Manejo de Bloques no Reconocidos
       // Gestiona los tipos de bloque que no tienen una simulación visual implementada.
       default:
           updateStatus(`Bloque '${block.type}' no simulado.`);
           await new Promise(resolve => setTimeout(resolve, 100));
           break;
    }
}

// SECCIÓN 517: Inicialización y Manejo de Eventos Globales
// Asigna los listeners a los botones y maneja el redimensionamiento de la ventana.

runBtn.addEventListener('click', runProgramSimulation);
pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? '▶️ Reanudar' : '2. Pausar';
    updateStatus(isPaused ? '⏸️ Pausado' : '▶️ Reanudando...');
});
clearBtn.addEventListener('click', clearTrajectory);

function formatShortDateTime(ts) {
    if (!Number.isFinite(ts)) return '-';
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return '-';
    const pad2 = (value) => String(value).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad2(date.getMonth() + 1);
    const d = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mm = pad2(date.getMinutes());
    return `${y}-${m}-${d} ${hh}:${mm}`;
}

function shortRunId(runId) {
    if (!runId) return '-';
    const raw = String(runId);
    return raw.length > 12 ? raw.slice(-12) : raw;
}

function isTechnicalProgramName(programName) {
    const value = String(programName || '').trim();
    if (!value) return true;
    return /\.(urp|script|mod|ls|xml)$/i.test(value);
}

/**
 * Resuelve el nombre de programa visible para un run.
 * 1) Usa run.program_name si existe y no es técnico.
 * 2) Si no, consulta el snapshot asociado (snapshot_id / program_snapshot_id).
 * 3) Si tampoco, devuelve cadena vacía.
 * Centraliza la lógica usada en renderComparisonRunInfo y populatePersistedRunSelect.
 */
async function resolveDisplayProgramName(run) {
    let name = (run?.program_name || run?.meta?.program_name || '').trim();
    if (!isTechnicalProgramName(name)) return name;

    const snapshotId = run?.snapshot_id || run?.program_snapshot_id;
    if (snapshotId && typeof window.getSnapshot === 'function') {
        try {
            const snapshot = await window.getSnapshot(snapshotId);
            const snapName = String(snapshot?.program_name || '').trim();
            if (snapName) {
                if (typeof isComparisonDebugEnabled === 'function' && isComparisonDebugEnabled()) {
                    console.debug('[resolveDisplayProgramName] Nombre del snapshot:', snapName, '(run:', run?.run_id, ')');
                }
                return snapName;
            }
        } catch (err) {
            if (typeof isComparisonDebugEnabled === 'function' && isComparisonDebugEnabled()) {
                console.debug('[resolveDisplayProgramName] Error cargando snapshot:', snapshotId, err);
            }
        }
    }
    return '';
}

async function renderComparisonRunInfo(result) {
    if (!comparisonRunInfo) return;
    if (!result || !result.run) {
        comparisonRunInfo.textContent = 'Ninguna ejecución comparada';
        updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');
        return;
    }

    const run = result.run;
    const snapshotId = run.snapshot_id || run.program_snapshot_id || '-';
    const comparableCount = getComparableResultStepIds(run.resultsByStep).length;
    const cycleMarkersCount = Object.keys(run.resultsByStep || {}).filter(isCycleMarkerStepId).length;
    const currentSnapshotId = window.SimulatorAPI?.getProgramSnapshotId?.() || programSnapshotId || null;
    const sourceLabel = run.source === 'mqtt' ? 'robot real' : 'simulación';
    const executionLabel = 'guardada';
    const versionLabel = snapshotId !== '-' && currentSnapshotId && snapshotId === currentSnapshotId ? 'actual' : 'anterior';

    // ✅ Resolución centralizada: usa run.program_name si es legible, sino consulta snapshot
    const programName = (await resolveDisplayProgramName(run)) || 'Programa sin nombre';

    // snapshot_short: identificador corto usado por telemetría MQTT/URScript
    const snapshotShort =
        run?.snapshot_short ||
        run?.meta?.snapshot_short ||
        (snapshotId && snapshotId !== '-' && typeof window.computeSnapshotShortId === 'function'
            ? window.computeSnapshotShortId(snapshotId)
            : null) ||
        null;
    const snapshotShortPart = (snapshotShort && Number(snapshotShort) > 0)
        ? ` | ID corto telemetría: ${snapshotShort}`
        : '';

    const runIdLabel = run.run_id || '-';
    const cycleMarkersPart = cycleMarkersCount > 0 ? ` | Marcadores ciclo: ${cycleMarkersCount}` : '';
    comparisonRunInfo.textContent = `Programa: ${programName} | Run: ${runIdLabel} | Snapshot: ${snapshotId}${snapshotShortPart} | Origen: ${sourceLabel} | Ejecución: ${executionLabel} | Versión del programa: ${versionLabel} | Puntos comparables: ${comparableCount}${cycleMarkersPart}`;
}

async function populatePersistedRunSelect() {
    if (!persistedRunSelect) return;

    persistedRunSelect.innerHTML = '';
    const activeSnapshotMeta = syncCurrentSnapshotState(
        currentProgramSnapshotId || getStoredSnapshotMeta().snapshotId,
        currentSnapshotShort || getStoredSnapshotMeta().snapshotShort,
        { persist: false }
    );
    const currentSnapshotId = activeSnapshotMeta.snapshotId;
    const activeSnapshotShort = Number(activeSnapshotMeta.snapshotShort || 0);
    const debugMode = isComparisonDebugEnabled();
    if (debugMode) {
        console.debug(`[RUN SELECT] activeSnapshotId=${currentSnapshotId} activeSnapshotShort=${activeSnapshotShort}`);
    }

    if (typeof window.listRuns !== 'function') {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Listado de ejecuciones no disponible';
        persistedRunSelect.appendChild(option);
        return;
    }

    try {
        const runs = await window.listRuns();
        const sortedRuns = (Array.isArray(runs) ? runs : [])
            .filter(run => run && run.run_id)
            .filter(run => run.run_id === 'run_mqtt_live' || String(run.run_id).startsWith('run_sim_') || String(run.run_id).startsWith('run_mqtt_'))
            .sort((a, b) => (b?.started_at ?? b?.startedAt ?? 0) - (a?.started_at ?? a?.startedAt ?? 0));

        const compatibleRealRuns = sortedRuns.filter((run) => {
            const runSnapshotId = run?.snapshot_id || run?.program_snapshot_id || null;
            const runIdStr = String(run?.run_id || '');
            const source = String(run?.source || '');
            const isMqttRun = source === 'mqtt' || runIdStr.startsWith('run_mqtt_');
            const isCompleted = String(run?.status || '').toLowerCase() === 'completed';
            const hasResults = Object.keys(run?.resultsByStep || {}).length > 0;
            return Boolean(isMqttRun && isCompleted && hasResults && currentSnapshotId && runSnapshotId === currentSnapshotId);
        });

        console.debug(
            `[REAL RUN SELECTOR] currentProgramSnapshotId=${currentSnapshotId || 'null'} compatible runs=${compatibleRealRuns.map(r => r.run_id).join(',') || '-'}`
        );

        console.debug('[REAL RUN SELECTOR UI BEFORE]', {
            compatibleRunsLength: compatibleRealRuns.length,
            selectOptionsLength: persistedRunSelect.options.length,
            selectInnerHTML: persistedRunSelect.innerHTML
        });

        persistedRunSelect.innerHTML = '';

        if (compatibleRealRuns.length > 0) {
            for (const run of compatibleRealRuns) {
                const option = document.createElement('option');
                option.value = run.run_id;
                const programName = (await resolveDisplayProgramName(run)) || run.program_name || 'Programa sin nombre';
                const resultsCount = Object.keys(run.resultsByStep || {}).length;
                const startedTs = run.started_at ?? run.startedAt ?? NaN;
                const fecha = formatShortDateTime(Number(startedTs));
                option.textContent = `${programName} | MQTT real | ${resultsCount} puntos | ${fecha}`;
                persistedRunSelect.appendChild(option);
            }

            persistedRunSelect.disabled = false;
            persistedRunSelect.value = compatibleRealRuns[0].run_id;
            if (btnCompareSelectedRun) {
                btnCompareSelectedRun.disabled = false;
            }
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No hay ejecuciones reales completas para comparar.';
            persistedRunSelect.appendChild(option);
            persistedRunSelect.disabled = true;
            if (btnCompareSelectedRun) {
                btnCompareSelectedRun.disabled = true;
            }
        }

        console.debug('[REAL RUN SELECTOR UI AFTER]', {
            compatibleRunsLength: compatibleRealRuns.length,
            selectOptionsLength: persistedRunSelect.options.length,
            selectValue: persistedRunSelect.value,
            selectInnerHTML: persistedRunSelect.innerHTML
        });
    } catch (error) {
        console.error('Error al listar runs persistidos', error);
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Error cargando ejecuciones';
        persistedRunSelect.appendChild(option);
    }
}

if (btnCompareMqttRun) {
    btnCompareMqttRun.addEventListener('click', async () => {
        try {
            if (typeof window.listRuns !== 'function') {
                renderComparisonRunInfo(null);
                if (comparisonRunInfo) comparisonRunInfo.textContent = 'Listado de ejecuciones no disponible.';
                return;
            }

            const runs = await window.listRuns();
            const currentSnapshotId = currentProgramSnapshotId || window.SimulatorAPI?.getProgramSnapshotId?.() || programSnapshotId || null;
            const currentPlanned = typeof window.SimulatorAPI?.getPlannedSteps === 'function'
                ? window.SimulatorAPI.getPlannedSteps()
                : plannedSteps;
            const expectedComparableIds = getExpectedComparableStepIds(currentPlanned);

            const mqttRuns = (Array.isArray(runs) ? runs : [])
                .filter(run => run && run.run_id && run.source === 'mqtt')
                .filter(run => String(run?.status || '').toLowerCase() === 'completed')
                .filter(run => getComparableResultStepIds(run.resultsByStep).length > 0)
                .filter(run => {
                    if (!currentSnapshotId) return true;
                    const runSnapshotId = run.snapshot_id || run.program_snapshot_id || null;
                    return !!(runSnapshotId && runSnapshotId === currentSnapshotId);
                })
                .sort((a, b) => (b?.started_at ?? b?.startedAt ?? 0) - (a?.started_at ?? a?.startedAt ?? 0));

            if (mqttRuns.length === 0) {
                renderComparisonRunInfo(null);
                if (comparisonRunInfo) comparisonRunInfo.textContent = 'Sin ejecución MQTT compatible — espera telemetría con versión del programa conocida.';
                return;
            }

            const runDiagnostics = await Promise.all(mqttRuns.map(async (run) => {
                const receivedComparable = getComparableResultStepIds(run.resultsByStep);
                const receivedSet = new Set(receivedComparable.map(String));

                let expectedComparable = expectedComparableIds;
                if (!Array.isArray(expectedComparable) || expectedComparable.length === 0) {
                    const resolved = await resolveExpectedComparableStepIdsForRun(run);
                    expectedComparable = resolved.expectedComparable;
                }

                const expectedSet = new Set((expectedComparable || []).map(String));
                const missing = (expectedComparable || []).filter(id => !receivedSet.has(String(id))).sort((a, b) => a - b);
                const complete = (expectedComparable || []).length > 0 && missing.length === 0;

                return {
                    run,
                    receivedComparable,
                    expectedComparable: expectedComparable || [],
                    missing,
                    complete
                };
            }));

            const selectedDiagnostic = runDiagnostics.find(info => info.complete) || null;
            if (!selectedDiagnostic) {
                updateStatus('⚠️ No hay ejecuciones reales completas para comparar.', false);
                if (comparisonRunInfo) {
                    comparisonRunInfo.textContent = 'No hay ejecuciones reales completas para comparar.';
                }
                return;
            }
            const selectedRun = selectedDiagnostic.run;
            const result = await window.SimulatorAPI.comparePersistedRun(selectedRun.run_id);
            renderComparisonRunInfo(result);
            lockComparisonView(selectedRun.run_id, 'latest');
            console.log(`[COMPARE VIEW] user refreshed comparison run=${selectedRun.run_id}`);

            await populatePersistedRunSelect();
        } catch (error) {
            console.error('Error al comparar run MQTT persistido', error);
            renderComparisonRunInfo(null);
        }
    });
}

if (btnCompareSelectedRun) {
    btnCompareSelectedRun.addEventListener('click', async () => {
        const runId = persistedRunSelect?.value;
        if (!runId) return;

        try {
            const currentSnapshotId = window.SimulatorAPI?.getProgramSnapshotId?.() || programSnapshotId || null;
            const runs = typeof window.listRuns === 'function' ? await window.listRuns() : [];
            const selectedRun = (Array.isArray(runs) ? runs : []).find(run => run?.run_id === runId) || null;
            const runSnapshotId = selectedRun?.snapshot_id || selectedRun?.program_snapshot_id || null;

            if (!runSnapshotId) {
                updateStatus('⚠️ Esta ejecución no tiene información suficiente para compararse.', false);
                updateGlobalComparisonStatus('error', '🔴 Comparación no válida para esta versión del programa');
                return;
            }

            if (currentSnapshotId && runSnapshotId !== currentSnapshotId) {
                updateStatus('⚠️ Esta ejecución pertenece a otra versión del programa.', false);
                updateGlobalComparisonStatus('error', '🔴 Comparación no válida para esta versión del programa');
                return;
            }

            const result = await window.SimulatorAPI.comparePersistedRun(runId);
            renderComparisonRunInfo(result);
            lockComparisonView(runId, 'selected');
            console.log(`[COMPARE VIEW] user refreshed comparison run=${runId}`);
        } catch (error) {
            console.error('Error al comparar run persistido seleccionado', error);
            renderComparisonRunInfo(null);
            updateGlobalComparisonStatus('error', '🔴 Comparación no válida para esta versión del programa');
        }
    });
}

if (toggleComparisonDetailsBtn && comparisonDetailsContainer) {
    toggleComparisonDetailsBtn.addEventListener('click', () => {
        const isVisible = comparisonDetailsContainer.style.display === 'block';
        comparisonDetailsContainer.style.display = isVisible ? 'none' : 'block';
        toggleComparisonDetailsBtn.textContent = isVisible
            ? '▼ Ver detalles de comparación'
            : '▲ Ocultar detalles de comparación';
    });
}

updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');
void populatePersistedRunSelect();
updateRobotLiveStatus('idle', 'Robot: ⚪ esperando ejecuciones reales');

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

function buildActualResultsFromRun(run) {
    if (!run || !run.resultsByStep) return [];
    const actualFromRun = Object.entries(run.resultsByStep || {}).map(([rawStepId, result]) => {
        const keyedStepId = Number(rawStepId);
        const fallbackStepId = Number(result?.step_id ?? result?.stepId ?? result?.id);
        const resolvedStepId = Number.isFinite(keyedStepId) ? keyedStepId : fallbackStepId;

        if (result && typeof result === 'object') {
            return {
                ...result,
                step_id: resolvedStepId
            };
        }

        return {
            step_id: resolvedStepId,
            pose: result
        };
    });
    actualFromRun.sort((a, b) => (a?.step_id ?? 0) - (b?.step_id ?? 0));
    return actualFromRun;
}

function isCycleMarkerStepId(stepId) {
    const n = Number(stepId);
    return n === 10000 || n === 20000;
}

function getComparableResultStepIds(resultsByStep) {
    return Object.keys(resultsByStep || {})
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0 && id < 9000);
}

function getExpectedComparableStepIds(plannedStepsInput) {
    const plannedList = Array.isArray(plannedStepsInput) ? plannedStepsInput : [];
    const verifyStepIdsSet = new Set();

    for (const step of plannedList) {
        const candidates = [step?.verify_step_ids, step?.meta?.verify_step_ids];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                candidate.forEach(id => {
                    const numeric = Number(id);
                    if (Number.isFinite(numeric)) verifyStepIdsSet.add(numeric);
                });
            }
        }
    }

    const expected = plannedList
        .map(step => Number(step?.step_id ?? step?.stepId ?? step?.id))
        .filter(stepId => Number.isFinite(stepId) && stepId > 0 && stepId < 9000 && !isCycleMarkerStepId(stepId))
        .filter((stepId, idx, arr) => arr.indexOf(stepId) === idx)
        .filter(stepId => {
            const planned = plannedList.find(step => Number(step?.step_id ?? step?.stepId ?? step?.id) === stepId);
            return isPlannedStepVerifiable(planned, verifyStepIdsSet);
        })
        .sort((a, b) => a - b);

    return expected;
}

async function resolveExpectedComparableStepIdsForRun(run, context = {}) {
    const snapshotId = run?.snapshot_id || run?.program_snapshot_id || null;
    const snapshotShort = Number(run?.snapshot_short);
    const activeSnapshotId = context?.activeSnapshotId || null;
    const activeSnapshotShort = Number(context?.activeSnapshotShort || 0);

    // Try run's own snapshot_id first
    if (snapshotId && typeof window.getSnapshot === 'function') {
        try {
            const snapshot = await window.getSnapshot(snapshotId);
            const expected = getExpectedComparableStepIds(snapshot?.plannedSteps || []);
            if (expected.length > 0) {
                return { expectedComparable: expected, source: 'snapshot_id', planFound: true };
            }
        } catch (error) {
            if (isComparisonDebugEnabled()) {
                console.debug('[RUN LABEL] error resolving snapshot by id:', snapshotId, error);
            }
        }
    }

    // Try run's own snapshot_short
    if (Number.isFinite(snapshotShort) && snapshotShort > 0 && typeof window.resolveSnapshotByShort === 'function') {
        try {
            const snapshot = await window.resolveSnapshotByShort(snapshotShort);
            const expected = getExpectedComparableStepIds(snapshot?.plannedSteps || []);
            if (expected.length > 0) {
                return { expectedComparable: expected, source: 'snapshot_short', planFound: true };
            }
        } catch (error) {
            if (isComparisonDebugEnabled()) {
                console.debug('[RUN LABEL] error resolving snapshot by short:', snapshotShort, error);
            }
        }
    }

    // Fallback: active context snapshot_id (e.g. from localStorage in simulator.html)
    if (activeSnapshotId && activeSnapshotId !== snapshotId && typeof window.getSnapshot === 'function') {
        try {
            const snapshot = await window.getSnapshot(activeSnapshotId);
            const expected = getExpectedComparableStepIds(snapshot?.plannedSteps || []);
            if (expected.length > 0) {
                return { expectedComparable: expected, source: 'active_snapshot_id', planFound: true };
            }
        } catch (error) {
            if (isComparisonDebugEnabled()) {
                console.debug('[RUN LABEL] error resolving active snapshot by id:', activeSnapshotId, error);
            }
        }
    }

    // Fallback: active context snapshot_short
    if (activeSnapshotShort > 0 && activeSnapshotShort !== snapshotShort && typeof window.resolveSnapshotByShort === 'function') {
        try {
            const snapshot = await window.resolveSnapshotByShort(activeSnapshotShort);
            const expected = getExpectedComparableStepIds(snapshot?.plannedSteps || []);
            if (expected.length > 0) {
                return { expectedComparable: expected, source: 'active_snapshot_short', planFound: true };
            }
        } catch (error) {
            if (isComparisonDebugEnabled()) {
                console.debug('[RUN LABEL] error resolving active snapshot by short:', activeSnapshotShort, error);
            }
        }
    }

    return { expectedComparable: [], source: 'none', planFound: false };
}

function isComparisonDebugEnabled() {
    try {
        const debugFromWindow = window.fp_debug === true;
        const debugFromStorage = String(localStorage.getItem('fp_debug') || '').toLowerCase() === 'true';
        return debugFromWindow || debugFromStorage;
    } catch (error) {
        return false;
    }
}

function compareStepsFromData(plannedStepsInput, actualResultsInput) {
    const comparison = [];
    const orientationComparable = false;
    const plannedStepsData = Array.isArray(plannedStepsInput) ? plannedStepsInput : [];
    const actualResultsData = Array.isArray(actualResultsInput) ? actualResultsInput : [];
    const verifyStepIdsSet = new Set();
    const plannedByStepId = new Map();

    for (const step of plannedStepsData) {
        const stepId = Number(step?.step_id ?? step?.stepId ?? step?.id);
        if (Number.isFinite(stepId)) {
            plannedByStepId.set(stepId, step);
        }
    }

    for (const step of plannedStepsData) {
        const candidates = [step?.verify_step_ids, step?.meta?.verify_step_ids];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                candidate.forEach(id => {
                    const numeric = Number(id);
                    if (Number.isFinite(numeric)) verifyStepIdsSet.add(numeric);
                });
            }
        }
    }

    // Helper: encontrar resultado real por step_id o aliases en meta
    const findActual = (stepId) => actualResultsData.find(r => {
        if (r.step_id === stepId) return true;
        const mpi = Number(r.meta?.planned_step_id);
        if (Number.isFinite(mpi) && mpi === stepId) return true;
        const mri = Number(r.meta?.raw_step_id);
        if (Number.isFinite(mri) && mri === stepId) return true;
        return false;
    });

    const plannedComparableIds = getExpectedComparableStepIds(plannedStepsData)
        .filter(stepId => isMotionPlannedStep(plannedByStepId.get(stepId)));

    const actualResultIds = actualResultsData
        .map(result => Number(result?.step_id ?? result?.stepId ?? result?.id))
        .filter(stepId => Number.isFinite(stepId) && stepId > 0 && stepId < 9000 && !isCycleMarkerStepId(stepId))
        .filter((stepId, index, array) => array.indexOf(stepId) === index)
        .sort((a, b) => a - b);

    const rowsRenderedIds = (actualResultIds.length > 0 ? actualResultIds : plannedComparableIds)
        .filter(stepId => {
            const planned = plannedByStepId.get(stepId);
            if (!planned) return false;
            if (!isMotionPlannedStep(planned)) return false;
            if (actualResultIds.length > 0) return true;
            return isPlannedStepVerifiable(planned, verifyStepIdsSet);
        });

    console.log('[COMPARE STEP IDS]', {
        plannedComparableIds,
        actualResultIds,
        rowsRenderedIds
    });

    for (const stepId of rowsRenderedIds) {
        const planned = plannedByStepId.get(stepId);
        if (!planned) continue;

        const actual = findActual(stepId);
        const zone = planned.meta?.zone || 'fine';
        const zoneMm = planned.meta?.zone_mm ?? 0;
        const phase = planned.meta?.phase;

        let allowedMm = POSITION_TOLERANCES.OK;
        if (phase === 'target_pick' || phase === 'target_place') {
            allowedMm = zoneMm > 0 ? zoneMm + POSITION_TOLERANCE_MARGIN : POSITION_TOLERANCES.OK;
        } else {
            allowedMm = zoneMm > 0 ? zoneMm + POSITION_TOLERANCE_MARGIN : POSITION_TOLERANCES.OK;
        }

        if (!actual) {
            comparison.push({
                step_id: stepId,
                planned: planned.target_pose || null,
                actual: null,
                expects_telemetry: true,
                zone,
                phase,
                allowed_mm: allowedMm,
                error: { position: null, orientation: null, orientationComparable }
            });
            continue;
        }

        const pose = actual.pose || actual;
        if (planned.target_pose && pose) {
            const dx = pose.x - planned.target_pose.x;
            const dy = pose.y - planned.target_pose.y;
            const dz = pose.z - planned.target_pose.z;
            comparison.push({
                step_id: stepId,
                planned: planned.target_pose,
                actual: pose,
                expects_telemetry: true,
                zone,
                phase,
                allowed_mm: allowedMm,
                error: { position: Math.sqrt(dx*dx + dy*dy + dz*dz), orientation: null, orientationComparable }
            });
        } else {
            comparison.push({
                step_id: stepId,
                planned: planned.target_pose || null,
                actual: pose,
                expects_telemetry: true,
                zone,
                phase,
                allowed_mm: allowedMm,
                error: { position: null, orientation: null, orientationComparable }
            });
        }
    }

    return comparison;
}

async function recoverPlannedStepsForComparison(run) {
    console.log('[COMPARE PLAN] no active plannedSteps, trying snapshot recovery');

    // Candidatos por snapshot_id
    const idCandidates = [];
    const runSnapshotId = run?.snapshot_id || run?.program_snapshot_id;
    if (runSnapshotId) idCandidates.push({ type: 'run.snapshot_id', id: runSnapshotId });
    const lsSnapshotId = localStorage.getItem('fp_snapshot_id');
    if (lsSnapshotId) idCandidates.push({ type: 'localStorage.fp_snapshot_id', id: lsSnapshotId });
    const lsProgramSnapshotId = localStorage.getItem('fp_program_snapshot_id');
    if (lsProgramSnapshotId && lsProgramSnapshotId !== lsSnapshotId) {
        idCandidates.push({ type: 'localStorage.fp_program_snapshot_id', id: lsProgramSnapshotId });
    }

    for (const c of idCandidates) {
        try {
            const snap = await window.getSnapshot?.(c.id);
            if (snap?.plannedSteps?.length) {
                console.log(`[COMPARE PLAN] recovered from ${c.type}=${c.id} steps=${snap.plannedSteps.length}`);
                return {
                    plannedSteps: snap.plannedSteps,
                    snapshot_id: snap.snapshot_id || snap.program_snapshot_id || c.id,
                    snapshot_short: snap.snapshot_short,
                    program_name: snap.program_name
                };
            }
        } catch (err) {
            console.warn('[COMPARE PLAN] snapshot recovery failed', c, err);
        }
    }

    // Candidatos por snapshot_short
    const shortCandidates = [];
    const runShort = Number(run?.snapshot_short);
    if (Number.isFinite(runShort) && runShort > 0) shortCandidates.push({ type: 'run.snapshot_short', short: runShort });
    const lsShort = Number(localStorage.getItem('fp_snapshot_short'));
    if (Number.isFinite(lsShort) && lsShort > 0) shortCandidates.push({ type: 'localStorage.fp_snapshot_short', short: lsShort });

    for (const c of shortCandidates) {
        try {
            const snap = await window.resolveSnapshotByShort?.(c.short);
            if (snap?.plannedSteps?.length) {
                console.log(`[COMPARE PLAN] recovered from ${c.type}=${c.short} steps=${snap.plannedSteps.length}`);
                return {
                    plannedSteps: snap.plannedSteps,
                    snapshot_id: snap.snapshot_id || snap.program_snapshot_id,
                    snapshot_short: snap.snapshot_short || c.short,
                    program_name: snap.program_name
                };
            }
        } catch (err) {
            console.warn('[COMPARE PLAN] snapshot_short recovery failed', c, err);
        }
    }

    console.warn('[COMPARE PLAN] failed: no plannedSteps found');
    return null;
}

async function comparePersistedRun(runId) {
    if (typeof window.getRun !== 'function') {
        throw new Error('comparePersistedRun: window.getRun no está disponible');
    }

    const run = await window.getRun(runId);
    if (!run) {
        throw new Error(`comparePersistedRun: run no encontrado (${runId})`);
    }

    const actual = buildActualResultsFromRun(run);

    // Resolución de plannedSteps: 1) snapshot persistido, 2) memoria, 3) error
    let planned = null;
    const snapshotId = run.snapshot_id || run.program_snapshot_id || null;
    if (snapshotId && typeof window.getSnapshot === 'function') {
        const snapshot = await window.getSnapshot(snapshotId);
        if (snapshot?.plannedSteps?.length) {
            planned = snapshot.plannedSteps;
        }
    }
    if (!planned) {
        const memPlanned = typeof window.SimulatorAPI?.getPlannedSteps === 'function'
            ? window.SimulatorAPI.getPlannedSteps()
            : plannedSteps;
        if (memPlanned && memPlanned.length > 0) {
            planned = memPlanned;
        }
    }
    if (!planned || planned.length === 0) {
        const recovered = await recoverPlannedStepsForComparison(run);
        if (recovered?.plannedSteps?.length) {
            planned = recovered.plannedSteps;
            if (typeof window.SimulatorAPI?.setProgramSnapshotId === 'function' && recovered.snapshot_id) {
                window.SimulatorAPI.setProgramSnapshotId(recovered.snapshot_id);
            }
            if (recovered.snapshot_id) {
                syncCurrentSnapshotState(recovered.snapshot_id, recovered.snapshot_short || null, { persist: true });
                programSnapshotId = recovered.snapshot_id;
            }
        }
    }
    if (!planned || planned.length === 0) {
        throw new Error(`comparePersistedRun: no hay plannedSteps para run (${runId}). snapshot_id=${snapshotId ?? 'none'}`);
    }

    const comparison = compareStepsFromData(planned, actual);
    renderComparisonTable(comparison);

    return {
        run,
        planned,
        actual,
        comparison
    };
}

async function compareLatestRunBySource(source) {
    if (typeof window.listRuns !== 'function') {
        throw new Error('compareLatestRunBySource: window.listRuns no está disponible');
    }

    const allRuns = await window.listRuns();
    const runsBySource = (Array.isArray(allRuns) ? allRuns : [])
        .filter(run => run && run.source === source)
        .filter(run => getComparableResultStepIds(run.resultsByStep).length > 0)
        .sort((a, b) => (b?.started_at ?? b?.startedAt ?? 0) - (a?.started_at ?? a?.startedAt ?? 0));

    if (runsBySource.length === 0) {
        throw new Error(`compareLatestRunBySource: no hay runs persistidos válidos para source '${source}'`);
    }

    let selectedRun = runsBySource[0];
    if (source === 'mqtt') {
        const currentPlanned = typeof window.SimulatorAPI?.getPlannedSteps === 'function'
            ? window.SimulatorAPI.getPlannedSteps()
            : plannedSteps;
        const expectedComparableIds = getExpectedComparableStepIds(currentPlanned);
        const completeCandidates = await Promise.all(runsBySource.map(async (run) => {
            let expectedComparable = expectedComparableIds;
            if (!Array.isArray(expectedComparable) || expectedComparable.length === 0) {
                const resolved = await resolveExpectedComparableStepIdsForRun(run);
                expectedComparable = resolved.expectedComparable;
            }
            const expectedSet = new Set((expectedComparable || []).map(String));
            if (expectedSet.size === 0) return { run, complete: false };

            const runIds = new Set(getComparableResultStepIds(run.resultsByStep).map(String));
            for (const stepId of expectedSet) {
                if (!runIds.has(stepId)) return { run, complete: false };
            }
            return { run, complete: true };
        }));

        const completeRun = completeCandidates.find(item => item.complete)?.run || null;
        if (!completeRun) {
            throw new Error('compareLatestRunBySource: no hay ejecuciones MQTT completas para comparar');
        }
        selectedRun = completeRun;
    }

    return comparePersistedRun(selectedRun.run_id);
}

// SECCIÓN 518: Exportación de Funciones para Acceso Externo
// Exponer funciones clave al objeto window para debugging y acceso desde consola
window.SimulatorAPI = {
    // Datos de planificación y resultados
    getPlannedSteps: () => plannedSteps,
    getActualResults: () => actualResults,
    getLastRunResults: getLastRunResults,
    getCurrentRunId: () => currentRunId,
    getProgramSnapshotId: () => currentProgramSnapshotId || programSnapshotId,
    getCurrentProgramSnapshotId: () => currentProgramSnapshotId || programSnapshotId,
    getCurrentSnapshotShort: () => currentSnapshotShort,
    setProgramSnapshotId: (snapshotId) => {
        const synced = syncCurrentSnapshotState(snapshotId, currentSnapshotShort, { persist: true });
        return synced.snapshotId;
    },
    setCurrentSnapshotShort: (snapshotShort) => {
        const synced = syncCurrentSnapshotState(currentProgramSnapshotId || programSnapshotId, snapshotShort, { persist: true });
        return synced.snapshotShort;
    },
    getActiveMqttRunId: () => activeMqttRunId,
    setActiveMqttRunId: (runId) => {
        if (runId) {
            updateRobotLiveStatus('receiving', 'Robot: 🟠 recibiendo datos del robot...');
            if (robotLiveStatusTimeout) {
                clearTimeout(robotLiveStatusTimeout);
            }
            robotLiveStatusTimeout = setTimeout(() => {
                updateRobotLiveStatus('received', 'Robot: 🟢 última ejecución real disponible');
            }, 3000);
        }
        if (runId === activeMqttRunId) return; // ya activo, no limpiar
        if (comparisonLockedByUser && activeComparisonRunId && runId && runId !== activeComparisonRunId) {
            console.log(`[COMPARE VIEW] mqtt update ignored for visible table run=${runId} active=${activeComparisonRunId}`);
            updateStatus('ℹ️ Hay una nueva ejecución real recibida. Pulsa comparar para actualizar.', false);
        }
        console.log(`[simulator] run MQTT activo cambia: ${activeMqttRunId} → ${runId}`);
        activeMqttRunId = runId;
        // Limpiar actualResults en memoria al cambiar de snapshot activo
        actualResults.length = 0;
    },
    
    // Funciones de compilación y ejecución (para uso avanzado)
    compilePlanFromProgram: window.CompilerAPI?.compilePlanFromProgram || compilePlanFromProgram_legacyThree,
    getCurrentSimPose: getCurrentSimPose,
    
    // Utilidades de depuración
    exportPlannedStepsJSON: () => JSON.stringify(plannedSteps, null, 2),
    exportActualResultsJSON: () => JSON.stringify(actualResults, null, 2),
    runPlannedSteps: async (steps) => {
        if (!Array.isArray(steps) || steps.length === 0) {
            console.warn('runPlannedSteps: steps vacío o inválido');
            return;
        }
        if (isSimulating) {
            console.warn('runPlannedSteps: simulación en curso');
            return;
        }

        const token = simCancelToken;
        plannedSteps.length = 0;
        plannedSteps.push(...steps);
        programSnapshotId = 'fixture';
        updateGlobalComparisonStatus('neutral', '⚪ Sin comparación');

        currentRunId = makeId('run');
        runStartTime = Date.now();
        actualResults.length = 0;
        currentStepIndex = 0;

        isSimulating = true;
        isPaused = false;
        runBtn.disabled = true;
        pauseBtn.disabled = false;
        clearBtn.disabled = true;

        updateStatus(`▶️ Ejecutando fixture (${plannedSteps.length} steps)...`);
        currentBlockText.textContent = "Fixture";

        for (const step of plannedSteps) {
            while (isPaused && isSimulating) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!isSimulating || token !== simCancelToken) break;
            await executeStep(step);
            currentStepIndex += 1;
            if (!isSimulating || token !== simCancelToken) break;
        }

        updateStatus("✅ Fixture completado", false);
        currentBlockText.textContent = "FIN";
        isSimulating = false;
        isPaused = false;
        runBtn.disabled = false;
        pauseBtn.disabled = true;
        clearBtn.disabled = false;
    },
    resetSimulationState: () => {
        if (localStorage.getItem('fp_debug') !== 'true') {
            console.warn('resetSimulationState: fp_debug desactivado');
            return;
        }

        simCancelToken += 1;
        isSimulating = false;
        isPaused = false;
        currentStepIndex = 0;
        actualResults.length = 0;

        const simState = (typeof window !== 'undefined')
            ? (window.simState || (window.simState = {}))
            : {};
        simState.gripper = 'open';
        simState.gripperWidth = undefined;
        simState.gripperForce = undefined;

        currentPosition.copy(initialPosition);
        currentRotation.copy(initialRotation);
        tcpOrientationDebugFirstPalletStepLogged = false;
        resetInitialReferenceSegmentState();
        if (tcpObject) {
            tcpObject.position.copy(currentPosition);
            tcpObject.rotation.copy(currentRotation);
        }

        if (typeof clearTrajectory === 'function') {
            clearTrajectory(false);
        }

        updateStatus('RESET', false);
    },
    exportComparisonData: () => {
        return JSON.stringify({
            program_snapshot_id: programSnapshotId,
            run_id: currentRunId,
            plannedSteps: plannedSteps,
            actualResults: actualResults,
            summary: {
                totalPlannedSteps: plannedSteps.length,
                totalExecutedSteps: actualResults.length,
                executionTime: actualResults.length > 0 ? 
                    actualResults[actualResults.length - 1].timestamp : 0
            }
        }, null, 2);
    },

    // IndexedDB (opcional)
    idbGetResultsByRun: (run_id) => {
        if (typeof idbGetResultsByRun !== 'function') return Promise.resolve([]);
        return idbGetResultsByRun(run_id);
    },
    idbGetResultsByRunAndType: (run_id, step_type) => {
        if (typeof idbGetResultsByRunAndType !== 'function') return Promise.resolve([]);
        return idbGetResultsByRunAndType(run_id, step_type);
    },
    idbGetResultsByRunAndPhase: (run_id, phase) => {
        if (typeof idbGetResultsByRunAndPhase !== 'function') return Promise.resolve([]);
        return idbGetResultsByRunAndPhase(run_id, phase);
    },
    idbClearAll: () => {
        if (typeof idbClearAll !== 'function') return Promise.resolve(false);
        return idbClearAll();
    },
    idbLoadRunBundle: (run_id) => {
        if (typeof idbLoadRunBundle !== 'function') return Promise.resolve(null);
        return idbLoadRunBundle(run_id);
    },

    // Debug: verificar persistencia incremental del último run
    idbDebugVerifyLastRun: async () => {
        try {
            const runId = currentRunId;
            const snapshotId = programSnapshotId;
            if (!runId || !snapshotId) {
                console.warn('IndexedDB error', 'No hay run_id o program_snapshot_id activo.');
                return;
            }

            if (typeof idbGetResultsByRun !== 'function') {
                console.warn('IndexedDB error', 'idbGetResultsByRun no está disponible.');
                return;
            }

            const resultsInIdb = await idbGetResultsByRun(runId);
            const plannedLen = plannedSteps.length;
            const actualLen = actualResults.length;

            console.log('IDB verify', {
                run_id: runId,
                program_snapshot_id: snapshotId,
                plannedSteps: plannedLen,
                actualResults: actualLen,
                resultsInIdb: resultsInIdb.length
            });

            const firstThree = resultsInIdb.slice(0, 3).map(r => ({
                step_id: r.step_id,
                type: r.meta?.type,
                timestamp: r.timestamp
            }));
            const lastItem = resultsInIdb[resultsInIdb.length - 1];

            console.log('IDB first 3', firstThree);
            console.log('IDB last', lastItem ? { step_id: lastItem.step_id } : null);

            if (resultsInIdb.length !== actualLen) {
                console.warn('IndexedDB error', {
                    message: 'Mismatch resultsInIdb vs actualResults',
                    resultsInIdb: resultsInIdb.length,
                    actualResults: actualLen
                });
            }
        } catch (error) {
            console.warn('IndexedDB error', error);
        }
    },

    // Debug: listar runs guardados
    idbDebugListRuns: async (limit = 10) => {
        try {
            if (typeof idbListRuns !== 'function') {
                console.warn('IndexedDB error', 'idbListRuns no está disponible.');
                return;
            }

            const runsList = await idbListRuns(limit);
            const rows = runsList.map(r => ({
                run_id: r.run_id,
                program_snapshot_id: r.program_snapshot_id,
                source: r.source,
                status: r.status,
                plannedSteps: r.plannedSteps,
                completedSteps: r.completedSteps,
                startedAt: r.startedAt,
                completedAt: r.completedAt
            }));
            console.table(rows);
        } catch (error) {
            console.warn('IndexedDB error', error);
        }
    },

    // Ejemplos (debug):
    // await SimulatorAPI.idbLoadRunBundle(SimulatorAPI.getCurrentRunId?.() || currentRunId)
    // await SimulatorAPI.idbGetResultsByRun(run_id)
    // await SimulatorAPI.idbGetResultsByRunAndType(run_id, "MoveL")
    // await SimulatorAPI.idbGetResultsByRunAndType(run_id, "IO_DO")
    
    // Comparación con tolerancias por fase (industriales)
    buildActualResultsFromRun,
    compareStepsFromData,
    comparePersistedRun,
    compareLatestRunBySource,
    renderComparisonTable: (comparison, options = {}) => {
        const force = Boolean(options?.force);
        if (comparisonLockedByUser && !force) {
            console.log(`[COMPARE VIEW] mqtt update ignored for visible table run=${activeMqttRunId} active=${activeComparisonRunId}`);
            return;
        }
        renderComparisonTable(comparison);
    },
    compareSteps: () => {
        const comparison = [];
        const orientationComparable = false;
        
        for (const planned of plannedSteps) {
            const actual = actualResults.find(r => r.step_id === planned.step_id);
            const zone = planned.meta?.zone || 'fine';
            const zoneMm = planned.meta?.zone_mm ?? 0;
            const phase = planned.meta?.phase;  // Nuevas fases: target_pick, target_place, approach_pick, etc.
            const motion = planned.meta?.motion;  // MoveJ, MoveL, IO
            
            // Calcular tolerancia dinámica según fase
            let allowedMm = POSITION_TOLERANCES.OK;  // Default
            
            if (phase === 'target_pick' || phase === 'target_place') {
                // Targets son críticos: usar zona estricta (fine = 0)
                allowedMm = zoneMm > 0 ? zoneMm + POSITION_TOLERANCE_MARGIN : POSITION_TOLERANCES.OK;
            } else if (phase && (phase.includes('approach_') || phase.includes('retract'))) {
                // Aproximaciones/retracciones: tolerancia amplia (zone_mm + margen)
                allowedMm = zoneMm > 0 ? zoneMm + 2 : POSITION_TOLERANCES.WARNING;
            } else if (phase && (phase.includes('approach_global') || phase === 'exit' || phase === 'home')) {
                // MoveJ global (seguridad): tolerancia muy amplia
                allowedMm = 10;
            } else {
                // Otros (home, etc.)
                allowedMm = zoneMm > 0 ? zoneMm + POSITION_TOLERANCE_MARGIN : POSITION_TOLERANCES.OK;
            }

            // Pasos de IO/wait no tienen target_pose: se marcan como ejecutados/pendientes sin error posicional
            if (!planned.target_pose || motion === 'IO') {
                comparison.push({
                    step_id: planned.step_id,
                    status: actual ? 'executed_io' : 'not_executed_io',
                    planned: null,
                    actual: actual ? actual.pose : null,
                    zone: null,
                    phase: phase,
                    motion: motion,
                    allowed_mm: null,
                    error: {
                        position: null,
                        orientation: null,
                        orientationComparable
                    }
                });
                continue;
            }
            
            if (!actual) {
                comparison.push({
                    step_id: planned.step_id,
                    status: 'not_executed',
                    planned: planned.target_pose,
                    actual: null,
                    zone: zone,
                    phase: phase,
                    motion: motion,
                    allowed_mm: allowedMm,
                    error: {
                        position: null,
                        orientation: null,
                        orientationComparable
                    }
                });
                continue;
            }
            
            // Calcular error posicional
            const dx = actual.pose.x - planned.target_pose.x;
            const dy = actual.pose.y - planned.target_pose.y;
            const dz = actual.pose.z - planned.target_pose.z;
            const posError = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            comparison.push({
                step_id: planned.step_id,
                status: 'executed',
                planned: planned.target_pose,
                actual: actual.pose,
                zone: zone,
                phase: phase,
                motion: motion,
                allowed_mm: allowedMm,
                error: {
                    position: posError,
                    orientation: null,
                    orientationComparable
                }
            });
        }
        return comparison;
    },

    // [HARDENED] Hook llamado desde telemetry.js cuando falla validación de snapshot_id
    onMqttValidationFailure: async ({ reason, details }) => {
        const shortId = (id) => id ? String(id).slice(0, 8) + '...' : '(ninguno)';

        let title = '⚠️ Telemetría MQTT bloqueada';
        let message = '';

        switch (reason) {
            case 'MQTT_MISSING_SNAPSHOT':
                title = '⚠️ Telemetría recibida sin snapshot_id';
                message = 'No se puede comparar este programa de forma fiable.';
                break;
            case 'MQTT_OTHER_PROGRAM_WARNING':
            case 'MQTT_OTHER_PROGRAM':
                title = '⚠️ Telemetría de otro programa (aceptada)';
                message = details.mqttProgramName
                    ? `Programa MQTT: "${details.mqttProgramName}" — snapshot: "${shortId(details.mqttSnapshotId)}"`
                    : `Snapshot MQTT: "${shortId(details.mqttSnapshotId)}" ≠ programa abierto: "${shortId(details.currentSnapshotId)}"`;
                break;
            case 'MQTT_UNKNOWN_SNAPSHOT':
                title = '⚠️ MQTT con snapshot desconocido';
                message = `snapshot_id recibido: "${shortId(details.mqttSnapshotId)}" no existe en IndexedDB.`;
                break;
        }

        // Mostrar aviso en comparisonRunInfo (elemento ya existente en HTML)
        if (comparisonRunInfo) {
            const isWarningOnly = reason === 'MQTT_OTHER_PROGRAM_WARNING' || reason === 'MQTT_OTHER_PROGRAM';
            comparisonRunInfo.style.color = isWarningOnly ? '#7a5c00' : '#b85c00';
            comparisonRunInfo.textContent = `${title} — ${message}`;
        }

        updateStatus(
            `${title}\n${message}`,
            false
        );
    }
};

console.log('✅ SimulatorAPI exportado a window.SimulatorAPI');
console.log('📖 Uso: window.SimulatorAPI.getPlannedSteps(), window.SimulatorAPI.compareSteps(), etc.');
window.SimulatorAPI = window.SimulatorAPI || {};
window.SimulatorAPI.setMqttConnectionStatus = function(info) { updateMqttStatusIndicator(info); };
updateMqttStatusIndicator({ status: 'disconnected' });

// SECCIÓN 519: Inicialización automática al cargar la página
console.log('🚀 Iniciando aplicación...');
try {
    init3D();
    console.log('✅ init3D() ejecutado correctamente');
} catch (e) {
    console.error('❌ Error en init3D():', e);
}

try {
    initIOPanel();
    console.log('✅ initIOPanel() ejecutado correctamente');
} catch (e) {
    console.error('❌ Error en initIOPanel():', e);
}

// Auto-rellenar el selector de ejecuciones reales al cargar el simulador
// Espera a que las funciones IDB estén disponibles (máx. ~2 segundos)
(function autoPopulateRunSelect() {
    const maxAttempts = 20;
    let attempts = 0;
    function tryPopulate() {
        attempts += 1;
        const ready = typeof window.listRuns === 'function' &&
                      typeof window.getSnapshot === 'function';
        if (ready) {
            populatePersistedRunSelect().catch(err =>
                console.warn('[AUTO POPULATE] Error al rellenar selector:', err)
            );
        } else if (attempts < maxAttempts) {
            setTimeout(tryPopulate, 100);
        } else {
            console.warn('[AUTO POPULATE] IDB no disponible tras', maxAttempts * 100, 'ms. Selector no rellenado.');
        }
    }
    setTimeout(tryPopulate, 100);
})();
console.log('🎉 Aplicación iniciada correctamente');
