# 🎯 Implementación del Bloque IF-THEN-ELSE

## 📋 Resumen

Se ha implementado el bloque condicional `Si...Entonces...Sino` con soporte completo para:
- ✅ **Código Educativo** (pseudocódigo en español)
- ✅ **UR3e** (URScript)
- ✅ **ABB IRC5** (RAPID)
- ✅ **Fanuc** (TP - Teach Pendant)

---

## 🧩 Bloques Añadidos

### 1️⃣ **Bloque IF mejorado**
```
Si [condición] entonces
  [acciones cuando verdadero]
sino
  [acciones cuando falso] (opcional)
```

### 2️⃣ **Bloque de Lectura de DI como Condición**
```
DI[1] está en [ON/OFF]
```
Devuelve verdadero/falso según el estado de la entrada digital.

### 3️⃣ **Bloque Comparador**
```
[valor A] [operador] [valor B]
```
Operadores: `=`, `≠`, `>`, `<`, `≥`, `≤`

### 4️⃣ **Bloque Booleano**
```
[verdadero / falso]
```
Valor booleano constante.

---

## 💡 Ejemplos de Uso

### **Ejemplo 1: Control Simple de Entrada**
**Diagrama de Bloques:**
```
┌─────────────────────────────────────┐
│ Si DI[1] está en ON entonces:       │
│   ├─ Poner DO[1] en ON              │
│   └─ Esperar 2 segundos             │
│ sino:                                │
│   └─ Poner DO[1] en OFF             │
└─────────────────────────────────────┘
```

**Salida - Código Educativo:**
```
Si DI[1] está en ON entonces:
  Poner Salida 1 en ON
  Esperar 2 segundos
Sino:
  Poner Salida 1 en OFF
Fin Si
```

**Salida - UR3e (URScript):**
```python
if (get_standard_digital_in(1) == True):
  set_standard_digital_out(1, True)
  sleep(2)
else:
  set_standard_digital_out(1, False)
end
```

**Salida - ABB IRC5 (RAPID):**
```rapid
IF (DInput(di1) = 1) THEN
  SetDO do1, 1;
  WaitTime 2;
ELSE
  SetDO do1, 0;
ENDIF
```

**Salida - Fanuc (TP):**
```fanuc
 3:  IF DI[1]=ON THEN ;
 4:    DO[1]=ON ;
 5:    WAIT 2.00 SEC ;
 6:  ELSE ;
 7:    DO[1]=OFF ;
 8:  ENDIF ;
```

---

### **Ejemplo 2: Movimiento Condicional**
**Diagrama de Bloques:**
```
┌─────────────────────────────────────┐
│ Si DI[5] está en ON entonces:       │
│   └─ Mover Lineal a Punto "home"    │
│ sino:                                │
│   └─ Mover Articular a Punto "safe" │
└─────────────────────────────────────┘
```

**Salida - Código Educativo:**
```
Si DI[5] está en ON entonces:
  Mover Lineal a (X: 300, Y: 0, Z: 400) a 100 mm/s (usando punto: "home")
Sino:
  Mover Articular a (X: 0, Y: 200, Z: 500) al 50% (usando punto: "safe")
Fin Si
```

**Salida - UR3e (URScript):**
```python
if (get_standard_digital_in(5) == True):
  movel(p[0.300, 0.000, 0.400, 0, 3.14, 0], a=1.2, v=0.100)
else:
  movej(p[0.000, 0.200, 0.500, 0, 3.14, 0], a=1.4, v=0.50)
end
```

---

### **Ejemplo 3: Comparación Numérica (Avanzado)**
**Diagrama de Bloques:**
```
┌─────────────────────────────────────┐
│ Variable contador = 10               │
│ Si contador > 5 entonces:            │
│   └─ Poner DO[2] en ON              │
└─────────────────────────────────────┘
```

**Salida - Código Educativo:**
```
Variable contador = 10
Si 10 > 5 entonces:
  Poner Salida 2 en ON
Fin Si
```

---

## 🔧 Detalles Técnicos

### **Estructura JSON Interna**
Cuando se serializa un bloque IF, se genera esta estructura:

```json
{
  "type": "if_block",
  "condition": {
    "type": "read_di_block",
    "pin": 1,
    "state": "1"
  },
  "do": [
    {
      "type": "set_do_block",
      "pin": 1,
      "state": "1"
    }
  ],
  "else": [
    {
      "type": "set_do_block",
      "pin": 1,
      "state": "0"
    }
  ],
  "next": null
}
```

### **Funciones Auxiliares de Generación**

Se han creado 4 funciones auxiliares para formatear condiciones:

1. **`formatConditionEducational(cond)`** → Español legible
2. **`formatConditionUR(cond)`** → URScript (Python-like)
3. **`formatConditionRAPID(cond)`** → RAPID (ABB)
4. **`formatConditionFanuc(cond)`** → TP (Fanuc)

Cada función traduce:
- `read_di_block` → Lectura de entrada digital
- `logic_compare` → Comparación entre valores
- `logic_boolean` → Constante verdadero/falso

---

## 🎨 Diferencias Clave entre Código Educativo vs Industrial

| Aspecto | Educativo | Industrial (UR/ABB/Fanuc) |
|---------|-----------|---------------------------|
| **Legibilidad** | Español completo | Sintaxis del fabricante |
| **Condiciones** | "DI[1] está en ON" | `get_standard_digital_in(1) == True` |
| **Estructura** | `Si...Entonces...Sino...Fin Si` | `if...else...end` / `IF...THEN...ELSE...ENDIF` |
| **Indentación** | Visual (espacios) | Sintáctica (requerida) |
| **Objetivo** | Enseñanza de lógica | Ejecutable en robot real |

---

## 🚀 Próximos Pasos Recomendados

Para una interfaz multi-robot **completa y realista**, considera añadir:

### **Fase 2 - Control de Flujo Avanzado:**
1. ✅ **While loop** - `Mientras [condición] hacer...`
2. ✅ **For loop** - `Para i desde 1 hasta 10...`
3. ✅ **Break/Continue** - Salir de bucles

### **Fase 3 - Operadores Lógicos:**
4. ✅ **AND/OR/NOT** - Combinar condiciones
   ```
   Si (DI[1] está ON) Y (DI[2] está OFF) entonces...
   ```

### **Fase 4 - E/S Avanzadas:**
5. ✅ **Leer AI** (analógica) - Valores 0-10V
6. ✅ **Escribir AO** - Control proporcional
7. ✅ **Pulsos DO** - Señales temporales

### **Fase 5 - Gestión de Errores:**
8. ✅ **Try-Catch** - Manejo de excepciones
9. ✅ **Parada de emergencia condicional**

---

## 📚 Documentación de Referencia

- **UR3e URScript**: [https://www.universal-robots.com/articles/ur/programming/](https://www.universal-robots.com/articles/ur/programming/)
- **ABB RAPID**: Manual técnico IRC5
- **Fanuc TP**: R-30iA/R-30iB Programming Manual

---

## ✅ Checklist de Validación

- [x] Bloque IF definido en `blocks.js`
- [x] Bloques de condición (DI, comparador, booleano) añadidos
- [x] Conversión a JSON en `blockToJSON()`
- [x] Generador educativo implementado
- [x] Generador UR3e implementado
- [x] Generador ABB implementado
- [x] Generador Fanuc implementado
- [x] Bloques visibles en toolbox de Blockly
- [ ] Pruebas en simulador (pendiente)
- [ ] Validación en robot real (pendiente)

---

**Fecha de implementación:** 19 de diciembre de 2025  
**Versión:** 1.3 modularizado
