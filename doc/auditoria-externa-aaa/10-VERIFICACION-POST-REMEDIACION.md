# Auditoría Independiente de Verificación Post-Remediación (Fases 0 a 7)

> **Fecha:** 2026-11-25 · **Rama verificada:** `feat/remediacion-aaa`  
> **Alcance:** Auditoría paralela en 4 frentes independientes (Cableado & Runtime, Ingeniería FV & Finanzas, Seguridad & Accesibilidad WCAG 2.2 AA, Coherencia Documental) + corrección inmediata de todos los hallazgos P0/P1 verificados.

---

## 1. Nuevo Semáforo Global

| Momento | Semáforo | Estado Real del Inventario (78 tickets) |
| :--- | :---: | :--- |
| **Auditoría inicial (2026-11-24)** | 🔴 **ROJO** | `0` Hecho · `0` Parcial · `78` Pendiente (14 bloqueantes P0 activos) |
| **Verificación Post-Remediación (2026-11-25)** | 🟡 **AMARILLO (ÁMBAR)** | **`63` `[Hecho]` (80,8%) · `14` `[Parcial]` (17,9%) · `1` `[Pendiente]` (1,3%)** |

### Desglose por Fase (Sincronizado en `00-INDICE.md` y fichas 01–08)
- **Fase 0 (Estabilización P0):** `8 [Hecho]`, `3 [Parcial]` (`F0-04`, `F0-10`, `F0-11`), `0 [Pendiente]`
- **Fase 1 (Motor 3D/WebGL):** `7/7 [Hecho]` (100%)
- **Fase 2 (Ingeniería FV/REBT/Eólica):** `12/12 [Hecho]` (100%)
- **Fase 3 (Limpieza y Deduplicación):** `11/11 [Hecho]` (100%)
- **Fase 4 (Arquitectura Modular):** `3 [Hecho]`, `4 [Parcial]`, `1 [Pendiente]` (`F4-06`)
- **Fase 5 (UI/UX y WCAG 2.2 AA):** `9 [Hecho]`, `1 [Parcial]` (`F5-07`), `0 [Pendiente]`
- **Fase 6 (Seguridad Backend, QA y CI/CD):** `4 [Hecho]`, `1 [Parcial]` (`F6-04`), `0 [Pendiente]`
- **Fase 7 (Capacidades AAA):** `9 [Hecho]`, `5 [Parcial]`, `0 [Pendiente]`

---

## 2. Hallazgos Críticos Cazados y Reparados en Esta Verificación

La segunda auditoría paralela detectó defectos reales de integración entre los módulos recién incorporados de Fase 7 y los contratos heredados, todos **reparados de inmediato** en la misma pasada:

1. **Contratos financieros y de catálogo (`P0`):**
   - `js/bankable-p50-p90.js`: alineado con las claves reales de `calculateFinancialModel()` (`capexNeto`, `capexBruto`, `ahorroLuzAnio1`, `cuotaMensual`, `opexYear1`, `annualYieldKWh`), eliminado OPEX fantasma con 0 paneles y sincronizado LID en Año 1 y cabecera de WACC.
   - `js/pvsyst-pan-ond-parser.js`: corregidas claves canónicas de inversor (`vMpptMin`, `vMpptMax`, `vStart`, `iMaxOperA`) y módulo (`weightKg`, `bifacialityFactor`, `tempCoeffPmax` en `%/°C` sin dividir ×100), cambiado `unshift()` a `push()` para preservar el índice de protección de equipos de fábrica, y reparada la llamada `populateStep3EquipmentSelectors`.
   - `js/project-calcs.js` & `js/docs-generator.js`: expuestos `iMaxOperA`/`iMaxScA`/`eff` en el objeto inversor de proyecto y reparado `m.kWh || m.kwh` en la gráfica SVG mensual de la memoria técnica.
2. **Cableado UI, Live Preview y CAD 3D (`P0/P1`):**
   - `js/proposal-style-studio.js`: corregida la unidad de `cfg.fontScale` (porcentaje `85..115`, evitando el desborde de tamaño de letra en la vista previa A4), lectura de `cfg.lockedTexts`, `density === 'editorial'`, sanitización estricta de colores/alineación CSS y debounce de 80 ms.
   - `js/ux-aaa-workspace.js`: reparados los selectores DOM reales (`#step4-mppt-matrix-card`, `#step4-single-line-diagram-svg`), método real `RA.billAuditor.openModal()`, lectura de tensión de string `Vmp_str_hot`, subida CSV accesible por teclado, tipografía `>= 11px` y estado `applied` en toast GPU.
   - `js/shadow-auto-stringer.js`: protegido `_splitBalanced` para no violar jamás `Ns_max` (`Voc_cold`), añadida validación de corriente `iMaxOperA`/`iMaxScA`, corregida clave `hasMLPE` y propagación real hacia paneles 3D, cables y Matriz MPPT.
   - `js/cad-clash-section.js` & `js/cad-osnap-polar.js`: leídas dimensiones reales `obs.w/l/h`, persistencia de resolución de choques sobre `poly.roofInfo.panels`, anclaje ENU (`modelMatrix`) del plano de corte sobre la cubierta real, corrección `WP.selectedPolyIdx` y `aria-modal="true"` + `Escape` completo en el diálogo numérico.
   - `js/collab-timetravel.js`: lectura de titular vía `readTitular()`, manejo de `SNAPSHOT_CREATED`, refresco 3D al restaurar versión y cierre limpio de `BroadcastChannel` en `pagehide`.
3. **Precisión física/tarifaria y Seguridad Defensa-en-Profundidad (`P0/P1`):**
   - `js/datadis-tariff-optimizer.js`: propagado índice real de periodo `p` para aplicar los coeficientes `Kp` normativos CNMC (`1.0 / 0.5 / 0.37 / 0.17`) en P2..P6, evitada falsa detección cuartohoraria en CSV multi-año/bisiesto y aplicado el tope de compensación RD 244 mensualmente.
   - `js/bishop-iv-engine.js` & `js/ra-sdk-plugins.js`: lectura de `tempCoeffVoc`/`tempCoeffPmax`/`inv.eff`, escalado multi-inversor con clipping AC, escape SVG + `font-size="11"`, alineación de escalada en TIR vs VAN y rendimiento específico coherente en el comparador de variantes.
   - **BFF y Seguridad:** añadido rewrite `/api/ai` → `aiProxy` en `firebase.json`, alineado payload `{ model, payload: { contents, generationConfig } }` y cabecera `Authorization: Bearer` en `js/ai-service.js`, endurecido `aiProxy` en `functions/index.js` (límite 64 KB, lista blanca de campos, sanitización de errores y poda LRU de cuotas), purga activa de claves heredadas + allowlist estricto de hosts en `js/trusted-security-guard.js`, purga de `<style>`/`xlink:href`/`srcset` en `js/docx-exporter.js`, guardia `.get('tenantId', null)` en `firestore.rules` y `z-index: var(--z-toast, 700)` para `#ra-toast-container`.

---

## 3. Puertas Restantes para Alcanzar 🟢 VERDE Producción Plena

1. **Ejecución autorizada de QA (`F6-04`):** correr `npm run sast`, `npm test`, Emulador Firebase y Playwright E2E cuando se autorice.
2. **Despliegue y secretos en consola Firebase (`F7-14` / `F0-10`):** configurar `GEMINI_API_KEY`, activar `ENFORCE_APP_CHECK=true` y desplegar `firestore.rules`, `storage.rules` y Cloud Functions v2.
3. **Remates opcionales de evolución (`F0-11` y `F4-01/04/05/06/07`):** migración completa a bundle Vite ESM para retirar `'unsafe-inline'` de la CSP y desmantelamiento gradual restante de los tres monolitos heredados.
