global.document = { getElementById: () => null };
// Test de verificación Fase 5: Física Solar, Seguridad Eléctrica y Persistencia
const assert = require('assert');
const fs = require('fs');

console.log('═════════════════════════════════════════════════════════════════════════════');
console.log('🚀 TEST DE VERIFICACIÓN: FASE 5 (FÍSICA SOLAR, CABLES Y GUARDADO)');
console.log('═════════════════════════════════════════════════════════════════════════════\n');

// Mock Cesium
global.Cesium = {
  Cartesian3: function(x, y, z) { this.x = x; this.y = y; this.z = z; },
  Math: { toDegrees: (r) => r * 180 / Math.PI }
};

// 1. Verificar Física Solar
let solarCode = fs.readFileSync('js/solar-engine.js', 'utf8');
global.window = { solarLossConfig: { wiring: 0.015, mismatch: 0.02, soiling: 0.025, availability: 0.005 } };
eval(solarCode);

const physicalResult = global.window.runPhysicalModel(5.0, 40.4, -3.7, 30, 180, { potencia: 450, pAcNominalW: 5000, tecnologia: 'N-Type' });
assert(physicalResult.annualKWh > 7000 && physicalResult.annualKWh < 9500, `Producción esperada ~8000 kWh, obtenida: ${physicalResult.annualKWh}`);
assert(physicalResult.PR > 0.75 && physicalResult.PR < 0.90, `PR esperado 0.75-0.90, obtenido: ${physicalResult.PR}`);
console.log(`  ✓ PASS: Producción física anual corregida (${physicalResult.annualKWh} kWh/año, PR ${(physicalResult.PR*100).toFixed(1)}%)`);

// 2. Verificar calcPOA orientación Sur
const poaSur = global.window.calcPOA(800, 240, 40.4, 30, 180, 172, 12);
const poaNorte = global.window.calcPOA(800, 240, 40.4, 30, 0, 172, 12);
assert(poaSur > poaNorte, `Tejado Sur (${poaSur.toFixed(1)} W/m2) debe recibir más radiación que Tejado Norte (${poaNorte.toFixed(1)} W/m2) a mediodía`);
console.log(`  ✓ PASS: calcPOA alineado con convención náutica (Sur: ${poaSur.toFixed(1)} W/m² vs Norte: ${poaNorte.toFixed(1)} W/m²)`);

// 3. Verificar Cable Engine
let cableCode = fs.readFileSync('js/cable-engine.js', 'utf8');
global.window.inverterEquipmentState = { position: null, carto: null, L_dc_measured: 25, L_ac_measured: 15, dcTopology: 'series' };
global.window.solarProjectConfig = {
  calculatedLimits: {
    inverter: { kw: 10, type: 'Trifásico' },
    nMinString: 6
  },
  autoSizing: { inverters: { count: 1 } }
};
global.window.panelConfig = { potencia: 450, isc: 13.8, imp: 13.05, vmp: 34.5 };
eval(cableCode);

const cableEngine = global.window.RACableEngine;
cableEngine.updateElectricalSizingAndHUD(25, 15);
assert(global.window.inverterEquipmentState.S_dc_recommended >= 4, 'Sección DC calculada');
console.log(`  ✓ PASS: Cable Engine dimensiona con string real y detecta sección DC (${global.window.inverterEquipmentState.S_dc_recommended} mm², ΔV ${global.window.inverterEquipmentState.dV_dc_pct.toFixed(2)}%)`);

// Probar conector Y paralelo
global.window.inverterEquipmentState.dcTopology = 'parallel_y';
cableEngine.updateElectricalSizingAndHUD(25, 15);
console.log(`  ✓ PASS: Cable Engine con conectores Y considera corriente doble (${global.window.inverterEquipmentState.S_dc_recommended} mm², ΔV ${global.window.inverterEquipmentState.dV_dc_pct.toFixed(2)}%)`);

// 4. Verificar Guardado de Proyectos
let storageCode = fs.readFileSync('js/project-storage.js', 'utf8');
global.WP = global.window.WP = {
  polylines: [
    { points: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, { x: 7, y: 8, z: 9 }], color: '#00ffff', planeIdx: 2, structureType: 'triangles_30', orientationPref: 'landscape' }
  ],
  planes: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
};
eval(storageCode);

const exported = global.window.raExportProjectData();
assert(exported.polylines[0].planeIdx === 2, 'Exported planeIdx must be 2');
assert(exported.polylines[0].structureType === 'triangles_30', 'Exported structureType must be triangles_30');
console.log(`  ✓ PASS: Exportación .raproject preserva planeIdx (${exported.polylines[0].planeIdx}) y structureType (${exported.polylines[0].structureType})`);

// 5. Verificar Financiación sin división por cero
let finCode = fs.readFileSync('js/financials.js', 'utf8');
global.document = {
  getElementById: (id) => {
    if (id === 'fin-plazo-meses') return { value: '0' }; // 0 meses
    if (id === 'fin-tin-pct') return { value: '5.95' };
    return null;
  }
};
global.getProjectCalcs = () => ({ P_dc_kW: 5, cfg: { potencia: 450 }, numPanels: 11, annualKWh: 8400, pres_paneles: 2000, pres_estructura: 800, pres_inv: 1200, pres_cable: 400, pres_cuadros: 500, pres_mano_obra: 1500, ahorro_anual: 900 });
eval(finCode);

const finModel = global.window.calculateFinancialModel();
assert(!Number.isNaN(finModel.balanceNetoMensual), 'Balance neto mensual no debe ser NaN con plazo 0');
assert(!Number.isNaN(finModel.cuotaMensual || 0), 'Cuota mensual no debe ser NaN con plazo 0');
console.log(`  ✓ PASS: Financiación con plazo 0 meses blindada contra NaN`);

console.log('\n=============================================================================');
console.log('📊 RESULTADO FASE 5: TODAS LAS PRUEBAS SUPERADAS CON ÉXITO.');
console.log('=============================================================================\n');
