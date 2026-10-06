function installCesiumWatchdog(viewer) {
  if (!viewer || !viewer.scene || !viewer.scene.context) return;
  const ctx = viewer.scene.context;
  if (!ctx.shaderCache || !ctx.shaderCache._shaders) return;
  
  let patched = false;
  // Iterate through all cached shaders
  const shaders = Object.values(ctx.shaderCache._shaders);
  for (let i = 0; i < shaders.length; i++) {
    const shader = shaders[i];
    if (shader._uniformsByName) {
      for (const name in shader._uniformsByName) {
        const uniform = shader._uniformsByName[name];
        // Check if this uniform is a sampler by seeing if it calls gl.bindTexture in its set method
        if (uniform && typeof uniform.set === 'function') {
          const setStr = uniform.set.toString();
          if (setStr.includes('bindTexture') && setStr.includes('_target')) {
            const proto = Object.getPrototypeOf(uniform);
            if (proto && !proto.__patchedWatchdog) {
              const originalSet = proto.set;
              proto.set = function() {
                if (!this.value) {
                  // Fallback to a default 1x1 texture to prevent crash
                  this.value = ctx.defaultTexture;
                }
                return originalSet.apply(this, arguments);
              };
              proto.__patchedWatchdog = true;
              patched = true;
            }
          }
        }
      }
    }
  }
  if (patched) {
    console.log('[WATCHDOG] Cesium UniformSampler successfully patched against _target crash.');
  }
}
