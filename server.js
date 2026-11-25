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

const {
  lanczosGamma,
  parseWAsPLib,
  validateExternalProxyUrl,
  isAllowedCorsOrigin
} = require('./js/wind/wasp-parser');

// [AUD-2026 · B-10 / F3-01 / F6-01] Descarga de texto con timeout, tope de tamaño y anti-SSRF estricto (SSOT).
function fetchTextLimited(rawUrl, opts) {
  const options = opts || {};
  const maxBytes = options.maxBytes || 4 * 1024 * 1024;
  const timeoutMs = options.timeoutMs || 8000;
  const allowedHostSuffix = options.allowedHostSuffix || null;

  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = validateExternalProxyUrl(rawUrl, allowedHostSuffix); } catch (e) { return reject(e); }
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
      const noLibErr = new Error('Respuesta WPS sin URL .lib');
      noLibErr.statusCode = 422;
      throw noLibErr;
    }
    const libUrl = match[1].replace(/^http:\/\//i, 'https://');

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
    // [AUD-2026 / F6-01] No devolver `err.message` al cliente; retornar 422 si el .lib es inválido.
    console.error('[server.js] Error GWA:', err.message);
    if (err && err.statusCode === 422) {
      sendJson(res, 422, { error: 'Los datos eólicos recibidos de GWA no son válidos para estas coordenadas' });
      return;
    }
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
  // CSP endurecida por directivas con cobertura completa de CesiumJS (workers/assets), Google 3D Tiles y Firebase Auth/Firestore
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cesium.com https://*.cesium.com https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://www.gstatic.com https://apis.google.com https://maps.googleapis.com https://*.googleapis.com blob:; style-src 'self' 'unsafe-inline' https://cesium.com https://*.cesium.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cesium.com data:; img-src 'self' data: blob: https:; worker-src 'self' https://cesium.com https://*.cesium.com blob:; child-src 'self' https://cesium.com https://*.cesium.com https://*.firebaseapp.com https://accounts.google.com blob:; frame-src 'self' https://*.firebaseapp.com https://accounts.google.com blob:; connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* https://cesium.com https://*.cesium.com https://*.virtualearth.net https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com https://*.ggpht.com https://*.firebaseio.com https://*.firebaseapp.com https://*.cloudfunctions.net https://*.run.app https://*.firebasestorage.app https://re.jrc.ec.europa.eu https://power.larc.nasa.gov https://*.open-meteo.com https://apidatos.ree.es https://nominatim.openstreetmap.org https://*.openstreetmap.org https://ovc.catastro.meh.es https://services.arcgisonline.com https://*.arcgis.com https://api.allorigins.win https://api.codetabs.com https://corsproxy.io https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
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

  // [F6-01] CORS unificado con Cloud Functions (lista cerrada en wasp-parser.js)
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
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
