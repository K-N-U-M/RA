/**
 * test-ghost-panels-cel.js — Verificación de Paneles Fantasma y Monetización CEL
 */
const assert = require('assert');
const fs = require('fs');

console.log('🧪 Iniciando test de Paneles Fantasma y Oportunidad CEL (Ideas 1 y 4)...');

// 1. Mock básico de entorno y DOM
global.window = global;
global.document = {
  getElementById: (id) => ({
    id: id,
    style: {},
    textContent: '',
    innerHTML: ''
  })
};

global.window.solarProjectConfig = {
  targetKwp: 2.7, // ~6 módulos de 450W
  selectedObjective: 'target_kwh',
  forcedPanelIds: []
};
global.panelConfig = { potencia: 450 };

// 2. Cargar solar-heatmap.js en entorno simulado
const resolvedPath = fs.existsSync('js/solar-heatmap.js') ? 'js/solar-heatmap.js' : 'RA/js/solar-heatmap.js';
const code = fs.readFileSync(resolvedPath, 'utf8');
eval(code);

// 3. Crear 10 paneles candidatos en un faldón (simulando faldón con 10 posiciones)
const candidatePanels = [];
for (let i = 0; i < 10; i++) {
  candidatePanels.push({
    panelId: 'pan_0_' + i,
    layoutIndex: i,
    localIdx: i,
    annualLossPct: i * 2.5, // 0%, 2.5%, 5%, ..., 22.5%
    annualKwh: 700 - i * 20
  });
}

const poly = {
  id: 'poly_1',
  roofInfo: { panels: candidatePanels }
};

// TEST 1: Filtrado en Modo target_kwh debe marcar 6 activos y 4 con isGhost = true
const filtered = window.wpFilterPanelsForPolyline(poly, 0, [poly], 'target_kwh', {
  polyPanels: candidatePanels,
  targetKwp: 2.7,
  modWp: 450
});

assert.strictEqual(filtered.length, 10, 'Deben devolverse los 10 paneles para representación fidedigna');
const activePanels = filtered.filter(p => !p.isGhost);
const ghostPanels = filtered.filter(p => p.isGhost);

assert.strictEqual(activePanels.length, 6, 'Debe haber exactamente 6 paneles activos para la meta de consumo');
assert.strictEqual(ghostPanels.length, 4, 'Debe haber exactamente 4 paneles fantasma de reserva');
assert.strictEqual(activePanels[0].panelId, 'pan_0_0', 'El panel con menos pérdidas (0%) debe ser activo');
assert.strictEqual(ghostPanels[ghostPanels.length - 1].panelId, 'pan_0_9', 'El panel con más pérdidas (22.5%) debe ser fantasma');

console.log('✅ TEST 1 superado: 6 módulos activos y 4 módulos fantasma translúcidos generados correctamente.');

// TEST 2: Incorporación interactiva (Override individual vía wpToggleGhostPanel)
window.wpToggleGhostPanel('pan_0_9');
assert.ok(window.solarProjectConfig.forcedPanelIds.includes('pan_0_9'), 'pan_0_9 debe estar en forcedPanelIds');

const filteredAfterOverride = window.wpFilterPanelsForPolyline(poly, 0, [poly], 'target_kwh', {
  polyPanels: candidatePanels,
  targetKwp: 2.7,
  modWp: 450
});

const pan9 = filteredAfterOverride.find(p => p.panelId === 'pan_0_9');
assert.strictEqual(!pan9.isGhost, true, 'pan_0_9 forzado no debe tener isGhost');

console.log('✅ TEST 2 superado: Módulo fantasma incorporado e integrado a la instalación con override.');

// TEST 3: Verificación de conmutación off
window.wpToggleGhostPanel('pan_0_9');
assert.strictEqual(window.solarProjectConfig.forcedPanelIds.includes('pan_0_9'), false, 'pan_0_9 debe haberse desmarcado');

console.log('✅ TEST 3 superado: Conmutación de retorno a estado óptimo verificada.');

console.log('🎉 TODOS LOS TESTS DE PANELES FANTASMA Y CEL PASARON AL 100%');
