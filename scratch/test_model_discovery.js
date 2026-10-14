const assert = require('assert');

// Mock response from Google Gemini ListModels
const mockListModelsResponse = {
  models: [
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.1-pro-preview", supportedGenerationMethods: ["generateContent"] }
  ]
};

function filterAndSortModels(modelsList) {
  const valid = modelsList
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));

  // Priorizar Flash y ordenar por versión más alta
  const flash = valid.filter(n => /flash/i.test(n));
  const other = valid.filter(n => !/flash/i.test(n));

  flash.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
  return [...flash, ...other];
}

const sorted = filterAndSortModels(mockListModelsResponse.models);
console.log('Modelos ordenados:', sorted);
assert.strictEqual(sorted[0], 'gemini-3.8-flash');
assert.strictEqual(sorted[1], 'gemini-3.5-flash-lite');
assert.strictEqual(sorted[2], 'gemini-2.5-flash');
assert.strictEqual(sorted[3], 'gemini-3.1-pro-preview');
console.log('✓ Filtrado y ordenación dinámica de modelos verificado.');
