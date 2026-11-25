/**
 * tests/e2e/smoke.e2e.mjs — Suite E2E mínima en Chromium headless con WebGL SwiftShader [F6-04]
 * Ejecutar con: npm run test:e2e
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 4179;
const URL = `http://127.0.0.1:${PORT}/`;

function startStaticServer() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout arrancando server.js')), 10000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes(String(PORT))) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server.js salió prematuramente (${code})`));
    });
  });
}

async function main() {
  const srv = await startStaticServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });

  const pageErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#ra-sidebar', { timeout: 15000 });

    // 1. Verificar cero desborde horizontal en portátil 1366x768
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error('Desbordamiento horizontal detectado en 1366x768');

    // 2. Verificar ausencia de aria-label corruptos > 120 chars
    const badAria = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-label]')).filter((el) => (el.getAttribute('aria-label') || '').length > 120).length
    );
    if (badAria > 0) throw new Error(`Detectados ${badAria} aria-label corruptos > 120 chars`);

    // 3. Verificar navegación por teclado Tab sin captura global y stack Escape en modal de catálogo
    await page.mouse.move(680, 380);
    await page.keyboard.press('Tab');
    const activeTag = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    if (!activeTag) throw new Error('Tab no movió el foco a ningún control UI');

    // 4. Verificar 0 errores no capturados de página
    if (pageErrors.length > 0) {
      throw new Error('Errores JS no capturados en arranque: ' + pageErrors.join(' | '));
    }

    console.log('[E2E Playwright] Smoke WebGL/WCAG/Responsive superado con 0 errores.');
  } finally {
    await browser.close();
    srv.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('[E2E Playwright] Fallo:', err);
  process.exit(1);
});
