import sys

with open('index.html', 'r', encoding='utf-8') as f:
    code = f.read()

target = """      const mat = texUrl 
        ? Cesium.Material.fromType('Image', { image: texUrl })
        : Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#0a1931') });
        
      const panelRenderState = (typeof Cesium !== 'undefined' && Cesium.RenderState && typeof Cesium.RenderState.fromCache === 'function')
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
      });"""

replacement = """      let mat;
      if (texUrl && typeof Cesium.Material === 'function') {
        try {
          mat = new Cesium.Material({
            fabric: {
              type: 'SolarMirrorGlass',
              uniforms: {
                image: texUrl,
                specularIntensity: 0.88,
                shininess: 96.0
              },
              components: {
                diffuse: 'texture2D(image, materialInput.st).rgb',
                specular: 'specularIntensity',
                shininess: 'shininess'
              }
            }
          });
        } catch (eMat) {
          mat = Cesium.Material.fromType('Image', { image: texUrl });
        }
      } else {
        mat = (texUrl && typeof Cesium.Material.fromType === 'function')
          ? Cesium.Material.fromType('Image', { image: texUrl })
          : Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#0a1931') });
      }

      const panelRenderState = (typeof Cesium !== 'undefined' && Cesium.RenderState && typeof Cesium.RenderState.fromCache === 'function')
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
          flat: false,
          faceForward: false,
          translucent: false,
          renderState: panelRenderState
        }),
        asynchronous: false,
        shadows: (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
      });"""

if target in code:
    code = code.replace(target, replacement, 1)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(code)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
    # Debug search
    idx = code.find('const mat = texUrl')
    if idx != -1:
        print("Found around:")
        print(code[idx:idx+300])
