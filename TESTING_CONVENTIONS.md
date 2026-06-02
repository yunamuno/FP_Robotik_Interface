# Testing Conventions

## Objetivo
Garantizar que **todos los artefactos de test** sean identificables y eliminables de forma segura con `cleanupTestArtifacts()`.

## Prefijos obligatorios

### `snapshot_id`
Usar siempre:
- `t_snap_<uid>`

Generador recomendado:
- `TestHelpers.createTestSnapshotId(name?)`

### `run_id`
Usar siempre:
- `t_run_<uid>`

Generador recomendado:
- `TestHelpers.createTestRunId(name?)`

### `program_name`
Usar siempre:
- `TEST_<NOMBRE_DEL_TEST>`

Generador recomendado:
- `TestHelpers.createTestProgramName(name)`

## Reglas de implementación
1. No crear IDs arbitrarios en tests nuevos.
2. Reutilizar `TestHelpers` para IDs y nombres.
3. Mantener `run_mqtt_live` solo cuando el test lo requiera por compatibilidad del flujo productivo.
4. Para runs/snapshots auxiliares, usar IDs de prueba con prefijo obligatorio.

## Compatibilidad con cleanup seguro
`tests/utils/test_cleanup.js` solo borra automáticamente por prefijo de ID:
- `t_`
- `test_`
- `tmp_test_`

`program_name` con prefijo `TEST_` o `TMP_TEST_` se usa para preview/diagnóstico y no fuerza borrado por sí solo.

## Ejemplos
- `snapshot_id`: `t_snap_mqtt_other_program_1_id_1713379200000_ab12cd`
- `run_id`: `t_run_cleanup_validation_id_1713379200000_ef34gh`
- `program_name`: `TEST_MQTT_UNKNOWN_SNAPSHOT`
