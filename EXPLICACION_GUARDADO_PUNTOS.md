# 📋 Explicación: Cómo el Programa Guarda y Compara Puntos (v2.6)

## 🎯 Resumen Ejecutivo

El programa usa un **flujo planificado → ejecutado → comparado**:

1. **Planificación (Simulador)**: compila los bloques en pasos con `step_id` único (0-based)
2. **Ejecución**: ejecuta cada paso en 3D y registra la pose real alcanzada
3. **Comparación**: calcula error posicional (orientación N/A por ahora)

---

## 🔄 Flujo General del Sistema

```
┌─────────────────────┐
│  Bloques Blockly    │  Definir frames, poses, puntos y movimientos
│  (Interfaz Visual)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│  workspaceToProgram()           │  Convierte bloques a JSON
│  (js/blocks.js, invocado desde  │
│   js/main.js)                   │
└──────────┬──────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  localStorage: robotProgramForSimulation │  Programa plano para simulador
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  compilePlanFromProgram()                │  Crea pasos planificados (step_id 0-based)
│  (simulator.js - SECCIÓN 509)            │
│                                          │
│  SALIDA: plannedSteps[]                  │
└──────────┬───────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│  executeStep()                           │  Ejecuta y registra resultados reales
│  (simulator.js)                          │
│                                          │
│  Registra: recordStepResult()            │
│  SALIDA: actualResults[]                 │
└──────────────────────────────────────────┘
```

---

## 📍 PASO 1: Almacenamiento de Puntos Planificados

### Ubicación: `simulator.js` - Función `compilePlanFromProgram()`

Al presionar **"Ejecutar Simulación"**, el programa:

1. **Lee el JSON** desde `localStorage` (`robotProgramForSimulation`)
2. **Compila cada bloque** en pasos planificados con `step_id` único (0-based)
3. **Guarda en memoria** en `plannedSteps[]`

### Qué bloques generan pasos

- **Movimientos**: `move_block` (MoveJ), `move_linear_block` (MoveL), `use_pose`, `use_point`
- **Circular**: `move_circular_block` genera 2 pasos (via + end)
- **Paletizado**: `palletize_block` se expande a múltiples pasos (incluye IO)
- **No generan pasos**: `define_frame`, `define_pose`, `define_point`, `set_frame`, `set_tool`, `wait`, etc.

### Cómo se resuelven poses y puntos

- **Definiciones** (`define_pose`, `define_point`) se almacenan en memoria en `js/blocks.js` (`savedPoses`, `savedPoints`).
- **Uso** (`use_pose`, `use_point`) se resuelve en el JSON del programa con coordenadas finales.
- **Compilación** (`compilePlanFromProgram` en `simulator.js`) toma esos valores ya resueltos para crear `target_pose`.

### Diagrama rápido: define → use → compile

```
define_pose / define_point
  │  (savedPoses / savedPoints)
  ▼
use_pose / use_point
  │  (valores resueltos en JSON)
  ▼
compilePlanFromProgram
  │  (target_pose final)
  ▼
plannedSteps[]
```

### Estructura de un Paso Planificado (MoveJ/MoveL)

```javascript
{
    step_id: 0,              // ID único (0, 1, 2, ...)
    type: "MoveJ",           // "MoveJ" o "MoveL"
    pointName: "Pick_Point", // Nombre del punto (si existe)
    target_pose: {
        x: 250.5,            // Coordenada X en mm
        y: -150.2,           // Coordenada Y en mm
        z: 350.0,            // Coordenada Z en mm
        rx: 0.0,             // Rotación eje X (grados)
        ry: 180.0,           // Rotación eje Y (grados)
        rz: 0.0              // Rotación eje Z (grados)
    },
    target_joints: null,     // No se usa aún
    tool_id: "default",     // Herramienta activa (o 'default')
    frame_id: "WORLD",      // Sistema de coordenadas (WORLD o custom)
    meta: {
        origin_block_id: "blockId",
        pallet: { layer: 1, row: 2, col: 3 },
        circular_phase: null
    }
}
```

### Estructura de un Paso de I/O (gripper)

```javascript
{
    step_id: 5,
    type: "IO_DO",
    target_pose: null,
    target_joints: null,
    tool_id: "default",
    frame_id: "WORLD",
    pointName: null,
    meta: { pin: 1, value: true, wait_s: 0.5, stage: "pick" }
}
```

### Dónde se Guardan

**En memoria**:
```javascript
const plannedSteps = [];  // simulator.js
```

**Programa para simulación (persistencia)**:
```javascript
localStorage.setItem('robotProgramForSimulation', JSON.stringify(flatProgram));
```

---

## 🎬 PASO 2: Ejecución y Registro de Resultados Reales

### Ubicación: `simulator.js` - Funciones `executeStep()` y `recordStepResult()`

Durante la simulación, para cada step:

1. **Ejecuta el movimiento** en el 3D
2. **Lee la pose actual** (`getCurrentSimPose()`)
3. **Registra el resultado** en `actualResults[]`

Nota: en esta versión, los resultados “reales” proceden del simulador 3D (`source: "sim"`). Cuando se conecte el UR3e, se registrará un segundo run con `source: "robot"`.

### Estructura de un Resultado Registrado

```javascript
{
    source: "sim",                // Origen actual: "sim"
    run_id: "run_3c6f...",         // ID único (UUID)
    step_id: 0,                     // Referencia al step planificado
    pose: {
        x: 250.4,
        y: -150.3,
        z: 349.8,
        rx: 0.1,
        ry: 180.2,
        rz: -0.1
    },
    timestamp: 1234,                // ms desde el inicio del run
    frame: "WORLD",
    meta: { ... }                   // info adicional (palet, IO, etc.)
}
```

### Notas clave

- `timestamp` es **relativo** al inicio de la ejecución (`Date.now() - runStartTime`). El timestamp relativo facilita la comparación temporal dentro de un mismo run; para persistencia externa se podrá usar timestamp absoluto.
- Los **pasos de IO** también generan `actualResults` (pose actual en ese momento).
- En UI, el paso mostrado es `step_id + 1` (1-based para el usuario).

---

## 🔗 PASO 3: Comparación Planificado vs Real

La comparación se hace con `window.SimulatorAPI.compareSteps()`:

- **Solo compara posición (mm)**, no orientación.
- **Orientación** se marca como `N/A`.
- **Pasos de IO** se listan como ejecutados sin error posicional.

### Tolerancias usadas en la tabla

- OK: $\le 1$ mm
- Warning: $\le 5$ mm
- NOK: $> 5$ mm

---

## 📊 PASO 4: Historial de Ejecuciones (`runs[]`)

Cada ejecución agrega metadata en `runs[]`:

```javascript
{
  run_id: "run_3c6f...",
  program_snapshot_id: "snap_f9a2...",
  startedAt: 1700000000000,
  completedAt: 1700000005000,
  source: "sim",
  status: "completed",       // running | completed | cancelled
  plannedSteps: 24,
  completedSteps: 24,
  orientationCompared: false
}
```

---

## 💾 Exportación de Datos (Actual)

El simulador expone datos vía `window.SimulatorAPI`:

```javascript
window.SimulatorAPI.exportPlannedStepsJSON();
window.SimulatorAPI.exportActualResultsJSON();
window.SimulatorAPI.exportComparisonData();
```

`exportComparisonData()` devuelve JSON con `plannedSteps`, `actualResults` y resumen de ejecución.

---

## 🔍 Consultas Útiles (consola)

### Obtener pasos planificados

```javascript
window.SimulatorAPI.getPlannedSteps().map(step => ({
  step_id: step.step_id,
  point: step.pointName,
  pos: step.target_pose
}));
```

### Obtener resultados del último run

```javascript
const runId = window.SimulatorAPI.getCurrentRunId();
window.SimulatorAPI.getLastRunResults(runId);
```

### Comparar un step manualmente

```javascript
function compareStep(stepId) {
  const planned = window.SimulatorAPI.getPlannedSteps().find(s => s.step_id === stepId);
  const actual = window.SimulatorAPI.getActualResults().find(r => r.step_id === stepId);
  if (!planned || !actual || !planned.target_pose) return null;
  const dx = actual.pose.x - planned.target_pose.x;
  const dy = actual.pose.y - planned.target_pose.y;
  const dz = actual.pose.z - planned.target_pose.z;
  return { error_mm: Math.sqrt(dx*dx + dy*dy + dz*dz), delta: {dx, dy, dz} };
}
```

---

## 📌 Archivos Clave (aprox.)

| Archivo | Función | Línea |
|---------|---------|-------|
| `simulator.js` | `compilePlanFromProgram()` | ~556 |
| `simulator.js` | `createPlannedStep()` | ~688 |
| `simulator.js` | `recordStepResult()` | ~909 |
| `simulator.js` | `executeStep()` | ~946 |
| `simulator.js` | `compareSteps()` | ~1755 |
| `js/main.js` | `workspaceToProgram()` + localStorage | ~12-55 |

---

## 🎓 Resumen

✅ **Planificación**: `plannedSteps[]` se genera desde el JSON del workspace  
✅ **Ejecución**: `actualResults[]` registra la pose real por step (incluye IO)  
✅ **Comparación**: error posicional con tolerancias; orientación no comparada  
✅ **Historial**: `runs[]` guarda metadata por ejecución  
✅ **Exportación**: disponible vía `window.SimulatorAPI`  

Este sistema permite **verificar la coherencia entre el plan generado y la ejecución del simulador**.

Para detalles de definición y uso de poses/puntos, ver `POSES_PUNTOS_README.md`.
