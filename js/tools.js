/*═══════════════════════════════════════════════════════════════════════════════
  TOOL LIBRARY - tools.js

  Define herramientas avanzadas (URCap, IO, etc.) para acciones de pinza.
  Nota: verificar disponibilidad de rg_grip en la URCap del centro.
═══════════════════════════════════════════════════════════════════════════════*/

window.ToolLibrary = {
  onrobot_rg2_urcap: {
    id: 'onrobot_rg2_urcap',
    type: 'urcap',
    supportedRobots: ['UR'],
    name: 'OnRobot RG2 (URCap)',
    tcp: { x: 0, y: 0, z: 158, rx: 0, ry: 0, rz: 0 },
    // defaults contiene todos los parámetros físicos de la pinza.
    // actions solo describe qué acción ejecutar; el generador resuelve
    // fromDefaults usando defaults.openWidth/openForce o defaults.closeWidth/closeForce.
    // No usar plantillas URScript aquí. El generador debe usar actions + buildRg2GripCommand.
    defaults: {
      openWidth: 110,
      openForce: 10,
      closeWidth: 50,
      closeForce: 40
    },
    actions: {
      open:  { type: 'rg_grip', fromDefaults: 'open' },
      close: { type: 'rg_grip', fromDefaults: 'close' }
    },
    ur: {
      profiles: {
        rg2_urcap_rg_grip: {
          fnName: 'rg_grip',
          args: ['width_mm', 'force']
        }
      }
    }
  }
};
