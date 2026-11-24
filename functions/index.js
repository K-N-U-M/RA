/**
 * Cloud Function: gwaProxy
 * Proxy y parser de recurso eólico de alta resolución (250m WAsP)
 * desde Global Wind Atlas 3.0 (DTU Wind Energy / Banco Mundial).
 */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const { parseWAsPLib, validateHttpsUrl } = require('./wasp-parser');

// [AUD-2026 · B-09] Endurecimiento del proxy:
//  - CORS restringido a los orígenes de la app (antes `cors: true` = cualquiera).
//  - Rate limit best-effort por IP (30 req/min) para frenar bucles y abuso de cuota.
//  - Allowlist de host al descargar el .lib (antes SSRF si se manipulaba el XML).
//  - Timeout y tope de tamaño en ambas descargas.
//  - Errores genéricos al cliente; detalle solo en el log.
const ALLOWED_ORIGINS = [
  /^https:\/\/ra-solar-3d\.(web\.app|firebaseapp\.com)$/,
  /^https:\/\/[a-z0-9-]+\.web\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/
];
const RATE_LIMIT = { windowMs: 60000, max: 30, hits: new Map() };

function isRateLimited(ip) {
  const now = Date.now();
  const entry = RATE_LIMIT.hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    RATE_LIMIT.hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT.max;
}

async function fetchTextLimited(url, { maxBytes = 4 * 1024 * 1024, timeoutMs = 8000, allowedHostSuffix = null } = {}) {
  const parsed = validateHttpsUrl(url, allowedHostSuffix);
  const resp = await fetch(parsed, {
    headers: { 'User-Agent': 'RenewableArchitecture/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const text = await resp.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Respuesta demasiado grande');
  return text;
}

exports.gwaProxy = onRequest({
  cors: ALLOWED_ORIGINS,
  maxInstances: 5,
  timeoutSeconds: 30
}, async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Demasiadas peticiones. Inténtalo en un minuto.' });
    return;
  }

  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Parámetros inválidos. Se requiere lat (-90..90) y lon (-180..180)' });
    return;
  }

  const wpsUrl = `https://wps.globalwindatlas.info/?service=WPS&version=1.0.0&request=Execute&identifier=get_libfile&datainputs=location=%7B%22type%22%3A%22Point%22%2C%22coordinates%22%3A%5B${lon.toFixed(4)}%2C${lat.toFixed(4)}%5D%7D`;
  logger.info(`Consultando GWA WPS para lat=${lat}, lon=${lon}`);

  try {
    const xml = await fetchTextLimited(wpsUrl, {
      allowedHostSuffix: 'globalwindatlas.info',
      maxBytes: 512 * 1024
    });

    const match = xml.match(/"path":\s*"([^"]+)"/);
    if (!match) {
      throw new Error('No se encontró URL de .lib en respuesta de DTU GWA');
    }

    const libUrl = match[1].replace('http://', 'https://');
    logger.info(`Descargando .lib desde DTU: ${libUrl}`);

    const libText = await fetchTextLimited(libUrl, {
      allowedHostSuffix: 'globalwindatlas.info',
      maxBytes: 2 * 1024 * 1024
    });

    const parsed = parseWAsPLib(libText);
    res.set('Cache-Control', 'public, max-age=2592000'); // Cache 30 días
    res.json(parsed);

  } catch (err) {
    logger.error('Error al consultar Global Wind Atlas:', err);
    // Sin requisitos internos en la respuesta: mensaje genérico.
    res.status(502).json({ error: 'No se pudo obtener el recurso eólico (GWA)' });
  }
});
