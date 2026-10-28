/**
 * tests/test-mppt-parity.js
 * [AUD-2026 · C-01] Paridad entre el motor eléctrico modular y la copia inline
 * de `calculateDynamicMPPTStringLimits` que lo sombrea en index.html.
 *
 * La copia inline delega en `window.RA.Electrical` cuando existe; este test fuerza
 * su rama de respaldo (sin módulo) y comprueba que usa los coeficientes térmicos
 * correctos (βVmp), no γPmp ni βVoc.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const start = html.indexOf('function calculateDynamicMPPTStringLimits');
const end = html.indexOf('function partitionPanelsIntoMPPTStrings');
assert.ok(start > 0 && end > start, 'No se pudo extraer la función inline de límites MPPT');
const inlineSrc = html.slice(start, end);

// Contexto sin RA.Electrical para ejercitar el fallback inline.
const ctx = {
  window: {},
  panelConfig: {},
  console: console
};
ctx.window.panelConfig = ctx.panelConfig;
ctx.window.solarProjectConfig = {};
vm.createContext(ctx);
vm.runInContext(inlineSrc, ctx);

// Motor modular real.
const modCtx = { window: {}, panelConfig: {}, console };
modCtx.window.panelConfig = modCtx.panelConfig;
modCtx.window.solarProjectConfig = {};
vm.createContext(modCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), modCtx);
const Electrical = modCtx.window.RA.Electrical;
assert.ok(Electrical && typeof Electrical.calculateDynamicMPPTStringLimits === 'function');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: PARIDAD DE LÍMITES MPPT (inline vs módulo)');
console.log('═════════════════════════════════════════════════════════════════════');

const moduleSpec = {
  potencia: 450, Voc: 49.5, Vmp: 41.5, Isc: 11.5, Imp: 10.84,
  tempCoeffVoc: -0.29,      // βVoc
  tempCoeffVmp: -0.30,      // βVmp (distinto a propósito)
  tempCoeffPmax: -0.35      // γPmp (no debe usarse para tensión)
};
const inverter = { vDcMax: 1000, vMpptMin: 250, vMpptMax: 850, kw: 10, mppt: 2 };
const clim = { tMinCold: -10, tMaxHot: 70 };

const fromModule = Electrical.calculateDynamicMPPTStringLimits(moduleSpec, inverter, clim);
const fromInline = ctx.calculateDynamicMPPTStringLimits(moduleSpec, inverter, clim);

assert.strictEqual(fromInline.Ns_max, fromModule.Ns_max, 'Ns_max debe coincidir');
assert.strictEqual(fromInline.Ns_min, fromModule.Ns_min, 'Ns_min debe coincidir');
assert.ok(Math.abs(fromInline.Vmp_Tmax - fromModule.Vmp_Tmax) < 0.02, 'Vmp_Tmax debe coincidir');
assert.ok(Math.abs(fromInline.Vmp_Tmin - fromModule.Vmp_Tmin) < 0.02, 'Vmp_Tmin debe coincidir');
console.log(`  ✓ PASS: Ns_max=${fromModule.Ns_max} · Ns_min=${fromModule.Ns_min} en ambas implementaciones`);

// El fallback NO debe volver a γPmp: con γPmp=−0,35 el Ns_min habría sido distinto.
const VmpHotCorrect = moduleSpec.Vmp * (1 + (-0.0030) * (70 - 25));
assert.ok(Math.abs(fromInline.Vmp_Tmax - VmpHotCorrect) < 0.05,
  `Vmp_Tmax debe usar βVmp (${VmpHotCorrect.toFixed(2)} V), recibido ${fromInline.Vmp_Tmax.toFixed(2)} V`);
console.log('  ✓ PASS: el fallback usa βVmp (no γPmp) para la tensión MPP');

// Guardas de entrada.
const lowT = Electrical.calculateDynamicMPPTStringLimits(moduleSpec, inverter, { tMinCold: -20, tMaxHot: 80 });
assert.ok(lowT.Ns_max <= fromModule.Ns_max, 'Más frío no puede permitir más módulos en serie');
assert.ok(lowT.Ns_min >= fromModule.Ns_min, 'Más calor exige más módulos en serie');
console.log('  ✓ PASS: monotonía térmica de Ns_max/Ns_min');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 PARIDAD MPPT: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
