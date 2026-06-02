# 🧪 Plan de Testing - Sistema de Frames

## Estado: Fase 9 - Testing y Validación Completa

### ✅ Verificaciones Completadas

1. **Análisis estático de código**: Sin errores de compilación
2. **Revisión de implementación**:
   - ✅ config.js: savedFrames, DEFAULT_FRAME, constantes
   - ✅ blocks.js: define_frame, use_frame bloques visuales
   - ✅ generators.js: Código educativo e industrial (UR3e, ABB, Fanuc)
   - ✅ simulator.js: Transformaciones 3D y visualización de frames

### 📋 Casos de Prueba a Realizar

#### Test 1 — Definición Básica de Frame

**Objetivo**
Verificar que se puede definir un frame y visualizarlo

**Precondición**
No aplica.

### Pasos
1. Abrir index.html en navegador (http://localhost:8080)
2. Arrastrar bloque "Definir Frame" desde categoría "Poses/Puntos"
3. Configurar: Nombre="mesa1", X=200, Y=300, Z=0, Rz=45
4. Generar código educativo
5. Generar código industrial (UR3e, ABB, Fanuc)

**Resultado esperado**
- Educativo: "Definir Frame: mesa1 (Origen: X:200, Y:300, Z:0, Rotación: Rx:0, Ry:0, Rz:45)"
- UR3e: `mesa1_frame = p[0.2000, 0.3000, 0.0000, 0.0000, 0.0000, 0.7854]`
- ABB: `PERS wobjdata wobj_mesa1:=[FALSE,TRUE,"",[...quaternion...],[[0,0,0],[1,0,0,0]]];`
- Fanuc: Comentarios explicando UFRAME[1]

#### Test 2 — Uso de Frame en Movimientos

**Objetivo**
Verificar que los movimientos se transforman correctamente

**Precondición**
No aplica.

### Pasos
1. Definir frame "pieza1" en X=200, Y=300, Z=0
2. Añadir bloque "Usar Frame" → seleccionar "pieza1"
3. Definir punto "home" en X=0, Y=0, Z=50
4. Añadir "Mover Articular" → usar punto "home"
5. Generar código y simular

**Resultado esperado**
- Educativo: "Activar Frame: pieza1" → "Todos los movimientos siguientes serán relativos a este frame"
- UR3e: `movej(pose_trans(pieza1_frame, p[0.0000, 0.0000, 0.0500, ...]))`
- ABB: `MoveJ home, v200, z50, tool0\WObj:=wobj_pieza1;`
- Simulador: TCP se mueve a (200, 300, 50) en coordenadas absolutas

#### Test 3 — Cambio de Frame Activo

**Objetivo**
Verificar que se puede cambiar entre frames

**Precondición**
No aplica.

### Pasos
1. Definir frame "mesa1" en X=0, Y=0, Z=0
2. Definir frame "mesa2" en X=500, Y=0, Z=0
3. Usar frame "mesa1" → mover a (100, 0, 50)
4. Usar frame "mesa2" → mover a (100, 0, 50)
5. Usar frame "WORLD" → mover a (250, 0, 50)
6. Simular

**Resultado esperado**
- Primer movimiento: TCP en (100, 0, 50) absoluto
- Segundo movimiento: TCP en (600, 0, 50) absoluto (500 + 100)
- Tercer movimiento: TCP en (250, 0, 50) absoluto

#### Test 4 — Frame con Rotación

**Objetivo**
Verificar transformaciones con frame rotado

**Precondición**
No aplica.

### Pasos
1. Definir frame "rotado" en X=100, Y=100, Z=0, Rz=90°
2. Usar frame "rotado"
3. Mover a punto local (50, 0, 0)
4. Simular

**Resultado esperado**
- Punto local (50, 0, 0) → Punto global (100, 150, 0) debido a rotación de 90°

#### Test 5 — Integración con Simulador 3D

**Objetivo**
Verificar visualización de frames

**Precondición**
No aplica.

### Pasos
1. Abrir simulator.html
2. Crear programa con 2 frames definidos
3. Ejecutar simulación
4. Observar:
   - Ejes de coordenadas visuales para cada frame
   - Etiquetas con nombres de frames
   - Transformaciones correctas de movimientos

**Resultado esperado**
- Frames visibles como ejes XYZ de 150mm
- Etiquetas legibles sobre cada frame
- Trayectorias TCP correctas respecto a frames activos
- Indicador "[Frame: nombre]" en display de bloque actual

#### Test 6 — Zona de Movimiento Configurable

**Objetivo**
Verificar parámetro de zona en ABB

**Precondición**
No aplica.

### Pasos
1. Añadir "Mover Lineal" a un punto
2. Cambiar zona de z50 a z1 (preciso) y z100 (rápido)
3. Generar código ABB

**Resultado esperado**
- ABB: `MoveL punto, v200, z1, tool0\WObj:=wobj0;` (según selección)
- UR3e: Ignora zona (no aplica)
- Fanuc: Siempre FINE

#### Test 7 — Paletizado con Frames

**Objetivo**
Verificar que paletizado respeta frame activo

**Precondición**
No aplica.

### Pasos
1. Definir frame "pallet1" en X=300, Y=400, Z=0
2. Usar frame "pallet1"
3. Añadir bloque "Paletizado Completo"
4. Configurar origen pallet en (0, 0, 0) LOCAL
5. Simular

**Resultado esperado**
- Grid de paletizado se genera en coordenadas globales (300, 400, 0) + offsets

#### Test 8 — Persistencia de puntos en Paletizado (PALLET_P1/P2/P3)

**Objetivo**
Verificar que al guardar/cargar XML no se pierden `PALLET_P1/P2/P3` (use_point)

**Precondición**
1. Activar debug si aplica: `localStorage.fp_debug = true`
2. Recargar la página

### Pasos

### Caso A — Orden “malo” (paletize arriba, define_point abajo)
1. Crear un bloque **Paletizado** que use:
   - `PALLET_P1 = puntoA`
   - `PALLET_P2 = puntoB`
   - `PALLET_P3 = puntoC`
2. En un stack separado (y/o más abajo), crear tres `define_point`:
   - `puntoA = (X=50, Y=50, Z=220)`
   - `puntoB = (X=100, Y=300, Z=150)`
   - `puntoC = (X=300, Y=300, Z=150)`
3. Generar programa (o exportar JSON) y comprobar que:
   - `pallet_p1/p2/p3` contienen **esas coordenadas** (no ceros).
4. Guardar el workspace a XML (Export).
5. Recargar la página y cargar el XML (Import).
6. Volver a generar programa y comprobar:
   - `pallet_p1/p2/p3` siguen con las mismas coordenadas.
   - NO aparecen fallbacks tipo `pallet_base_x = 0` o `step_x = 0.110` si no corresponde.

### Caso B — define_point arriba (control)
1. Repetir el flujo pero colocando `define_point` por encima del paletizado.

**Resultado esperado**
- En ambos casos, `pallet_p1/p2/p3` mantienen coordenadas correctas tras recargar XML.
- No se aplican fallbacks por pérdida de puntos.

#### Test 9 — Registries en vivo (define_* → dropdowns y resolución inmediata)

**Objetivo**
Verificar que al **crear / editar / borrar** bloques `define_point`, `define_pose` y/o `define_frame`, los registries se actualizan automáticamente y los dropdowns / resolución `use_*` reflejan el cambio **sin recargar** ni “generar dos veces”.

**Precondición**
Workspace vacío o con un programa simple.

### Caso A — Alta (create)
1. Añade un bloque de paletizado (o cualquier bloque que use `use_point`) y selecciona un nombre que aún NO exista (p. ej. `pA`) o deja el selector abierto.
2. Crea un bloque `define_point` con:
   - `NAME = pA`
   - `X=50, Y=50, Z=220`
3. Espera ~0.1 s (debounce).
**Resultado esperado**
- `pA` aparece en el dropdown de `use_point` (sin recargar).
- Al generar programa / código, `use_point(pA)` se resuelve con esas coordenadas (no fallback).

### Caso B — Edición (change)
1. Con `define_point` `pA` ya creado, cambia sus coordenadas:
   - `X=60, Y=55, Z=210`
2. Espera ~0.1 s.
3. Vuelve a generar programa / código.
**Resultado esperado**
- La resolución de `pA` usa los nuevos valores (60,55,210) inmediatamente.

### Caso C — Renombrado (change NAME)
1. Cambia `NAME` de `pA` a `pA2`.
2. Espera ~0.1 s.
**Resultado esperado**
- `pA2` aparece en dropdown.
- `pA` desaparece del dropdown (o deja de ser seleccionable si ya estaba seleccionado).
- Si algún `use_point` estaba apuntando a `pA`, debe quedar “no resuelto” o forzar reselección (según comportamiento actual), pero **no** debe resolver a coordenadas equivocadas.

### Caso D — Borrado (delete)
1. Elimina el bloque `define_point` `pA2`.
2. Espera ~0.1 s.
3. Abre el dropdown de `use_point`.
**Resultado esperado**
- `pA2` ya no aparece.
- Si un bloque seguía referenciando `pA2`, al generar programa/código:
  - no debe “inventar” valores antiguos
  - debe caer al comportamiento de “no resuelto / fallback” coherente con el sistema actual, pero sin valores fantasma.

**Notas**
- Este test valida el listener + debounce y el uso determinista de registries locales durante `workspaceToProgram`.
- Si el dropdown no se actualiza, revisar `updatePosePointDropdowns()` y que el listener esté registrado sobre el `workspace` real.

#### Test 10 — Determinismo del compiler (workspaceToProgram)

**Objetivo**
Verificar que `workspaceToProgram(workspace)` produce siempre el mismo `plannedSteps`
para un mismo workspace, independientemente del estado previo de los registries
o del orden de ejecución.

**Precondición**
Workspace con un programa que incluya:
- al menos un `define_point`
- un bloque que use `use_point`
- un movimiento o paletizado

### Pasos
1. Generar el programa por primera vez.
2. Copiar el JSON completo de `plannedSteps`.
3. Generar el programa nuevamente sin modificar el workspace.
4. Comparar el JSON generado.

**Resultado esperado**
- El JSON de `plannedSteps` es **idéntico** en ambas ejecuciones.

### Verificación adicional
1. Añadir un bloque nuevo que **no esté relacionado** con los puntos.
2. Generar el programa nuevamente.

**Resultado esperado**
- Los pasos que ya existían en `plannedSteps` **no cambian**.

**Notas**
Este test valida que el compiler utiliza registries reconstruidos
y no depende del estado global previo.

#### Test 11 — Coherencia compiler ↔ simulador

**Objetivo**
Verificar que los `plannedSteps` generados por el compiler
son ejecutados correctamente por el simulador.

**Precondición**
Programa Blockly con:
- al menos 2 movimientos
- una acción de herramienta (gripper_close / gripper_open)
- un wait

### Pasos
1. Generar el programa (`plannedSteps`).
2. Ejecutar el simulador con ese programa.
3. Observar la ejecución paso a paso.

**Resultado esperado**
El simulador debe ejecutar en este orden:
1. Movimiento inicial
2. Acción de herramienta (cerrar pinza)
3. Espera (`wait`)
4. Acción de herramienta (abrir pinza)
5. Movimiento final

### Verificación adicional
Comparar:
- número de pasos en `plannedSteps`
- número de pasos ejecutados por el simulador

**Resultado esperado**
Ambos números coinciden y el orden es el mismo.

**Notas**
Este test valida que `simulator.js` interpreta correctamente `move`, `tool` y `wait`
y que no se pierden pasos durante la ejecución.

#### Test 12 — Paletizado con 3 puntos (pallet girado)

**Objetivo**
Verificar que el paletizado usa correctamente P1/P2/P3 y respeta la rotación implícita.

**Precondición**
Programa con `define_point` y un bloque de paletizado configurado con P1/P2/P3.

### Pasos
1. Crear `define_point` P1, P2, P3 con un pallet claramente girado:
   - P1 = (100, 200, 150)
   - P2 = (150, 210, 150)   // dx = (50,10,0)
   - P3 = (90, 240, 150)    // dy = (-10,40,0)
2. Configurar paletizado rows=2 cols=2 layers=1.
3. Generar plannedSteps y verificar (al menos) que la celda (row=1,col=1) resulta en:
   - (140, 250, 150)  // P1 + dx + dy

**Resultado esperado**
- Las posiciones NO están alineadas a ejes puros (no es base_x + step_x),
  sino que siguen la rotación implícita de dx/dy.
- No aparecen fallbacks de pallet_base_x=0 ni step_x=0.110 si P1/P2/P3 están definidos.

### 🐛 Problemas Conocidos a Verificar

1. **Orden de transformación**: Verificar que rotación + traslación se aplican en orden correcto
2. **Cuaterniones ABB**: Validar conversión Euler → Quaternion
3. **Frames anidados**: Sistema actual no soporta frames relativos a otros frames (documentado como limitación)
4. **Dropdown dinámico**: Verificar que dropdown de use_frame se actualiza al definir nuevos frames

### 📊 Checklist Final

- [ ] Test 1: Definición básica
- [ ] Test 2: Uso en movimientos
- [ ] Test 3: Cambio de frame activo
- [ ] Test 4: Frame con rotación
- [ ] Test 5: Simulador 3D
- [ ] Test 6: Zona configurable
- [ ] Test 7: Paletizado con frames
- [ ] Test 8: Persistencia de puntos (PALLET_P1/P2/P3)
- [ ] Test 9 (Registries en vivo) pasado
- [ ] Test 10 (Determinismo del compiler) pasado
- [ ] Test 11 (Coherencia compiler ↔ simulador) pasado
- [ ] Test 12 (Palet girado con P1/P2/P3) pasado
- [ ] Código educativo legible
- [ ] Código UR3e ejecutable
- [ ] Código ABB ejecutable
- [ ] Código Fanuc ejecutable
- [ ] Sin errores en consola del navegador
- [ ] Documentación actualizada

### 🎯 Criterios de Aceptación

**Mínimo viable**:
- Frames se definen y almacenan correctamente
- use_frame cambia contexto de coordenadas
- Código industrial es sintácticamente correcto
- Simulador muestra transformaciones básicas

**Calidad completa**:
- Transformaciones con rotación funcionan correctamente
- Visualización 3D de frames es clara
- Código generado es ejecutable en robots reales
- Todos los casos de prueba pasan sin errores

---

## 🚀 Próximos Pasos

1. Ejecutar navegador y realizar Tests 1-7
2. Documentar cualquier bug encontrado
3. Ajustar implementación según resultados
4. Actualizar documentación con limitaciones/características
5. Marcar Fase 9 como completada
