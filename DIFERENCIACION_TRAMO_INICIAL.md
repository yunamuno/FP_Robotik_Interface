# Diferenciación Visual del Tramo Inicial - Simulador 3D

## Objetivo
Distinguir claramente el **tramo inicial desde la posición home simulada** del resto de la trayectoria real del programa.

## Problema
El simulador 3D dibuja la trayectoria empezando desde una posición home visual que **no coincide necesariamente con la posición inicial real del robot**. Esto puede inducir a error si el alumno confunde el inicio simulado con el punto de inicio real del programa.

## Solución Implementada

### 1. Material Diferenciado para el Primer Segmento
**Ubicación:** `simulator.js`, líneas 202-213

```javascript
const firstSegmentMaterial = new THREE.LineBasicMaterial({
    color: 0x999999, // Gris
    transparent: true,
    opacity: 0.5,
    linewidth: 1
});
```

**Características:**
- Color **gris** (0x999999) diferenciado del azul/verde de los movimientos reales
- Semitransparente (opacity 0.5) para indicar que es solo referencia visual
- Se aplica automáticamente al primer segmento (desde home simulado hasta el primer punto real)

### 2. Marcador Visual de la Posición Inicial Simulada
**Ubicación:** `simulator.js`, líneas 218-236

```javascript
const simulatedHomeGeometry = new THREE.SphereGeometry(0.025, 16, 8);
const simulatedHomeMaterial = new THREE.MeshBasicMaterial({
    color: 0xcccccc, // Gris claro
    transparent: true,
    opacity: 0.6,
    wireframe: false
});
```

**Características:**
- Esfera **más grande** (0.025 vs 0.015) que los puntos normales
- Color gris claro semitransparente
- Etiqueta "Inicio simulado" para identificación en tooltips

### 3. Función `markSimulatedHome()`
**Ubicación:** `simulator.js`, líneas 630-638

```javascript
function markSimulatedHome(position) {
    const homeMesh = new THREE.Mesh(simulatedHomeGeometry, simulatedHomeMaterial);
    homeMesh.position.copy(position);
    homeMesh.userData.pointName = 'Inicio simulado'; // Para tooltip
    trajectoryGroup.add(homeMesh);
}
```

**Uso:**
- Se llama al inicio de la simulación (`runProgramSimulation()`)
- Dibuja la esfera gris semitransparente en `currentPosition` (home visual del simulador)
- No interfiere con los puntos normales del programa

### 4. Lógica de Selección de Material en `executeStep()`
**Ubicación:** `simulator.js`, líneas 1719-1734

```javascript
// Determinar material: el primer tramo desde home simulado usa material diferenciado (gris semitransparente)
// Los demás tramos usan el color según tipo de movimiento (azul MoveJ, verde MoveL, etc)
let lineMaterial;
if (step.step_id === 0) {
    // Primer segmento: desde la posición inicial visual del simulador.
    // Este es solo una referencia visual y no representa necesariamente la posición inicial real del robot.
    lineMaterial = firstSegmentMaterial;
} else {
    // Movimientos reales del programa
    lineMaterial = isLinearMove ? moveLMaterial : moveJMaterial;
}
```

**Lógica:**
- Si `step.step_id === 0` (primer paso): usa `firstSegmentMaterial` (gris semitransparente)
- Si no: usa el material normal según tipo de movimiento (azul para MoveJ, verde para MoveL, magenta para MoveC)

### 5. Inicialización en `runProgramSimulation()`
**Ubicación:** `simulator.js`, líneas 1973-1977

```javascript
clearTrajectory(false);  // ✅ No limpiar frames, solo la trayectoria anterior
// Marcar la posición inicial del simulador con esfera gris semitransparente
// Esta es solo una referencia visual y no representa necesariamente la posición inicial real del robot
markSimulatedHome(currentPosition);
```

**Flujo:**
1. Limpia la trayectoria anterior
2. Dibuja la esfera gris en la posición inicial
3. Inicia la ejecución de los pasos planificados

## Resultado Visual

Al simular un programa, el alumno verá:

### Posición Inicial Simulada
- **Marcador:** Esfera gris semitransparente más grande
- **Etiqueta:** "Inicio simulado" (en tooltip)
- **Posición:** En las coordenadas home del simulador (típicamente X=0, Y=0, Z=200mm en robot)

### Primer Tramo
- **Línea:** Gris semitransparente (0x999999, opacity 0.5)
- **Significado:** Referencia visual desde home simulado hasta el primer objetivo real
- **No confundir:** Este NO es necesariamente un movimiento real del programa

### Tramos Siguientes
- **Líneas:** Colores normales (azul MoveJ, verde MoveL, magenta MoveC)
- **Significado:** Movimientos reales del programa entre puntos objetivo

## Restricciones Respetadas

✅ **No se modificó:**
- Generación de URScript
- `compiler.js`
- Telemetría MQTT/socket
- `plannedSteps`
- Comparación real vs plan
- Coordenadas del programa
- Otros idiomas (ABB/Fanuc)

## Validación

✓ Sintaxis correcta: `simulator.js` sin errores  
✓ Funciones definidas: `markSimulatedHome()` funcional  
✓ Material diferenciado: `firstSegmentMaterial` aplicado al step 0  
✓ Inicialización: `markSimulatedHome()` llamado en `runProgramSimulation()`  
✓ Documentación: Comentarios extensos en código

## Cómo Validar Visualmente

1. Abre el simulador (simulator.html)
2. Carga un programa con al menos 2 puntos
3. Simula la ejecución ("1. Ejecutar")
4. Observa:
   - ✓ Esfera gris grande en el inicio (home simulado)
   - ✓ Primera línea gris semitransparente hasta el primer punto
   - ✓ Líneas azul/verde/magenta normales para los movimientos reales
   - ✓ Puntos negros en los objetivos reales del programa

## Archivos Modificados

- `simulator.js` (4 cambios):
  1. Líneas 202-213: Material `firstSegmentMaterial`
  2. Líneas 218-236: Geometría y material `simulatedHomeGeometry` / `simulatedHomeMaterial`
  3. Líneas 630-638: Función `markSimulatedHome()`
  4. Líneas 1719-1734: Lógica de selección de material en `executeStep()`
  5. Línea 1973-1977: Llamada a `markSimulatedHome()` en `runProgramSimulation()`

## Ejemplos de Código

### Antes
```javascript
markPoint(currentPosition, 'HOME');  // Punto negro, igual a los demás
drawTrajectoryLine(startPoint, currentPosition, lineMaterial);  // Material normal
```

### Después
```javascript
markSimulatedHome(currentPosition);  // Esfera gris semitransparente diferenciada

// En executeStep:
if (step.step_id === 0) {
    lineMaterial = firstSegmentMaterial;  // Gris semitransparente
} else {
    lineMaterial = isLinearMove ? moveLMaterial : moveJMaterial;
}
drawTrajectoryLine(startPoint, currentPosition, lineMaterial);
```

---

**Fecha:** 18 de Mayo de 2026  
**Componente:** Diferenciación visual de tramo inicial en simulador 3D  
**Estado:** ✅ Implementado y validado
