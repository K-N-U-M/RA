# 🔴 FASE 2: Rendimiento WebGL / 60 FPS (Nivel Google Earth) y Motor CAD AAA

> **Objetivo:** Igualar la fluidez de Google Earth eliminando el coste GPU oculto que mantiene el visor lento, restaurar el ahorro real de `requestRenderMode: true` y hacer zero-allocation el arrastre CAD.

---

## 2.A. Ya Resuelto (Verificado)
- [x] Activado `skipLevelOfDetail: true`, `cullWithChildrenBounds: true`, `dynamicScreenSpaceError: true` en carga inicial (`js/viewer.js:352-395`).
- [x] Eliminadas llamadas síncronas a `scene.render()` en `get3DElectricalClickPosition` y `wpCapturaInforme` (`js/app-main.js`).
- [x] Reutilizadas entidades ghost en `obsRenderGhostNow` (`js/obstacles.js:1536-1609`) y añadido dirty-flagging en `buildings.js:70-95`.
- [x] Expuesto `destroy()` en `js/cad-events-controller.js` y subida textura PBR a `1024x2048` (`js/solar-materials.js`).

---

## 2.B. Causas Raíz de Lentitud Detectadas y Tareas Pendientes

### 2.1. Desacoplar `google3DTileset` del ShadowMap por defecto (+40% a +120% FPS)
- **Evidencia:**
  - `js/shadow-settings.js:58` fija `selfShadows: true`, haciendo que `google3DTileset.shadows = Cesium.ShadowMode.ENABLED` (`js/viewer.js:357-391`, `js/shadow-settings.js:161-167`). Esto obliga a Cesium a renderizar **toda la malla fotogramétrica densa de Google** dentro de los mapas de sombras en cascada en cada frame.
  - Además, aunque `js/app-main.js:474` crea `Viewer` con `shadows: false`, `js/app-main.js:865` (`wpConfigureShadowMap`) y `js/app-main.js:9960-9965` (`wpSyncCesiumSun()` en `js/solar-engine.js:1894, 2002-2008`) fuerzan `shadowMap.enabled = true` al arrancar.
- **Solución:**
  - Cambiar por defecto `selfShadows: false` en `ShadowSettings.defaultSettings` (`js/shadow-settings.js:58`) para que `google3DTileset.shadows = Cesium.ShadowMode.RECEIVE_ONLY` (recibe sombras de paneles, obstáculos y edificios CAD sin re-renderizar toda la ciudad en el shadow map).
  - Dejar `ShadowMode.ENABLED` en Google 3D Tiles como opción explícita `"Sombras de entorno completo (Modo Foto)"` o durante reproducción solar puntual, y evitar que `wpToggleSolarPlay` (`js/solar-engine.js:1874`) re-configure todo el `ShadowSettings` cada 40 ms.
- **Aceptación:** La fotogrametría no proyecta cascadas sobre sí misma en navegación normal; salto medible de FPS al orbitar sobre zonas urbanas densas.

### 2.2. Restaurar Culling LOD al conmutar de vuelta a Google 3D Tiles
- **Evidencia:** `js/viewer.js:413-417` al reactivar `google3DTileset` vuelve a poner `cullWithChildrenBounds = false`, `skipLevelOfDetail = false`, `dynamicScreenSpaceError = false`.
- **Solución:** Mantener los 3 flags en `true` también en la rama de reactivación (`L413-417`).
- **Aceptación:** Cambiar entre motores de mapa/terreno y volver a Google 3D no degrada el rendimiento.

### 2.3. Erradicar `CallbackProperty(..., false)`, `postRender` continuo y `clock.onTick`
- **Evidencia:** Pese a `requestRenderMode: true, maximumRenderTimeChange: Infinity` (`js/app-main.js:477-478`), Cesium re-renderiza continuamente por:
  1. `CallbackProperty(..., false)` (`isConstant = false`) en `js/app-main.js:2031, 2077, 3028`, `js/cad-events-controller.js:142`, `js/buildings.js:1797, 1853, 1862`, `js/working-plane.js:3628, 3635, 3643`.
  2. `scene.postRender.addEventListener` (`js/cad-events-controller.js:1283-1286`) ejecutando `renderTriad2D()` (`clearRect` HiDPI completo + 15+ `new Cesium.Cartesian3()` en `renderUniversalGizmo2D` en `js/universal-gizmo-3d.js:630-664, 745-753`) en **cada frame**.
  3. `clock.onTick` (`js/app-main.js:4600-4606`) ejecutando `updateWindRose()` y mutando el DOM continuamente.
- **Solución:**
  - Sustituir `CallbackProperty(..., false)` por primitivas mutables o propiedades constantes actualizadas bajo demanda + `scene.requestRender()`.
  - Mover `renderTriad2D()` / `renderUniversalGizmo2D()` fuera de `postRender` hacia `camera.changed` + flag `dirty` de hover/drag, reutilizando `Cartesian3` scratch prealocados.
  - Actualizar `updateWindRose()` en `camera.changed` en lugar de `clock.onTick` cuando no hay rotación automática.
- **Aceptación:** En reposo (sin mover cámara ni ratón), `RA.perf.frameCount` permanece en `0` FPS (0% GPU/CPU en idle).

### 2.4. Eliminar stalls CPU↔GPU (`gl.readPixels`), `pickTranslucentDepth` y consolidar `moveStart/moveEnd`
- **Evidencia:**
  - `js/app-main.js:1193` activa `scene.pickTranslucentDepth = true`, forzando pases extra de profundidad translúcida y falsos positivos sobre overlays.
  - `getRaw3DPosition` (`js/app-main.js:1885-1907`) llega a llamar **dos veces seguidas** a `scene.pickPosition` (`L1893` y `L1904`).
  - `get3DElectricalClickPosition` (`js/app-main.js:5110-5114`) llama `requestRender()` justo antes de `pickPosition` (lee el buffer viejo).
  - 4 listeners distintos compiten en `moveStart`/`moveEnd`/`camera.changed`: `js/ra-lod-manager.js:119-205`, `js/app-main.js:505-528`, `js/app-main.js:999-1006, 1265-1271`, `js/shadow-settings.js:198-213`, `js/cad-events-controller.js:1860-1868`.
  - `js/app-main.js:1041` inicializa `_currentAntialiasingMode = 'off'` mientras activa `scene.fxaa = true` en `L1186`.
- **Solución:**
  - Poner `scene.pickTranslucentDepth = false`.
  - Eliminar la segunda llamada a `pickPosition` en `getRaw3DPosition` y priorizar intersección analítica rayo-plano (`wpRayPlane`) sobre `WP.planes` cerrados en hover/edición.
  - Unificar el control dinámico de LOD en `RALodManager` (eliminando los hooks redundantes de `app-main.js` y `shadow-settings.js`), añadiendo `resolutionScale` adaptativo (`0.75` en órbita rápida sobre HiDPI, `1.0` al detenerse).
- **Aceptación:** Cero stalls visibles durante pan/órbita y un único gestor de calidad dinámica durante el movimiento.

### 2.5. Zero-Allocation en Gizmo Drag, Render Asíncrono de Paneles y Limpieza de Listeners
- **Evidencia:**
  - `js/universal-gizmo-3d.js:1252-1255, 1381-1382, 1745-1748, 1771-1803` reconstruye GPU/DOM (`render3DObstaclesInCesium`, `wpRenderAllPolylines`, `wpUpdateUI`) en `MOUSE_MOVE`.
  - `wpFastRenderSimulatedPanelsAsync` (`js/app-main.js:7659, 8280, 8457, 8520, 8943`) y `js/buildings.js:1272-1340` crean `Cesium.Primitive` con `asynchronous: false`.
  - `js/cad-events-controller.js:1283, 1860, 2020-2029` y `js/cad-selection-suite.js:125-759` dejan listeners `postRender`, `camera.changed` y `window.*` sin `removeEventListener` (y `updateCADHover` ejecuta `scene.drillPick` incluso con `RAMeasureTool` activo).
  - Supresión de etiquetas al seleccionar con Gizmo (`AGENTS.md §5`) pendiente de implementar.
- **Solución:** Diferir reconstrucciones pesadas a `LEFT_UP`, usar `asynchronous: true` en batches no bloqueantes, guardar unsubscribes para `RACadEvents.destroy()`, pausar `updateCADHover` cuando haya herramienta activa y ocultar etiquetas no relevantes durante selección activa.
- **Aceptación:** 60 FPS durante arrastre con Gizmo y 0 listeners huérfanos tras `destroy()`.

---

## Checklist de Avance
- [x] 2.1. `google3DTileset.shadows = RECEIVE_ONLY` por defecto (`selfShadows: false`) y desacople en reproducción solar
- [x] 2.2. Culling LOD preservado al reactivar Google 3D Tiles (`js/viewer.js:413-417`)
- [x] 2.3. Erradicados `CallbackProperty(..., false)`, `postRender` continuo y `clock.onTick`
- [x] 2.4. `pickTranslucentDepth = false`, picking sin doble `readPixels` y `RALodManager` unificado
- [x] 2.5. Gizmo drag diferido a `LEFT_UP`, `asynchronous: true`, cleanup de listeners y supresión de etiquetas

## Registro de Avances
- **2026-11-26 (Fase 2 inicial):** Activado LOD dinámico en carga inicial de `viewer.js`, reutilización de entidades ghost en `obstacles.js`, dirty-flagging en `buildings.js`, `destroy()` base en `cad-events-controller.js` y textura PBR `1024x2048`.
- **2026-11-26 (Auditoría Quirúrgica):** Identificadas las causas principales de lag frente a Google Earth (`google3DTileset.shadows = ENABLED`, `CallbackProperty(..., false)` rompiendo `requestRenderMode`, `postRender` repintando tríada/gizmo por frame, `pickTranslucentDepth = true` y colisión de 4 gestores `moveStart/moveEnd`).
- **2026-11-26 (3 Agentes en paralelo):** Fase 2 completada al 100%: `selfShadows: false` (`RECEIVE_ONLY` en Google 3D Tiles), LOD preservado al conmutar motor, `0` `CallbackProperty(..., false)` activos, `renderTriad2D()` movido fuera de `postRender`, `pickTranslucentDepth = false`, picking analítico rayo-plano prioritario, `RALodManager` con `resolutionScale` adaptativo, pool scratch `Cartesian3`, gizmo drag diferido a `LEFT_UP`, supresión de etiquetas y cleanup completo de listeners.
