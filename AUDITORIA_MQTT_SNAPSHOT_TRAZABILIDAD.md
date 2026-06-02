# Auditoría: Trazabilidad MQTT-Snapshot en IndexedDB

## 1. Estado actual del flujo MQTT

### 1.1 Creación de `run_mqtt_live`

**Archivo:** `telemetry.js` (líneas 47–72)

```javascript
await window.saveRun({
    run_id: MQTT_PERSISTED_RUN_ID,        // "run_mqtt_live"
    snapshot_id: null,                    // ⚠️ SIEMPRE null
    program_name: resolvedProgramName,
    source: 'mqtt',
    started_at: Date.now(),
    ended_at: null,
    status: 'running',
    resultsByStep: {},
    meta: { program_name: resolvedProgramName }
});
```

**Problema crítico:** `snapshot_id` es hardcoded a `null`. No hay enlace con el plan compilado.

### 1.2 Datos de entrada MQTT

**Archivo:** `telemetry.js` (líneas 78–105)

El adaptador extrae del mensaje JSON:
- `step_id` — identificador del paso (numérico)
- `tcp_position_mm` — posición del robot `{x, y, z}`
- `timestamp` — marca temporal ISO
- `program_name` — nombre del programa (opcional)

**Problemas:**
- No hay `snapshot_id` en el mensaje MQTT
- No hay `program_snapshot_id`
- No hay `plannedSteps` — información de plan compilado

### 1.3 Persistencia de resultados MQTT

**Archivo:** `telemetry.js` (líneas 113–128)

```javascript
window.upsertRunStepResult(MQTT_PERSISTED_RUN_ID, {
    step_id: adapted.step_id,
    pose: adapted.pose,
    timestamp: adapted.timestamp,
    source: 'mqtt',
    meta: adapted.meta || {}
});
```

**Impacto:** Se persisten los pasos realizados, pero sin referencia al plan compilado.

---

## 2. El problema de `comparePersistedRun('run_mqtt_live')`

### 2.1 Flujo de resolución de `plannedSteps`

**Archivo:** `simulator.js` (líneas 2813–2835)

```javascript
async function comparePersistedRun(runId) {
    const run = await window.getRun(runId);  // Obtiene run_mqtt_live
    const actual = buildActualResultsFromRun(run);  // Extrae resultsByStep ✅
    
    // Intenta resolver plannedSteps
    let planned = null;
    const snapshotId = run.snapshot_id || run.program_snapshot_id || null;
    // ⚠️ snapshotId es NULL → no encuentra snapshot
    
    if (snapshotId && typeof window.getSnapshot === 'function') {
        const snapshot = await window.getSnapshot(snapshotId);  // FALLA
        if (snapshot?.plannedSteps?.length) {
            planned = snapshot.plannedSteps;
        }
    }
    
    if (!planned) {
        // Fallback: intenta memoria
        const memPlanned = window.SimulatorAPI?.getPlannedSteps();
        // ⚠️ Problema: memoria es volátil, recarga perdería el plan
    }
    
    if (!planned || planned.length === 0) {
        throw new Error(`no hay plannedSteps para run (${runId}). snapshot_id=${snapshotId}`);
    }
}
```

**Resultado:**
- Si `SimulatorAPI.getPlannedSteps()` está en memoria → comparación funciona
- Si se recarga la página → error, no hay plan persistido

### 2.2 Diferencia con `compareLatestRunBySource('sim')`

Runs de simulación (`run_sim_*`):
- ✅ Tienen `snapshot_id` válido
- ✅ Snapshot contiene `plannedSteps` completos
- ✅ Comparación es reproducible entre sesiones

Runs MQTT (`run_mqtt_live`):
- ❌ `snapshot_id` es null
- ❌ Solo hay `program_name` como pista
- ❌ Comparación depende de estado en memoria

---

## 3. Datos disponibles para enlace

### 3.1 En `run_mqtt_live` hoy

| Campo | Valor actual | ¿Útil para enlace? |
|---|---|---|
| `run_id` | `"run_mqtt_live"` | — (invariable) |
| `snapshot_id` | `null` | ❌ |
| `program_snapshot_id` | — (no existe) | ❌ |
| `program_name` | `"Programa_20260416_0930"` | ⚠️ Ambiguo, no único |
| `source` | `"mqtt"` | ✅ (identificador de origen) |
| `meta.program_name` | Ídem | ⚠️ Duplicado |
| `resultsByStep` | `{step_id: {...}, ...}` | ✅ (tiene datos) |

### 3.2 En el mensaje MQTT

**Ejemplo de payload esperado:**
```json
{
  "step_id": 5,
  "tcp_position_mm": { "x": 123.4, "y": 456.7, "z": 890.1 },
  "timestamp": "2026-04-16T09:30:45.123Z",
  "program_name": "Programa_20260416_0930"
}
```

**Lo que falta:**
- No hay `snapshot_id` del lado de la fuente
- No hay plan compilado para validación

### 3.3 En memoria (`SimulatorAPI`)

Si `simulator.html` está abierto:
- `SimulatorAPI.getPlannedSteps()` → plan actual en memoria
- `SimulatorAPI.getCurrentRunId()` → run actual
- `programSnapshotId` (variable global) → snapshot del plan compilado

---

## 4. Propuestas de enlace

### Opción A: Captura explícita de `snapshot_id` en MQTT (Recomendada)

**Cambios requeridos:**

1. **Fuente MQTT (lado robot):**
   - Incluir `snapshot_id` en cada mensaje MQTT
   - Ejemplo: `{"step_id": 5, "snapshot_id": "snap_abc123", "tcp_position_mm": {...}, ...}`

2. **`telemetry.js`:**
   - Extraer `snapshot_id` del payload MQTT
   - Pasar a `ensureMqttRunExists(programName, snapshotId)`
   - Guardar en `run_mqtt_live.snapshot_id`

3. **Beneficios:**
   - ✅ Trazabilidad de fuente fidedigna
   - ✅ Comparación reproducible entre sesiones
   - ✅ No depende de memoria volátil
   - ✅ Permite limpiar snapshots sin perder datos MQTT

4. **Inconvenientes:**
   - ⚠️ Requiere cambio en firmware/telemetría del robot
   - ⚠️ No es reversible sin actualizar fuentes

---

### Opción B: Enlace por `program_name` con búsqueda de snapshot

**Cambios requeridos:**

1. **`telemetry.js`:**
   - Cuando llega mensaje MQTT, extraer `program_name`
   - Buscar último snapshot con ese `program_name` en metadatos
   - Guardar `snapshot_id` en `run_mqtt_live`

2. **Nuevo helper en `idb.js`:**
   ```javascript
   async function getLatestSnapshotByProgramName(programName) {
       const snapshots = await listSnapshots();
       const matching = snapshots.filter(s => s.meta?.program_name === programName);
       if (!matching.length) return null;
       const sorted = matching.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
       return sorted[0];
   }
   ```

3. **En `pushMqttResultToSimulator`:**
   - Si no hay `run_mqtt_live.snapshot_id`, buscarlo
   - Guardar una sola vez

4. **Beneficios:**
   - ✅ Sin cambios en firmware
   - ✅ Usa datos disponibles hoy
   - ✅ Comparación mejora sin nuevos requisitos

5. **Inconvenientes:**
   - ⚠️ Si hay múltiples programas con mismo nombre, ambiguo
   - ⚠️ Snapshot se elige después (lazy), no garantizado inmediato
   - ⚠️ Puede enlazar snapshot incorrecto si cronología es caótica

---

### Opción C: Captura transitoria en `SimulatorAPI`

**Cambios requeridos:**

1. Cuando llega mensaje MQTT a `pushMqttResultToSimulator`:
   - Leer `programSnapshotId` actual de `SimulatorAPI`
   - Si coincide `program_name` del MQTT con el nombre de `SimulatorAPI`
   - Pasar `snapshot_id` a `ensureMqttRunExists`

2. **Limitación:** Solo funciona si `simulator.html` está abierto en ese momento.

3. **Beneficios:**
   - ✅ Mínimo cambio de código
   - ✅ Automático si app está visible

4. **Inconvenientes:**
   - ❌ No funciona si `simulator.html` está cerrada
   - ❌ No retroactivo para MQTT histórico
   - ❌ Frágil (depende de estado volátil)

---

## 5. Evaluación de opciones

| Aspecto | Opción A | Opción B | Opción C |
|---|---|---|---|
| **Cambios en firmware** | ✅ Requiere | ❌ No | ❌ No |
| **Reproducibilidad** | ✅ Excelente | ⚠️ Buena | ❌ Mala |
| **Complejidad código** | ⚠️ Moderada | ⚠️ Moderada | ✅ Mínima |
| **Robustez** | ✅ Muy alta | ⚠️ Media | ❌ Baja |
| **Reversibilidad** | ❌ Difícil | ✅ Fácil | ✅ Fácil |
| **Funciona sin `simulator.html`** | ✅ Sí | ✅ Sí | ❌ No |

---

## 6. Recomendación

**Opción B + Opción C en paralelo** (enfoque pragmático por fases):

### Fase 1: Opción C (inmediata, sin firmware)
- Cuando MQTT llega y `SimulatorAPI` está disponible, capturar `programSnapshotId`
- Mejoraría casos interactivos
- Código reversible

### Fase 2: Opción B (cuando sea posible sin cambios robot)
- Impl. `getLatestSnapshotByProgramName`
- Búsqueda lazy al primer acceso en `comparePersistedRun('run_mqtt_live')`
- Mejora reproductibilidad histórica

### Fase 3: Opción A (futuro, requiere coord. hardware)
- Incluir `snapshot_id` en mensaje MQTT desde el robot
- Elimina ambigüedad de `program_name`
- Garantiza trazabilidad de fuente

---

## 7. Criterios de éxito (post-implementación)

Para considerar el problema resuelto:

1. **`comparePersistedRun('run_mqtt_live')` sin errores** (memoria y post-recarga)
2. **Snapshot referenciado es el correcto** (validar plan == pasos ejecutados)
3. **Limpieza de IndexedDB no pierde trazabilidad MQTT** (snapshot persiste mientras run existe)
4. **Selector de runs muestra comparación MQTT** junto a simulaciones

---

## 8. Archivos a revisar para implementación

- `telemetry.js` — Líneas 45–128 (creación de run, adaptación de MQTT)
- `simulator.js` — Líneas 2798–2870 (`comparePersistedRun`, `compareLatestRunBySource`)
- `js/idb.js` — Posible nuevo helper `getLatestSnapshotByProgramName`
- `js/ui.js` — Selector de runs, si necesita cambios de presentación
