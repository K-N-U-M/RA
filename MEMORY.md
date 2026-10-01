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

### 2026-10-01: Oferta Comercial — Alineación SSOT + Resumen IA
- **Problema:** `generatePropuestaComercialPDF()` en `financials.js` usa textos genéricos hardcodeados para inversor/batería en lugar de leer del catálogo.
- **Decisiones del usuario:**
  - Enfoque híbrido: plantilla determinista por defecto + enriquecimiento Gemini opcional.
  - Datos del resumen: kWp, nº paneles, producción anual, ahorro año 1, payback, autoconsumo %.
  - Tono: comercial-cercano (vendedor que inspira confianza).
  - Alcance: corregir alineación SSOT + añadir resumen IA.
- **Estado:** En implementación.

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
6. **5 pasos siempre.** Ignorar referencias a 6/7 pasos en código legacy.

---

## 5. Problemas Conocidos y Deuda Técnica

| Prioridad | Problema | Dónde |
|---|---|---|
| ✅ Resuelto | ~~Oferta comercial con textos genéricos para inversor/batería~~ | `financials.js` — `resolveEquipmentNames()` |
| 🟡 Media | `#wp-polyline-list-report` tiene filas clickables redundantes con el nuevo dropdown | `working-plane.js` (wpUpdateUI) |
| 🟡 Media | Paso 2 "Ajuste fino" duplica controles de la tarjeta de faldón | `index.html:805-900` |
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

