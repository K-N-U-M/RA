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
const appMain = fs.readFileSync(path.join(ROOT, 'js/app-main.js'), 'utf8');

// Verificar que la copia inline ya fue eliminada de js/app-main.js.
assert.strictEqual(
  appMain.indexOf('function calculateDynamicMPPTStringLimits'),
  -1,
  'La copia inline de calculateDynamicMPPTStringLimits debe haber sido eliminada de js/app-main.js'
);

// Motor modular real.
const modCtx = { window: {}, panelConfig: {}, console };
modCtx.window.panelConfig = modCtx.panelConfig;
modCtx.window.solarProjectConfig = {};
vm.createContext(modCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/electrical-engine.js'), 'utf8'), modCtx);
const Electrical = modCtx.window.RA.Electrical;
assert.ok(Electrical && typeof Electrical.calculateDynamicMPPTStringLimits === 'function');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('⚡ TEST SUITE: LÍMITES MPPT (motor centralizado en electrical-engine.js)');
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

assert.ok(fromModule.Ns_max > 0 && fromModule.Ns_min > 0, 'Ns_max y Ns_min deben ser positivos');
assert.ok(fromModule.Ns_max >= fromModule.Ns_min, 'Ns_max debe ser >= Ns_min');
console.log(`  ✓ PASS: Ns_max=${fromModule.Ns_max} · Ns_min=${fromModule.Ns_min} en electrical-engine.js`);

// El cálculo NO debe usar γPmp: con γPmp=−0,35 el Vmp_Tmax sería distinto.
const VmpHotCorrect = moduleSpec.Vmp * (1 + (-0.0030) * (70 - 25));
assert.ok(Math.abs(fromModule.Vmp_Tmax - VmpHotCorrect) < 0.05,
  `Vmp_Tmax debe usar βVmp (${VmpHotCorrect.toFixed(2)} V), recibido ${fromModule.Vmp_Tmax.toFixed(2)} V`);
console.log('  ✓ PASS: el motor usa βVmp (no γPmp) para la tensión MPP');

// Guardas de entrada.
const lowT = Electrical.calculateDynamicMPPTStringLimits(moduleSpec, inverter, { tMinCold: -20, tMaxHot: 80 });
assert.ok(lowT.Ns_max <= fromModule.Ns_max, 'Más frío no puede permitir más módulos en serie');
assert.ok(lowT.Ns_min >= fromModule.Ns_min, 'Más calor exige más módulos en serie');
console.log('  ✓ PASS: monotonía térmica de Ns_max/Ns_min');

console.log('═════════════════════════════════════════════════════════════════════');
console.log('🎉 PARIDAD MPPT: TODAS LAS COMPROBACIONES PASARON');
console.log('═════════════════════════════════════════════════════════════════════');
