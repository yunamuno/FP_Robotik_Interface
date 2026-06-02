/*═══════════════════════════════════════════════════════════════════════════════
  CONFIGURACIÓN GLOBAL - config.js
  
  Contiene:
  - Constantes del sistema
  - Límites de alcance por robot
  - Base de datos de herramientas
  - Funciones auxiliares matemáticas
═══════════════════════════════════════════════════════════════════════════════*/

/* Constantes Globales */
const CONSTANTS = {
  ROBOTS: { UR3E: 'UR3e', ABB: 'ABB IRC5', FANUC: 'Fanuc LR Mate' },
  MODES: { EDUCATIONAL: 'educativo', INDUSTRIAL: 'industrial' },
  BLOCK_TYPES: { 
    MOVE_J: 'move_block', 
    MOVE_L: 'move_linear_block', 
    MOVE_C: 'move_circular_block', 
    WAIT: 'wait_block', 
    SET_DO: 'set_do_block', 
    WAIT_DI: 'wait_di_block',
    DEFINE_FRAME: 'define_frame',
    USE_FRAME: 'use_frame'
  }
};

/* Límites de Alcance por Robot (en mm) */
const ROBOT_REACH_LIMITS = {
  [CONSTANTS.ROBOTS.UR3E]: 500,
  [CONSTANTS.ROBOTS.ABB]: 700,
  [CONSTANTS.ROBOTS.FANUC]: 550
};

/* Umbral para Advertencia de Singularidad */
const SINGULARITY_THRESHOLD_Y_MM = 1;

/* Base de Datos de Herramientas */
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

/* Almacén Global de Frames Definidos */
const savedFrames = {};
// Estructura: { nombreFrame: { x, y, z, rx, ry, rz } }

/* Frame por Defecto (Base del Robot) */
const DEFAULT_FRAME = {
  name: 'WORLD',
  x: 0, y: 0, z: 0,
  rx: 0, ry: 0, rz: 0
};

/* Funciones Auxiliares Matemáticas */

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

// Revisa si un valor Y está peligrosamente cerca de 0 para advertir de singularidad
function checkSingularityWarning(yValue) {
  if (yValue === null || typeof yValue === 'undefined') {
    return false;
  }
  return Math.abs(yValue) < SINGULARITY_THRESHOLD_Y_MM;
}

// Conversión de Ángulos Euler a Cuaternión (necesario para robots ABB)
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

// Obtiene la velocidad por defecto configurada
function currentDefaultSpeed() {
  const v = Number(document.getElementById("defaultSpeed").value || 100);
  return isFinite(v) && v > 0 ? v : 100;
}
