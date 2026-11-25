/**
 * Cloud Function: gwaProxy
 * Proxy y parser de recurso eólico de alta resolución (250m WAsP)
 * desde Global Wind Atlas 3.0 (DTU Wind Energy / Banco Mundial).
 */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const {
  parseWAsPLib,
  validateExternalProxyUrl,
  ALLOWED_CORS_ORIGINS
} = require('./wasp-parser');

// [AUD-2026 · B-09 / F6-01] Endurecimiento unificado del proxy (SSOT con server.js):
//  - CORS cerrado estrictamente a los dominios propios de la app (sin comodín *.web.app).
//  - Rate limit acotado con poda LRU/TTL por IP real (30 req/min, máx 1.000 claves).
//  - Anti-SSRF estricto (HTTPS:443, subdominio con punto, bloqueo redirecciones manual).
//  - Validación numérica 422 controlada frente a errores de red 502.
const RATE_LIMIT = { windowMs: 60000, max: 30, maxEntries: 1000, hits: new Map() };

function pruneRateLimit(now) {
  for (const [key, val] of RATE_LIMIT.hits.entries()) {
    if (now - val.start > RATE_LIMIT.windowMs) {
      RATE_LIMIT.hits.delete(key);
    }
  }
  while (RATE_LIMIT.hits.size >= RATE_LIMIT.maxEntries) {
    const oldestKey = RATE_LIMIT.hits.keys().next().value;
    if (oldestKey === undefined) break;
    RATE_LIMIT.hits.delete(oldestKey);
  }
}

function resolveClientIp(req) {
  // En Cloud Functions v2 (Cloud Run / Google Frontend), req.ip o el último salto fiable evita spoofing trivial del primer XFF
  if (req.ip && typeof req.ip === 'string') return req.ip.trim();
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) {
    const parts = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  if (RATE_LIMIT.hits.size > 500) {
    pruneRateLimit(now);
  }
  const entry = RATE_LIMIT.hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    if (RATE_LIMIT.hits.size >= RATE_LIMIT.maxEntries) pruneRateLimit(now);
    RATE_LIMIT.hits.delete(ip);
    RATE_LIMIT.hits.set(ip, { start: now, count: 1 });
    return false;
  }
  // Renovar orden LRU
  RATE_LIMIT.hits.delete(ip);
  entry.count++;
  RATE_LIMIT.hits.set(ip, entry);
  return entry.count > RATE_LIMIT.max;
}

async function fetchTextLimited(url, { maxBytes = 4 * 1024 * 1024, timeoutMs = 8000, allowedHostSuffix = null } = {}) {
  const parsed = validateExternalProxyUrl(url, allowedHostSuffix);
  const resp = await fetch(parsed, {
    headers: { 'User-Agent': 'RenewableArchitecture/1.0' },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (resp.status >= 300 && resp.status < 400) {
    throw new Error('Redirección externa bloqueada (HTTP ' + resp.status + ')');
  }
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const text = await resp.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Respuesta demasiado grande');
  return text;
}

exports.gwaProxy = onRequest({
  cors: ALLOWED_CORS_ORIGINS,
  maxInstances: 5,
  timeoutSeconds: 30
}, async (req, res) => {
  const ip = resolveClientIp(req);
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
      const noLibErr = new Error('No se encontró URL de .lib en respuesta de DTU GWA');
      noLibErr.statusCode = 422;
      throw noLibErr;
    }

    const libUrl = match[1].replace(/^http:\/\//i, 'https://');
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
    if (err && err.statusCode === 422) {
      res.status(422).json({ error: 'Los datos eólicos recibidos de GWA no son válidos para estas coordenadas' });
      return;
    }
    res.status(502).json({ error: 'No se pudo obtener el recurso eólico (GWA)' });
  }
});
