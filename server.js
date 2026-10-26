const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
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

  const fieldBlock = roughnessBlocks.find(b => Math.abs(b.z0 - 0.03) < 0.01) || roughnessBlocks[1] || roughnessBlocks[0];
  const h10 = fieldBlock.heightData.find(d => d.heightM === 10) || fieldBlock.heightData[0];
  const h50 = fieldBlock.heightData.find(d => d.heightM === 50) || fieldBlock.heightData[1];
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

async function handleGWAPetition(lat, lon, res) {
  const wpsUrl = `https://wps.globalwindatlas.info/?service=WPS&version=1.0.0&request=Execute&identifier=get_libfile&datainputs=location=%7B%22type%22%3A%22Point%22%2C%22coordinates%22%3A%5B${lon.toFixed(4)}%2C${lat.toFixed(4)}%5D%7D`;
  try {
    const xml = await new Promise((resolve, reject) => {
      https.get(wpsUrl, { headers: { 'User-Agent': 'RenewableArchitecture/1.0' } }, (resp) => {
        let d = '';
        resp.on('data', chunk => d += chunk);
        resp.on('end', () => resolve(d));
      }).on('error', reject);
    });

    const match = xml.match(/"path":\s*"([^"]+)"/);
    if (!match) {
      throw new Error('Respuesta WPS no contiene .lib: ' + xml.substring(0, 150));
    }
    const libUrl = match[1].replace('http://', 'https://');

    const libText = await new Promise((resolve, reject) => {
      https.get(libUrl, (resp) => {
        let d = '';
        resp.on('data', chunk => d += chunk);
        resp.on('end', () => resolve(d));
      }).on('error', reject);
    });

    const parsed = parseWAsPLib(libText);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'public, max-age=2592000'
    });
    res.end(JSON.stringify(parsed));
  } catch (err) {
    console.error('[server.js] Error GWA:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer((req, res) => {
  // CORS y No-Cache para desarrollo en caliente
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqUrl = req.url.split('?')[0];

  if (reqUrl === '/api/gwa') {
    const urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost:8080'));
    const lat = parseFloat(urlObj.searchParams.get('lat'));
    const lon = parseFloat(urlObj.searchParams.get('lon'));
    if (isNaN(lat) || isNaN(lon)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ error: 'Faltan parámetros lat y lon' }));
      return;
    }
    handleGWAPetition(lat, lon, res);
    return;
  }

  if (reqUrl === '/') reqUrl = '/index.html';

  const safePath = path.normalize(decodeURIComponent(reqUrl)).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(BASE_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found: ' + reqUrl);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor local RA activo en http://localhost:${PORT}/`);
  console.log(`🌐 Acceso en red local: http://127.0.0.1:${PORT}/`);
});
