/**
 * tests/test-security-contract.js
 * [AUD-2026 · B-05/B-06/B-07] Contrato estático de reglas y cliente de datos.
 *
 * No sustituye a las pruebas con el emulador de Firebase (ver anexo B del informe),
 * pero bloquea las regresiones más peligrosas: lectura anónima, escritura sin límites
 * y desalineación entre el modelo del cliente y las reglas.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: CONTRATO DE SEGURIDAD DE DATOS');
console.log('═════════════════════════════════════════════════════════════════════');

// ── Firestore ────────────────────────────────────────────────────────────────
const firestore = read('firestore.rules');
// Se ignoran comentarios: la comprobación es sobre reglas efectivas, no sobre prosa.
const firestoreCode = firestore.replace(/\/\/[^\n]*/g, '');

assert.ok(!/isPublic/.test(firestoreCode), 'firestore.rules no debe contener la rama isPublic (lectura anónima)');
const projectsBlock = (firestoreCode.match(/match\s+\/projects\/\{projectId\}\s*\{[\s\S]*?\n\s{2,4}\}/) || [''])[0];
assert.ok(projectsBlock.length > 0, 'Debe existir el bloque /projects');
assert.ok(!/allow\s+read\s*:\s*if\s+true/.test(projectsBlock), 'No debe haber lectura universal en /projects');
assert.ok(/function\s+isSignedIn\s*\(/.test(firestore), 'Debe existir el helper isSignedIn()');
assert.ok(/allow\s+read\s*:\s*if\s+isOwner\(\)\s*\|\|\s*isTenantMember\(\)\s*\|\|\s*isAdmin\(\)/.test(firestore),
  'La lectura debe exigir propietario, tenant o admin');
assert.ok(/request\.resource\.data\.ownerId\s*==\s*resource\.data\.ownerId/.test(firestore),
  'update no debe permitir cambiar ownerId');
assert.ok(/request\.resource\.data(\.tenantId|\.get\('tenantId',\s*null\))\s*==\s*resource\.data(\.tenantId|\.get\('tenantId',\s*null\))/.test(firestore),
  'update no debe permitir cambiar tenantId');
assert.ok(/allow\s+create\s*:\s*if\s+isSignedIn\(\)[\s\S]*?request\.resource\.data\.ownerId\s*==\s*request\.auth\.uid/.test(firestore),
  'create debe exigir ownerId = uid');
console.log('  ✓ PASS: Firestore cierra lectura anónima y protege ownerId/tenantId');

// ── Storage ──────────────────────────────────────────────────────────────────
const storage = read('storage.rules');
const storageCode = storage.replace(/\/\/[^\n]*/g, '');

assert.ok(!/allow\s+read\s*:\s*if\s+true/.test(storageCode), 'branding no debe ser de lectura anónima');
assert.ok(/request\.resource\.size\s*<=\s*10\s*\*\s*1024\s*\*\s*1024/.test(storage), 'Debe limitar el tamaño a 10 MB');
assert.ok(/contentType/.test(storage), 'Debe validar el tipo MIME');
assert.ok(/application\/pdf/.test(storage) && /image\/png/.test(storage), 'Debe permitir solo tipos previstos');
console.log('  ✓ PASS: Storage valida tamaño y tipo, y cierra la lectura anónima');

// ── Cliente: alineación con las reglas ───────────────────────────────────────
const fb = read('js/firebase-service.js');

assert.ok(/cleanData\.ownerId\s*=\s*userId/.test(fb), 'El cliente debe escribir ownerId en la RAÍZ');
assert.ok(/\.where\(\s*['"]ownerId['"]\s*,\s*['"]==['"]/.test(fb), 'La consulta debe filtrar por ownerId raíz');
assert.ok(/if\s*\(!user\)\s*return\s*\[\]/.test(fb), 'Sin sesión no se debe consultar la colección');
assert.ok(/data\.ownerId\s*!==\s*_currentUser\.uid/.test(fb), 'La carga debe verificar la propiedad del documento');
assert.ok(/throw new Error\('Inicia sesión para guardar proyectos en la nube\.'\)/.test(fb),
  'Guardar sin sesión debe fallar con mensaje claro');
assert.ok(!/meta\.ownerId\s*=\s*userId;\s*$/m.test(fb.split('cleanData.ownerId')[0] || ''),
  'No debe depender solo de meta.ownerId');
console.log('  ✓ PASS: El cliente escribe/consulta ownerId raíz y valida propiedad');

// ── Servidor: allowlist y cabeceras ──────────────────────────────────────────
const server = read('server.js');

assert.ok(/ALLOWED_EXT/.test(server) && /DENIED_SEGMENTS/.test(server), 'El servidor debe tener allowlist');
assert.ok(/resolveSafePath/.test(server), 'El servidor debe resolver rutas de forma segura');
assert.ok(/127\.0\.0\.1/.test(server), 'El servidor debe escuchar en loopback por defecto');
assert.ok(/X-Content-Type-Options/.test(server), 'Debe enviar nosniff');
assert.ok(!/Access-Control-Allow-Origin',\s*'\*'/.test(server), 'CORS no debe ser comodín');
console.log('  ✓ PASS: Servidor con allowlist, loopback y cabeceras');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 CONTRATO DE SEGURIDAD: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
