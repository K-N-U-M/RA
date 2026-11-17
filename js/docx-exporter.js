/**
 * js/docx-exporter.js — Generador y exportador nativo de documentos DOCX (Office OpenXML)
 * ====================================================================================
 * - Convierte estructuras HTML con estilos CSS e imágenes base64 en archivos .docx válidos.
 * - Utiliza la arquitectura oficial OpenXML w:altChunk con MHTML (multipart/related RFC 822).
 * - Extrae imágenes incrustadas (data:image/...) y las empaqueta como adjuntos MIME (Content-ID / Content-Location).
 * - Empaquetador ZIP nativo síncrono en puro JS (cero dependencias externas, 100% offline).
 */

(function(global) {
  'use strict';

  // ── 1. Empaquetador ZIP en memoria puro (PKZIP Store) ──
  function createZipSync(files) {
    const fileEntries = [];
    let offset = 0;

    function strToBytes(str) {
      return new TextEncoder().encode(str);
    }

    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[i] = c;
    }

    function crc32(buf) {
      let crc = ~0;
      for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
      }
      return (~crc) >>> 0;
    }

    const parts = [];

    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const data = (typeof f.data === 'string') ? strToBytes(f.data) : f.data;
      const nameBytes = strToBytes(f.name);
      const crc = crc32(data);
      const size = data.length;

      // Cabecera local de archivo (30 bytes + nombre)
      const h = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(h.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true); // UTF-8
      dv.setUint16(8, 0, true);      // Store (sin compresión)
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      h.set(nameBytes, 30);

      parts.push(h);
      parts.push(data);

      fileEntries.push({ nameBytes: nameBytes, crc: crc, size: size, offset: offset });
      offset += h.length + data.length;
    }

    const cdStart = offset;
    let cdSize = 0;

    for (let ei = 0; ei < fileEntries.length; ei++) {
      const entry = fileEntries[ei];
      const cd = new Uint8Array(46 + entry.nameBytes.length);
      const dv = new DataView(cd.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0, true);
      dv.setUint32(16, entry.crc, true);
      dv.setUint32(20, entry.size, true);
      dv.setUint32(24, entry.size, true);
      dv.setUint16(28, entry.nameBytes.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true);
      dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, entry.offset, true);
      cd.set(entry.nameBytes, 46);

      parts.push(cd);
      cdSize += cd.length;
    }

    const eocd = new Uint8Array(22);
    const dvE = new DataView(eocd.buffer);
    dvE.setUint32(0, 0x06054b50, true);
    dvE.setUint16(4, 0, true);
    dvE.setUint16(6, 0, true);
    dvE.setUint16(8, fileEntries.length, true);
    dvE.setUint16(10, fileEntries.length, true);
    dvE.setUint32(12, cdSize, true);
    dvE.setUint32(16, cdStart, true);
    dvE.setUint16(20, 0, true);
    parts.push(eocd);

    let totLen = 0;
    for (let pi = 0; pi < parts.length; pi++) totLen += parts[pi].length;
    const out = new Uint8Array(totLen);
    let pPos = 0;
    for (let pi = 0; pi < parts.length; pi++) {
      out.set(parts[pi], pPos);
      pPos += parts[pi].length;
    }
    return out;
  }

  // Helper para codificar en quoted-printable conforme a RFC 2045 (<= 76 chars/línea + CRLF)
  function encodeQuotedPrintable(str) {
    const normalized = String(str || '').replace(/\r?\n/g, '\r\n');
    const lines = normalized.split('\r\n');
    const outLines = [];
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      let encodedLine = '';
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        const code = line.charCodeAt(ci);
        let token;
        if (ch === '=') {
          token = '=3D';
        } else if ((code >= 33 && code <= 126) || code === 32 || code === 9) {
          // Escapar espacios/tabs al final de la línea física
          if ((code === 32 || code === 9) && ci === line.length - 1) {
            token = code === 32 ? '=20' : '=09';
          } else {
            token = ch;
          }
        } else {
          const bytes = new TextEncoder().encode(ch);
          token = '';
          for (let b = 0; b < bytes.length; b++) {
            const h = bytes[b].toString(16).toUpperCase();
            token += '=' + (h.length === 1 ? '0' + h : h);
          }
        }
        if (encodedLine.length + token.length > 75) {
          outLines.push(encodedLine + '=');
          encodedLine = token;
        } else {
          encodedLine += token;
        }
      }
      outLines.push(encodedLine);
    }
    return outLines.join('\r\n');
  }

  // Helper de limpieza editorial antes de exportar a Word / HTML
  function sanitizeEditorialHtml(rawHtml) {
    if (typeof document === 'undefined') return String(rawHtml || '');
    const wrap = document.createElement('div');
    wrap.innerHTML = String(rawHtml || '');
    const junkSelectors = [
      '.doc-top-bar', '.dossier-toolbar', '#dossier-format-bar', '#doc-format-toolbar',
      '.no-print', '.dossier-overflow-warn', '.dossier-drag-handle', '.dossier-resize-handle',
      '.dossier-img-picker-btn', '.dossier-file-input', '.ra-edit-del-btn', '.ra-gap-handle',
      '#ra-gap-tooltip', '.photo-upload-overlay'
    ];
    wrap.querySelectorAll(junkSelectors.join(',')).forEach(function(el) { el.remove(); });
    wrap.querySelectorAll('[contenteditable]').forEach(function(el) { el.removeAttribute('contenteditable'); });
    wrap.querySelectorAll('[data-editable-box]').forEach(function(el) {
      el.removeAttribute('draggable');
      el.removeAttribute('data-editable-box');
    });
    wrap.querySelectorAll('.editable-field').forEach(function(el) { el.classList.remove('editable-field'); });
    return wrap.innerHTML;
  }

  // Helper async para rasterizar todos los <svg> (y <img> SVG) a PNG para compatibilidad total con Word
  async function rasterizeSvgsToPng(rootEl) {
    if (!rootEl || typeof document === 'undefined' || typeof Image === 'undefined') return rootEl;
    const scale = 2;

    async function svgMarkupToPngDataUrl(svgString, targetW, targetH) {
      return new Promise(function(resolve) {
        try {
          const w = Math.max(24, Math.min(2000, Math.round(targetW || 400)));
          const h = Math.max(24, Math.min(2000, Math.round(targetH || 240)));
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = function() {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = w * scale;
              canvas.height = h * scale;
              const ctx = canvas.getContext('2d');
              ctx.scale(scale, scale);
              ctx.drawImage(img, 0, 0, w, h);
              const pngUrl = canvas.toDataURL('image/png');
              URL.revokeObjectURL(url);
              resolve({ pngUrl: pngUrl, w: w, h: h });
            } catch (eDraw) {
              URL.revokeObjectURL(url);
              resolve(null);
            }
          };
          img.onerror = function() {
            URL.revokeObjectURL(url);
            resolve(null);
          };
          img.src = url;
        } catch (eOuter) {
          resolve(null);
        }
      });
    }

    const svgs = Array.from(rootEl.querySelectorAll('svg'));
    for (let i = 0; i < svgs.length; i++) {
      const svgEl = svgs[i];
      try {
        if (!svgEl.getAttribute('xmlns')) svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/);
        const attrW = parseFloat(svgEl.getAttribute('width'));
        const attrH = parseFloat(svgEl.getAttribute('height'));
        const rect = (typeof svgEl.getBoundingClientRect === 'function') ? svgEl.getBoundingClientRect() : null;
        const w = (attrW > 0 ? attrW : (rect && rect.width > 0 ? rect.width : (parseFloat(vb[2]) || 480)));
        const h = (attrH > 0 ? attrH : (rect && rect.height > 0 ? rect.height : (parseFloat(vb[3]) || 200)));
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const res = await svgMarkupToPngDataUrl(svgData, w, h);
        const imgEl = document.createElement('img');
        if (res && res.pngUrl) {
          imgEl.src = res.pngUrl;
        } else {
          imgEl.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        }
        imgEl.style.cssText = svgEl.style.cssText || 'display:block;max-width:100%;height:auto;';
        imgEl.setAttribute('width', String(Math.round(w)));
        imgEl.setAttribute('height', String(Math.round(h)));
        if (svgEl.parentNode) svgEl.parentNode.replaceChild(imgEl, svgEl);
      } catch (eSvg) {}
    }

    // También convertir cualquier <img src="data:image/svg+xml..."> previo a PNG
    const svgImgs = Array.from(rootEl.querySelectorAll('img[src^="data:image/svg+xml"]'));
    for (let j = 0; j < svgImgs.length; j++) {
      const im = svgImgs[j];
      try {
        const src = im.getAttribute('src') || '';
        const idx = src.indexOf('base64,');
        if (idx === -1) continue;
        const rawSvg = decodeURIComponent(escape(atob(src.slice(idx + 7))));
        const w = parseFloat(im.getAttribute('width')) || 400;
        const h = parseFloat(im.getAttribute('height')) || 200;
        const res = await svgMarkupToPngDataUrl(rawSvg, w, h);
        if (res && res.pngUrl) im.setAttribute('src', res.pngUrl);
      } catch (eImg) {}
    }
    return rootEl;
  }

  // ── 2. Generador OpenXML DOCX con MHTML altChunk ──
  function buildDocxBlobFromHtml(htmlContent, options) {
    options = options || {};
    const isLandscape = options.orientation === 'landscape';
    const widthDxa = isLandscape ? 16838 : 11906; // A4 dxa (1 mm = 56.7 dxa)
    const heightDxa = isLandscape ? 11906 : 16838;

    const cleanHtml = sanitizeEditorialHtml(htmlContent);
    const images = [];
    let imgIdx = 0;

    // Extraer imágenes base64 en src
    const processedHtml = cleanHtml.replace(/src=["'](data:image\/([a-zA-Z0-9\+\-]+);base64,([A-Za-z0-9+/=\r\n]+))["']/gi, function(match, fullDataUrl, ext, b64) {
      imgIdx++;
      const cleanExt = (ext === 'jpeg' || ext === 'jpg') ? 'jpg' : ((ext === 'svg+xml') ? 'svg' : ext);
      const fName = 'img_' + imgIdx + '.' + cleanExt;
      images.push({
        name: fName,
        contentType: 'image/' + ext,
        base64: b64.replace(/\s+/g, '')
      });
      return 'src="' + fName + '"';
    });

    const boundary = '----=_Part_RA_DOCX_' + Date.now();
    const rawHtmlDoc = '<!DOCTYPE html>\r\n<html><head><meta charset="utf-8"><title>' + (options.title || 'Documento') + '</title>\r\n' +
      '<style>\r\n' +
      '@page Section1 { size: ' + (isLandscape ? '297mm 210mm' : '210mm 297mm') + '; margin: 12mm 14mm 14mm 12mm; mso-page-orientation: ' + (isLandscape ? 'landscape' : 'portrait') + '; }\r\n' +
      'div.Section1 { page: Section1; font-family: Segoe UI, Aptos, Arial, sans-serif; }\r\n' +
      '.page-sheet, .sheet, .doc-sheet { page-break-after: always; break-after: page; mso-break-type: section-break; width: 100% !important; margin: 0 0 25pt 0 !important; box-shadow: none !important; border-radius: 0 !important; }\r\n' +
      'table { border-collapse: collapse; width: 100%; mso-table-lspace: 0pt; mso-table-rspace: 0pt; margin: 8pt 0; }\r\n' +
      'td, th { vertical-align: top; font-family: Segoe UI, Aptos, Arial, sans-serif; }\r\n' +
      'img { max-width: 100%; height: auto; }\r\n' +
      (options.styles || '') + '\r\n' +
      '</style></head><body><div class="Section1">\r\n' +
      processedHtml + '\r\n' +
      '</div></body></html>';

    const qpEncodedHtml = encodeQuotedPrintable(rawHtmlDoc);

    let mhtml = 'MIME-Version: 1.0\r\n' +
      'Content-Type: multipart/related; boundary="' + boundary + '"; type="text/html"\r\n\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: text/html; charset="utf-8"\r\n' +
      'Content-Transfer-Encoding: quoted-printable\r\n' +
      'Content-Location: document.html\r\n\r\n' +
      qpEncodedHtml + '\r\n\r\n';

    for (let ii = 0; ii < images.length; ii++) {
      const img = images[ii];
      mhtml += '--' + boundary + '\r\n' +
        'Content-Type: ' + img.contentType + '\r\n' +
        'Content-Transfer-Encoding: base64\r\n' +
        'Content-Location: ' + img.name + '\r\n' +
        'Content-ID: <' + img.name + '>\r\n\r\n' +
        img.base64.replace(/(.{76})/g, '$1\r\n') + '\r\n\r\n';
    }
    mhtml += '--' + boundary + '--\r\n';

    const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\r\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\r\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\r\n' +
      '  <Default Extension="mht" ContentType="message/rfc822"/>\r\n' +
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\r\n' +
      '</Types>';

    const pkgRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\r\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\r\n' +
      '</Relationships>';

    const docRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\r\n' +
      '  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="chunk.mht"/>\r\n' +
      '</Relationships>';

    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"\r\n' +
      '            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\r\n' +
      '  <w:body>\r\n' +
      '    <w:altChunk r:id="htmlChunk"/>\r\n' +
      '    <w:sectPr>\r\n' +
      '      <w:pgSz w:w="' + widthDxa + '" w:h="' + heightDxa + '"' + (isLandscape ? ' w:orient="landscape"' : '') + '/>\r\n' +
      '      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>\r\n' +
      '    </w:sectPr>\r\n' +
      '  </w:body>\r\n' +
      '</w:document>';

    const files = [
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: pkgRelsXml },
      { name: 'word/_rels/document.xml.rels', data: docRelsXml },
      { name: 'word/document.xml', data: documentXml },
      { name: 'word/chunk.mht', data: mhtml }
    ];

    const zipBytes = createZipSync(files);
    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ── 3. Descarga directa en navegador ──
  function downloadDocx(blob, filename) {
    if (!filename) filename = 'Documento.docx';
    if (!filename.toLowerCase().endsWith('.docx')) {
      filename = filename.replace(/\.[a-zA-Z0-9]+$/, '') + '.docx';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {
      URL.revokeObjectURL(a.href);
    }, 30000);
  }

  const RADocxExporter = {
    createZipSync: createZipSync,
    buildDocxBlobFromHtml: buildDocxBlobFromHtml,
    rasterizeSvgsToPng: rasterizeSvgsToPng,
    sanitizeEditorialHtml: sanitizeEditorialHtml,
    encodeQuotedPrintable: encodeQuotedPrintable,
    downloadDocx: downloadDocx
  };

  if (typeof global !== 'undefined') {
    global.RADocxExporter = RADocxExporter;
    global.buildDocxBlobFromHtml = buildDocxBlobFromHtml;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RADocxExporter;
  }
})(typeof window !== 'undefined' ? window : this);
