/**
 * tests/test-server-hardening.js
 * [AUD-2026 · B-01/B-02/B-03/B-10] Contrato de seguridad del servidor estático.
 *
 * Verifica, contra un proceso real:
 *  - No se sirven archivos fuera de la allowlist (server.js, functions/, tests/, .gitignore).
 *  - Una URL malformada devuelve 400 y NO tumba el proceso.
 *  - Se aplican cabeceras de seguridad básicas.
 *  - El listado raíz sigue sirviendo index.html.
 */
'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 18080 + (process.pid % 500);
const BASE = `http://127.0.0.1:${PORT}`;

function request(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + pathname, { method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no arrancó en 8 s')), 8000);
    const onData = (buf) => {
      if (String(buf).includes('Servidor local RA activo')) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('El servidor terminó con código ' + code));
    });
  });
}

(async () => {
  console.log('═════════════════════════════════════════════════════════════════════');
  console.log('⚡ TEST SUITE: ENDURECIMIENTO DEL SERVIDOR ESTÁTICO');
  console.log('═════════════════════════════════════════════════════════════════════');

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });

  try {
    await waitForServer(child);

    // 1. Allowlist: código, tests y configuración no deben servirse.
    for (const denied of ['/server.js', '/functions/index.js', '/tests/test-js-syntax.js', '/.gitignore', '/package.json', '/js/ra-env.example.js']) {
      const r = await request(denied);
      assert.strictEqual(r.status, 404, `${denied} debe responder 404 (recibido ${r.status})`);
    }
    console.log('  ✓ PASS: server.js, functions/, tests/, .gitignore y package.json no se sirven');

    // 2. Raíz e index siguen disponibles.
    const home = await request('/');
    assert.strictEqual(home.status, 200, 'GET / debe servir index.html');
    assert.ok(/text\/html/.test(home.headers['content-type'] || ''), 'GET / debe ser HTML');
    console.log('  ✓ PASS: GET / sirve index.html');

    // 3. Cabeceras de seguridad.
    assert.strictEqual(home.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(home.headers['x-frame-options'], 'DENY');
    assert.ok(home.headers['content-security-policy'], 'debe enviar CSP');
    assert.ok(home.headers['referrer-policy'], 'debe enviar Referrer-Policy');
    console.log('  ✓ PASS: cabeceras nosniff / DENY / CSP / Referrer-Policy presentes');

    // 4. URL malformada: 400 y proceso vivo.
    const bad = await request('/%zz');
    assert.strictEqual(bad.status, 400, `/%zz debe responder 400 (recibido ${bad.status})`);
    const nul = await request('/%00');
    assert.strictEqual(nul.status, 400, `/%00 debe responder 400 (recibido ${nul.status})`);

    const alive = await request('/');
    assert.strictEqual(alive.status, 200, 'el servidor debe seguir vivo tras URLs malformadas');
    console.log('  ✓ PASS: /%zz y /%00 devuelven 400 sin tumbar el proceso');

    // 5. El 404 no refleja la entrada.
    const notFound = await request('/no-existe-xyz');
    assert.strictEqual(notFound.status, 404);
    assert.ok(!notFound.body.includes('no-existe-xyz'), 'el 404 no debe reflejar la URL pedida');
    console.log('  ✓ PASS: el cuerpo del 404 no refleja la URL');

    console.log('═════════════════════════════════════════════════════════════════════');
    console.log('🎉 SERVIDOR ENDURECIDO: TODAS LAS COMPROBACIONES PASARON');
    console.log('═════════════════════════════════════════════════════════════════════');
  } finally {
    child.kill();
  }
})().catch((err) => {
  console.error('❌ FALLO:', err.message);
  process.exit(1);
});
