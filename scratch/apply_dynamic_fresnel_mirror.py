import sys

with open('index.html', 'r', encoding='utf-8') as f:
    code = f.read()

target = """      const mat = (texUrl && typeof Cesium.Material.fromType === 'function')
        ? Cesium.Material.fromType('Image', { image: texUrl })
        : (Cesium.Material && typeof Cesium.Material.fromType === 'function' ? Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#0a1931') }) : undefined);

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
      });
      
      window.simulatedPanelsPrimitive = viewer.scene.primitives.add(primitive);"""

replacement = """      const panelRenderState = (typeof Cesium !== 'undefined' && Cesium.RenderState && typeof Cesium.RenderState.fromCache === 'function')
        ? Cesium.RenderState.fromCache({
            depthTest: { enabled: true },
            depthMask: true,
            polygonOffset: { enabled: true, factor: -2.0, units: -2.0 }
          })
        : undefined;

      let primitive = null;
      // Intento 1: Shader dinámico Fresnel PBR (Efecto espejo reactivo al ángulo de cámara y cielo)
      if (texUrl && typeof Cesium.Material === 'function') {
        try {
          const mirrorMat = new Cesium.Material({
            fabric: {
              uniforms: {
                image: texUrl,
                reflectivity: 0.65
              },
              source: `
                czm_material czm_getMaterial(czm_materialInput materialInput) {
                  czm_material material = czm_getDefaultMaterial(materialInput);
                  vec4 texColor = texture2D(image, materialInput.st);
                  
                  vec3 normalEC = normalize(materialInput.normalEC);
                  vec3 viewDirEC = -normalize(materialInput.positionToEyeEC);
                  float cosTheta = clamp(dot(normalEC, -viewDirEC), 0.0, 1.0);
                  
                  // Fresnel Schlick para vidrio solar templado (n = 1.52)
                  float F0 = 0.043;
                  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 3.5);
                  
                  // Gradiente dinámico de cielo físico reflejado en el vidrio
                  vec3 reflectEC = reflect(viewDirEC, normalEC);
                  vec3 skyZenith = vec3(0.50, 0.68, 0.88);
                  vec3 skyHorizon = vec3(0.78, 0.85, 0.94);
                  vec3 skyReflect = mix(skyHorizon, skyZenith, clamp(reflectEC.y * 0.5 + 0.5, 0.0, 1.0));
                  
                  material.diffuse = mix(texColor.rgb, skyReflect, fresnel * reflectivity);
                  material.alpha = texColor.a;
                  return material;
                }
              `
            }
          });

          primitive = new Cesium.Primitive({
            geometryInstances: instances,
            appearance: new Cesium.MaterialAppearance({
              material: mirrorMat,
              flat: false,
              faceForward: false,
              translucent: false,
              renderState: panelRenderState
            }),
            asynchronous: false,
            shadows: (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
          });
          window.simulatedPanelsPrimitive = viewer.scene.primitives.add(primitive);
        } catch (eFresnel) {
          primitive = null;
          if (window.RA && window.RA.log) window.RA.log.warn('[Shader Fresnel fallback]', eFresnel);
        }
      }

      // Fallback seguro: Material Image nativo si el shader custom no se inicializa
      if (!primitive) {
        const fallbackMat = (texUrl && typeof Cesium.Material.fromType === 'function')
          ? Cesium.Material.fromType('Image', { image: texUrl })
          : (Cesium.Material && typeof Cesium.Material.fromType === 'function' ? Cesium.Material.fromType('Color', { color: Cesium.Color.fromCssColorString('#0a1931') }) : undefined);

        primitive = new Cesium.Primitive({
          geometryInstances: instances,
          appearance: new Cesium.MaterialAppearance({
            material: fallbackMat,
            flat: true,
            translucent: false,
            renderState: panelRenderState
          }),
          asynchronous: false,
          shadows: (typeof Cesium !== 'undefined' && Cesium.ShadowMode ? Cesium.ShadowMode.ENABLED : 1)
        });
        window.simulatedPanelsPrimitive = viewer.scene.primitives.add(primitive);
      }"""

if target in code:
    code = code.replace(target, replacement, 1)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(code)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
