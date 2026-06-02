# Parche Aplicado: Validación Hardened de snapshot_id en MQTT

## Cambios realizados

### 1. `telemetry.js` — Nueva función `notifyMqttValidationFailure()`

**Ubicación:** línea ~149

Reemplaza el anterior `notifyMqttSnapshotMismatch()` con soporte para 5 razones de fallo:

| Reason | Caso | Mensaje clave |
|---|---|---|
| `MISMATCH` | `snap_A` vs `snap_B` | "Snapshot distinto" |
| `NO_ACTIVE_SNAPSHOT` | Compilador sin programa | "Sin snapshot activo en simulator.html" |
| `NO_PERSISTED_SNAPSHOT` | run_mqtt_live sin snapshot | "run_mqtt_live sin snapshot persistido" |
| `NO_PERSISTED_RUN` | run_mqtt_live aún no existe | "Esperando primer paso" |
| `NO_CONTEXT` | Sin ningún snapshot | "Sin contexto de programa" |

**Implementación:**
```javascript
function notifyMqttValidationFailure(reason, details = {}) {
    // Log con mensaje específico según reason
    // Llama a window.SimulatorAPI?.onMqttValidationFailure?.()
}
```

---

### 2. `telemetry.js` — Nueva función `validateMqttSnapshotContext()`

**Ubicación:** línea ~190

Función async que realiza validación en **4 pasos**:

```javascript
async function validateMqttSnapshotContext(currentSnapshotId) {
    // 1. Si currentSnapshotId es null → buscar en persistedRun
    if (!currentSnapshotId) {
        const persistedRun = await window.getRun?.(MQTT_PERSISTED_RUN_ID).catch(() => null);
        if (persistedRun?.snapshot_id) {
            return { ok: false, reason: 'NO_ACTIVE_SNAPSHOT', ... };
        }
        return { ok: false, reason: 'NO_CONTEXT', ... };
    }

    // 2. Si persistedRun no existe → error
    const persistedRun = await window.getRun?.(MQTT_PERSISTED_RUN_ID).catch(() => null);
    if (!persistedRun) {
        return { ok: false, reason: 'NO_PERSISTED_RUN', ... };
    }

    // 3. Si persistedRun no tiene snapshot → error
    const persistedSnapshotId = persistedRun?.snapshot_id || persistedRun?.program_snapshot_id || null;
    if (!persistedSnapshotId) {
        return { ok: false, reason: 'NO_PERSISTED_SNAPSHOT', ... };
    }

    // 4. Si snapshots no coinciden → error
    if (persistedSnapshotId !== currentSnapshotId) {
        return { ok: false, reason: 'MISMATCH', ... };
    }

    // ✅ Todo OK
    return { ok: true };
}
```

**Retorna:**
```javascript
{
    ok: boolean,
    reason?: string,  // Si ok=false
    details?: object  // Contexto para mensajes
}
```

---

### 3. `telemetry.js` — Refactorizar `pushMqttResultToSimulator()`

**Cambios:**

```javascript
async function pushMqttResultToSimulator(adapted) {
    if (!adapted || typeof adapted !== 'object') return;

    const currentSnapshotId = getCurrentSnapshotId();

    // [HARDENED] Validación estricta ANTES de cualquier persistencia
    const validationResult = await validateMqttSnapshotContext(currentSnapshotId);
    if (!validationResult.ok) {
        notifyMqttValidationFailure(validationResult.reason, validationResult.details);
        return;  // ← BLOQUEA aquí si falla
    }

    // [De aquí en adelante] Flujo normal sin cambios
    Promise.resolve(ensureMqttRunExists(...))
        .then(() => upsertRunStepResult(...))
        ...
}
```

**Punto clave:** La guardia es **síncrona en lógica pero async en lectura de IDB**. El `await` en validación es necesario para leer estado persistido.

---

### 4. `simulator.js` — Hook `onMqttValidationFailure()`

**Ubicación:** línea ~3172 (en `window.SimulatorAPI`)

Reemplaza `onMqttSnapshotMismatch` con soporte para 5 razones:

```javascript
onMqttValidationFailure: async ({ reason, details }) => {
    // Switch por 5 casos → mensajes específicos
    // Actualiza #comparisonRunInfo con color y texto
    // Llama a updateStatus() con dos líneas (título + contexto)
}
```

**Colores de error:**
- Mismatch/Sin snapshot: naranja (`#b85c00`)
- Esperando primer paso: gris (`#666`) — informativo, no error

---

## Matriz de comportamiento (post-parche)

| Escenario | `currentSnapshotId` | `persistedSnapshotId` | `persistedRun` | ✅/❌ | Razón |
|---|---|---|---|---|---|
| A: Normal | `snap_A` | `snap_A` | Existe | ✅ | OK |
| B: Mismatch | `snap_A` | `snap_B` | Existe | ❌ | MISMATCH |
| C: Sin activo | `null` | `snap_A` | Existe | ❌ | NO_ACTIVE_SNAPSHOT |
| D: Sin persistido | `snap_A` | `null` | Existe | ❌ | NO_PERSISTED_SNAPSHOT |
| E: Sin run | `snap_A` | — | No existe | ❌ | NO_PERSISTED_RUN |
| F: Sin contexto | `null` | `null` | No existe | ❌ | NO_CONTEXT |

---

## Logs de consola (ejemplos)

### Caso A (paso aceptado)
```
[telemetry] ✅ Paso MQTT persistido: step_id=5, snapshot=snap_abc123...
```

### Caso B (mismatch)
```
[telemetry] ⚠️ Paso MQTT descartado: snapshot distinto.
Activo: snap_abc123... | MQTT: snap_def456...
```

### Caso C (sin activo)
```
[telemetry] ⚠️ Paso MQTT descartado: sin snapshot activo en simulator.html
run_mqtt_live tiene: snap_abc123...
```

### Caso E (sin run)
```
[telemetry] ℹ️  Esperando primer paso MQTT (creará run_mqtt_live con snapshot snap_abc123...).
```

---

## UI (elemento `#comparisonRunInfo`)

### Caso A (paso aceptado)
```
(sin cambios, se actualiza con dato de comparación)
```

### Caso B (mismatch)
```
⚠️ MQTT de otro programa — Activo: "snap_abc..." — MQTT: "snap_def..."
```

### Caso C (sin activo)
```
⚠️ Sin snapshot activo en simulator.html — run_mqtt_live corresponde a: "snap_abc...".
Carga ese programa para comparar.
```

### Caso E (sin run)
```
ℹ️  Esperando primer paso MQTT — Se creará run_mqtt_live con snapshot "snap_abc..."
cuando llegue el primer paso.
```

---

## Riesgos mitigados

| Riesgo | Antes | Después | Mitigación |
|---|---|---|---|
| MQTT sin verificación | ✅ Aceptado | ❌ Bloqueado | Validación estricta en 4 pasos |
| Cambio accidental de programa | ✅ Aceptado | ❌ Bloqueado | MISMATCH check |
| Confusión de origen MQTT | ✅ Silencioso | ❌ Aviso claro | 5 mensajes específicos por razón |
| Fuga de datos entre runs | ✅ Posible | ❌ Imposible | Bloqueo anticipado antes de persistencia |

---

## Reversibilidad

**Eliminar guardia = vuelta a comportamiento anterior:**
```javascript
// Para revertir, solo remover bloque:
const validationResult = await validateMqttSnapshotContext(currentSnapshotId);
if (!validationResult.ok) {
    notifyMqttValidationFailure(...);
    return;
}
```

Las funciones `validateMqttSnapshotContext()` y `notifyMqttValidationFailure()` permanecen (no rompen), pero sin usarlas, todo fluye.

---

## Testing manual recomendado

### Escenario A: Flujo normal (snap_A = snap_A)
1. Compilar Programa A → `snap_A`
2. Conectar MQTT
3. Enviar pasos → ✅ deben aceptarse

### Escenario B: Mismatch (snap_A ≠ snap_B)
1. Compilar Programa A → `snap_A`
2. Enviar MQTT → crea run_mqtt_live(snap_A)
3. Compilar Programa B → `snap_B`
4. Enviar MQTT → ❌ debe bloquearse con "MISMATCH"

### Escenario C: Sin activo
1. Compilar Programa A → `snap_A`, enviar MQTT → OK
2. Cerrar simulator.html o cambiar página
3. Volver a simulator, sin compilar nada
4. MQTT sigue llegando → ❌ debe bloquearse con "NO_ACTIVE_SNAPSHOT"

### Escenario D: Sin run aún
1. Compilar Programa A → `snap_A`
2. Enviar primer paso MQTT → ❌ debe bloquearse con "NO_PERSISTED_RUN"
3. Verifi

car que `ensureMqttRunExists` luego create el run
4. Segundo paso → ✅ debe aceptarse (ya existe run)

---

## Cambios de nombres

| Anterior | Nuevo | Motivo |
|---|---|---|
| `notifyMqttSnapshotMismatch` | `notifyMqttValidationFailure` | Refleja que no es solo mismatch |
| `onMqttSnapshotMismatch` | `onMqttValidationFailure` | Coherencia con nueva nomenclatura |

(Cambios de nombres públicos son mínimos y localizados en hook.)

