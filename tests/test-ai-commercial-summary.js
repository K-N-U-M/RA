/**
 * test-ai-commercial-summary.js
 * Verificación de la redacción IA del resumen comercial y sanitización de comodines
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Simular entorno global de navegador mínimo
global.window = global;
global.window.RA = {
  geminiApiKey: 'fake-gemini-api-key-12345',
  getGeminiApiKey: function() { return 'fake-gemini-api-key-12345'; }
};
global.document = {
  getElementById: function(id) {
    return null;
  }
};
global.localStorage = {
  getItem: function() { return 'fake-gemini-api-key-12345'; },
  setItem: function() {}
};

// Cargar financials.js
const financialsPath = path.join(__dirname, '..', 'js', 'financials.js');
const financialsCode = fs.readFileSync(financialsPath, 'utf8');

// Ejecutar financials.js en el contexto global
eval(financialsCode);

console.log('--- TEST 1: generateCommercialSummary ---');
const dGeneric1 = { tit: { nombre: 'CLIENTE', mun: 'Sevilla' } };
const m1 = { kwp: 5.5, numPanels: 10, ahorroLuzAnio1: 1200, paybackYears: 4.5, pctAutoconsumo: 65 };
const sum1 = generateCommercialSummary(dGeneric1, m1, null);
assert.ok(sum1.includes('opción A') && sum1.includes('opción B'), 'Debe incluir el resumen de opción A y opción B');
assert.ok(!sum1.includes('CLIENTE'), 'NO debe incluir el comodín CLIENTE');
console.log('✓ PASS: generateCommercialSummary devuelve resumen estándar sin comodines');
const dReal = { tit: { nombre: 'Carlos Rodríguez', mun: 'Madrid' } };

console.log('--- TEST 2: requestCommercialSummaryFromGemini con mock de API y partes múltiples ---');
let lastRequestPayload = null;
global.RA = {
  geminiFetch: async function(url, options, timeout, apiKey) {
    lastRequestPayload = JSON.parse(options.body);
    return {
      ok: true,
      json: async function() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: 'Thinking about the proposal...' },
                  { text: '<p>Esta propuesta fotovoltaica para su inmueble en <strong>Sevilla</strong> cuenta con una potencia de <strong>5.50 kWp</strong>. Permitirá un ahorro estimado de <strong>1.200 €</strong> el primer año y un retorno en <strong>4.5 años</strong>.</p>' }
                ]
              },
              finishReason: 'STOP'
            }
          ]
        };
      }
    };
  }
};
global.RA.geminiApiKey = 'fake-gemini-api-key-12345';
global.RA.getGeminiApiKey = function() { return 'fake-gemini-api-key-12345'; };
global.window.RA = global.RA;

async function runGeminiTest() {
  const result = await requestCommercialSummaryFromGemini(dGeneric1, m1, null);
  assert.ok(result.includes('Esta propuesta fotovoltaica'), 'Debe extraer el texto de la parte no-thought');
  assert.ok(!result.includes('Thinking about the proposal'), 'Debe ignorar las partes de razonamiento (thought: true)');
  
  // Verificar payload enviado a Gemini
  assert.strictEqual(lastRequestPayload.generationConfig.maxOutputTokens, 2500, 'maxOutputTokens debe ser 2500');
  const userPrompt = lastRequestPayload.contents[0].parts[0].text;
  assert.ok(!userPrompt.includes('- Cliente: CLIENTE'), 'No debe enviar "- Cliente: CLIENTE" en el prompt');
  assert.ok(userPrompt.includes('BAJO NINGÚN CONCEPTO utilices la palabra "CLIENTE"'), 'Debe dar la instrucción explícita anti-comodín');
  assert.ok(userPrompt.includes('- Ubicación: Sevilla'), 'Debe incluir la ubicación');
  
  console.log('✓ PASS: requestCommercialSummaryFromGemini filtra thoughts, usa 2500 tokens y previene "CLIENTE"');

  // Test 2b: Limpieza de bloques ```html y concatenación de múltiples partes de texto
  global.RA.geminiFetch = async function() {
    return {
      ok: true,
      json: async function() {
        return {
          candidates: [{
            content: {
              parts: [
                { text: '```html\n<p>Instalación solar de <strong>5.5 kWp</strong> en Madrid. ' },
                { text: 'Ahorro garantizado de <strong>1.200 €/año</strong>.<script>alert("xss")</script></p>\n```' }
              ]
            }
          }]
        };
      }
    };
  };

  const result2 = await requestCommercialSummaryFromGemini(dReal, m1, null);
  assert.ok(result2.startsWith('<p>Instalación solar'), 'Debe eliminar el bloque markdown ```html');
  assert.ok(result2.endsWith('</p>'), 'Debe eliminar el cierre markdown ```');
  assert.ok(result2.includes('Ahorro garantizado'), 'Debe concatenar correctamente las partes consecutivas');
  assert.ok(!result2.includes('<script>'), 'Debe sanitizar scripts maliciosos');
  console.log('✓ PASS: Limpieza de markdown ```html, concatenación de partes múltiples y sanitización XSS');
}

runGeminiTest().then(() => {
  console.log('\n===========================================');
  console.log('🎉 TODOS LOS TESTS DE REDACCIÓN IA SUPERADOS CON ÉXITO');
  console.log('===========================================');
}).catch((err) => {
  console.error('✗ ERROR EN TEST:', err);
  process.exit(1);
});
