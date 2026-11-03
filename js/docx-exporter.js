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

  // Helper para codificar en quoted-printable seguro (escapa '=' a '=3D' y líneas largas)
  function encodeQuotedPrintable(str) {
    return str
      .replace(/=/g, '=3D')
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, function(ch) {
        const bytes = new TextEncoder().encode(ch);
        let hex = '';
        for (let b = 0; b < bytes.length; b++) {
          const h = bytes[b].toString(16).toUpperCase();
          hex += '=' + (h.length === 1 ? '0' + h : h);
        }
        return hex;
      });
  }

  // ── 2. Generador OpenXML DOCX con MHTML altChunk ──
  function buildDocxBlobFromHtml(htmlContent, options) {
    options = options || {};
    const isLandscape = options.orientation === 'landscape';
    const widthDxa = isLandscape ? 16838 : 11906; // A4 dxa (1 mm = 56.7 dxa)
    const heightDxa = isLandscape ? 11906 : 16838;

    const images = [];
    let imgIdx = 0;

    // Extraer imágenes base64 en src
    const processedHtml = htmlContent.replace(/src=["'](data:image\/([a-zA-Z0-9\+\-]+);base64,([A-Za-z0-9+/=\r\n]+))["']/gi, function(match, fullDataUrl, ext, b64) {
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
