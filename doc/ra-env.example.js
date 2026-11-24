/**
 * ⚠️ PLANTILLA — copiar a `js/ra-env.js` y rellenar con credenciales RESTRINGIDAS.
 *
 * `js/ra-env.js` está en .gitignore y NO se versiona.
 *
 * Restricciones obligatorias antes de poner una clave aquí:
 *   1. Google Maps Platform → restringir por HTTP referrer (tu dominio) y solo las APIs
 *      que uses (Maps JavaScript, Geocoding, Elevation). Poner cuota diaria máxima.
 *   2. Cesium ion → token con ámbito mínimo (solo 3D Tiles / Google Photorealistic)
 *      y restringido por dominio si el plan lo permite.
 *   3. Firebase → la apiKey web es pública por diseño; protégela con App Check y
 *      reglas de Firestore/Storage (ver firestore.rules y storage.rules).
 *
 * Rotación: si una clave ha estado en git, considérala comprometida. Revócala en consola
 * y genera una nueva; no basta con borrarla del código.
 */
window.RA_ENV = {
  googleMaps: 'PEGA_AQUI_TU_CLAVE_RESTRINGIDA',
  cesiumIon: 'PEGA_AQUI_TU_TOKEN_CESIUM',
  firebase: {
    apiKey: 'PEGA_AQUI_TU_FIREBASE_API_KEY',
    authDomain: 'tu-proyecto.firebaseapp.com',
    projectId: 'tu-proyecto',
    storageBucket: 'tu-proyecto.firebasestorage.app',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000000000'
  }
};
