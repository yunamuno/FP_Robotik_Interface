# Sistema de Poses y Puntos Guardados (v2.6)

## ✅ Implementación Completada

Se ha implementado un sistema completo para **definir, guardar y reutilizar poses y puntos** en el simulador de robot.

---

## 🎯 ¿Qué hace ahora el bloque "Nombre pose"?

### **ANTES** ❌
- El bloque `define_pose` solo generaba comentarios
- Los valores NO se guardaban
- No se podían reutilizar

### **AHORA** ✅
- Los valores **se guardan automáticamente** en un almacén global
- Puedes **reutilizar las poses** con el bloque "Usar Pose"
- Se actualizan dinámicamente las opciones disponibles

---

## 📦 Nuevos Bloques Disponibles

### En la categoría **"Poses/Puntos"** encontrarás:

#### 1️⃣ **Definir Pose** (ya existía, ahora funcional)
```
Nombre pose: home
X: 0    Y: 300    Z: 150
Rx: 0   Ry: 180   Rz: 0
```
- Define una pose completa (posición + orientación)
- Se guarda automáticamente con el nombre especificado

#### 2️⃣ **Definir Punto** (ya existía, ahora funcional)
```
Nombre punto: punto1
X: 100    Y: 200    Z: 150
```
- Define solo una posición (sin orientación)
- Se guarda automáticamente con el nombre especificado

#### 3️⃣ **Usar Pose** ⭐ NUEVO
```
Usar Pose: [dropdown con poses guardadas]
```
- Recupera todos los valores (X, Y, Z, Rx, Ry, Rz) de una pose previamente definida
- El dropdown se actualiza automáticamente con las poses disponibles

#### 4️⃣ **Usar Punto** ⭐ NUEVO
```
Usar Punto: [dropdown con puntos guardados]
```
- Recupera los valores (X, Y, Z) de un punto previamente definido
- El dropdown se actualiza automáticamente con los puntos disponibles

---

## 🚀 Ejemplo de Uso

### Paso 1: Definir poses/puntos
```blockly
1. Nombre pose: home
   X: 0, Y: 300, Z: 150
   Rx: 0, Ry: 180, Rz: 0

2. Nombre punto: encima_pieza
   X: 200, Y: 150, Z: 200

3. Nombre pose: agarrar
   X: 200, Y: 150, Z: 100
   Rx: 0, Ry: 180, Rz: 0
```

### Paso 2: Usar las poses/puntos guardados
```blockly
1. Mover Articular a [Usar Pose: home]
2. Mover Lineal a [Usar Punto: encima_pieza]
3. Mover Lineal a [Usar Pose: agarrar]
4. Activar pinza (set_do)
5. Mover Lineal a [Usar Punto: encima_pieza]
6. Mover Articular a [Usar Pose: home]
```

---

## 💾 ¿Dónde se guardan?

Los valores se guardan en **objetos globales en memoria** dentro de `js/blocks.js`:

```javascript
const savedPoses = {};   // {nombre: {x, y, z, rx, ry, rz}}
const savedPoints = {};  // {nombre: {x, y, z}}
```

### 🔄 Actualización Automática
- En cada cambio en Blockly, `workspaceToProgram()` (en `js/blocks.js`) reprocesa todo
- Los almacenes se limpian y se repueblan con las definiciones actuales
- Los dropdowns de "Usar Pose/Punto" se actualizan con `updatePosePointDropdowns(workspace)`

---

## 📝 Generación de Código

### Modo Educativo:
```
Definir Pose: home (X: 0, Y: 300, Z: 150, Rx: 0, Ry: 180, Rz: 0)
Usar Pose: home → (X: 0, Y: 300, Z: 150, Rx: 0, Ry: 180, Rz: 0)
```

### Modo Industrial (URScript):
```python
# Pose definida: home (X: 0, Y: 300, Z: 150, Rx: 0, Ry: 180, Rz: 0)
# Usando Pose: home (X: 0, Y: 300, Z: 150, Rx: 0, Ry: 180, Rz: 0)
movel(p[0.0, 0.3, 0.15, 0, 3.14, 0], a=1.2, v=0.100)
```

### Modo Industrial (ABB RAPID):
```
! Pose definida: home (X: 0, Y: 300, Z: 150, Rx: 0, Ry: 180, Rz: 0)
! Usando Pose: home (X: 0, Y: 300, Z: 150, Rx: 0, Ry: 180, Rz: 0)
CONST robtarget p1:=[[0.00,300.00,150.00],[0,1,0,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]];
MoveL p1, v100, z50, tool0\WObj:=wobj0;
```

---

## 🔧 Detalles Técnicos

### Flujo de Datos (actual):
1. **Blockly UI** → Usuario define poses/puntos
2. **`blockToJSON()` en `js/blocks.js`** → Convierte el bloque y guarda en `savedPoses`/`savedPoints`
3. **`workspaceToProgram()` en `js/blocks.js`** → Limpia y repuebla almacenes al procesar todo
4. **`updatePosePointDropdowns()` en `js/blocks.js`** → Actualiza dropdowns dinámicos
5. **`generateCodeForSelectedRobot()` en `js/generators.js`** → Genera código con valores ya resueltos

### Compatibilidad:
- ✅ UR3e (URScript)
- ✅ ABB IRC5 (RAPID)
- ✅ Fanuc LR Mate (TP)
- ✅ Simulador 3D

---

## 🎨 Ventajas del Sistema

### ✨ Reutilización
- Define una vez, usa muchas veces
- Cambias el valor en un solo lugar

### 🔄 Dinámico
- Los dropdowns se actualizan automáticamente
- No necesitas recargar la página

### 📊 Organización
- Código más limpio y mantenible
- Fácil identificar posiciones importantes

### 🛡️ Seguridad
- Reduces errores de transcripción
- Consistencia en valores críticos

---

## 🐛 Notas Importantes

1. **Las poses/puntos se pierden al recargar la página** (no hay persistencia)
2. **Debes definir las poses ANTES de usarlas** (el orden de bloques importa)
3. **Los nombres distinguen mayúsculas/minúsculas** ("Home" ≠ "home")
4. **Si no hay poses/puntos definidos**, el dropdown mostrará "(ninguna pose definida)" o "(ningún punto definido)"
5. **En simulación**, los valores se aplican en el simulador 3D; la validación es interna (ver `EXPLICACION_GUARDADO_PUNTOS.md`)

---

## 🎓 Casos de Uso Típicos

### 🏭 Pick & Place
```
Definir: home, encima_origen, agarrar_origen, encima_destino, soltar_destino
Secuencia: home → encima_origen → agarrar → agarrar_origen → encima_origen 
          → encima_destino → soltar_destino → encima_destino → home
```

### 🔨 Soldadura
```
Definir: home, inicio_soldadura, fin_soldadura
Secuencia: home → inicio_soldadura → [encender antorcha] 
          → mover lineal a fin_soldadura → [apagar] → home
```

### 📦 Paletizado
```
Definir: home, capa1_pos1, capa1_pos2, capa2_pos1, capa2_pos2
Loop: Para cada posición → mover → soltar → regresar
```

---

## 📞 Soporte

Si encuentras problemas:
1. Abre la consola del navegador (F12)
2. Busca mensajes de error
3. Verifica que las poses estén definidas antes de usarlas
4. Comprueba que los nombres coincidan exactamente
