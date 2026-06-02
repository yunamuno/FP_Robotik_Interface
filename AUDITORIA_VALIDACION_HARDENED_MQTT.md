# Auditoría: Validación hardened de snapshot_id en MQTT

## Estado actual (Fase 1)

### Guardias activas

```javascript
// telemetry.js — línea ~164
if (currentSnapshotId && typeof window.getRun === 'function') {
    try {
        const persistedRun = await window.getRun(MQTT_PERSISTED_RUN_ID);
        const persistedSnapshotId = persistedRun?.snapshot_id || persistedRun?.program_snapshot_id || null;
        if (persistedSnapshotId && persistedSnapshotId !== currentSnapshotId) {
            notifyMqttSnapshotMismatch(persistedSnapshotId, currentSnapshotId);
            return;
        }
    } catch (err) {
        console.warn('[telemetry] No se pudo verificar snapshot del run persistido:', err);
    }
}
```

### Problemas (casos permitidos que deberían bloquearse)

| Caso | `currentSnapshotId` | `persistedSnapshotId` | Comportamiento actual | Deseado |
|---|---|---|---|---|
| A | `snap_A` | `snap_A` | ✅ Acepta | ✅ Acepta |
| B | `snap_A` | `snap_B` | ❌ Bloquea | ❌ Bloquea |
| **C** | `null` | `snap_A` | ✅ Acepta | ❌ **DEBE BLOQUEAR** |
| **D** | `snap_A` | `null` | ✅ Acepta | ❌ **DEBE BLOQUEAR** |
| **E** | `snap_A` | (run inexistente) | ✅ Acepta | ❌ **DEBE BLOQUEAR** |
| **F** | `null` | `null` | ✅ Acepta | ❌ **DEBE BLOQUEAR** |

**Los casos C, D, E, F son vulnerabilidades de diseño** que permiten telemetría sin verificación real.

---

## Nueva regla de validación (hardened)

```
La telemetría MQTT solo fluye si:

1. ✅ currentSnapshotId existe (no null)
2. ✅ persistedRun existe en IDB (getRun no null)
3. ✅ persistedSnapshotId existe en persistedRun (no null)
4. ✅ persistedSnapshotId === currentSnapshotId (coincidencia exacta)

En cualquier otro caso → BLOQUEAR + AVISO ESPECÍFICO
```

---

## Diferencias de causas de rechazo

Cada caso de rechazo tiene una razón específica que el usuario debe entender:

| Caso | Condición | Razón | Mensaje usuario |
|---|---|---|---|
| C | `currentSnapshotId = null` | Compilador sin programa | "No hay snapshot activo en simulator.html" |
| D | `persistedSnapshotId = null` | run_mqtt_live huérfano | "run_mqtt_live sin snapshot persistido (cárgalo)" |
| E | `persistedRun = null` | run no existe | "run_mqtt_live no existe aún en IDB" |
| F | Ambos null | Sin contexto | "Sin contexto de verificación: carga programa" |
| B | Mismatch | Programas diferentes | "MQTT corresponde a otro programa" |

---

## Cambios necesarios

### 1. Refactorizar `notifyMqttSnapshotMismatch()` → `notifyMqttValidationFailure()`

**Nuevo nombre:** Mejor refleja que no es solo un "mismatch", sino una falla de validación.

**Firma nueva:**
```javascript
function notifyMqttValidationFailure(reason, details = {}) {
    // reason: 'MISMATCH' | 'NO_ACTIVE_SNAPSHOT' | 'NO_PERSISTED_SNAPSHOT' 
    //         | 'NO_PERSISTED_RUN' | 'NO_CONTEXT'
    // details: { currentSnapshotId, persistedSnapshotId, error, ... }
}
```

**Ejemplos de uso:**
```javascript
notifyMqttValidationFailure('MISMATCH', { 
    currentSnapshotId: snap_A, 
    persistedSnapshotId: snap_B 
});

notifyMqttValidationFailure('NO_ACTIVE_SNAPSHOT', { 
    persistedSnapshotId: snap_A 
});

notifyMqttValidationFailure('NO_PERSISTED_SNAPSHOT', { 
    currentSnapshotId: snap_A 
});

notifyMqttValidationFailure('NO_PERSISTED_RUN', {});

notifyMqttValidationFailure('NO_CONTEXT', {});
```

### 2. Nueva guardia en `pushMqttResultToSimulator()`

**Flujo de validación:**

```javascript
async function pushMqttResultToSimulator(adapted) {
    if (!adapted || typeof adapted !== 'object') return;

    const currentSnapshotId = getCurrentSnapshotId();

    // [HARDENED] Validación estricta
    const validationResult = await validateMqttSnapshotContext(currentSnapshotId);
    if (!validationResult.ok) {
        notifyMqttValidationFailure(validationResult.reason, validationResult.details);
        return;
    }

    // Si validación pasó, flujo normal...
    Promise.resolve(ensureMqttRunExists(...))
        .then(() => upsertRunStepResult(...))
        ...
}
```

Donde `validateMqttSnapshotContext()` es un nuevo helper async que:

```javascript
async function validateMqttSnapshotContext(currentSnapshotId) {
    // Si no hay snapshot activo
    if (!currentSnapshotId) {
        // Intentar leer persistedRun para dar contexto
        const persistedRun = await window.getRun(MQTT_PERSISTED_RUN_ID).catch(() => null);
        if (persistedRun?.snapshot_id) {
            return { ok: false, reason: 'NO_ACTIVE_SNAPSHOT', details: { persistedSnapshotId: persistedRun.snapshot_id } };
        }
        return { ok: false, reason: 'NO_CONTEXT', details: {} };
    }

    // Si no hay run_mqtt_live persistido
    const persistedRun = await window.getRun(MQTT_PERSISTED_RUN_ID).catch(() => null);
    if (!persistedRun) {
        return { ok: false, reason: 'NO_PERSISTED_RUN', details: { currentSnapshotId } };
    }

    // Si run existe pero no tiene snapshot
    const persistedSnapshotId = persistedRun?.snapshot_id || persistedRun?.program_snapshot_id || null;
    if (!persistedSnapshotId) {
        return { ok: false, reason: 'NO_PERSISTED_SNAPSHOT', details: { currentSnapshotId } };
    }

    // Si hay mismatch
    if (persistedSnapshotId !== currentSnapshotId) {
        return { ok: false, reason: 'MISMATCH', details: { currentSnapshotId, persistedSnapshotId } };
    }

    // ✅ Validación pasó
    return { ok: true };
}
```

### 3. Actualizar `onMqttSnapshotMismatch()` en simulator.js

Renombrarlo a `onMqttValidationFailure()` y manejar todos los casos:

```javascript
onMqttValidationFailure: async ({ reason, details }) => {
    const shortId = (id) => id ? String(id).slice(0, 8) + '...' : '?';

    let title = '⚠️ Telemetría MQTT bloqueada';
    let message = '';

    switch (reason) {
        case 'MISMATCH':
            title = '⚠️ MQTT de otro programa';
            message = `Activo: "${shortId(details.currentSnapshotId)}" · MQTT: "${shortId(details.persistedSnapshotId)}"`;
            break;
        case 'NO_ACTIVE_SNAPSHOT':
            title = '⚠️ Sin snapshot activo';
            message = `Carga un programa en simulator.html para comparar con MQTT: "${shortId(details.persistedSnapshotId)}"`;
            break;
        case 'NO_PERSISTED_SNAPSHOT':
            title = '⚠️ run_mqtt_live sin snapshot';
            message = `Carga el programa MQTT correspondiente. Snapshot activo: "${shortId(details.currentSnapshotId)}"`;
            break;
        case 'NO_PERSISTED_RUN':
            title = '⚠️ Esperando primer paso MQTT';
            message = 'Se creará run_mqtt_live con snapshot cuando llegue el primer paso.';
            break;
        case 'NO_CONTEXT':
            title = '⚠️ Sin contexto de programa';
            message = 'Carga un programa o conecta MQTT que tenga snapshot.';
            break;
    }

    // Actualizar UI
    if (comparisonRunInfo) {
        comparisonRunInfo.style.color = '#b85c00';
        comparisonRunInfo.textContent = `${title} — ${message}`;
    }

    updateStatus(`${title}\n${message}`, false);
}
```

---

## Matriz de cambios exactos

| Archivo | Función | Cambio |
|---|---|---|
| `telemetry.js` | `notifyMqttSnapshotMismatch` | Renombrar a `notifyMqttValidationFailure` + cambiar firma |
| `telemetry.js` | `validateMqttSnapshotContext` | NUEVA función async |
| `telemetry.js` | `pushMqttResultToSimulator` | Llamar a `validateMqttSnapshotContext` antes de flujo normal |
| `simulator.js` | `onMqttSnapshotMismatch` | Renombrar a `onMqttValidationFailure` + manejar todos los `reason` |

---

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambio de nombres de funciones públicas | Rompe scripts de usuario | Mantener alias deprecated de `notifyMqttSnapshotMismatch` |
| Hook `onMqttSnapshotMismatch` no existe en versión vieja | Errores silenciosos | Hook es `?.` (optional chaining) — error silencioso OK |
| Primeros pasos MQTT sin run_mqtt_live | Caso `NO_PERSISTED_RUN` | Es correcto: primer paso crea el run en `ensureMqttRunExists` |
| IDB read en cada paso MQTT | Performance | Negligible: 1 `getRun()` por paso = milisegundos |

---

## Reversibilidad

- Guardia es un `return` anticipado → eliminar = vuelta al comportamiento anterior.
- Nueva función `validateMqttSnapshotContext` es un `await` síncrono → no asincronía adicional.
- Cambios en `simulator.js` son en el hook (reemplazable).

---

## Caso de validación crítico

**Escenario:** Usuario carga Programa A, telemetría MQTT llega, luego carga Programa B, telemetría sigue llegando.

```
t=0: Cargar Programa A → snap_A
t=1: MQTT llega → validateMqttSnapshotContext(snap_A)
     → persistedRun = null (aún no existe)
     → reason = 'NO_PERSISTED_RUN'
     → return (bloquea)
     
t=2: ensureMqttRunExists(name, snap_A) crea run_mqtt_live con snap_A
t=3: Siguiente MQTT llega → validateMqttSnapshotContext(snap_A)
     → persistedRun.snapshot_id = snap_A ✅
     → ok = true
     → flujo normal

t=4: Usuario carga Programa B → snap_B (currentSnapshotId = snap_B)
t=5: MQTT sigue llegando → validateMqttSnapshotContext(snap_B)
     → persistedRun.snapshot_id = snap_A
     → snap_A !== snap_B
     → reason = 'MISMATCH'
     → return (bloquea)
```

Este es el comportamiento deseado: protección contra cambio accidental de programa.

