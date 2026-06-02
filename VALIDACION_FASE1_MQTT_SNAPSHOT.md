# Validación Fase 1: MQTT → snapshot_id

## Cambios realizados en `telemetry.js`

### 1. Helper `getCurrentSnapshotId()` — líneas ~10–18

```javascript
function getCurrentSnapshotId() {
    const api = window.SimulatorAPI;
    if (typeof api?.getProgramSnapshotId === 'function') {
        const snapshotId = api.getProgramSnapshotId();
        return snapshotId || null;
    }
    return null;
}
```

**Propósito:** Capturar el `snapshot_id` actual del compilador de forma segura.

---

### 2. Firma mejorada `ensureMqttRunExists(programName, snapshotId = null)` — líneas ~60–115

**Cambios clave:**

#### a) Parámetro nuevo
```javascript
async function ensureMqttRunExists(programName, snapshotId = null) {
```

#### b) Lógica de actualización (run existente)
```javascript
const currentSnapshotId = existing.snapshot_id || existing.program_snapshot_id || null;
if (snapshotId && !currentSnapshotId) {
    updates.snapshot_id = snapshotId;
    console.log(`[telemetry] Asociado snapshot_id a run_mqtt_live: ${snapshotId}`);
    needsUpdate = true;
}
else if (snapshotId && currentSnapshotId && snapshotId !== currentSnapshotId) {
    console.warn(`[telemetry] run_mqtt_live ya tiene snapshot_id=${currentSnapshotId}, no se sobrescribe con ${snapshotId}`);
}
```

**Comportamiento:**
- ✅ Si run existe sin `snapshot_id`, lo asigna
- ✅ Si run existe CON `snapshot_id` válido, lo protege (no sobrescribe)
- ⚠️ Si `snapshotId` es null, no hace nada

#### c) Creación (run nuevo)
```javascript
const newRun = {
    run_id: MQTT_PERSISTED_RUN_ID,
    snapshot_id: snapshotId || null,  // [FASE 1] Asignable
    // ... resto
};
if (snapshotId) {
    console.log(`[telemetry] Creado run_mqtt_live con snapshot_id: ${snapshotId}`);
}
```

**Comportamiento:**
- ✅ Si `snapshotId` es válido, lo persiste desde el inicio
- ✅ Si es null, crea run sin snapshot (compatible con MQTT sin simulator.html)

---

### 3. Invocación mejorada en `pushMqttResultToSimulator()` — líneas ~125–131

**Antes:**
```javascript
Promise.resolve(ensureMqttRunExists(adapted?.meta?.program_name))
```

**Después:**
```javascript
const currentSnapshotId = getCurrentSnapshotId();
Promise.resolve(ensureMqttRunExists(adapted?.meta?.program_name, currentSnapshotId))
```

---

## Plan de validación

### Escenario A: MQTT con simulator.html abierto (caso ideal)

**Pasos:**
1. Abrir `simulator.html`
2. Compilar un programa (ej: bloque Blockly)
3. En consola del navegador:
   ```javascript
   const snap = SimulatorAPI.getProgramSnapshotId();
   console.log('Snapshot actual:', snap);
   ```
4. Conectar MQTT y enviar un paso
5. En consola verificar:
   ```javascript
   const mqttRun = await getRun('run_mqtt_live');
   console.assert(mqttRun.snapshot_id === snap, 'snapshot_id debe ser igual');
   console.table({ expected: snap, actual: mqttRun.snapshot_id });
   ```

**Esperado en console:**
```
[telemetry] Creado run_mqtt_live con snapshot_id: snap_abc123...
```
o
```
[telemetry] Asociado snapshot_id a run_mqtt_live: snap_abc123...
```

---

### Escenario B: MQTT sin simulator.html (compatible)

**Pasos:**
1. Cerrar `simulator.html`
2. MQTT sigue conectado (proxy u otro cliente)
3. Enviar pasos MQTT
4. En consola verificar:
   ```javascript
   const mqttRun = await getRun('run_mqtt_live');
   console.log('snapshot_id:', mqttRun.snapshot_id);  // Debe ser null
   ```

**Esperado:** No hay logs de captura; `snapshot_id` sigue siendo null (compatible)

---

### Escenario C: Múltiples programas (protección de sobrescritura)

**Pasos:**
1. Compilar programa A → `snap_A`
2. Enviar MQTT → `run_mqtt_live.snapshot_id = snap_A`
3. Compilar programa B → `snap_B` (diferente)
4. Enviar MQTT → verificar protección
5. En consola:
   ```javascript
   const run = await getRun('run_mqtt_live');
   console.assert(run.snapshot_id === 'snap_A', 'snapshot_id no debe cambiar');
   ```

**Esperado en console:**
```
[telemetry] run_mqtt_live ya tiene snapshot_id=snap_A, no se sobrescribe con snap_B
```

---

### Escenario D: Recarga de página (persistencia en IDB)

**Pasos:**
1. Compilar programa → `snap_X`
2. Enviar MQTT → `run_mqtt_live.snapshot_id = snap_X`
3. **Recargar página**
4. En consola:
   ```javascript
   const run = await getRun('run_mqtt_live');
   console.log('snapshot_id post-recarga:', run.snapshot_id);
   
   // Intentar comparación
   const cmp = await comparePersistedRun('run_mqtt_live');
   console.log('Comparación:', cmp.planned?.length, 'pasos planeados');
   ```

**Esperado:**
- `run.snapshot_id` debe ser `snap_X` (persistido en IDB)
- `comparePersistedRun` debe encontrar el snapshot y devolver planned steps
- Sin error de "no hay plannedSteps"

---

## Logs de depuración esperados

### Creación nueva con snapshot
```
[telemetry] Creado run_mqtt_live con snapshot_id: snap_abc123...
```

### Mejora de existing sin snapshot
```
[telemetry] Asociado snapshot_id a run_mqtt_live: snap_def456...
```

### Protección de sobrescritura
```
[telemetry] run_mqtt_live ya tiene snapshot_id=snap_old, no se sobrescribe con snap_new
```

### Sin captura (simulator.html cerrado)
```
(sin logs de snapshot_id)
```

---

## Validación automática (script en consola)

```javascript
(async () => {
    console.group('Validación Fase 1 MQTT→snapshot_id');
    
    // V1: Helper existe y funciona
    const snap = window.SimulatorAPI?.getProgramSnapshotId?.();
    console.assert(typeof snap === 'string' || snap === null,
        'getProgramSnapshotId debe retornar string o null');
    console.log('✅ V1 — getProgramSnapshotId:', snap ? 'OK (' + snap.slice(0,8) + '...)' : 'null (sin compilación)');
    
    // V2: ensureMqttRunExists acepta segundo parámetro
    // (no podemos testear sin MQTT, pero verificar que existe)
    console.log('✅ V2 — ensureMqttRunExists firma mejorada (asumido por revisión de código)');
    
    // V3: run_mqtt_live tiene snapshot si lo pasamos
    const run = await getRun('run_mqtt_live');
    if (run) {
        console.log(`✅ V3 — run_mqtt_live.snapshot_id: ${run.snapshot_id || 'null'}`);
    } else {
        console.log('ℹ️  V3 — run_mqtt_live aún no existe (sin MQTT aún)');
    }
    
    // V4: snapshot es accesible desde getSnapshot
    if (run?.snapshot_id) {
        const s = await getSnapshot(run.snapshot_id);
        console.assert(s != null, 'snapshot debe existir en IDB');
        console.log(`✅ V4 — snapshot accesible: ${s?.plannedSteps?.length ?? 0} pasos`);
    } else {
        console.log('ℹ️  V4 — omitido (sin snapshot_id)');
    }
    
    console.groupEnd();
})();
```

---

## Criterios de paso

| Criterio | Validación |
|---|---|
| **Sintaxis** | `node --check telemetry.js` ✅ |
| **Helper** | `getCurrentSnapshotId()` existe y es seguro |
| **Firma** | `ensureMqttRunExists(programName, snapshotId = null)` ✅ |
| **Creación** | `run_mqtt_live.snapshot_id = snapshotId` cuando se crea ✅ |
| **Mejora** | Si run existe sin snapshot_id y llega uno válido, lo asigna ✅ |
| **Protección** | No sobrescribe snapshot_id válido ✅ |
| **Logs** | Discretos ([telemetry]) cuando hay cambios ✅ |
| **Compatibilidad** | Sin MQTT funciona igual (snapshot_id = null) ✅ |
| **Reversibilidad** | Parámetro `snapshotId` es opcional (default null) ✅ |

---

## Próximos pasos (sin implementar en Fase 1)

- **Fase 2:** Helper `findSnapshotIdByProgramNameAndSteps()` en `idb.js`
- **Fase 2:** Búsqueda retroactiva en `comparePersistedRun()` para runs MQTT históricos
- **Fase 3 (futuro):** Incluir `snapshot_id` en mensaje MQTT desde el robot

