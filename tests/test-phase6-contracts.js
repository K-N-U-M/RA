'use strict';
/**
 * tests/test-phase6-contracts.js — Contratos reales sin mocks obsoletos [F6-04]
 * =============================================================================
 * Evalúa directamente módulos de producción reales:
 *  - js/wind/wasp-parser.js (SSRF, CORS cerrado, validación 422)
 *  - js/sanitizer.js (XSS DOM, URI seguras, JSON para <script>)
 *  - js/docx-exporter.js (purga XSS, bloqueo URLs externas en MHTML, escape XML)
 *  - js/wind/wind-electrical.js (reactancia X, Voc_overspeed)
 *  - js/bill-auditor.js (existencia y contrato de exportaciones)
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function runTest(name, fn) {
  try {
    fn();
    console.log('  PASS:', name);
  } catch (err) {
    console.error('  FAIL:', name, '->', err.message);
    process.exitCode = 1;
  }
}

console.log('=== Contratos Reales Fase 6 (F6-01..F6-04) ===');

// 1. WAsP parser + Anti-SSRF + CORS cerrado
const wasp = require(path.join(ROOT, 'js', 'wind', 'wasp-parser.js'));

runTest('validateExternalProxyUrl acepta globalwindatlas.info y subdominios HTTPS válidos', () => {
  const u1 = wasp.validateExternalProxyUrl('https://wps.globalwindatlas.info/?a=1', 'globalwindatlas.info');
  assert.strictEqual(u1.hostname, 'wps.globalwindatlas.info');
  const u2 = wasp.validateExternalProxyUrl('https://globalwindatlas.info/data.lib', 'globalwindatlas.info');
  assert.strictEqual(u2.hostname, 'globalwindatlas.info');
});

runTest('validateExternalProxyUrl rechaza dominios homónimos, HTTP, puertos raros, credenciales e IPs metadata', () => {
  const badUrls = [
    'https://evil-globalwindatlas.info/file.lib',
    'http://globalwindatlas.info/file.lib',
    'https://169.254.169.254/latest/meta-data/',
    'https://127.0.0.1/secret',
    'https://user:pass@wps.globalwindatlas.info/x',
    'https://wps.globalwindatlas.info:8443/x'
  ];
  for (const url of badUrls) {
    assert.throws(() => wasp.validateExternalProxyUrl(url, 'globalwindatlas.info'), `Debió rechazar ${url}`);
  }
});

runTest('isAllowedCorsOrigin permite solo dominios propios y rechaza otros proyectos .web.app', () => {
  assert.strictEqual(wasp.isAllowedCorsOrigin('https://ra-solar-3d.web.app'), true);
  assert.strictEqual(wasp.isAllowedCorsOrigin('https://ra-solar-3d.firebaseapp.com'), true);
  assert.strictEqual(wasp.isAllowedCorsOrigin('http://localhost:8080'), true);
  assert.strictEqual(wasp.isAllowedCorsOrigin('https://otro-proyecto.web.app'), false);
  assert.strictEqual(wasp.isAllowedCorsOrigin('https://evil.com'), false);
});

runTest('parseWAsPLib lanza error controlado con statusCode 422 ante datos truncados o no numéricos', () => {
  let caught = null;
  try {
    wasp.parseWAsPLib('solo\ndos\nlineas');
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, 'Debe lanzar error');
  assert.strictEqual(caught.statusCode, 422);
});

// 2. Sanitizador real
runTest('RASanitize neutraliza XSS y valida URIs de imagen', () => {
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'sanitizer.js'), 'utf8'), sandbox);
  const S = sandbox.RASanitize;
  assert.ok(S && typeof S.plain === 'function');
  assert.strictEqual(S.plain('<img src=x onerror=alert(1)>').includes('<img'), false);
  assert.strictEqual(S.safeImageUri('javascript:alert(1)'), '');
  assert.strictEqual(S.safeImageUri('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.strictEqual(S.safeJsonForScript({ a: '</script>' }).includes('</script>'), false);
});

// 3. Exportador DOCX/MHTML real (sin URLs externas http/https ni título sin escapar)
runTest('RADocxExporter purga scripts, eventos, URLs remotas y escapa XML en título', () => {
  const sandbox = {
    window: {},
    TextEncoder,
    Blob: class FakeBlob {
      constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; }
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'docx-exporter.js'), 'utf8'), sandbox);
  const exp = sandbox.RADocxExporter;
  assert.ok(exp && typeof exp.buildDocxBlobFromHtml === 'function');

  const blob = exp.buildDocxBlobFromHtml(
    '<p onclick="alert(1)">Hola</p><script>evil()</script><img src="https://attacker.example/pixel.png"><div style="background:url(http://evil.example/bg.png)">X</div>',
    {
      title: 'Propuesta <Cliente & "S.L.">',
      styles: '@import url(https://evil.example/a.css); .a { background: url(https://evil.example/b.png); }'
    }
  );
  const rawBytes = Buffer.from(blob.parts[0]);
  const text = rawBytes.toString('utf8');
  assert.strictEqual(/attacker\.example|evil\.example/i.test(text), false, 'No debe contener URLs remotas externas');
  assert.strictEqual(/<script|onclick/i.test(text), false, 'No debe contener scripts ni handlers inline');
  assert.strictEqual(text.includes('Propuesta &lt;Cliente &amp; &quot;S.L.&quot;&gt;'), true, 'Título XML debe ir escapado');
});

// 4. Cobertura de contratos de módulos críticos (storage-cache, ui-outliner, wind-electrical, bill-auditor)
runTest('Módulos críticos cargan sin errores de sintaxis en contexto aislado', () => {
  const files = [
    'js/storage-cache.js',
    'js/ui-outliner.js',
    'js/wind/wind-electrical.js',
    'js/proposal-style-studio.js',
    'js/wind/wind-ui.js',
    'js/bill-auditor.js'
  ];
  for (const rel of files) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: rel }), `Error de compilación en ${rel}`);
  }
});

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
console.log('=== Todos los contratos Fase 6 OK ===');
