/**
 * ═══════════════════════════════════════════════════════════════════════
 * wind-electrical.js — Ingeniería Eléctrica Eólica según REBT ITC-BT-40,
 *                      ITC-BT-19, ITC-BT-23 y Frenado Reostático (Dump Load)
 * ═══════════════════════════════════════════════════════════════════════
 * Dimensiona el subsistema eléctrico de cada aerogenerador y del parque:
 *   - Resistencia de frenado electromagnético (Dump Load) al 120% de P_nom
 *     durante 30 min continuos para evitar embalamiento ante pérdida de red
 *   - Sección normalizada de conductores Cu RV-K 0,6/1 kV por doble criterio:
 *       1) Caída de tensión máxima ΔU ≤ 1,5 % (REBT ITC-BT-40)
 *       2) Criterio térmico de corriente admisible Iz ≥ 1,25 · In (ITC-BT-19)
 *   - Medición automática de longitud 3D de línea desde base de mástil hasta
 *     el inversor/cuadro general si está posicionado en escena
 *   - Aparamenta obligatoria: Diferencial Clase B (300 mA) para rectificadores
 *     PMSG/inversores sin transformador, Magnetotérmico Curva C/D, y SPD Tipo 1+2
 * @version 2.0.0  2026-10-24
 */
(function (global) {
  'use strict';

  var RAWind = global.RAWind || (global.RAWind = {});

  // Secciones comerciales normalizadas de cobre (mm²) y su intensidad máxima admisible Iz (A)
  // para cable RV-K XLPE 0,6/1 kV al aire / tubo enterrado (UNE-HD 60364-5-52 / ITC-BT-19)
  var STANDARD_CU_SECTIONS = [
    { sectionMm2: 2.5,  maxAmpacity1Ph: 24,  maxAmpacity3Ph: 21 },
    { sectionMm2: 4,    maxAmpacity1Ph: 32,  maxAmpacity3Ph: 28 },
    { sectionMm2: 6,    maxAmpacity1Ph: 41,  maxAmpacity3Ph: 36 },
    { sectionMm2: 10,   maxAmpacity1Ph: 57,  maxAmpacity3Ph: 50 },
    { sectionMm2: 16,   maxAmpacity1Ph: 76,  maxAmpacity3Ph: 68 },
    { sectionMm2: 25,   maxAmpacity1Ph: 101, maxAmpacity3Ph: 89 },
    { sectionMm2: 35,   maxAmpacity1Ph: 125, maxAmpacity3Ph: 110 },
    { sectionMm2: 50,   maxAmpacity1Ph: 151, maxAmpacity3Ph: 134 },
    { sectionMm2: 70,   maxAmpacity1Ph: 192, maxAmpacity3Ph: 171 },
    { sectionMm2: 95,   maxAmpacity1Ph: 232, maxAmpacity3Ph: 207 },
    { sectionMm2: 120,  maxAmpacity1Ph: 269, maxAmpacity3Ph: 239 },
    { sectionMm2: 150,  maxAmpacity1Ph: 300, maxAmpacity3Ph: 272 },
    { sectionMm2: 185,  maxAmpacity1Ph: 341, maxAmpacity3Ph: 310 },
    { sectionMm2: 240,  maxAmpacity1Ph: 400, maxAmpacity3Ph: 364 }
  ];

  // Calibres comerciales de interruptores magnetotérmicos (A)
  var STANDARD_BREAKER_AMPS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400];

  /**
   * Calcula la longitud de línea eléctrica (m) entre el aerogenerador (bajada vertical por el mástil
   * + tendido horizontal + 15% de margen por curvas/subidas) y el inversor o contador de la escena.
   */
  function estimateCableLengthM(turbineInstance, customHorizontalM) {
    if (!turbineInstance) return 40;
    var hubH = (turbineInstance.supportStructure && turbineInstance.supportStructure.hubHeightM) || 18;

    if (customHorizontalM !== undefined && !isNaN(Number(customHorizontalM)) && Number(customHorizontalM) > 0) {
      return Math.round(hubH + Number(customHorizontalM));
    }

    var horizM = 25; // Distancia horizontal por defecto si no hay inversor posicionado
    var pos = turbineInstance.positionCartographic;
    var Cesium = global.Cesium;

    if (pos && Cesium && (global.inverterPosition || global.gridMeterPosition)) {
      try {
        var targetCart = global.inverterPosition || global.gridMeterPosition;
        var turbCart = Cesium.Cartesian3.fromRadians(
          pos.longitudeRad || 0,
          pos.latitudeRad || 0,
          pos.altitudeM || 0
        );
        var dist3D = Cesium.Cartesian3.distance(turbCart, targetCart);
        if (dist3D > 1 && dist3D < 2000) {
          horizM = dist3D * 1.15; // +15% factor de trazado ortogonal y holgura
        }
      } catch (e) { /* fallback a 25m */ }
    }

    return Math.round(hubH + horizM);
  }

  /**
   * Selecciona el calibre comercial de interruptor magnetotérmico inmediatamente superior a `minAmps`.
   */
  function selectStandardBreakerAmps(minAmps) {
    for (var i = 0; i < STANDARD_BREAKER_AMPS.length; i++) {
      if (STANDARD_BREAKER_AMPS[i] >= minAmps) {
        return STANDARD_BREAKER_AMPS[i];
      }
    }
    return 400;
  }

  /**
   * Evalúa y dimensiona la instalación eléctrica de un aerogenerador según REBT ITC-BT-40.
   */
  function evaluateTurbineElectrical(turbineInstance, catalogItem, customCableLengthM) {
    if (!turbineInstance) return null;

    var cat = catalogItem || turbineInstance._catalog || {};
    if (global.RAWindCatalog && turbineInstance.catalogId && !cat.electrical) {
      var fullCat = global.RAWindCatalog.getById(turbineInstance.catalogId);
      if (fullCat) cat = fullCat;
    }

    var C = RAWind.CONSTANTS || {};
    var maxDropPct = C.REBT_MAX_VOLTAGE_DROP_PCT || 1.5;
    var dumpMargin = C.DUMP_LOAD_MARGIN_FACTOR || 1.20;
    var dumpDurationMin = C.DUMP_LOAD_DURATION_MIN || 30;
    // UNE-HD 60364-5-52 / REBT ITC-BT-40: Conductividad de servicio a 90°C para cables XLPE/EPR (kappa=44, rho=0.0227 Ω·mm²/m)
    var rhoCu = 0.0227;

    var ratedPowerW = Number(cat.ratedPowerW) || 10000;
    var ratedKw = ratedPowerW / 1000;
    var elecSpec = cat.electrical || {};
    var genType = elecSpec.generatorType || 'PMSG';
    var voltageV = Number(elecSpec.outputVoltageV) || (ratedPowerW >= 8000 ? 400 : 230);
    var isThreePhase = voltageV >= 380;
    var isDcBus = voltageV <= 120; // Bancos 48V DC (ej. Bornay Wind 6 o Kliux Gecko)
    var cosPhi = isDcBus ? 1.0 : 0.98;

    // 1. Corriente nominal y corriente de diseño (+25% según ITC-BT-40 para generadores)
    var nominalCurrentA = 0;
    if (isThreePhase) {
      nominalCurrentA = ratedPowerW / (Math.sqrt(3) * voltageV * cosPhi);
    } else {
      nominalCurrentA = ratedPowerW / (voltageV * cosPhi);
    }
    var designCurrentA = nominalCurrentA * 1.25;

    // 2. Dimensionamiento de línea eléctrica (Caída de tensión ΔU ≤ 1,5% + Criterio térmico Iz ≥ 1,25·In)
    var cableLengthM = estimateCableLengthM(turbineInstance, customCableLengthM);
    var maxDeltaV = (maxDropPct / 100) * voltageV;

    // S_min por caída de tensión:
    // Trifásica: S = (√3 · L · I · cosφ · ρ) / ΔU_max
    // Monofásica / DC: S = (2 · L · I · cosφ · ρ) / ΔU_max
    var phaseGeomFactor = isThreePhase ? Math.sqrt(3) : 2.0;
    var minSectionByDropMm2 = (phaseGeomFactor * cableLengthM * nominalCurrentA * cosPhi * rhoCu) / Math.max(0.1, maxDeltaV);

    var chosenSpec = STANDARD_CU_SECTIONS[STANDARD_CU_SECTIONS.length - 1];
    for (var i = 0; i < STANDARD_CU_SECTIONS.length; i++) {
      var candidate = STANDARD_CU_SECTIONS[i];
      var ampacity = isThreePhase ? candidate.maxAmpacity3Ph : candidate.maxAmpacity1Ph;
      if (candidate.sectionMm2 >= minSectionByDropMm2 && ampacity >= designCurrentA) {
        chosenSpec = candidate;
        break;
      }
    }

    var selectedSectionMm2 = chosenSpec.sectionMm2;
    var cableAmpacityA = isThreePhase ? chosenSpec.maxAmpacity3Ph : chosenSpec.maxAmpacity1Ph;
    var actualDeltaV = (phaseGeomFactor * cableLengthM * nominalCurrentA * cosPhi * rhoCu) / selectedSectionMm2;
    var actualDropPct = (actualDeltaV / voltageV) * 100;
    var jouleLossW = isThreePhase
      ? (3 * Math.pow(nominalCurrentA, 2) * (rhoCu * cableLengthM / selectedSectionMm2))
      : (2 * Math.pow(nominalCurrentA, 2) * (rhoCu * cableLengthM / selectedSectionMm2));

    // 3. Dimensionamiento del banco de resistencias de frenado (Dump Load)
    var dumpLoadKw = Number(elecSpec.dumpLoadRequiredKw) || Number((ratedKw * dumpMargin).toFixed(2));
    var dumpLoadW = dumpLoadKw * 1000;
    // Tensión del bus DC rectificado (V_dc ≈ 1.35 · V_ll en trifásica o V_dc directo en 48V)
    var dcBusVoltageV = isDcBus ? (voltageV * 1.15) : Math.round(voltageV * 1.35);
    var dumpResistanceOhm = Number(((dcBusVoltageV * dcBusVoltageV) / Math.max(100, dumpLoadW)).toFixed(2));
    var dumpMaxCurrentA = Number((dumpLoadW / dcBusVoltageV).toFixed(1));
    var dumpThermalEnergyKwh = Number((dumpLoadKw * (dumpDurationMin / 60)).toFixed(2));

    // 4. Protecciones obligatorias REBT (ITC-BT-40 / ITC-BT-23 / ITC-BT-24)
    var breakerAmps = selectStandardBreakerAmps(designCurrentA);
    var polesLabel = isThreePhase ? '4P' : '2P';

    var report = {
      generatorType: genType,
      systemTopology: isDcBus ? ('DC ' + voltageV + 'V (Acoplamiento CC)') : (isThreePhase ? 'Trifásico 400V AC' : 'Monofásico 230V AC'),
      outputVoltageV: voltageV,
      nominalCurrentA: Number(nominalCurrentA.toFixed(1)),
      designCurrentA: Number(designCurrentA.toFixed(1)),
      cable: {
        lengthM: cableLengthM,
        sectionMm2: selectedSectionMm2,
        designation: (isThreePhase ? '4x' : '2x') + selectedSectionMm2 + ' mm² Cu RV-K 0,6/1kV + TT',
        ampacityA: cableAmpacityA,
        voltageDropV: Number(actualDeltaV.toFixed(2)),
        voltageDropPct: Number(actualDropPct.toFixed(2)),
        maxAllowedDropPct: maxDropPct,
        jouleLossAtRatedW: Math.round(jouleLossW),
        compliesREBT: actualDropPct <= maxDropPct && cableAmpacityA >= designCurrentA
      },
      dumpLoad: {
        requiredPowerKw: dumpLoadKw,
        durationMin: dumpDurationMin,
        dcBusVoltageV: Math.round(dcBusVoltageV),
        equivalentResistanceOhm: dumpResistanceOhm,
        peakCurrentA: dumpMaxCurrentA,
        dissipatedEnergy30MinKwh: dumpThermalEnergyKwh
      },
      protections: {
        mcbSpec: 'Magnetotérmico ' + polesLabel + ' ' + breakerAmps + ' A Curva C (6 kA)',
        rcdSpec: 'Diferencial ' + polesLabel + ' ' + Math.max(25, breakerAmps) + ' A / 300 mA Clase B (sensible a corrientes continuas alisadas PMSG)',
        spdTowerBase: 'Descargador Sobretensiones Tipo 1+2 (Iimp ≥ 12,5 kA 10/350 µs) en base de mástil (ITC-BT-23)',
        spdMainBoard: 'Descargador Sobretensiones Tipo 2 (In ≥ 20 kA 8/20 µs) en cuadro de sincronización',
        earthingSpec: 'Pica de tierra independiente en pie de torre (R_t ≤ 10 Ω) equipotencializada con armadura de zapata'
      }
    };

    turbineInstance._electricalReport = report;
    return report;
  }

  /**
   * Evalúa el subsistema eléctrico de todo el parque eólico.
   */
  function evaluateParkElectricalSummary(turbines) {
    var list = Array.isArray(turbines) ? turbines : (global.windTurbines || []);
    var totalDumpLoadKw = 0;
    var maxDropPct = 0;
    var allComply = true;
    var reports = [];

    for (var i = 0; i < list.length; i++) {
      var rep = evaluateTurbineElectrical(list[i]);
      if (rep) {
        reports.push(rep);
        totalDumpLoadKw += rep.dumpLoad.requiredPowerKw;
        if (rep.cable.voltageDropPct > maxDropPct) {
          maxDropPct = rep.cable.voltageDropPct;
        }
        if (!rep.cable.compliesREBT) {
          allComply = false;
        }
      }
    }

    return {
      totalDumpLoadKw: Number(totalDumpLoadKw.toFixed(1)),
      worstVoltageDropPct: Number(maxDropPct.toFixed(2)),
      allComplyREBT: allComply,
      reports: reports
    };
  }

  var Electrical = {
    estimateCableLengthM: estimateCableLengthM,
    evaluateTurbineElectrical: evaluateTurbineElectrical,
    evaluateParkElectricalSummary: evaluateParkElectricalSummary,
    STANDARD_CU_SECTIONS: STANDARD_CU_SECTIONS
  };

  RAWind.Electrical = Electrical;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Electrical;
  }

})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
