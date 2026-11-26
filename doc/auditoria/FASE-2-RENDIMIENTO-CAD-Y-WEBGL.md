# 🟠 FASE 2: Rendimiento CAD 3D y WebGL (Nivel AAA)

> **Objetivo:** Eliminar bloqueos del hilo principal, `gl.readPixels` síncronos, recreación de entidades en `MOUSE_MOVE` y fugas de memoria WebGL/DOM.

---

## Tareas

### 2.1. Zero-Allocation Picking en `MOUSE_MOVE` (eliminar `scene.render()` síncrono)
- **Evidencia:** `js/app-main.js:477` activa `requestRenderMode: true`, pero `js/app-main.js:906, 956, 961, 5089` llaman a `viewer.scene.render()` síncronamente antes de `pickPosition`.
- **Acción:** Reemplazar `scene.render() + pickPosition` durante el arrastre/preview sobre cubiertas por intersección analítica rayo-plano (`Cesium.IntersectionTests.rayPlane`) contra el plano de trabajo activo (`WP.planes`), y usar `viewer.scene.requestRender()`.
- **Criterio de aceptación:** 0 llamadas a `viewer.scene.render()` en handlers de ratón; 60 FPS estables en arrastre.

### 2.2. Eliminar recreación de entidades en `obsRenderGhostNow`
- **Evidencia:** `js/obstacles.js:1536-1609` (`obsClearGhost` + `obsRenderGhostNow`) destruye y recrea 6 entidades (`viewer.entities.remove` / `add`) en cada frame de `MOUSE_MOVE`.
- **Acción:** Usar un único `Cesium.Primitive` (o `Entity` persistente) actualizando solo su `modelMatrix` (patrón zero-allocation de `js/wind-turbine.js:486`).
- **Criterio de aceptación:** 0 creaciones/destrucciones de entidades durante `MOUSE_MOVE` al colocar obstáculos.

### 2.3. Dirty-flagging en reconstrucción de edificios 3D
- **Evidencia:** `js/buildings.js:70-95` (`render3DBuildingsInCesium`) destruye y recrea todas las primitivas y entidades de todos los edificios en cada llamada.
- **Acción:** Añadir flag `building._dirty` para reconstruir únicamente el edificio modificado.
- **Criterio de aceptación:** Editar un edificio no reconstruye las primitivas del resto de edificios de la escena.

### 2.4. Limpieza de listeners DOM y `ScreenSpaceEventHandler.destroy()`
- **Evidencia:** 23 `addEventListener` sin `removeEventListener` en módulos CAD (`working-plane.js`, `buildings.js`, `obstacles.js`, `measure-tool.js`, `wind-turbine.js`, `viewer.js`, `universal-gizmo-3d.js`). `js/cad-events-controller.js:7` crea `ScreenSpaceEventHandler` sin método `destroy()`.
- **Acción:** Exponer `destroy()` en `cad-events-controller.js` y centralizar suscripciones DOM con limpieza explícita.
- **Criterio de aceptación:** Desmontar/reinicializar el visor no deja listeners huérfanos.

### 2.5. Ajustar resolución de textura PBR de paneles y supresión de etiquetas en selección
- **Evidencia:** `js/solar-materials.js:18-21` crea canvas `256x512` (comentario dice `2048x1024`). Además, `AGENTS.md §5` indica supresión de etiquetas al seleccionar con Gizmo, pero `selectObstacle`/`selectPanel`/`selectBuilding` no ocultan `label.show`.
- **Acción:** Subir canvas PBR a `1024x2048` (o mipmapped `1024x1024`) e implementar supresión/restauración de `label.show` al seleccionar/deseleccionar.
- **Criterio de aceptación:** Textura nítida en primer plano y escena limpia al manipular con Gizmo.

---

## Checklist de Avance
- [x] 2.1. Picking analítico sin `scene.render()` síncrono
- [x] 2.2. Preview de obstáculos zero-allocation
- [x] 2.3. Dirty-flagging en `buildings.js`
- [x] 2.4. Limpieza de listeners y `destroy()` en `cad-events-controller.js`
- [x] 2.5. Textura PBR y supresión de etiquetas en selección

## Registro de Avances
- **2026-11-26 (2 Agentes en paralelo):** Completadas tareas 2.1, 2.2, 2.3, 2.4 y 2.5. Eliminado `scene.render()` síncrono en picking, reutilizadas entidades ghost en `MOUSE_MOVE`, añadido dirty-flagging en edificios, expuesto `destroy()` en controlador CAD y subida textura PBR a `1024x2048`. Verificado con `node tests/test-js-syntax.js` (81/81 OK).
