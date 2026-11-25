'use strict';
/**
 * tests/test-firebase-rules.js — Suite de reglas Firestore y Storage contra Firebase Emulator [F6-02 / F6-04]
 * Ejecutar con: npm run test:rules
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require('@firebase/rules-unit-testing');

const ROOT = path.resolve(__dirname, '..');

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'ra-solar-3d-test',
    firestore: {
      rules: fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')
    },
    storage: {
      rules: fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8')
    }
  });

  try {
    const alice = testEnv.authenticatedContext('alice', { tenantId: 'tenant-a' });
    const bob = testEnv.authenticatedContext('bob', { tenantId: 'tenant-b' });
    const anon = testEnv.unauthenticatedContext();

    // 1. Firestore: alta legítima del propietario con esquema válido
    await assertSucceeds(
      alice.firestore().collection('projects').doc('proj_12345678').set({
        ownerId: 'alice',
        tenantId: 'tenant-a',
        meta: { id: 'proj_12345678', updatedAt: new Date().toISOString(), name: 'Cubierta A' }
      })
    );

    // 2. Firestore: prohibido inyectar tenantId ajeno al crear
    await assertFails(
      alice.firestore().collection('projects').doc('proj_spoof_01').set({
        ownerId: 'alice',
        tenantId: 'tenant-b',
        meta: { id: 'proj_spoof_01', updatedAt: new Date().toISOString() }
      })
    );

    // 3. Firestore: Bob (tenant-b) NO puede leer ni editar proyecto de Alice (tenant-a)
    await assertFails(bob.firestore().collection('projects').doc('proj_12345678').get());
    await assertFails(bob.firestore().collection('projects').doc('proj_12345678').update({ 'meta.name': 'Hack' }));

    // 4. Firestore: anónimo bloqueado
    await assertFails(anon.firestore().collection('projects').doc('proj_12345678').get());

    // 5. Storage: branding aislado por propietario/tenant y límite <= 2 MB solo imagen
    const pngTiny = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    await assertSucceeds(
      alice.storage().ref('branding/alice/logo.png').put(pngTiny, { contentType: 'image/png' }).then(() => true)
    );
    await assertFails(
      alice.storage().ref('branding/alice/script.js').put(pngTiny, { contentType: 'application/javascript' }).then(() => true)
    );
    await assertFails(bob.storage().ref('branding/alice/logo.png').getDownloadURL());
    await assertFails(anon.storage().ref('branding/alice/logo.png').getDownloadURL());

    console.log('[Rules Emulator] Todas las pruebas de Firestore y Storage pasaron.');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error('[Rules Emulator] Fallo:', err);
  process.exit(1);
});
