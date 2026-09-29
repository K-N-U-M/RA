import sys

with open('index.html', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add KeyT to switch (e.code)
old_switch = """    case 'KeyL':
      if (typeof toggleLabelsVisibility === 'function') {
        toggleLabelsVisibility();
      }
      break;"""

new_switch = """    case 'KeyL':
      if (typeof toggleLabelsVisibility === 'function') {
        toggleLabelsVisibility();
      }
      break;
    case 'KeyT':
      if (typeof togglePhotorealisticPanelsTexture === 'function') {
        togglePhotorealisticPanelsTexture();
      }
      break;"""

if old_switch in code:
    code = code.replace(old_switch, new_switch, 1)
    print("KeyT added to switch")
else:
    print("Could not find old_switch")

# 2. Update isPbrMode primitive creation
old_pbr_prim = """      const primitive = new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.MaterialAppearance({
          material: mat,
          flat: false,
          translucent: false
        }),
        asynchronous: true
      });
      
      viewer.scene.primitives.add(primitive);
      if (!window.raSolarPrimitives) window.raSolarPrimitives = [];
      window.raSolarPrimitives.push(primitive);"""

new_pbr_prim = """      const panelRenderState = (typeof Cesium !== 'undefined' && Cesium.RenderState && typeof Cesium.RenderState.fromCache === 'function')
        ? Cesium.RenderState.fromCache({
            depthTest: { enabled: true },
            depthMask: true,
            polygonOffset: { enabled: true, factor: -2.0, units: -2.0 }
          })
        : undefined;

      const primitive = new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.MaterialAppearance({
          material: mat,
          flat: true,
          translucent: false,
          renderState: panelRenderState
        }),
        asynchronous: false,
        shadows: (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
      });
      
      window.simulatedPanelsPrimitive = viewer.scene.primitives.add(primitive);"""

if old_pbr_prim in code:
    code = code.replace(old_pbr_prim, new_pbr_prim, 1)
    print("PBR primitive creation updated")
else:
    print("Could not find old_pbr_prim")

# 3. Add flat: true to PerInstanceColorAppearance
old_color_app = """          const appearance = Cesium.PerInstanceColorAppearance ? new Cesium.PerInstanceColorAppearance({
            translucent: false,
            closed: false,
            renderState: panelRenderState
          }) : undefined;"""

new_color_app = """          const appearance = Cesium.PerInstanceColorAppearance ? new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: false,
            closed: false,
            renderState: panelRenderState
          }) : undefined;"""

if old_color_app in code:
    code = code.replace(old_color_app, new_color_app, 1)
    print("Color appearance flat: true added")
else:
    print("Could not find old_color_app")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(code)
print("Done!")
