/**
 * Configuración base de Vite para migración incremental ESM (Fase 4 · F4-01).
 * Mantiene compatibilidad total con el servidor estático actual (server.js) mientras
 * habilita empaquetado de producción con content-hash y Web Workers en formato módulo.
 */
export default {
  root: '.',
  publicDir: 'assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: 'index.html'
    }
  },
  worker: {
    format: 'es'
  },
  server: {
    port: 8080,
    strictPort: false
  }
};
