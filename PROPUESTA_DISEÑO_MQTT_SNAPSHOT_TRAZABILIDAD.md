# Propuesta de Diseño: Trazabilidad MQTT con snapshot_id

## Principio de Diseño

**Todo run comparable de forma fiable debe tener `snapshot_id` explícito y persistente.**

- `program_name` → metadato humano para identificación visual
- `snapshot_id` → referencia fuerte que garantiza planificación exacta
- Resultado: comparación reproducible sin dependencia de memoria volátil

---

## Análisis del flujo MQTT actual

### Estado inicial de `run_mqtt_live`

```javascript
// telemetry.js:47-72 — ensureMqttRunExists()
await window.saveRun({
    run_id: MQTT_PERSISTED_RUN_ID,        // "run_mqtt_live"
    snapshot_id: null,                    // ⚠️ PROBLEMA: hardcoded null
    program_name: resolvedProgramName,
    source: 'mqtt',
    started_at: Date.now(),
    ended_at: null,
    status: 'running',
    resultsByStep: {},
    meta: { program_name: resolvedProgramName }
});
```

**Consecuencia:** El run nace "huérfano" — sin planificación asociada.

### Búsqueda de información disponible

Cuando llega un mensaje MQTT a `pushMqttResultToSimulator()`:

```javascript
// telemetry.js:113-160
function pushMqttResultToSimulator(adapted) {
    Promise.resolve(ensureMqttRunExists(adapted?.meta?.program_name))
        .then(() => {
            // Persiste el paso en IDB
            window.upsertRunStepResult(MQTT_PERSISTED_RUN_ID, {...});
        });
    
    // ⚠️ AQUÍ: acceso a memoria volátil
    const api = window.SimulatorAPI;
    const planned = api?.getPlannedSteps?.();        // ✅ Disponible
    const actual = api?.getActualResults?.();        // ✅ Disponible
}
```

**Datos disponibles EN ESTE MOMENTO:**
- `window.SimulatorAPI.getPlannedSteps()` → plan actual compilado
- `window.SimulatorAPI.getProgramSnapshotId()` → snapshot_id actual ✅

---

## Propuesta: Flujo de asociación snapshot → MQTT

### Punto 1: Captura de snapshot_id en el adaptador MQTT

**Ubicación:** `telemetry.js` — función `pushMqttResultToSimulator()`

```javascript
// Nuevo helper: extraer snapshot_id del contexto actual
function getCurrentSnapshotId() {
    const api = window.SimulatorAPI;
    const snapshotId = api?.getProgramSnapshotId?.();
    return snapshotId || null;
}
```

**Criterio de captura:**
- Si `window.SimulatorAPI.getProgramSnapshotId()` devuelve un ID válido
- Y el `program_name` del MQTT coincide con el programa compilado
- Entonces: capturar ese `snapshot_id`

### Punto 2: Pasar snapshot_id a `ensureMqttRunExists()`

**Ubicación:** `telemetry.js` — firma de función

**Cambio de:**
```javascript
async function ensureMqttRunExists(programName) {
```

**A:**
```javascript
async function ensureMqttRunExists(programName, snapshotId = null) {
```

**Lógica interna:**
- Si `snapshotId` es válido → usar ese valor
- Si `snapshotId` es null → intentar búsqueda lazy por `program_name`
- Guardar en `run_mqtt_live.snapshot_id`

### Punto 3: Persisten snapshot_id en el run

**Ubicación:** `telemetry.js` — línea 60–72

**Cambio de:**
```javascript
await window.saveRun({
    run_id: MQTT_PERSISTED_RUN_ID,
    snapshot_id: null,  // ❌ Cambiar
    program_name: resolvedProgramName,
    ...
});
```

**A:**
```javascript
await window.saveRun({
    run_id: MQTT_PERSISTED_RUN_ID,
    snapshot_id: snapshotId || null,  // ✅ Asignable
    program_name: resolvedProgramName,
    ...
});
```

### Punto 4: Invocación con snapshot_id

**Ubicación:** `telemetry.js` — línea 116

**Cambio de:**
```javascript
Promise.resolve(ensureMqttRunExists(adapted?.meta?.program_name))
```

**A:**
```javascript
Promise.resolve(ensureMqttRunExists(
    adapted?.meta?.program_name,
    getCurrentSnapshotId()  // Captura del contexto actual
))
```

---

## Dos fases de ejecución

### Fase 1: Captura en tiempo real (MQTT con simulator.html abierto)

**Requisito:** `simulator.html` está abierto y `SimulatorAPI` disponible

**Flujo:**
1. Mensaje MQTT llega → `pushMqttResultToSimulator()`
2. Obtiene `snapshot_id` de `SimulatorAPI.getProgramSnapshotId()`
3. Pasa a `ensureMqttRunExists(programName, snapshotId)`
4. Guarda `run_mqtt_live.snapshot_id = snapshot_id`
5. **Resultado:** Nuevo `run_mqtt_live` tiene snapshot asociado

**Ventaja:** Inmediato, sin cambios en hardware

### Fase 2: Búsqueda retroactiva (MQTT histórico sin snapshot)

**Para runs MQTT antiguos que no tengan `snapshot_id`:**

Nuevo helper en `idb.js`:
```javascript
async function findSnapshotIdByProgramNameAndSteps(programName, resultsByStep) {
    // Buscar snapshot cuyo programa y pasos compilados coincidan
    // con los pasos ejecutados en el run MQTT
    const snapshots = await listSnapshots();
    for (const snap of snapshots) {
        if (snap.meta?.program_name === programName) {
            const plannedIds = new Set(snap.plannedSteps.map(s => s.step_id));
            const actualIds = new Set(Object.keys(resultsByStep || {}));
            if (setsEqual(plannedIds, actualIds)) {
                return snap.snapshot_id;
            }
        }
    }
    return null;
}
```

En `simulator.js` — modificar `comparePersistedRun()`:
```javascript
async function comparePersistedRun(runId) {
    const run = await window.getRun(runId);
    let snapshotId = run.snapshot_id;
    
    // Si no tiene snapshot y es run MQTT, intentar búsqueda
    if (!snapshotId && run.source === 'mqtt' && run.program_name) {
        snapshotId = await findSnapshotIdByProgramNameAndSteps(
            run.program_name,
            run.resultsByStep
        );
        if (snapshotId) {
            // Guardar para futuro (no recomendable, pero informativo)
            console.log('[MQTT SNAPSHOT LINK] Encontrado snapshot retroactivo:', snapshotId);
        }
    }
    
    // Resto del flujo igual
}
```

---

## Matriz de decisiones

### ¿Cuándo capturar snapshot_id?

| Escenario | Captura | Fuente | Persistencia |
|---|---|---|---|
| MQTT en vivo, simulator.html abierto | ✅ Sí | `SimulatorAPI.getProgramSnapshotId()` | Inmediata en `run_mqtt_live` |
| MQTT en vivo, simulator.html cerrada | ❌ No | — | Histórico sin snapshot |
| MQTT histórico, comparar post-recarga | ⚠️ Lazy | `findSnapshotIdByProgramNameAndSteps()` | Búsqueda dinámica en `comparePersistedRun()` |

### Reglas de validación

**Antes de usar snapshot_id:**

1. ✅ Validar que existe en store `snapshots`
2. ✅ Validar que tiene `plannedSteps.length > 0`
3. ✅ Validar que `program_name` coincide (si está disponible)
4. ✅ Validar que paso_ids compilados ⊇ paso_ids ejecutados

Si falla alguna → error claro en `comparePersistedRun()` con diagnóstico.

---

## Cambios exactos por archivo

### `telemetry.js`

| Línea | Tipo | Cambio |
|---|---|---|
| 1–8 | Const | Agregar: `const MQTT_SNAPSHOT_STORAGE_KEY = 'fp_mqtt_snapshot_id'` |
| 44 | Función | Cambiar firma: `async function ensureMqttRunExists(programName, snapshotId = null)` |
| 45 | Función | Agregar validación: `if (!snapshotId && program_name en localStorage)` |
| 60–72 | Save | Cambiar: `snapshot_id: snapshotId \|\| null` |
| 113 | Helper | Agregar: `function getCurrentSnapshotId()` → llama `SimulatorAPI.getProgramSnapshotId()` |
| 116 | Call | Pasar: `ensureMqttRunExists(name, getCurrentSnapshotId())` |

### `simulator.js`

| Línea | Tipo | Cambio |
|---|---|---|
| 2813–2835 | `comparePersistedRun()` | Agregar lógica lazy: si run MQTT sin snapshot_id, buscar retroactivo |
| 2845–2860 | `compareLatestRunBySource()` | Sin cambios (usa `comparePersistedRun()` interno) |

### `js/idb.js`

| Línea | Tipo | Cambio |
|---|---|---|
| EOF | Nuevo helper | Agregar: `findSnapshotIdByProgramNameAndSteps(programName, resultsByStep)` |
| EOF | Export | Exponer: `window.findSnapshotIdByProgramNameAndSteps` |

---

## Validación post-implementación

### Script de testing (en consola de simulator.html)

```javascript
// Test 1: Captura en tiempo real
const apiSnap = SimulatorAPI.getProgramSnapshotId();
console.assert(apiSnap != null, 'SimulatorAPI.getProgramSnapshotId() debe retornar valor');

// Test 2: run_mqtt_live tiene snapshot si MQTT llegó
const mqttRun = await getRun('run_mqtt_live');
console.assert(
    !mqttRun || mqttRun.snapshot_id,
    'run_mqtt_live debe tener snapshot_id si existe'
);

// Test 3: comparar MQTT después de recargar
const cmp = await comparePersistedRun('run_mqtt_live');
console.assert(cmp.planned?.length > 0, 'comparePersistedRun debe resolver plannedSteps');
```

---

## Beneficios de esta propuesta

| Beneficio | Cómo se logra |
|---|---|
| **Trazabilidad fuerte** | `snapshot_id` es la referencia, no `program_name` |
| **Reproducibilidad** | Post-recarga, `comparePersistedRun('run_mqtt_live')` funciona |
| **Reversibilidad** | Fase 1 no toca firmware; Fase 2 no modifica runs viejos |
| **Compatibilidad** | Runs MQTT antiguos sin snapshot siguen siendo leíbles (fallback lazy) |
| **Limpieza segura** | IndexedDB cleanup ve `snapshot_id` y no elimina snapshots MQTT activos |

---

## Riesgos mitigados

| Riesgo | Mitigación |
|---|---|
| MQTT sin `simulator.html` → no captura | Lazy search en `comparePersistedRun()` como fallback |
| Múltiples programas mismo nombre | Búsqueda por coincidencia de `step_id` además de `program_name` |
| Snapshot no existe (borrado) | Validación explícita en `comparePersistedRun()` con error claro |
| Snapshot incorrecto enlazado | Validación de `step_id` antes de usar |

---

## Cronograma sugerido

1. **Ahora:** Implementar Fase 1 (captura en tiempo real)
   - Cambios mínimos en `telemetry.js`
   - Reversible (agregar parámetro opcional)
   - Mejora interactividad inmediata

2. **Luego:** Implementar Fase 2 (búsqueda retroactiva)
   - Helper en `idb.js`
   - Modificación de `comparePersistedRun()`
   - Cubre casos históricos

3. **Futuro:** Coordinar con hardware para incluir `snapshot_id` en MQTT
   - Eliminaría ambigüedad por `program_name`
   - Simplificaría lógica
