/**
 * test-docx-export.js
 * Test de empaquetado de documentos DOCX nativos con soporte de imágenes y maquetación
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Cargar el módulo real js/docx-exporter.js
const docxExporter = require('../js/docx-exporter.js');

// 1x1 transparent PNG base64 for testing image extraction
const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const sampleHtmlPortrait = `
<div class="page-sheet">
  <h1>Propuesta Solar 3D (Vertical)</h1>
  <p>Instalación fotovoltaica con render en cubierta:</p>
  <img src="data:image/png;base64,${samplePngBase64}" alt="Render 3D">
  <table>
    <tr><th>Partida</th><th>Importe</th></tr>
    <tr><td>Módulos Tier-1</td><td>1.250 €</td></tr>
  </table>
</div>
`;

const sampleHtmlLandscape = `
<div class="dossier-sheet">
  <h1>Dossier Comercial de 10 Láminas (Apaisado)</h1>
  <img src="data:image/png;base64,${samplePngBase64}" alt="Cubierta 3D">
</div>
`;

console.log('--- TEST 1: Generación de DOCX Vertical (Portrait) ---');
const blobPortrait = docxExporter.buildDocxBlobFromHtml(sampleHtmlPortrait, {
  orientation: 'portrait',
  title: 'Propuesta Comercial'
});
assert.ok(blobPortrait, 'Debe devolver un Blob');
assert.strictEqual(blobPortrait.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Tipo MIME debe ser OpenXML DOCX');
console.log('✓ PASS: DOCX Vertical generado con MIME OpenXML correcto');

console.log('--- TEST 2: Generación de DOCX Apaisado (Landscape) ---');
const blobLandscape = docxExporter.buildDocxBlobFromHtml(sampleHtmlLandscape, {
  orientation: 'landscape',
  title: 'Dossier Comercial'
});
assert.ok(blobLandscape, 'Debe devolver un Blob');
assert.strictEqual(blobLandscape.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Tipo MIME debe ser OpenXML DOCX');
console.log('✓ PASS: DOCX Horizontal generado con éxito');

console.log('--- TEST 3: Inspección binaria del archivo ZIP / DOCX ---');
// Convertir blob a Buffer
async function testBuffer() {
  const arrayBuf = await blobPortrait.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  assert.ok(bytes.length > 500, 'Tamaño debe ser superior a 500 bytes');
  assert.strictEqual(bytes[0], 0x50, 'Byte 0 debe ser P (PK signature)');
  assert.strictEqual(bytes[1], 0x4B, 'Byte 1 debe ser K (PK signature)');
  console.log('✓ PASS: Cabecera PKZIP válida');
}

testBuffer().then(() => {
  console.log('\n===========================================');
  console.log('🎉 TODOS LOS TESTS DE DOCX SUPERADOS CON ÉXITO');
  console.log('===========================================');
}).catch(err => {
  console.error('✗ ERROR EN TEST DOCX:', err);
  process.exit(1);
});
