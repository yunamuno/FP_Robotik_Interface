# Proyecto Modularizado - Programación Visual de Robots

## 📁 Estructura del Proyecto

```
proyecto/
├── index.html                    # Interfaz principal
├── simulator.html                # Simulador 3D
├── style.css                     # Estilos principales
├── simulator.style.css           # Estilos del simulador
├── simulator.js                  # Lógica del simulador
├── POSES_PUNTOS_README.md       # Documentación de poses/puntos
├── MODULARIZACIÓN.md            # Este archivo
├── js/                          # Scripts modulares (NUEVO)
│   ├── config.js               # Constantes y configuración global
│   ├── blocks.js               # Definición y procesamiento de bloques
│   ├── generators.js           # Generadores de código por robot
│   ├── ui.js                   # Interfaz de usuario y persistencia
│   └── main.js                 # Orquestación principal
└── script.js (OBSOLETO)         # Archivo monolítico original (mantener como backup)
```

## 🎯 Descripción de Módulos

### **1. config.js** (~115 líneas)
**Responsabilidad:** Configuración global y utilidades matemáticas

**Contenido:**
- `CONSTANTS`: Constantes del sistema (robots, modos, tipos de bloques)
- `ROBOT_REACH_LIMITS`: Límites de alcance por robot
- `SINGULARITY_THRESHOLD_Y_MM`: Umbral de singularidad
- `TOOL_DATABASE`: Base de datos de herramientas
- `dist3()`: Cálculo de distancia euclidiana
- `warnIfOutOfReach()`: Validación de alcance
- `checkSingularityWarning()`: Detección de singularidades
- `eulerToQuaternion()`: Conversión de ángulos
- `currentDefaultSpeed()`: Obtención de velocidad

**Dependencias:** Ninguna (módulo base)

---

### **2. blocks.js** (~540 líneas)
**Responsabilidad:** Definición y procesamiento de bloques Blockly

**Contenido:**
- `savedPoses` / `savedPoints`: Almacenamiento global
- `defineBlocks()`: Define todos los bloques visuales
- `Blockly.Blocks['use_pose']`: Bloque dinámico de poses
- `Blockly.Blocks['use_point']`: Bloque dinámico de puntos
- `Blockly.Blocks['set_tool']`: Bloque dinámico de herramientas
- `getVal()`: Extracción de valores de bloques
- `blockToJSON()`: Conversión bloque → JSON
- `workspaceToProgram()`: Conversión workspace → programa
- `updatePosePointDropdowns()`: Actualización de dropdowns
- `updateBlockWarnings()`: Advertencias de singularidad
- `updateToolWarnings()`: Advertencias de compatibilidad

**Dependencias:** 
- `config.js` (CONSTANTS, TOOL_DATABASE, checkSingularityWarning)

---

### **3. generators.js** (~350 líneas)
**Responsabilidad:** Generación de código específico por robot

**Contenido:**
- `generateCodeForSelectedRobot()`: Router principal
- **Modo Educativo:** Pseudocódigo en español
- **UR3e:** URScript (Python-like)
- **ABB IRC5:** RAPID (lenguaje ABB)
- **Fanuc:** TP (Teach Pendant)

**Características:**
- Manejo de bloques de movimiento (J, L, C)
- Configuración de herramientas TCP
- Control de E/S digitales
- Advertencias de alcance y singularidades

**Dependencias:**
- `config.js` (CONSTANTS, warnIfOutOfReach, checkSingularityWarning, eulerToQuaternion, currentDefaultSpeed)
- `blocks.js` (TOOL_DATABASE indirectamente)

---

### **4. ui.js** (~220 líneas)
**Responsabilidad:** Interfaz de usuario y persistencia

**Contenido:**
- `showToast()`: Notificaciones temporales
- `initSplitters()`: Splitters horizontales (Config ↔ Bloques ↔ JSON/Código)
- `initVerticalSplitter()`: Splitter vertical (Educativo ↔ Industrial)
- `downloadWorkspaceAsXML()`: Exportar workspace a XML
- `loadWorkspaceFromXML()`: Importar workspace desde XML

**Características:**
- Validación de límites de viewport
- Confirmación antes de sobrescribir
- Manejo de errores de parseo XML
- Timestamps automáticos en archivos guardados

**Dependencias:**
- `Blockly` (biblioteca externa)

---

### **5. main.js** (~180 líneas)
**Responsabilidad:** Orquestación y punto de entrada

**Contenido:**
- `workspace`: Variable global del workspace
- `updateOutputs()`: Actualización de toda la interfaz
- `window.onPanelsResized`: Manejador de redimensionamiento
- **Event Listeners:**
  - Cambios en el workspace
  - Cambio de robot/modo/velocidad
  - Botones: copiar, simular, guardar, cargar
- Carga de bloques de ejemplo
- Inicialización de Blockly

**Flujo de Ejecución:**
```
1. window.load →
2. initSplitters() / initVerticalSplitter() →
3. defineBlocks() →
4. Blockly.inject() →
5. Cargar XML de ejemplo →
6. updateOutputs() →
7. Escuchar eventos
```

**Dependencias:**
- `config.js` (CONSTANTS)
- `blocks.js` (defineBlocks, workspaceToProgram, updateBlockWarnings, updateToolWarnings)
- `generators.js` (generateCodeForSelectedRobot)
- `ui.js` (showToast, initSplitters, initVerticalSplitter, downloadWorkspaceAsXML, loadWorkspaceFromXML)

---

## 🔄 Orden de Carga en HTML

```html
<script src="js/config.js"></script>       <!-- 1. Base: constantes -->
<script src="js/blocks.js"></script>       <!-- 2. Definiciones de bloques -->
<script src="js/generators.js"></script>   <!-- 3. Generadores de código -->
<script src="js/ui.js"></script>           <!-- 4. Interfaz de usuario -->
<script src="js/main.js"></script>         <!-- 5. Orquestación final -->
```

⚠️ **IMPORTANTE:** El orden de carga es crítico debido a las dependencias entre módulos.

---

## ✅ Ventajas de la Modularización

### **Antes (Monolítico)**
- ❌ 1 archivo de 1544 líneas
- ❌ 32 secciones mezcladas
- ❌ Difícil de navegar
- ❌ Búsqueda lenta
- ❌ Conflictos en Git

### **Después (Modular)**
- ✅ 5 archivos de 115-540 líneas
- ✅ Responsabilidades claras
- ✅ Navegación sencilla
- ✅ Búsqueda rápida
- ✅ Sin conflictos en colaboración

### **Comparación de Líneas**
```
config.js      :  115 líneas  (  7.5%)
blocks.js      :  540 líneas  ( 35.0%)
generators.js  :  350 líneas  ( 22.7%)
ui.js          :  220 líneas  ( 14.2%)
main.js        :  180 líneas  ( 11.7%)
─────────────────────────────────────
TOTAL          : 1405 líneas  (91.0% del original)
```

*Nota: La reducción del 9% se debe a la eliminación de comentarios redundantes y código duplicado.*

---

## 🚀 Cómo Usar

### **Desarrollo**
1. Edita el módulo específico según la funcionalidad
2. Guarda el archivo
3. Recarga el navegador (F5)
4. No requiere build ni compilación

### **Agregar un Nuevo Robot**
1. **config.js**: Añadir entrada a `CONSTANTS.ROBOTS` y `ROBOT_REACH_LIMITS`
2. **generators.js**: Añadir caso en `generateCodeForSelectedRobot()`
3. **index.html**: Añadir opción al `<select id="robotSelect">`

### **Agregar un Nuevo Bloque**
1. **blocks.js**: 
   - Añadir definición en `Blockly.defineBlocksWithJsonArray()`
   - Añadir caso en `blockToJSON()`
2. **generators.js**: Añadir manejo en cada generador (educativo/UR3e/ABB/Fanuc)
3. **index.html**: Añadir al `<xml id="toolbox">` en la categoría apropiada

### **Debugging**
- Cada módulo tiene su propio espacio de nombres
- Usa `console.log()` en el módulo específico
- Los errores mostrarán el archivo exacto en DevTools
- Las variables globales están declaradas explícitamente

---

## 📊 Grafo de Dependencias

```
                    config.js
                        ↓
                    blocks.js
                    ↙       ↘
         generators.js     ui.js
                    ↘       ↙
                    main.js
```

---

## 🔧 Mantenimiento

### **Código Limpio**
- ✅ Sin emojis en comentarios
- ✅ Secciones renumeradas secuencialmente (001-032)
- ✅ Índice completo al inicio de cada archivo
- ✅ Comentarios en español
- ✅ Nombres de variables descriptivos

### **Testing**
```javascript
// Probar config.js
console.log(CONSTANTS.ROBOTS.UR3E);  // → 'UR3e'
console.log(dist3(3, 4, 0));         // → 5

// Probar blocks.js
console.log(Object.keys(savedPoses));  // → Array de nombres

// Probar generators.js
console.log(typeof generateCodeForSelectedRobot);  // → 'function'
```

### **Rollback**
Si hay problemas con la versión modular:
1. Renombrar `script.js` a `script.backup.js`
2. Comentar las 5 líneas de carga en `index.html`
3. Descomentar `<script src="script.js"></script>`

---

## 📝 Notas Técnicas

### **Variables Globales**
- `CONSTANTS`, `ROBOT_REACH_LIMITS`, `SINGULARITY_THRESHOLD_Y_MM`, `TOOL_DATABASE` (config.js)
- `savedPoses`, `savedPoints` (blocks.js)
- `workspace` (main.js, dentro del scope de window.load)

### **Funciones Globales**
Todas las funciones están en el scope global para compatibilidad entre módulos.

### **Sin Bundler**
Este proyecto NO usa Webpack, Rollup, ni Vite. Los scripts se cargan directamente en el navegador.

### **Compatibilidad**
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

---

## 🎓 Para Aprender Más

- **Blockly Docs**: https://developers.google.com/blockly
- **URScript Manual**: https://www.universal-robots.com/articles/ur/programming/
- **RAPID Reference**: https://library.e.abb.com/public/
- **Fanuc TP**: https://www.fanuc.com/

---

## 👥 Contribuciones

Al modificar el código:
1. Mantén la estructura modular
2. Actualiza los comentarios
3. Prueba en los 3 robots (UR3e, ABB, Fanuc)
4. Verifica que no hay errores en DevTools
5. Actualiza este README si cambias la estructura

---

**Última Actualización:** 15 de diciembre de 2025  
**Versión:** 2.0 (Modularizada)
