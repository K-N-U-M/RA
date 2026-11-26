# 🟡 FASE 4: Arquitectura, Desacoplamiento y Deuda Técnica

> **Objetivo:** Reducir el acoplamiento global (`1.010` propiedades en `window`), trocear los archivos monolíticos y modernizar el sistema de carga de scripts.

---

## Tareas

### 4.1. Consolidar estado global en namespace `window.RA`
- **Evidencia:** 1.010 asignaciones directas `window.<prop> = ...` en 39 archivos (259 en `working-plane.js`, 226 en `app-main.js`, 74 en `buildings.js`, 51 en `financials.js`, 48 en `project-storage.js`, 44 en `project-config.js`).
- **Acción:** Agrupar el estado y APIs internas bajo `window.RA = { state, cad, solar, electrical, ui, storage }`, manteniendo alias de compatibilidad únicamente para hooks `onclick` en HTML.
- **Criterio de aceptación:** Reducción >80% de propiedades sueltas en `window`.

### 4.2. Trocear los 3 archivos monolíticos ("God Files")
- **Evidencia:** `js/app-main.js` (10.003 líneas), `js/financials.js` (8.251 líneas), `js/working-plane.js` (8.172 líneas).
- **Acción:** Separar lógica de dominio pura (testeable en Node sin DOM/Cesium) de los controladores de UI/DOM en módulos cohesivos (<1.000 líneas por archivo).
- **Criterio de aceptación:** Ningún archivo nuevo supera las 1.500 líneas; lógica pura testeable unitariamente.

### 4.3. Migrar de 81 `<script defer>` a ES Modules + Vite
- **Evidencia:** `index.html:58-114` carga 81 scripts con `defer` y cache-busting manual (`?v=20261123_...`) en `index.html` y `js/lazy-loader.js`.
- **Acción:** Configurar Vite + ES Modules (`import`/`export`), eliminar query strings `?v=...` manuales y habilitar tree-shaking para detectar y purgar código muerto interno.
- **Criterio de aceptación:** Build reproducible con Vite, grafo de dependencias explícito y carga optimizada.

### 4.4. Actualizar inventario documental en `AGENTS.md`
- **Evidencia:** `AGENTS.md` menciona 63 archivos JS, pero el inventario real es de 81 archivos JS (67 en `js/` + 14 en `js/wind/`) y 64 archivos en `tests/`.
- **Acción:** Sincronizar la tabla de estructura de `AGENTS.md` tras la refactorización.

---

## Checklist de Avance
- [ ] 4.1. Namespace `window.RA` consolidado
- [ ] 4.2. Monolitos troceados (dominio vs UI)
- [ ] 4.3. Migración a ES Modules + Vite
- [x] 4.4. Documentación `AGENTS.md` sincronizada

## Registro de Avances
- **2026-11-26 (Agente):** Actualizado el inventario real en `AGENTS.md` (81 archivos JS: 67 en `js/` + 14 en `js/wind/`, y 64 pruebas en `tests/`). Pendiente decisión del usuario sobre migración a Vite/ESM (requiere build en GitHub Actions para Pages) frente a mantener carga estática directa.
