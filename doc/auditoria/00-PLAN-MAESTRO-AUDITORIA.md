# 🧭 Plan Maestro de Auditoría Técnica y Hoja de Ruta AAA — RA (Visor Solar 3D)

> **Fecha de auditoría:** 2026-11-26  
> **Alcance:** Auditoría externa completa (Arquitectura, CAD 3D/WebGL, Ingeniería Fotovoltaica/REBT, UI/UX y Producto).  
> **Estado base de tests (`node tests/run-all.js`):** `45/63` superadas · **`18` fallidas**.

---

## 🎯 Objetivo

Convertir **RA** en un software de ingeniería fotovoltaica y CAD 3D de **calidad AAA** (comparable a Aurora Solar, HelioScope o PVsyst), eliminando bugs críticos, cuellos de botella WebGL, duplicación de código y deuda técnica, mediante **5 fases independientes y secuenciales**.

---

## 📋 Índice de Fases (Orden de Implementación)

| Fase | Documento | Foco Principal | Prioridad |
| :---: | :--- | :--- | :---: |
| **1** | [`FASE-1-ESTABILIZACION-Y-BUGS-CRITICOS.md`](./FASE-1-ESTABILIZACION-Y-BUGS-CRITICOS.md) | Reparar 18 tests fallidos, guard Paso 1→2, `_fitNearFar` sombras, XSS `showStatus`, `QuotaExceededError` | 🔴 Crítica |
| **2** | [`FASE-2-RENDIMIENTO-CAD-Y-WEBGL.md`](./FASE-2-RENDIMIENTO-CAD-Y-WEBGL.md) | Zero-allocation picking, eliminar `scene.render()` síncrono, ghost 3D sin recrear entidades, dirty-flag edificios, leaks | 🟠 Alta |
| **3** | [`FASE-3-PRECISION-SOLAR-Y-INGENIERIA-FV.md`](./FASE-3-PRECISION-SOLAR-Y-INGENIERIA-FV.md) | Modelo térmico Faiman + ciclo diurno, pesos trapezoidales `fast`, bitmask sub-strings, penumbra por `quad`, DRY worker | 🟠 Alta |
| **4** | [`FASE-4-ARQUITECTURA-Y-DEUDA-TECNICA.md`](./FASE-4-ARQUITECTURA-Y-DEUDA-TECNICA.md) | Namespace `window.RA` (1.010 props), troceo de monolitos (`app-main`, `financials`, `working-plane`), migración Vite/ESM | 🟡 Media |
| **5** | [`FASE-5-UI-UX-Y-FUNCIONALIDADES-AAA.md`](./FASE-5-UI-UX-Y-FUNCIONALIDADES-AAA.md) | Tokens `z-index`, a11y teclado, Status Bar CAD, comparador A/B, gráfico ventana MPPT, autosave IndexedDB, onboarding | 🟢 Evolución AAA |

---

## 🤖 Protocolo para Agentes de Programación

Cualquier IA que aborde una fase debe seguir estas reglas:
1. **Leer `AGENTS.md`** antes de tocar código (flujo de 5 pasos, reglas de `window.*`, normativa REBT/IEC 62548).
2. **Trabajar una sola fase por sesión** (o una sub-tarea marcada con `[ ]` dentro de la fase).
3. **Verificar siempre** ejecutando `node tests/run-all.js` y `node tests/test-js-syntax.js` antes y después de cada cambio.
4. **Documentar el avance** marcando `[x]` en el checklist del fichero `FASE-X-*.md` correspondiente y añadiendo una entrada en su sección **Registro de Avances** (fecha, agente, archivos tocados, resultado de tests).
