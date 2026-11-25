#!/usr/bin/env node
/**
 * scripts/inject-build-meta.mjs — Generador automático de metadatos de build y empaquetado dist/ [F6-05]
 * ======================================================================================================
 * Elimina ediciones manuales de fecha de deploy, hash SHA y cache-busters ?v= en index.html.
 *
 * Uso:
 *   node scripts/inject-build-meta.mjs                  -> genera build-meta.json en raíz
 *   node scripts/inject-build-meta.mjs --sync-functions -> sincroniza js/wind/wasp-parser.js -> functions/wasp-parser.js
 *   node scripts/inject-build-meta.mjs --out-dir dist --stamp-html [--generate-env]
 *                                                       -> prepara artefacto dist/ listo para deploy CI/CD
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { outDir: null, stampHtml: false, generateEnv: false, syncFunctions: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-dir' && argv[i + 1]) {
      args.outDir = path.resolve(ROOT, argv[++i]);
    } else if (a === '--stamp-html') {
      args.stampHtml = true;
    } else if (a === '--generate-env') {
      args.generateEnv = true;
    } else if (a === '--sync-functions') {
      args.syncFunctions = true;
    }
  }
  return args;
}

function getGitShortSha() {
  if (process.env.GITHUB_SHA) return String(process.env.GITHUB_SHA).slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_) {
    return 'local';
  }
}

function getGitBranch() {
  if (process.env.GITHUB_REF_NAME) return String(process.env.GITHUB_REF_NAME);
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_) {
    return 'unknown';
  }
}

function formatDisplayDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function copyDirRecursive(src, dest, ignoreNames) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (ignoreNames.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d, ignoreNames);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function buildDistEnvJs() {
  const envObj = {
    cesiumIonToken: process.env.RA_CESIUM_ION_TOKEN || '',
    googleMapsApiKey: process.env.RA_GOOGLE_MAPS_KEY || '',
    firebase: {
      apiKey: process.env.RA_FIREBASE_API_KEY || '',
      authDomain: process.env.RA_FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.RA_FIREBASE_PROJECT_ID || 'ra-solar-3d',
      storageBucket: process.env.RA_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: process.env.RA_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.RA_FIREBASE_APP_ID || ''
    }
  };
  return `// Generado automáticamente por CI/CD — NO editar manualmente\nwindow.RA_ENV = ${JSON.stringify(envObj, null, 2)};\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const now = new Date();
  const meta = {
    version: pkg.version || '0.0.0',
    commit: getGitShortSha(),
    branch: getGitBranch(),
    builtAt: now.toISOString(),
    displayDate: formatDisplayDate(now)
  };

  if (opts.syncFunctions) {
    const srcWasp = path.join(ROOT, 'js', 'wind', 'wasp-parser.js');
    const dstWasp = path.join(ROOT, 'functions', 'wasp-parser.js');
    fs.copyFileSync(srcWasp, dstWasp);
    console.log('[build-meta] Sincronizado functions/wasp-parser.js desde js/wind/wasp-parser.js');
  }

  // Escribir build-meta.json en raíz (para desarrollo local y hosting directo)
  const rootMetaPath = path.join(ROOT, 'build-meta.json');
  fs.writeFileSync(rootMetaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log(`[build-meta] Generado build-meta.json: v${meta.version} · #${meta.commit} (${meta.displayDate})`);

  if (opts.outDir) {
    fs.rmSync(opts.outDir, { recursive: true, force: true });
    fs.mkdirSync(opts.outDir, { recursive: true });

    const ignoreAtRoot = new Set([
      '.git', '.github', '.firebase', 'node_modules', 'functions', 'tests',
      'doc', 'scripts', 'dist', 'src', 'server.js', 'package.json', 'package-lock.json',
      'firebase.json', 'firestore.rules', 'storage.rules', 'firestore.indexes.json',
      '.firebaserc', 'tsconfig.json', 'vite.config.js'
    ]);
    const ignoreNested = new Set(['ra-env.js', '.DS_Store']);

    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (ignoreAtRoot.has(entry.name) || entry.name.endsWith('.md')) continue;
      const srcPath = path.join(ROOT, entry.name);
      const dstPath = path.join(opts.outDir, entry.name);
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, dstPath, ignoreNested);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }

    if (opts.stampHtml) {
      const distIndex = path.join(opts.outDir, 'index.html');
      if (fs.existsSync(distIndex)) {
        let html = fs.readFileSync(distIndex, 'utf8');
        // Actualizar todos los ?v=... locales con el commit SHA exacto del build
        html = html.replace(/((?:js|css|assets)\/[a-zA-Z0-9_./-]+)\?v=[a-zA-Z0-9_.-]+/g, `$1?v=${meta.commit}`);
        html = html.replace(/DEPLOY:\s*[^<]+/g, `DEPLOY: ${meta.displayDate} (v${meta.version} · #${meta.commit})`);
        html = html.replace(/DEP:\s*[^<]+/g, `DEP: ${meta.displayDate}`);
        fs.writeFileSync(distIndex, html, 'utf8');
      }
    }

    if (opts.generateEnv) {
      const envOut = path.join(opts.outDir, 'js', 'ra-env.js');
      fs.mkdirSync(path.dirname(envOut), { recursive: true });
      fs.writeFileSync(envOut, buildDistEnvJs(), 'utf8');
      console.log('[build-meta] Generado dist/js/ra-env.js desde variables de entorno CI');
    }

    console.log(`[build-meta] Artefacto empaquetado en ${opts.outDir}`);
  }
}

main();
