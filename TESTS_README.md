# Tests README

Guía rápida para ejecutar y mantener la infraestructura de tests del simulador.

## 1) Activar `fp_debug`

Los tests solo se cargan en modo debug.

```javascript
localStorage.setItem('fp_debug', 'true');
location.reload();
```

Para desactivar:

```javascript
localStorage.removeItem('fp_debug');
location.reload();
```

## 2) Suites disponibles

- `mqtt`: validaciones de telemetría MQTT endurecida.
- `idb`: validación de utilidades de limpieza/preview en IndexedDB.
- `comparison`: validación de comparación persistida (`comparePersistedRun`).

## 3) Ejecución desde consola

En `simulator.html` (con debug activo):

```javascript
await TestSuite.runMqttSuite();
await TestSuite.runIdbSuite();
await TestSuite.runComparisonSuite();
await TestSuite.runAllSuites();
```

## 4) Qué significa modo `isolated`

`runComparisonSuite` usa modo aislado por defecto (`isolated=true`):
- crea artefactos de test propios (`run/snapshot/program`) con prefijos de test
- evita depender de datos reales existentes

Puedes desactivarlo si quieres probar contra un run real:

```javascript
await TestSuite.runComparisonSuite({ isolated: false, runId: 'run_mqtt_live' });
```

## 5) Preview y limpieza de artefactos de test

```javascript
await TestSuite.previewCleanup();
await TestSuite.cleanupTestsDry();
await TestSuite.cleanupTests();
```

- `previewCleanup`: muestra candidatos sin borrar.
- `cleanupTestsDry`: simulación de limpieza (`dryRun`).
- `cleanupTests`: elimina artefactos de test seguros.

## 6) Convención de IDs de test (obligatoria)

- `snapshot_id`: `t_snap_<uid>`
- `run_id`: `t_run_<uid>`
- `program_name`: `TEST_<NOMBRE>`

Helpers recomendados:
- `TestHelpers.createTestSnapshotId(name?)`
- `TestHelpers.createTestRunId(name?)`
- `TestHelpers.createTestProgramName(name)`

Ver detalle en `TESTING_CONVENTIONS.md`.

## 7) Advertencias básicas

- MQTT usa broker externo (`broker.emqx.io`): puede fallar por red/disponibilidad.
- Los tests escriben en IndexedDB local del navegador.
- No ejecutar suites de test en entornos de producción.
- La limpieza solo elimina artefactos con prefijos explícitos de test (no datos reales).

## 8) Regresiones de generación y simulación (Node)

### Generación UR

- `variables_while_generation_regression.js`: verifica que los bloques de variables se generan correctamente dentro y fuera de bucles `while` en UR industrial. Cubre la inicialización de contador, la condición del `while` y el incremento dentro del cuerpo del bucle.

### Simulación (intérprete JSON neutral)

- `sim_while_variable_counter_regression.js`: verifica que el intérprete del simulador ejecuta correctamente bucles `while` con variable contador. Cubre:
  - Condición `i < 3` con incremento `i = i + 1` → 3 iteraciones, `i` final = 3.
  - Condición `i <= 3` con incremento `i = i + 1` → 4 iteraciones, `i` final = 4.
  - Detección de bucle infinito: corte por `SIM_MAX_WHILE_ITERATIONS` y warning de posible bucle infinito.
  - Regresión histórica: valida que NO aparezcan "condición desconocida" ni "WHILE terminado tras 0 ciclo(s)" en casos válidos.

### Ejecución completa

Todos estos tests forman parte del barrido general:

```powershell
node tests/run_all_regressions.js
```
