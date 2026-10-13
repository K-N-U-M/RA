# 📋 Plan de Refactorización y Auditoría del Sidebar (Menús Laterales)

> **Documento de Trabajo:** Este archivo contiene los pasos tácticos para reordenar la interfaz de usuario (barra lateral) y alinearla estrictamente con el flujo canónico de 5 pasos definido en `AGENTS.md`.

## 🚨 Problemas Detectados

1. **La Paradoja del Inversor (Dependencia circular Paso 3 ↔ Paso 4):** El Paso 3 permite dimensionar el layout de paneles según el "Ajuste Óptimo al Inversor", pero el inversor se elige en el Paso 4.
2. **Controles de Visualización Secuestrados:** Controles globales como las texturas PBR y las etiquetas 3D están limitados al panel del Paso 2.
3. **Sobrecarga en Ingeniería (Paso 4):** Mezcla selección de catálogo, topología lógica de strings, colocación física de objetos 3D y trazado manual de cables.
4. **Desubicación de Reportes Técnicos:** El botón "Auditoría Matemática PFV" está en el Paso 3, cuando conceptualmente pertenece a los entregables del Paso 5.

---

## 🛠️ Plan de Acción Paso a Paso

### FASE 1: Liberación de Controles Globales
- [ ] **Mover toggles 3D:** Extraer los botones *"Textura Fotorrealista PBR (T)"* y *"Etiquetas y Cotas 3D (L)"* del `wp-step-2-content` en `index.html`.
- [ ] **Reubicación:** Moverlos a la barra de controles globales flotantes (ej. junto al botón de Ajustes de Renderizado abajo a la derecha, o en una barra de herramientas superior dedicada).

### FASE 2: Resolución de la Paradoja del Inversor
- [ ] **Mover selección de hardware principal:** Mover el acceso al Catálogo y la selección del Inversor/Microinversor del Paso 4 al **Paso 3**.
- [ ] **Justificación:** El Paso 3 (Análisis Solar) debe tener toda la información (factura del cliente y capacidad del inversor) para poder decidir matemáticamente cuántos paneles caben o hacen falta antes de lanzar el Heatmap.

### FASE 3: Reestructuración del Paso 4 (Ingeniería Eléctrica)
- [ ] **Limpiar el layout:** Una vez movida la selección del inversor al Paso 3, el Paso 4 queda dedicado exclusivamente a la topología y trazado.
- [ ] **Crear sub-secciones visuales en el Paso 4:**
  - *Bloque A (Topología Lógica):* "Casación Inteligente" y asignación de strings a los MPPT del inversor (ya seleccionado previamente).
  - *Bloque B (Emplazamiento 3D):* Botones "Situar Inversor 3D", "Situar Cuadro DC", "Situar Contador AC".
  - *Bloque C (Trazado de Rutas):* Botones "Trazar Bandeja DC" y "Trazar Tubo AC".

### FASE 4: Reubicación de Entregables
- [ ] **Mover Auditoría:** Cortar el botón *"VER AUDITORÍA MATEMÁTICA PFV"* del Paso 3.
- [ ] **Pegar en Paso 5:** Colocarlo en el Paso 5 (Entrega y Memoria) junto al resto de generadores de PDF y balances financieros.

---
*Nota para Agentes IA: Ejecutar estas fases estrictamente en orden, comprobando el funcionamiento de los event listeners (`onclick`) al reubicar el código HTML.*
