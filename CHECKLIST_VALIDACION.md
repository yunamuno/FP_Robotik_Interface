# VALIDACIÓN DEL CHECKLIST - SIMULADOR v2.5

## ESTADO ACTUAL VS CHECKLIST

### ✅ PUNTO 1: Longitudes (planned vs actual)

**ESTADO: PARCIALMENTE CORRECTO, NECESITA AJUSTE MENOR**

- ✅ **Almacenamiento correcto**: `runs[]` registra `steps_planned` y `steps_executed` 
- ✅ **Detección de estado**: Se guarda `status: 'completed' | 'cancelled'`
- ❌ **FALTA**: No hay validación explícita de coincidencia en el status "completed"
- ⚠️ **PENDIENTE**: Si run cancelado, los pasos sin resultado deben marcarse como "Pendiente" (ya lo hace en tabla, pero sin comentario)

**CAMBIO NECESARIO:**
```javascript
// En metadata del run, al finalizar:
if (currentRun.status === 'completed') {
    // Validación: asegurar que se ejecutaron todos los steps
    const mismatch = currentRun.steps_executed !== currentRun.steps_planned;
    if (mismatch) {
        console.warn(`⚠️ Mismatch: ejecutados ${currentRun.steps_executed}/${currentRun.steps_planned}`);
    }
}
```

---

### ✅ PUNTO 2: Alineación step_id (0-based datos / 1-based UI)

**ESTADO: CORRECTO ✓**

- ✅ Función `makeId()` y compilación usan `stepIdCounter++` (post-incremento, base 0)
- ✅ UI muestra `step_id + 1` en `renderComparisonTable()`: `stepCell.textContent = item.step_id + 1;`
- ✅ `compareSteps()` y filtros usan `step_id` real (0-based): `actualResults.find(r => r.step_id === planned.step_id)`

**VERIFICACIÓN:**
- `compilePlanFromProgram()`: línea ~600 usa `stepIdCounter++` ✓
- `renderComparisonTable()`: línea ~1045 `item.step_id + 1` ✓
- `compareSteps()`: línea ~1605 `r.step_id === planned.step_id` ✓

---

### ⚠️ PUNTO 3: Semáforo por tolerancia

**ESTADO: NO IMPLEMENTADO ❌**

Actualmente `renderComparisonTable()` solo muestra "OK" o "Pendiente", sin tolerancias.

**CAMBIO NECESARIO:**

```javascript
// Tolerancias configurables (al inicio del archivo, cerca de CONSTANTS)
const POSITION_TOLERANCES = {
    OK: 1,      // <= 1 mm
    WARNING: 5  // <= 5 mm (1 < error <= 5)
    // > 5 = NOK
};

// En renderComparisonTable(), cambiar statusCell:
function statusCell(item) {
    if (item.status === 'not_executed') return 'Pendiente';
    if (item.error && item.error.position != null) {
        const err = item.error.position;
        if (err <= POSITION_TOLERANCES.OK) return 'OK';
        if (err <= POSITION_TOLERANCES.WARNING) return 'Warning';
        return 'NOK';
    }
    return '-';
}

// Añadir clase CSS a la fila para colores visuales:
tr.classList.add(`status-${status}`);
```

---

### ✅ PUNTO 4: Tooltips y mensajes coherentes

**ESTADO: CORRECTO ✓**

- ✅ `renderComparisonTable()` línea ~1050: Solo muestra 'Ori: N/A' cuando `orientationComparable === false`
- ✅ Tooltip en cada celda: `oriCell.title = tooltip;`
- ✅ Panel global línea ~405 en HTML: `<p class="orientation-note">Orientación: N/A (no evaluada aún)</p>`
- ✅ Mensaje de estado: "Simulación completada. Orientación: N/A"

**VERIFICACIÓN:**
```javascript
// compareSteps() línea ~1610:
if (item.error && item.error.orientationComparable === false) {
    oriCell.textContent = 'Ori: N/A';
    oriCell.title = tooltip; // ✓
}
```

---

### ⚠️ PUNTO 5: Historial de runs consistente

**ESTADO: PARCIALMENTE CORRECTO, NECESITA CAMPOS**

Actual estructura de runs[]:
```javascript
{
    run_id,
    program_snapshot_id,
    started_at,
    source,
    status,
    completed_at,
    steps_executed,
    steps_planned,
    orientationCompared    // ✓ Presente
}
```

**CAMBIOS NECESARIOS:**
1. Cambiar `steps_executed` → `completedSteps` (naming consistency)
2. Asegurar que `completedSteps === actualResults.filter(r => r.run_id === run_id).length`
3. Añadir `pausedAt` si status === 'paused'
4. Verificación en la metadata final

```javascript
// Estructura normalizada:
{
    run_id: string,
    program_snapshot_id: string,
    status: 'completed' | 'cancelled' | 'paused',
    plannedSteps: number,           // Total planificados
    completedSteps: number,         // Total ejecutados
    orientationCompared: false,
    startedAt: timestamp,
    completedAt: timestamp,
    source: 'sim' | 'ur3e_real'
}
```

---

## RESUMEN DE CAMBIOS A APLICAR

| Punto | Archivo | Función | Cambio | Prioridad |
|-------|---------|---------|--------|-----------|
| 1 | simulator.js | runSimulation() | Añadir validación mismatch al finalizar | MEDIA |
| 2 | - | - | ✅ YA CORRECTO | - |
| 3 | simulator.js + CSS | renderComparisonTable() | Implementar semáforo (OK/Warning/NOK) + clases CSS | ALTA |
| 3 | simulator.js | (inicio) | Definir `POSITION_TOLERANCES` | ALTA |
| 4 | - | - | ✅ YA CORRECTO | - |
| 5 | simulator.js | runSimulation() | Normalizar nombres (steps_executed → completedSteps) | MEDIA |

---

## ARCHIVOS A MODIFICAR

1. **simulator.js**:
   - Añadir `POSITION_TOLERANCES` (constante global)
   - Modificar `renderComparisonTable()` para aplicar semáforo
   - Normalizar metadata de runs (steps_executed → completedSteps)
   - Añadir validación mismatch en status "completed"

2. **simulator.style.css**:
   - Añadir clases: `.status-OK`, `.status-Warning`, `.status-NOK` con colores

3. **simulator.html**:
   - Sin cambios (ya tiene estructura correcta)

---

## NOTAS EDUCATIVAS

- El código sigue siendo **didáctico y claro** para FP
- Se mantiene **sin IndexedDB/Supabase** aún
- La arquitectura **compile → execute → compare** se preserva intacta
- Los tooltips son **accesibles** con `title` attribute (WCAG basic)
- El sistema es **agnóstico del robot** (simulador ahora, UR3e después)
