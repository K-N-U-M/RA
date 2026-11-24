const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=UTF-8'
};

function lanczosGamma(z) {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5209681287051, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109583659912, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * lanczosGamma(1 - z));
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function parseWAsPLib(libText) {
  const lines = libText.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 5) throw new Error('Formato .lib de WAsP inválido o truncado');

  const header = lines[0];
  const coordMatch = header.match(/<coordinates>([0-9.-]+),([0-9.-]+)/);
  const lon = coordMatch ? parseFloat(coordMatch[1]) : 0;
  const lat = coordMatch ? parseFloat(coordMatch[2]) : 0;

  const parts2 = lines[1].split(/\s+/).map(Number);
  const numRough = parts2[0], numHeights = parts2[1], numSectors = parts2[2];
  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!isInt(numRough, 1, 8) || !isInt(numHeights, 1, 12) || !isInt(numSectors, 1, 36)) {
    throw new Error('Cabecera .lib fuera de rango (rough/heights/sectors)');
  }
  const needed = 4 + numRough * (1 + numHeights * 2);
  if (lines.length < needed) throw new Error('Fichero .lib truncado');

  const roughnesses = lines[2].split(/\s+/).map(Number);
  const heights = lines[3].split(/\s+/).map(Number);
  if (roughnesses.length < numRough || heights.length < numHeights) {
    throw new Error('Cabecera .lib con rugosidades o alturas incompletas');
  }

  let curLine = 4;
  const roughnessBlocks = [];
  for (let r = 0; r < numRough; r++) {
    const freqs = lines[curLine++].split(/\s+/).map(Number);
    if (freqs.length < numSectors) throw new Error('Frecuencias .lib incompletas');
    const heightData = [];
    for (let h = 0; h < numHeights; h++) {
      const A = lines[curLine++].split(/\s+/).map(Number);
      const k = lines[curLine++].split(/\s+/).map(Number);
      if (A.length < numSectors || k.length < numSectors) throw new Error('Sectores Weibull .lib incompletos');
      let vMean = 0;
      for (let s = 0; s < numSectors; s++) {
        if (!Number.isFinite(A[s]) || !Number.isFinite(k[s]) || k[s] <= 0 || !Number.isFinite(freqs[s])) {
          throw new Error('Valores Weibull .lib inválidos');
        }
        const vSec = A[s] * lanczosGamma(1 + 1 / k[s]);
        vMean += (freqs[s] / 100) * vSec;
      }
      heightData.push({ heightM: heights[h], A, k, vMean: Number(vMean.toFixed(2)) });
    }
    roughnessBlocks.push({ z0: roughnesses[r], freqs, heightData });
  }

  const fieldBlock = roughnessBlocks.find(b => Math.abs(b.z0 - 0.03) < 0.01) || roughnessBlocks[1] || roughnessBlocks[0];
  const h10 = fieldBlock && (fieldBlock.heightData.find(d => d.heightM === 10) || fieldBlock.heightData[0]);
  const h50 = fieldBlock && (fieldBlock.heightData.find(d => d.heightM === 50) || fieldBlock.heightData[1] || h10);
  if (!h10 || !h50) throw new Error('Alturas de referencia .lib ausentes');
  const alpha = (h50.vMean > h10.vMean && h10.vMean > 0)
    ? Math.log(h50.vMean / h10.vMean) / Math.log(50 / 10)
    : 0.143;

  let maxFreq = -1;
  let prevailingSectorIdx = 0;
  for (let s = 0; s < numSectors; s++) {
    if (fieldBlock.freqs[s] > maxFreq) {
      maxFreq = fieldBlock.freqs[s];
      prevailingSectorIdx = s;
    }
  }
  const prevailingDeg = Math.round((prevailingSectorIdx * (360 / numSectors)) % 360);

  return {
    source: 'Global Wind Atlas 3.0 (DTU / World Bank 250m WAsP)',
    latitude: lat,
    longitude: lon,
    vMeanRefMs: h10.vMean,
    refHeightM: 10,
    vMean50mMs: h50.vMean,
    shearExponentAlpha: Number(Math.max(0.08, Math.min(0.40, alpha)).toFixed(3)),
    weibullK: Number(h10.k[prevailingSectorIdx].toFixed(2)),
    prevailingWindDirDeg: prevailingDeg,
    ambientTempC: 15.0,
    sectorFrequencies: fieldBlock.freqs,
    sectorA10: h10.A,
    sectorK10: h10.k,
    roughnesses: roughnesses,
    heights: heights
  };
}

// [AUD-2026 · B-10] Descarga de texto con timeout, tope de tamaño y allowlist de host.
// Sin esto, una respuesta WPS manipulada podía apuntar a un host interno (SSRF) o colgar
// el proceso acumulando megabytes en memoria.
function fetchTextLimited(rawUrl, opts) {
  const options = opts || {};
  const maxBytes = options.maxBytes || 4 * 1024 * 1024;
  const timeoutMs = options.timeoutMs || 8000;
  const allowedHostSuffix = options.allowedHostSuffix || null;

  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(rawUrl); } catch (e) { return reject(new Error('URL inválida')); }
    if (parsed.protocol !== 'https:') {
      return reject(new Error('Protocolo no permitido: ' + parsed.protocol));
    }
    if (allowedHostSuffix) {
      const host = parsed.hostname.toLowerCase();
      const suffix = String(allowedHostSuffix).toLowerCase().replace(/^\./, '');
      if (host !== suffix && !host.endsWith('.' + suffix)) {
        return reject(new Error('Host no permitido: ' + parsed.hostname));
      }
    }
    const req = https.get(parsed, { headers: { 'User-Agent': 'RenewableArchitecture/1.0' } }, (resp) => {
      if (resp.statusCode && resp.statusCode >= 300) {
        resp.resume();
        return reject(new Error('HTTP ' + resp.statusCode));
      }
      let data = '';
      let size = 0;
      resp.setEncoding('utf8');
      resp.on('data', (chunk) => {
        size += Buffer.byteLength(chunk, 'utf8');
        if (size > maxBytes) { req.destroy(new Error('Respuesta demasiado grande')); return; }
        data += chunk;
      });
      resp.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout de red')));
  });
}

async function handleGWAPetition(lat, lon, res) {
  const wpsUrl = `https://wps.globalwindatlas.info/?service=WPS&version=1.0.0&request=Execute&identifier=get_libfile&datainputs=location=%7B%22type%22%3A%22Point%22%2C%22coordinates%22%3A%5B${lon.toFixed(4)}%2C${lat.toFixed(4)}%5D%7D`;
  try {
    const xml = await fetchTextLimited(wpsUrl, { allowedHostSuffix: 'globalwindatlas.info' });

    const match = xml.match(/"path":\s*"([^"]+)"/);
    if (!match) {
      throw new Error('Respuesta WPS sin URL .lib');
    }
    const libUrl = match[1].replace('http://', 'https://');

    const libText = await fetchTextLimited(libUrl, {
      allowedHostSuffix: 'globalwindatlas.info',
      maxBytes: 2 * 1024 * 1024
    });

    const parsed = parseWAsPLib(libText);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'public, max-age=2592000'
    });
    res.end(JSON.stringify(parsed));
  } catch (err) {
    // [AUD-2026] No devolver `err.message` al cliente (fuga de internos/URLs).
    console.error('[server.js] Error GWA:', err.message);
    sendJson(res, 502, { error: 'No se pudo obtener el recurso eólico (GWA)' });
  }
}

// ── [AUD-2026 · B-01/B-02/B-03] Endurecimiento del servidor estático ──────────
// Antes: servía CUALQUIER archivo del repo (functions/, tests/, .gitignore) a toda la LAN,
// con CORS `*`, sin cabeceras de seguridad, y `decodeURIComponent` sin try/catch (un GET
// con `%zz` o `%00` mataba el proceso).
const ALLOWED_EXT = new Set([
  '.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg',
  '.ico', '.wasm', '.txt', '.webmanifest', '.map', '.pdf'
]);
const DENIED_SEGMENTS = new Set([
  'node_modules', 'functions', 'tests', 'doc', 'scripts', '.git', '.firebase'
]);
const DENIED_PREFIXES = ['assets/private'];
// Código y configuración que nunca debe descargarse desde el navegador.
const DENIED_FILES = new Set([
  'server.js', 'package.json', 'package-lock.json', 'firebase.json',
  'firestore.rules', 'storage.rules', 'firestore.indexes.json', '.firebaserc'
]);
const DENIED_EXT = new Set(['.md', '.rules', '.log', '.env']);
const LOOPBACK_ONLY = !process.argv.includes('--lan');

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  // CSP endurecida por directivas sin romper scripts/handlers inline ni workers/tiles Cesium
  // hasta completar la migración modular de Fase 4 (nonces/ESM).
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cesium.com https://unpkg.com https://cdnjs.cloudflare.com https://www.gstatic.com https://maps.googleapis.com blob:; style-src 'self' 'unsafe-inline' https://cesium.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* https://*.cesium.com https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app https://*.firebasestorage.app https://re.jrc.ec.europa.eu https://power.larc.nasa.gov https://*.open-meteo.com https://apidatos.ree.es https://nominatim.openstreetmap.org https://*.openstreetmap.org https://ovc.catastro.meh.es https://services.arcgisonline.com https://api.allorigins.win https://api.codetabs.com https://corsproxy.io https://unpkg.com https://cdnjs.cloudflare.com data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
}

/** Resuelve una URL de fichero a una ruta segura dentro de BASE_DIR, o null si se deniega. */
function resolveSafePath(rawUrl) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawUrl);
  } catch (e) {
    return { error: 400 };
  }
  if (decoded.indexOf('\0') !== -1) return { error: 400 };

  const segments = decoded.split(/[\\/]+/).filter(Boolean);
  for (const seg of segments) {
    if (seg === '.' || seg === '..') return { error: 400 };
    if (seg.startsWith('.')) return { error: 404 };
    if (DENIED_SEGMENTS.has(seg.toLowerCase())) return { error: 404 };
  }
  const normalizedRel = segments.map(s => s.toLowerCase()).join('/');
  if (DENIED_PREFIXES.some(p => normalizedRel === p || normalizedRel.startsWith(p + '/'))) {
    return { error: 404 };
  }

  const filePath = path.resolve(BASE_DIR, '.' + path.sep + segments.join(path.sep));
  const rootWithSep = BASE_DIR.endsWith(path.sep) ? BASE_DIR : BASE_DIR + path.sep;
  if (filePath !== BASE_DIR && !filePath.startsWith(rootWithSep)) return { error: 404 };

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return { error: 404 };
  if (DENIED_EXT.has(ext)) return { error: 404 };
  if (DENIED_FILES.has(path.basename(filePath).toLowerCase())) return { error: 404 };
  return { filePath };
}

const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  // CORS restringido a desarrollo local (antes: `*`).
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqUrl = (req.url || '/').split('?')[0];

  if (reqUrl === '/api/gwa') {
    let urlObj;
    try {
      urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost:8080'));
    } catch (e) {
      sendJson(res, 400, { error: 'Petición o cabecera Host inválida' });
      return;
    }
    const lat = parseFloat(urlObj.searchParams.get('lat'));
    const lon = parseFloat(urlObj.searchParams.get('lon'));
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      sendJson(res, 400, { error: 'Parámetros lat/lon inválidos' });
      return;
    }
    handleGWAPetition(lat, lon, res);
    return;
  }

  if (reqUrl === '/') reqUrl = '/index.html';

  const resolved = resolveSafePath(reqUrl);
  if (resolved.error) {
    res.writeHead(resolved.error, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end(resolved.error === 400 ? '400 Bad Request' : '404 Not Found');
    return;
  }
  const filePath = resolved.filePath;

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { try { res.destroy(); } catch (e) {} });
    stream.pipe(res);
  });
});

// Un cliente malformado no debe tumbar el proceso.
server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) {}
});

server.listen(PORT, LOOPBACK_ONLY ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`🚀 Servidor local RA activo en http://localhost:${PORT}/`);
  console.log(`🌐 Acceso en red local: http://127.0.0.1:${PORT}/`);
});
