/**
 * Test automatizado de monotonicidad física estricta en pérdidas del sistema (Paso 4.3).
 * Verifica que para cualquier incremento de pérdidas o selección de preset con mayor pérdida,
 * la producción neta anual calculada por recalculateSolarYield, getProjectCalcs y el HUD
 * sea estrictamente decreciente (dE / dL <= 0), sin saltos hacia arriba.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunctionFromHtml(html, fnName) {
  const startIdx = html.indexOf('function ' + fnName + '(');
  if (startIdx === -1) throw new Error('No se encontró function ' + fnName + ' en index.html');
  let braceCount = 0;
  let started = false;
  let endIdx = startIdx;
  for (let i = startIdx; i < html.length; i++) {
    if (html[i] === '{') {
      braceCount++;
      started = true;
    } else if (html[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  return html.substring(startIdx, endIdx);
}

function runLossMonotonicityTests() {
  console.log('=== TEST DE MONOTONICIDAD FÍSICA EN PÉRDIDAS DEL SISTEMA ===');

  const projectRoot = path.join(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'js/app-main.js'), 'utf8');

  // DOM Mock completo
  const dom = {};
  const doc = {
    getElementById: (id) => {
      if (!dom[id]) dom[id] = { id, value: '0', textContent: '', style: {}, innerHTML: '', classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{}, contains: ()=>false }, parentNode: { insertBefore: ()=>{}, removeChild: ()=>{} }, animate: ()=>{} };
      return dom[id];
    },
    querySelector: () => ({ value: '0', textContent: '', style: {}, classList: { add: ()=>{}, remove: ()=>{} }, parentNode: { removeChild: ()=>{} } }),
    querySelectorAll: () => [],
    createElement: () => ({ id: '', style: {}, innerHTML: '', appendChild: ()=>{}, querySelector: ()=>null, parentNode: { removeChild: ()=>{} } }),
    body: { appendChild: ()=>{}, contains: ()=>true },
    addEventListener: ()=>{},
    removeEventListener: ()=>{}
  };

  const win = {
    RA: {},
    document: doc,
    addEventListener: ()=>{},
    removeEventListener: ()=>{},
    dispatchEvent: ()=>{},
    localStorage: { getItem: ()=>null, setItem: ()=>{} },
    solarSimState: {},
    solarProjectConfig: {
      selectedModuleId: 'mod_450',
      selectedInverterId: 'inv_10k',
      selectedTopology: 'inverter',
      selectedObjective: 'optimal_inv'
    },
    equipmentCatalog: {
      modules: [{ id: 'mod_450', wp: 450, potencia: 450, voc: 49.5, imp: 10.84, length: 2.1, width: 1.05, price: 95 }],
      inverters: [{ id: 'inv_10k', kw: 10, kw_nominal: 10, mppts: 2, price: 1500 }],
      batteries: []
    }
  };

  const pts = [{x:0,y:0,z:0},{x:20,y:0,z:0},{x:20,y:20,z:0},{x:0,y:20,z:0}];
  const panels = [];
  for (let i = 0; i < 170; i++) {
    panels.push({
      panelId: 'p_' + i,
      layoutIndex: i,
      annualGrossKwh: 733.5,
      annualKwh: 646,
      annualLossPct: 0,
      annualYieldPct: 100,
      _lastPrSys: 0.8813
    });
  }
  const WP = {
    polylines: [{
      points: pts,
      roofInfo: {
        panels: panels,
        tiltDeg: 30,
        azimuthDeg: 0,
        moduleTiltDeg: 30,
        moduleAzimuthDeg: 0
      }
    }],
    selectedPolyIdx: 0
  };
  const pCfg = { potencia: 450, largo: 2.1, ancho: 1.05 };

  win.allRenderedPanels = panels;
  win.WP = WP;
  win.polygonPoints = pts;
  win.panelConfig = pCfg;

  function Cartesian3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  Cartesian3.clone = (p) => new Cartesian3(p ? p.x : 0, p ? p.y : 0, p ? p.z : 0);
  Cartesian3.distance = () => 1.0;
  Cartesian3.subtract = () => new Cartesian3(0, 0, 0);
  Cartesian3.add = (a, b, res) => { if (res) { res.x = a.x + b.x; res.y = a.y + b.y; res.z = a.z + b.z; return res; } return new Cartesian3(a.x + b.x, a.y + b.y, a.z + b.z); };
  Cartesian3.cross = () => new Cartesian3(0, 0, 1);
  Cartesian3.magnitude = () => 1.0;
  Cartesian3.divideByScalar = (p, s, res) => { if (res) { res.x = p.x/s; res.y = p.y/s; res.z = p.z/s; return res; } return new Cartesian3(p.x/s, p.y/s, p.z/s); };
  Cartesian3.dot = () => 1.0;
  Cartesian3.normalize = (p, res) => { if (res) { res.x = 0; res.y = 0; res.z = 1; return res; } return new Cartesian3(0, 0, 1); };

  function Matrix4() {}
  Matrix4.inverse = () => new Matrix4();
  Matrix4.multiplyByPoint = (m, p, res) => { if (res) { res.x = p.x; res.y = p.y; res.z = p.z; return res; } return new Cartesian3(p.x, p.y, p.z); };

  const cesiumMock = {
    Ion: { defaultAccessToken: '' },
    GoogleMaps: { defaultApiKey: '' },
    Math: { toRadians: (d) => d * Math.PI / 180, toDegrees: (r) => r * 180 / Math.PI },
    Cartesian3: Cartesian3,
    Cartographic: { fromCartesian: () => ({ latitude: 40.4168 * Math.PI / 180, longitude: -3.7038 * Math.PI / 180, height: 600 }) },
    Transforms: { eastNorthUpToFixedFrame: () => new Matrix4() },
    Matrix4: Matrix4
  };

  const SOLAR_ENGINE_CONSTANTS = {
    CO2_FACTOR_SPAIN: 0.259,
    T_MIN_SPAIN: -10,
    T_AMB_MAX_SPAIN: 40
  };
  const SOLAR_RAD_MONTHLY_BASE = [2.3, 3.2, 4.4, 5.5, 6.4, 7.2, 7.5, 6.7, 5.2, 3.6, 2.5, 2.0];
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const ctx = vm.createContext({
    window: win,
    global: win,
    globalThis: win,
    document: doc,
    Cesium: cesiumMock,
    SOLAR_ENGINE_CONSTANTS: SOLAR_ENGINE_CONSTANTS,
    SOLAR_RAD_MONTHLY_BASE: SOLAR_RAD_MONTHLY_BASE,
    MONTH_DAYS: MONTH_DAYS,
    RA_LOSS_FIELDS: [
      { key: 'soiling', label: 'Suciedad' },
      { key: 'wiring', label: 'Óhmicas' },
      { key: 'mismatch', label: 'Mismatch' },
      { key: 'availability', label: 'Disponibilidad' },
      { key: 'iamAngular', label: 'IAM' },
      { key: 'spectral', label: 'Espectral' },
      { key: 'bypass', label: 'Bypass' },
      { key: 'bypassMlpe', label: 'Bypass MLPE' }
    ],
    console: console,
    polygonPoints: pts,
    WP: WP,
    panelConfig: pCfg,
    allRenderedPanels: panels,
    compute3DPolygonArea: () => 400,
    normalizeAzimuth: (a) => a,
    computeCellTemperature: (t, g) => (t || 25) + 25,
    computePOAIrradiance: (g) => ({ G_poa: g || 1000 }),
    renderSolarBarChart: () => {},
    setElemText: (id, text) => { if (dom[id]) dom[id].textContent = text; },
    setTimeout: (fn)=>fn(),
    clearTimeout: ()=>{},
    setInterval: ()=>{},
    clearInterval: ()=>{},
    Math, parseFloat, parseInt, isFinite, isNaN, Array, Object, String, Number, Date
  });

  // Cargar módulos JS
  ['config.js', 'radiation-engine.js', 'solar-engine.js', 'electrical-engine.js', 'project-status-hud.js', 'project-calcs.js', 'solar-yield-controller.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(projectRoot, 'js', f), 'utf8'), ctx);
  });

  // Extraer las funciones exactas de js/app-main.js
  const fnPolygonAnalysis = extractFunctionFromHtml(indexHtml, 'polygonAnalysis');
  const fnComputeElectrical = extractFunctionFromHtml(indexHtml, 'computeElectricalSizingEngineering');
  const fnRaSetLossUI = extractFunctionFromHtml(indexHtml, 'raSetLossUI');
  const fnRaApplyLossPresetUI = extractFunctionFromHtml(indexHtml, 'raApplyLossPresetUI');

  vm.runInContext(fnPolygonAnalysis, ctx);
  vm.runInContext(fnComputeElectrical, ctx);
  vm.runInContext(fnRaSetLossUI, ctx);
  vm.runInContext(fnRaApplyLossPresetUI, ctx);

  // Vincular a window
  ctx.recalculateSolarYield = ctx.window.recalculateSolarYield;
  ctx.getProjectCalcs = ctx.window.getProjectCalcs;
  ctx.raSetLossUI = ctx.window.raSetLossUI = ctx.raSetLossUI;
  ctx.raApplyLossPresetUI = ctx.window.raApplyLossPresetUI = ctx.raApplyLossPresetUI;
  ctx.raRenderLossFields = ctx.window.raRenderLossFields = () => {};
  ctx.raApplyLossesRealtime = ctx.window.raApplyLossesRealtime = () => {
    ctx.window.recalculateSolarYield();
  };

  // Inicializar simulación activa
  win.solarSimState.annualHeatmapData = { simulated: true };
  win.solarSimState.annualHeatmapDirty = false;
  win.wpCurrentStep = 4;
  win.recalculateSolarYield();
  win.RA.ProjectStatusHUD.update();

  const baseYield = win.RA.solarStats.annualYieldKWh;
  console.log(`Producción inicial base (170 paneles, simulación activa): ${baseYield} kWh`);

  // 1. Probar orden de presets
  const presets = ['optimo', 'estandar', 'urbano', 'rural'];
  const yields = {};

  presets.forEach(p => {
    win.raApplyLossPresetUI(p);
    win.RA.ProjectStatusHUD.update();
    const yEng = win.RA.solarStats.annualYieldKWh;
    const yProj = win.getProjectCalcs().annualKWh;
    const yHud = parseInt((dom['ra-hud-energy-text'].textContent || '').replace(/[^\d]/g, ''), 10);
    yields[p] = yEng;
    console.log(`  Preset ${p.padEnd(8)} -> Eng: ${yEng} kWh | ProjCalcs: ${yProj} kWh | HUD: ${yHud} kWh`);
    if (Math.abs(yEng - yProj) > 5) {
      throw new Error(`DESINCRONIZACIÓN: Eng (${yEng}) difiere de ProjCalcs (${yProj}) para preset ${p}`);
    }
  });

  // Verificaciones de monotonicidad de presets
  if (yields.optimo < yields.estandar) {
    throw new Error(`VIOLACIÓN: Óptimo (${yields.optimo}) debe ser mayor que Estándar (${yields.estandar})`);
  }
  if (yields.estandar < yields.urbano) {
    throw new Error(`VIOLACIÓN: Estándar (${yields.estandar}) debe ser mayor que Urbano (${yields.urbano})`);
  }
  if (yields.urbano < yields.rural) {
    throw new Error(`VIOLACIÓN: Urbano (${yields.urbano}) debe ser mayor que Rural (${yields.rural})`);
  }

  // 2. Probar incremento continuo de soiling (suciedad)
  console.log('\nPrueba de incremento continuo de suciedad (soiling 0% -> 15%):');
  let prevVal = Infinity;
  for (let s = 0; s <= 15; s += 2.5) {
    win.raSetLossUI('soiling', s.toString(), false);
    win.RA.ProjectStatusHUD.update();
    const curVal = win.RA.solarStats.annualYieldKWh;
    console.log(`  Soiling ${s}% -> ${curVal} kWh (Delta: ${curVal - (prevVal === Infinity ? curVal : prevVal)} kWh)`);
    if (curVal > prevVal) {
      throw new Error(`VIOLACIÓN MONOTÓNICA: Al subir suciedad a ${s}%, la producción subió de ${prevVal} a ${curVal}`);
    }
    prevVal = curVal;
  }

  // 3. Probar comportamiento cuando annualHeatmapDirty pasa a true
  console.log('\nPrueba de robustez ante annualHeatmapDirty = true:');
  win.raApplyLossPresetUI('estandar');
  const yieldClean = win.RA.solarStats.annualYieldKWh;
  win.solarSimState.annualHeatmapDirty = true;
  win.recalculateSolarYield();
  win.RA.ProjectStatusHUD.update();
  const yieldDirty = win.RA.solarStats.annualYieldKWh;
  const yieldProjDirty = win.getProjectCalcs().annualKWh;
  const hudDirty = parseInt((dom['ra-hud-energy-text'].textContent || '').replace(/[^\d]/g, ''), 10);
  console.log(`  Estándar limpio: ${yieldClean} kWh | Estándar con dirty=true: ${yieldDirty} kWh | ProjCalcs: ${yieldProjDirty} kWh | HUD: ${hudDirty} kWh`);

  if (yieldDirty > yieldClean) {
    throw new Error(`VIOLACIÓN: La producción con dirty=true (${yieldDirty}) saltó por encima de la limpia (${yieldClean})`);
  }
  if (yieldProjDirty > yieldClean) {
    throw new Error(`VIOLACIÓN: getProjectCalcs con dirty=true (${yieldProjDirty}) saltó por encima de la limpia (${yieldClean})`);
  }
  if (hudDirty > yieldClean) {
    throw new Error(`VIOLACIÓN: HUD con dirty=true (${hudDirty}) saltó por encima de la limpia (${yieldClean})`);
  }

  console.log('\n✓ TODOS LOS TESTS DE MONOTONICIDAD PASARON SATISFACTORIAMENTE.');
}

try {
  runLossMonotonicityTests();
} catch (e) {
  console.error('\n❌ ERROR EN TEST:', e.message);
  process.exit(1);
}
