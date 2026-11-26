# 🟠 FASE 3: Precisión Solar, Física FV y Eficiencia del Worker

> **Objetivo:** Elevar la precisión física del motor solar al nivel de PVsyst/Aurora Solar y eliminar duplicación de código entre hilo principal y Web Worker.

---

## Tareas

### 3.1. Modelo térmico Faiman + perfil diurno horario en `solar-worker.js`
- **Evidencia:** `js/solar-worker.js:621` usa `tAmbMonth` estática mensual sin ciclo diurno ni viento ni tipo de montaje.
- **Acción:** Incorporar perfil diurno sinusoidal `T_amb(h)` por zona climática y modelo **Faiman** (`T_cell = T_amb + G_poa / (U0 + U1 * v_wind)`) diferenciando `U0` para montaje coplanar vs. estructura abierta.
- **Criterio de aceptación:** La temperatura de célula refleja la hora del día y el tipo de montaje.

### 3.2. Pesos trapezoidales no uniformes en modo `fast`
- **Evidencia:** `js/solar-worker.js:258, 264` usa `hourStepDt` uniforme (`2.667 h`) para `hours = [9, 12, 15, 17]`, sesgando la ponderación energética de las 17h.
- **Acción:** Calcular pesos trapezoidales `dt[hIdx]` según el espaciado real entre horas muestreadas.
- **Criterio de aceptación:** La integral energética diaria en modo `fast` no sobrestima la última hora.

### 3.3. Bitmask de sub-strings y penumbra por `quad`
- **Evidencia:** `js/solar-worker.js:638` instancia `new Array(subStrings.length).fill(false)` por cada panel e instante (`N × 192` asignaciones). Además, `solar-worker.js:401-411` calcula penumbra usando solo `pts[0]` y la aplica globalmente al panel.
- **Acción:** Reemplazar el array booleano por un bitmask entero (`let subMask = 0`) y asociar el factor de penumbra por cada `quad` de sombra individual.
- **Criterio de aceptación:** Reducción drástica de presión GC en cubiertas >1000 módulos y penumbra físicamente correcta.

### 3.4. Eliminar duplicación de geometría 2D y fallback en hilo principal
- **Evidencia:** `isPointInPolygon2D`, `segmentsIntersect2D`, `polygonsIntersect2D`, `convexHull2D` están duplicadas exactamente en `js/polygon-shadow-math.js` y `js/solar-worker.js:29-68`. Además, `js/solar-heatmap.js:1682-2400` duplica la simulación en el hilo principal.
- **Acción:** Cargar `polygon-shadow-math.js` en `solar-worker.js` vía `importScripts` y unificar el motor de simulación.
- **Criterio de aceptación:** Cero funciones geométricas duplicadas entre worker e hilo principal.

---

## Checklist de Avance
- [x] 3.1. Modelo térmico Faiman + ciclo diurno horario
- [x] 3.2. Pesos trapezoidales no uniformes en modo `fast`
- [x] 3.3. Bitmask de sub-strings y penumbra por `quad`
- [x] 3.4. Eliminación de código duplicado en `solar-worker.js` y `solar-heatmap.js`

## Registro de Avances
- **2026-11-26 (Agente Fase 3):** Completadas tareas 3.1, 3.2, 3.3 y 3.4 en `js/solar-worker.js` (modelo térmico Faiman con ciclo diurno horario, pesos trapezoidales `hourWeights`, bitmask entero `subMask` + penumbra por `quad`, e `importScripts('polygon-shadow-math.js')`). Verificado con `node tests/test-js-syntax.js` (81/81 OK).
