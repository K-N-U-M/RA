/**
 * Cloud Function: gwaProxy
 * Proxy y parser de recurso eólico de alta resolución (250m WAsP)
 * desde Global Wind Atlas 3.0 (DTU Wind Energy / Banco Mundial).
 */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

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
  const roughnesses = lines[2].split(/\s+/).map(Number);
  const heights = lines[3].split(/\s+/).map(Number);

  let curLine = 4;
  const roughnessBlocks = [];
  for (let r = 0; r < numRough; r++) {
    const freqs = lines[curLine++].split(/\s+/).map(Number);
    const heightData = [];
    for (let h = 0; h < numHeights; h++) {
      const A = lines[curLine++].split(/\s+/).map(Number);
      const k = lines[curLine++].split(/\s+/).map(Number);
      let vMean = 0;
      for (let s = 0; s < numSectors; s++) {
        const vSec = A[s] * lanczosGamma(1 + 1 / k[s]);
        vMean += (freqs[s] / 100) * vSec;
      }
      heightData.push({ heightM: heights[h], A, k, vMean: Number(vMean.toFixed(2)) });
    }
    roughnessBlocks.push({ z0: roughnesses[r], freqs, heightData });
  }

  // Clase de rugosidad 0.03m (campo abierto / terreno estándar) o la más cercana
  const fieldBlock = roughnessBlocks.find(b => Math.abs(b.z0 - 0.03) < 0.01) || roughnessBlocks[1] || roughnessBlocks[0];
  const h10 = fieldBlock.heightData.find(d => d.heightM === 10) || fieldBlock.heightData[0];
  const h50 = fieldBlock.heightData.find(d => d.heightM === 50) || fieldBlock.heightData[1];
  const alpha = (h50.vMean > h10.vMean && h10.vMean > 0)
    ? Math.log(h50.vMean / h10.vMean) / Math.log(50 / 10)
    : 0.143;

  // Sector prevalente (dirección con mayor frecuencia porcentual)
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

exports.gwaProxy = onRequest({ cors: true, maxInstances: 10, timeoutSeconds: 60 }, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Parámetros inválidos. Se requiere lat (-90..90) y lon (-180..180)' });
    return;
  }

  const wpsUrl = `https://wps.globalwindatlas.info/?service=WPS&version=1.0.0&request=Execute&identifier=get_libfile&datainputs=location=%7B%22type%22%3A%22Point%22%2C%22coordinates%22%3A%5B${lon.toFixed(4)}%2C${lat.toFixed(4)}%5D%7D`;
  logger.info(`Consultando GWA WPS para lat=${lat}, lon=${lon}`);

  try {
    const wpsResp = await fetch(wpsUrl, { headers: { 'User-Agent': 'RenewableArchitecture/1.0' } });
    if (!wpsResp.ok) {
      throw new Error(`GWA WPS respondió HTTP ${wpsResp.status}`);
    }
    const xml = await wpsResp.text();

    const match = xml.match(/"path":\s*"([^"]+)"/);
    if (!match) {
      throw new Error('No se encontró URL de .lib en respuesta de DTU GWA');
    }

    const libUrl = match[1].replace('http://', 'https://');
    logger.info(`Descargando .lib desde DTU: ${libUrl}`);

    const libResp = await fetch(libUrl);
    if (!libResp.ok) {
      throw new Error(`Descarga de .lib falló con HTTP ${libResp.status}`);
    }
    const libText = await libResp.text();

    const parsed = parseWAsPLib(libText);
    res.set('Cache-Control', 'public, max-age=2592000'); // Cache 30 días
    res.json(parsed);

  } catch (err) {
    logger.error('Error al consultar Global Wind Atlas:', err);
    res.status(502).json({
      error: 'Error al contactar con Global Wind Atlas (DTU WPS)',
      details: err.message
    });
  }
});
