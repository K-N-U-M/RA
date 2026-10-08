# 📝 MEMORY.MD — Memoria del Proyecto RA (Visor Solar 3D)

> **Última actualización:** 2026-10-01  
> **Propósito:** Registro vivo de decisiones de diseño, estado del proyecto y contexto acumulado para agentes IA.

---

## 1. Estado Actual del Proyecto

### Arquitectura
- **Monolito cliente:** HTML/CSS/JS puro, sin backend, sin bundler.
- **Visor 3D:** CesiumJS + Google Photorealistic 3D Tiles.
- **Persistencia:** `localStorage` (proyectos, catálogo, branding).
- **Flujo:** 5 pasos canónicos (Emplazamiento → Campo Solar → Análisis → Ingeniería → Entrega).

### Módulos JS Activos
| Módulo | Responsabilidad | SSOT |
|---|---|---|
| `working-plane.js` | Planos de trabajo, faldones, tríada CAD | `window.WP` |
| `solar-engine.js` | Física astronómica, vector solar | `window.solarProjectConfig` |
| `solar-heatmap.js` | Simulación anual 192 instantes | `window.RA.solarStats`, `solarSimState` |
| `electrical-engine.js` | Strings MPPT, cableado REBT | `getProjectCalcs()` |
| `financials.js` | CAPEX/OPEX, VAN, TIR, oferta comercial PDF | `calculateFinancialModel()` |
| `docs-generator.js` | Memoria técnica, presupuesto BOE, unifilar | `getProjectCalcs()` |
| `bill-auditor.js` | Auditoría de facturas | `window.RA.billAuditor` |
| `buildings.js` | Edificios 3D y extrusión | `window.WP.buildings` |
| `obstacles.js` | Obstáculos 3D | `window.WP.obstacles` |
| `capture-mode.js` | Modo captura limpia (tecla C) | `window.RACapture` |
| `undo-manager.js` | Deshacer borrados | `window.RAundo` |
| `bom-tree.js` | Árbol de materiales (BOM) | `BOMTreeEngine` |
| `project-hierarchy.js` | Scene graph jerárquico | — |
| `ui-outliner.js` | Outliner de objetos | — |

---

## 2. Historial de Decisiones de Diseño

### 2026-09-30: Refactor Faldones — Patrón Master-Detail
- **Problema:** N tarjetas dinámicas HTML por faldón → duplicación DOM masiva, 3 funciones de selección solapadas.
- **Solución:** Dropdown selector (`#faldon-selector-dropdown`) + tarjeta única con IDs estables (`#faldon-edit-card`).
- **Funciones nuevas:** `wpPopulateFaldonCard()` (presentación pura), `wpSelectFaldon(idx)` (selección unificada).
- **Commit:** `173121f`

### 2026-10-06: Sincronización SSOT, Métricas Reactivas y Física de Cables
- **Problema 1 (Heatmap):** El texto "192 INSTANTES" era estático a pesar de cambiar la calidad en ajustes.
- **Solución 1:** Sincronización reactiva del UI con `window.raHeatmapResolution`. El badge ahora es interactivo y abre el modal.
- **Problema 2 (Descuadre Producción):** El HUD (Producción Neta) difería del Histograma BOM (ej. 8698 vs 7287 kWh) por una doble multiplicación errónea del Performance Ratio (`pr`) en el array mensual `monthlyYields`.
- **Solución 2:** Eliminado el `* pr` sobrante en el `map()` del array mensual (línea 6666 aprox).
- **Problema 3 (Métricas Estáticas):** Al mover equipos (Cuadro DC, Inversor, Contador AC), no se actualizaban ni los metros en el BOM ni las pérdidas de sistema en el HUD.
- **Solución 3:**
  - El enrutamiento de cables DC ahora apunta al Cuadro DC (`dcProtectionPosition`) si existe.
  - La caída de tensión real (ΔV) calculada en `wpCalculateAndRenderInverterCables` se inyecta dinámicamente en `window.solarLossConfig.wiring`.
  - Se llama a `recalculateSolarYield()` y `BOMTreeEngine.refresh()` en cascada al evento `LEFT_UP` del Gizmo.

---

## 3. Fuentes de Verdad (SSOT Map)

```
getProjectCalcs()          ← Definición canónica en index.html (~L10954)
  ├── window.WP            ← Faldones, planos, geometría
  ├── solarProjectConfig   ← IDs de equipos seleccionados, topología
  ├── equipmentCatalog     ← Catálogo completo (módulos, inversores, baterías, microinversores)
  ├── RA.solarStats        ← Producción solar simulada
  ├── RA.billAuditor       ← Auditoría de factura del cliente
  └── RA.branding          ← Logo, nombre empresa, CIF, garantías

calculateFinancialModel()  ← Definición canónica en financials.js (~L491)
  ├── CAPEX/OPEX desglosados
  ├── VAN, TIR, LCOE, Payback
  ├── Financiación (cuota mensual)
  ├── Degradación TOPCon/PERC
  └── Autarquía y perfiles tarifarios
```

---

## 4. Convenciones y Reglas Vivas

1. **Congelación inline:** Ningún código nuevo en `<script>` inline de `index.html` (desde ~L2230). Todo en `js/*.js`.
2. **CRLF:** `index.html` usa `\r\n`. Usar `\r?\n` en scripts.
3. **Hooks globales:** Funciones llamadas desde `onclick` HTML deben estar en `window`.
4. **Invalidación heatmap:** Mutar geometría → `wpInvalidateHeatmap(reason)`.
5. **SSOT producción:** `getProjectCalcs().annualKWh` es la producción canónica; `kwp × 1450` solo fallback.
6. **5 pasos siempre (en revisión).** Posible fusión de Paso 1 y Paso 2 debido a duplicación de UI.

---

## 5. Problemas Conocidos y Deuda Técnica

| Prioridad | Problema | Dónde |
|---|---|---|
| ✅ Resuelto | ~~Oferta comercial con textos genéricos para inversor/batería~~ | `financials.js` — `resolveEquipmentNames()` |
| ✅ Resuelto | ~~Descuadre Histograma vs HUD por doble aplicación de PR~~ | `index.html` — `recalculateSolarYield()` |
| ✅ Resuelto | ~~Pérdidas del sistema y BOM estáticos al arrastrar Cuadros~~ | `index.html` — `wpCalculateAndRenderInverterCables()` |
| 🔴 Alta | **Paso 2 redundante:** Sus controles (módulo, layout, azimuth) están duplicados en la nueva tarjeta Master-Detail del Faldón (Paso 1). | `index.html` (Flujo Stepper) |
| 🟡 Media | `#wp-polyline-list-report` tiene filas clickables redundantes con el nuevo dropdown | `working-plane.js` (wpUpdateUI) |
| 🟢 Baja | CRLF warning en git para working-plane.js | line endings |

---

## 6. Integración IA (Gemini)

- **Estado:** ✅ Implementada (commit `ae75e0f`)
- **Enfoque:** Híbrido — plantilla determinista por defecto + enriquecimiento Gemini opcional
- **API:** REST API directa (`fetch()`) a `generativelanguage.googleapis.com/v1beta`
- **Modelo:** `gemini-2.0-flash` (rápido, económico)
- **API Key:** Almacenada en `localStorage('ra_gemini_api_key')`, nunca en código fuente
- **UI:** Campo en modal de branding (`modal-cfg-gemini-apikey`) con botón PROBAR
- **Flujo:** `generatePropuestaComercialPDF()` → muestra plantilla → `enrichSummaryWithGemini()` async → reemplaza texto si OK → fallo silencioso mantiene plantilla
- **Funciones clave:**
  - `resolveEquipmentNames()` — lee SSOT del catálogo
  - `generateCommercialSummary(d, m, equipment)` — plantilla determinista
  - `enrichSummaryWithGemini(targetWindow, d, m, equipment)` — llamada async Gemini
  - `testGeminiApiKey()` — validación de conexión desde el modal

---

## 7. Motor de Cableado Ortogonal 3D y Sombras (`RACableEngine` — Octubre 2026)

- **Estado:** ✅ Implementado y modularizado en `js/cable-engine.js`.
- **Cero Catenarias:** Sustitución de curvas catenarias irreales por trazado ortogonal estricto a 90° (Manhattan 3D) descompuesto en los ejes U, V y N de la cubierta y bajantes verticales por fachada.
- **Geometría 3D Volumétrica con Sombras:** Uso de `Cesium.PolylineVolumeGraphics` con perfiles extruidos (tubo cilíndrico r=1.8cm para DC, r=2.5cm para AC y bandeja en U 8x3cm) con `shadows: Cesium.ShadowMode.ENABLED`. Proyecta sombras físicas reales en tiempo real según la posición solar sobre tejas y fachadas.
- **Cotas Reglamentarias:** +0.35m (DC+) y +0.45m (DC- / retorno compensado) sobre el faldón.
- **Colores Planos Sólidos:** `#EF4444` (DC+), `#0284C7` (DC-), `#10B981` (Combiner troncal), `#38BDF8` (AC), `#64748B` (Bandeja), sin shaders procedurales ni efectos glow inestables.
- **Tipologías Soportadas:** Serie pura (1S), Paralelo en cubierta con conectores Y (2S), Combiner Box y Línea de Evacuación AC.
- **Snapping Magnético y Auto-Trazado Zero-Click:** Generación automática al entrar en Paso 4 con codos editables y enganche a terminales de string.
- **Limpieza Inline:** ~26.000 caracteres de código legacy retirados de `index.html`, delegando limpiamente en `RACableEngine`.
- **Verificación:** Suite de pruebas en `tests/test-cable-engine.html` y consola `window.RACableEngine.runSelfTests()`.

