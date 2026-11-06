# AUDITORÍA — PASO 4 · INGENIERÍA ELÉCTRICA (Sidebar)

> Rol: ingeniero instalador senior. Método: lectura del markup del Paso 4 (`index.html`), del cableado de eventos y de las funciones que pueblan los datos (`js/project-config.js`, `js/electrical-engine.js`, `js/cable-engine.js`). Fecha: 2026-10-28.

---

## 0. Resumen para el instalador

El Paso 4 está **bien construido en lo esencial**: hay un checklist de conformidad arriba, el auto-dimensionado respeta la decisión manual del instalador y delega en el motor electrotécnico, y casi todos los números que se ven salen del estado canónico (`solarProjectConfig`, catálogo y `RA.Electrical`). **Todos los botones tienen su función** (ninguno muerto).

Pero hay **dos incoherencias de datos que un instalador no debería tolerar** (una temperatura de 65 °C que no es la que calcula el motor, y un parámetro de frío que se pasa pero no se usa), y **un patrón de "números de relleno" en el HTML** que puede mostrar cifras falsas si el refresco falla. Además, la distribución modelo-vs-cantidad entre tarjetas obliga a saltar arriba y abajo.

**Veredicto:** funcional y defendible, pero necesita 4 arreglos de datos/robustez antes de entregar un presupuesto, y una reordenación de tarjetas para que sea realmente "fácil y claro".

---

## 1. Cómo se verificó

- Bloque del Paso 4: `index.html:1943-2393` (`#wp-step-4-content`).
- Entrada al paso: `wpGoToStep(4)` → `js/working-plane.js:3985-4020` dispara la cadena de refresco.
- Pobladores de datos: `js/project-config.js` (equipos, semáforo, checklist, auto-sizing, roof-scope), `js/cable-engine.js` (telemetría de cables), `index.html:4645` (pérdidas).
- Motor electrotécnico: `js/electrical-engine.js` (`matchInvertersFromCatalog:573`, `calculateDynamicMPPTStringLimits`).

**Confirmado (positivo):** los 21 handlers del paso (`step3SetTopology`, `wpStepQuantity`, `wpToggleCableRouting`, `raApplyLossPresetUI`, etc.) están definidos y en `window`. `openCompanyBrandingModal`/`closeCompanyBrandingModal` sí existen (se exportan como `global.*` en `company-branding.js:523-524`).

---

## 2. Hallazgos

| # | Severidad | Dónde | Evidencia | Problema | Corrección | Aceptación |
| :--: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 🔴 GRAVE | `js/electrical-engine.js:595` vs llamadores | `calculateDynamicMPPTStringLimits(moduleSpec, inv, options.climParams \|\| {})`; los llamadores (`project-config.js:1345,1633`, `cable-engine.js:1231`, `working-plane.js:6977`) pasan `tempMinC`/`tempMaxCellC` como claves de nivel superior, no en `climParams` | Los parámetros climáticos que el instalador "ve" (default −5 °C) **no llegan al motor**; este usa su propio `climParams` (Tmin zonal CTE / −10 °C). Es un parámetro muerto: si alguien lo "corrige" a −20 °C, no cambia nada | Mover `tempMinC/tempMaxCellC` a `options.climParams = { Tmin, TmaxCell }` y que el motor los lea; o eliminar los parámetros muertos y declarar una única Tmin canónica | Test: llamar `matchInvertersFromCatalog` con `tempMinC:-20` y comprobar que `Ns_max` **sí** baja (hoy no baja) |
| 2 | 🔴 GRAVE | `index.html:2220` | Etiqueta `Mín. Arranque MPPT (65°C)` | El motor dimensiona con **70 °C** de célula (C-06). El instalador lee 65, el cálculo usa 70 → el semáforo muestra un margen distinto al real | Cambiar etiqueta a 70 °C (o parametrizarla desde `solarProjectConfig`) | El texto coincide con el `Tmax_cell` real del motor |
| 3 | 🟠 MODERADO | `index.html:2217,2221,2228,2237,2241,2245,2341,2349` | Valores literales: `Máx. 13 placas`, `Mín. 5 placas`, `14 placas (6.3 kWp)`, `13.1 A ≤ 26.0 A`, `14.0 A ≤ 30.0 A`, `6 mm² · ΔV 0.8%`, `10 mm² · ΔV 0.6%` | Son placeholders plausibles; si la cadena de refresco falla (JS, carga parcial) el instalador ve cifras **falsas que parecen reales** | Inicializar en `—` / `Calculando…` y pintar solo con datos reales; test que recorra los `id` y falle si contienen números hardcodeados | Al cargar sin cálculo, ningún campo muestra un número concreto |
| 4 | 🟠 MODERADO | `js/project-config.js:521,533` | `inv.iMaxOperA \|\| 15.0` y `inv.iMaxScA \|\| 30.0` | Si el datasheet no trae corriente máxima, se muestran 15/30 A inventados y el check de "Óptimo/clipping" es falso | Exigir campo en el catálogo o, si falta, mostrar `sin dato` en lugar de un número | Equipo sin `iMaxOperA` → texto "sin dato", no 15,0 A |
| 5 | 🟠 MODERADO | `js/project-config.js:722-727` | `chkRebt.textContent = '⚠️ REBT: ΔV > 1.5% … Incumplimiento REBT ITC-BT-40'` (tooltip) | La atribución del 1,5 % a la ITC-BT-40 se corrigió en `cable-engine` (C-02) pero **aquí persiste** | Unificar el texto con el criterio de proyecto (ITC-BT-19/guía); una sola frase canónica | Misma atribución en chip, badge y PDF |
| 6 | 🟡 MENOR | `js/project-config.js:723-726` | `return;` y 3 líneas inalcanzables detrás | Código muerto tras el `return` del bloque `chkRebt` | Eliminar las 3 líneas | Sin sentencias inalcanzables |
| 7 | 🟠 MODERADO | `js/working-plane.js:3989-4020` | Cadena de refresco del paso 4 sin `try/catch` por paso (solo `wpAutoSelectOptimalEngineering` va envuelto) | Un throw en `wpFastRenderSimulatedPanels` deja cables/telemetría/checklist sin actualizar | Encapsular cada paso con `try/catch` + `RAErrors.handle` (ya existe) | Inyectar un error y verificar que el resto del paso sigue renderizando |
| 8 | 🟠 MODERADO | `index.html:2027-2069` vs `2134-2195` | El **modelo** de inversor/batería se elige en 4.1; la **cantidad** (+/− y Auto) en 4.2 | El instalador elige equipo arriba y cantidad abajo; salto innecesario y dos lugares para "batería" | Consolidar modelo+cantidad en 4.1 (o anclar 4.2); mantener un único resumen de coste | El instalador fija modelo y nº de unidades en la misma tarjeta |
| 9 | 🟠 MODERADO | `index.html:2205-2248` | El semáforo IEC (nmax/nmin/totmax) está **después** del stepper multi-equipo | El instalador necesita los límites de string **antes** de decidir cuántos equipos | Reordenar: semáforo IEC antes del stepper | El flujo de lectura natural es: límites → casación → cantidades |
| 10 | 🟡 MENOR | `index.html:2359-2380` | 4.5 Pérdidas al final, pero afecta producción (paso 3) | La nota "se aplican al re-ejecutar" es poco visible; el instalador puede no relacionarlo con el kWh/año | Mover a Paso 3 o añadir un aviso visible "afecta al análisis solar del Paso 3" | El instalador entiende el vínculo pérdidas→producción |

---

## 3. Confirmaciones (lo que está bien, no tocar)

- **Auto-ingeniería coherente** (`wpAutoSelectOptimalEngineering`, `project-config.js:1284`): respeta `userManuallySelectedInverter`, cuenta módulos reales, detecta orientaciones distintas, usa el diagnóstico de sombras y delega en `matchInvertersFromCatalog` → elige topología (inversor/optimizador/micro) con sobrecarga y coste. ✅
- **SSOT alineado**: checklist (`wpUpdateStep4Checklist`), semáforo (`calculatedLimits`), telemetría (`inverterEquipmentState`), pérdidas (`solarLossConfig`), roof-scope y mapping leen el estado canónico, no recalculan por su cuenta. ✅
- **Cobertura de botones**: los 21 handlers existen. ✅

---

## 4. Plan de acción (priorizado)

**Ola A — correctitud de datos (bloqueante para presupuesto)**
1. H1: hacer que `tempMinC/tempMaxCellC` lleguen al motor vía `options.climParams` (o eliminar los parámetros muertos). *Test: Ns_max reacciona a −20 °C.*
2. H2: etiqueta MPPT 65→70 °C.
3. H3: placeholders numéricos → `—`/`Calculando…` + test anti-números-hardcodeados.
4. H4: quitar fallbacks 15,0/30,0 A y exigir `iMaxOperA`/`iMaxScA` en el catálogo (o mostrar "sin dato").

**Ola B — coherencia normativa y robustez**
5. H5: unificar la atribución del 1,5 % (chip REBT) con el criterio ya corregido.
6. H7: `try/catch` + `RAErrors.handle` en la cadena de refresco del paso 4.

**Ola C — UX instalador**
7. H8/H9: consolidar modelo+cantidad y reordenar semáforo antes del stepper.
8. H10: hacer visible el vínculo pérdidas→producción.

**Limpieza**
9. H6: eliminar código muerto tras `return`.

---

## 5. Verificación final

```powershell
cd C:\TRABAJOS\RA\RA
node tests/run-all.js              # debe quedar 45/45 tras añadir los tests nuevos
node tests/test-js-syntax.js       # 63 módulos
```

Nuevos tests sugeridos (uno por ola A/B):
- `test-step4-climparams`: `matchInvertersFromCatalog` responde a `climParams.Tmin`.
- `test-step4-no-placeholder`: el HTML del paso 4 no contiene números literales en los `id` del semáforo/telemetría.
- `test-step4-reesfresh-guard`: un throw en un refrescador no bloquea a los demás.

---

*Auditoría Paso 4 · 2026-10-28. Los hallazgos 1 y 2 son verificados en código; el resto son revisiones de calidad/UX verificadas en el markup.*
