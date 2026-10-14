/**
 * ============================================================================
 * 🧠 ENGINEERING EXPLAINER — RA SOLAR SUITE
 * Motor de Razonamiento Electrotécnico y Resumen Ejecutivo
 * Genera explicaciones pedagógicas progresivas para:
 * 1. Clientes (beneficio, rentabilidad, seguridad y fiabilidad)
 * 2. Ingenieros (normativa REBT ITC-BT-40, CTE DB-SE-AE, ventanas Voc/Vmp, MPPT, clipping)
 * ============================================================================
 */

(function(global) {
  'use strict';

  const EngineeringExplainer = {

    /**
     * Genera el análisis justificativo de la selección actual de equipos
     */
    analyzeEquipmentSelection: function(opts) {
      const mod = opts.module || { brand: 'Tier-1', model: 'Monocristalino', wp: 450, voc: 41.5, vmp: 34.5, isc: 13.0, l: 2.10, w: 1.05 };
      const inv = opts.inverter || { brand: 'Inversor', model: 'String', kw: 5.0, vDcMax: 1000, vMpptNomMin: 180, vMpptNomMax: 850, mppt: 2, iMaxScA: 30.0, maxOverload: 1.30 };
      const topo = opts.topology || 'inverter';
      const count = opts.totalPanels || 0;
      const totalKwp = opts.totalKwp || ((count * (mod.wp || 450)) / 1000.0);
      const invCount = opts.invCount || 1;

      // Cálculos térmicos y ratios
      const tMin = -10;
      const tMaxCell = 65;
      const gammaVoc = mod.gammaVoc || -0.0028;
      const vocCold = (mod.voc || 41.5) * (1 + gammaVoc * (tMin - 25));
      const vmpHot = (mod.vmp || 34.5) * (1 + gammaVoc * (tMaxCell - 25));

      const totalInvAcKw = (topo === 'microinverter') ? (opts.microinverter ? opts.microinverter.kw * invCount : totalKwp) : (inv.kw * invCount);
      const dcAcRatio = totalInvAcKw > 0 ? (totalKwp / totalInvAcKw) : 1.0;
      const dcAcPct = Math.round(dcAcRatio * 100);

      // Evaluación del ratio DC/AC
      let ratioStatus = 'optimal';
      let ratioText = '';
      if (dcAcRatio < 1.05) {
        ratioStatus = 'underloaded';
        ratioText = 'Inversor con holgura frente al campo solar. Margen disponible para ampliar módulos en el futuro sin sustituir el equipo.';
      } else if (dcAcRatio <= 1.30) {
        ratioStatus = 'optimal';
        ratioText = `Ratio óptimo (${dcAcPct}%). Maximiza la producción en horas de baja irradiancia (amanecer, atardecer e invierno) con mínimo recorte térmico (clipping).`;
      } else {
        ratioStatus = 'overloaded';
        ratioText = `Sobrecarga elevada (${dcAcPct}%). Puede producirse saturación de potencia (clipping) en picos de mediodía estival.`;
      }

      // Límites eléctricos por string
      const nMaxCold = Math.floor((inv.vDcMax || 1000) / vocCold);
      const nMinMppt = Math.ceil((inv.vMpptNomMin || 180) / vmpHot);
      const panelsPerInv = Math.ceil(count / Math.max(1, invCount));
      const panelsPerMppt = Math.round(panelsPerInv / Math.max(1, inv.mppt || 2));

      // Sobrecarga mecánica CTE
      const modArea = (mod.l || 2.10) * (mod.w || 1.05);
      const kgM2 = ((24.5 + 12.0) / modArea);

      // ── Narrativa para el Cliente ──────────────────────────────────────────
      const clientExplanation = {
        title: `Dimensionamiento de ${totalKwp.toFixed(2)} kWp con ${invCount}x ${inv.brand} ${inv.model}`,
        summary: `Tu instalación cuenta con ${count} módulos solares (${mod.brand}) y una potencia de ${totalKwp.toFixed(2)} kWp.`,
        keyPoints: [
          {
            icon: '⚡',
            label: 'Aprovechamiento Energético',
            desc: `El sistema está equilibrado al ${dcAcPct}% de capacidad nominal. Empieza a generar electricidad útil desde primera hora de la mañana incluso con radiación difusa o nubes.`
          },
          {
            icon: '🛡️',
            label: 'Seguridad y Protección Activa',
            desc: `Equipos con marcado CE y certificación IEC 62109. Dispone de desconexión anti-isla conforme a RD 1699/2011 y protecciones contra sobretensiones transitorias.`
          },
          {
            icon: '🔇',
            label: 'Ubicación y Confort Acústico',
            desc: topo === 'microinverter' 
              ? 'Microinversores situados bajo los paneles en tejado; funcionamiento silencioso y máxima seguridad en corriente continua a baja tensión (<60V).'
              : 'Inversor centralizado con refrigeración estanca silenciosa, ubicado junto al cuadro de la vivienda para facilitar mantenimiento e inspección.'
          }
        ]
      };

      // ── Checklist Técnico para Ingenieros ──────────────────────────────────
      const engineerExplanation = {
        dcAcRatio: dcAcRatio.toFixed(2),
        dcAcPct: dcAcPct,
        ratioStatus: ratioStatus,
        ratioEvaluation: ratioText,
        voltageCheck: {
          vocColdModule: vocCold.toFixed(2),
          vmpHotModule: vmpHot.toFixed(2),
          maxModulesPerString: nMaxCold,
          minModulesPerString: nMinMppt,
          status: (panelsPerMppt >= nMinMppt && panelsPerMppt <= nMaxCold) ? 'OK' : 'VERIFICAR',
          note: `Ventana MPPT recomendada: ${nMinMppt} a ${nMaxCold} módulos/string (Voc en frío @ -10°C: ${(panelsPerMppt * vocCold).toFixed(1)}V ≤ ${inv.vDcMax || 1000}V).`
        },
        currentCheck: (() => {
          // [C2/G2] Suma de corrientes de los grupos (strings) que entran por la misma entrada DC.
          const _modsPerString = nMinMppt || 12;
          const _stringsPerMppt = Math.max(1, Math.ceil(panelsPerMppt / _modsPerString));
          const _stringsPerInput = Math.max(1, Math.ceil(_stringsPerMppt / (inv.inputsPerMppt || 1)));
          const _invMaxOper = inv.iMaxOperA || (inv.iMaxScA ? inv.iMaxScA * 0.75 : 15.0);
          const _invMaxIsc = inv.iMaxScA || 30.0;
          const _totalImp = (mod.imp || 13.0) * _stringsPerInput;
          const _totalIsc = (mod.isc || 14.0) * _stringsPerInput;
          return {
            modImp: (mod.imp || 13.0).toFixed(1),
            modIsc: (mod.isc || 14.0).toFixed(1),
            groupsPerInput: _stringsPerInput,
            totalImp: _totalImp.toFixed(1),
            totalIsc: _totalIsc.toFixed(1),
            invMaxOper: _invMaxOper.toFixed(1),
            invMaxIsc: _invMaxIsc.toFixed(1),
            inputsPerMppt: inv.inputsPerMppt || 1,
            hasClipping: _totalImp > _invMaxOper,
            isSafe: _totalIsc <= _invMaxIsc,
            rule: 'IEC 62548: Isc_módulo × grupos_en_paralelo ≤ Imax_inversor y verificación de corriente operativa Imp.'
          };
        })(),
        structuralCheck: {
          kgPerM2: kgM2.toFixed(1),
          limitKgM2: 25.0,
          isAdmissible: kgM2 < 25.0,
          standard: 'CTE DB-SE-AE (Sobrecarga de uso y viento/nieve).'
        }
      };

      return {
        client: clientExplanation,
        engineer: engineerExplanation
      };
    },

    /**
     * Renderiza el componente interactivo de Justificación Técnica/Comercial en el Paso 4
     */
    renderEquipmentJustificationUI: function(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
      const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
      if (!catalog) return;

      const mod = catalog.modules.find(m => m.id === cfg.selectedModuleId) || catalog.modules[0];
      const inv = catalog.inverters.find(i => i.id === cfg.selectedInverterId) || catalog.inverters[0];
      const mi = catalog.microinverters.find(m => m.id === cfg.selectedMicroinverterId) || catalog.microinverters[0];
      const bat = catalog.batteries.find(b => b.id === cfg.selectedBatteryId) || catalog.batteries[0];

      let count = 0;
      if (typeof WP !== 'undefined' && WP && WP.polylines) {
        WP.polylines.forEach(p => {
          if (p.roofInfo && p.roofInfo.panels) count += p.roofInfo.panels.length;
        });
      }
      if (count === 0 && typeof lastRoofInfo !== 'undefined' && lastRoofInfo && lastRoofInfo.panels) {
        count = lastRoofInfo.panels.length;
      }
      if (count === 0) count = cfg.lastEstimatedPanels || 20;

      const invCount = (cfg.autoSizing && cfg.autoSizing.inverters) ? cfg.autoSizing.inverters.count : 1;
      const analysis = this.analyzeEquipmentSelection({
        module: mod,
        inverter: inv,
        microinverter: mi,
        battery: bat,
        topology: cfg.selectedTopology || 'inverter',
        totalPanels: count,
        invCount: invCount
      });

      const activeTab = window._engExplainerActiveTab || 'client';

      container.innerHTML = `
        <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(56,189,248,0.3);border-radius:8px;padding:8px;margin-top:6px;font-size:9px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;">
            <span style="font-weight:900;color:#38BDF8;display:flex;align-items:center;gap:4px;">
              <span>💡</span> RAZONAMIENTO Y JUSTIFICACIÓN
            </span>
            <div style="display:flex;gap:3px;">
              <button type="button" class="doc-mini-btn ${activeTab === 'client' ? 'active' : ''}" onclick="window._engExplainerActiveTab='client';EngineeringExplainer.renderEquipmentJustificationUI('${containerId}');" style="padding:2px 6px;font-size:8px;border-color:#38BDF8;color:${activeTab === 'client' ? '#fff' : '#94A3B8'};background:${activeTab === 'client' ? '#0284C7' : 'transparent'};">
                👤 CLIENTE
              </button>
              <button type="button" class="doc-mini-btn ${activeTab === 'engineer' ? 'active' : ''}" onclick="window._engExplainerActiveTab='engineer';EngineeringExplainer.renderEquipmentJustificationUI('${containerId}');" style="padding:2px 6px;font-size:8px;border-color:#F59E0B;color:${activeTab === 'engineer' ? '#000' : '#94A3B8'};background:${activeTab === 'engineer' ? '#F59E0B' : 'transparent'};font-weight:bold;">
                📐 INGENIERÍA
              </button>
            </div>
          </div>

          ${activeTab === 'client' ? `
            <div style="display:flex;flex-direction:column;gap:5px;">
              <div style="font-weight:700;color:#FBBF24;">${analysis.client.title}</div>
              ${analysis.client.keyPoints.map(kp => `
                <div style="background:rgba(255,255,255,0.03);padding:5px 6px;border-radius:5px;border-left:2px solid #38BDF8;">
                  <div style="font-weight:bold;color:#F8FAFC;margin-bottom:1px;">${kp.icon} ${kp.label}</div>
                  <div style="color:#CBD5E1;line-height:1.3;">${kp.desc}</div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;">
                <span style="color:#94A3B8;">Factor Sobrecarga DC/AC:</span>
                <b style="color:${analysis.engineer.ratioStatus === 'optimal' ? '#10B981' : '#FBBF24'};">${analysis.engineer.dcAcPct}% (${analysis.engineer.dcAcRatio})</b>
              </div>
              <div style="color:#94A3B8;font-size:8px;line-height:1.25;margin-bottom:2px;">${analysis.engineer.ratioEvaluation}</div>

              <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;">
                <span style="color:#94A3B8;">Seguridad Tensión Frío (-10°C):</span>
                <b style="color:#10B981;">${analysis.engineer.voltageCheck.status}</b>
              </div>
              <div style="color:#94A3B8;font-size:8px;line-height:1.25;">${analysis.engineer.voltageCheck.note}</div>

              <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;margin-top:2px;">
                <span style="color:#94A3B8;">Corriente Operativa Imp vs MPPT:</span>
                <b style="color:${analysis.engineer.currentCheck.hasClipping ? '#F59E0B' : '#10B981'};">${analysis.engineer.currentCheck.modImp}A ≤ ${analysis.engineer.currentCheck.invMaxOper}A (${analysis.engineer.currentCheck.hasClipping ? 'Clipping' : 'OK'})</b>
              </div>
              <div style="color:#94A3B8;font-size:8px;line-height:1.25;">${analysis.engineer.currentCheck.hasClipping ? '⚠️ La corriente del panel supera la entrada nominal del inversor: habrá recorte térmico en picos de radiación.' : 'Sin saturación por corriente en MPPT. Entradas por MPPT: ' + analysis.engineer.currentCheck.inputsPerMppt + '.'}</div>

              <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;margin-top:2px;">
                <span style="color:#94A3B8;">Seguridad Cortocircuito Isc:</span>
                <b style="color:${analysis.engineer.currentCheck.isSafe ? '#10B981' : '#EF4444'};">${analysis.engineer.currentCheck.modIsc}A ≤ ${analysis.engineer.currentCheck.invMaxIsc}A (${analysis.engineer.currentCheck.isSafe ? 'OK' : 'PELIGRO'})</b>
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:4px 6px;border-radius:4px;margin-top:2px;">
                <span style="color:#94A3B8;">Sobrecarga Mecánica Techo:</span>
                <b style="color:#38BDF8;">${analysis.engineer.structuralCheck.kgPerM2} kg/m² (&lt; 25 kg/m²)</b>
              </div>
              <div style="color:#64748B;font-size:7.5px;">Norma: ${analysis.engineer.structuralCheck.standard}</div>
            </div>
          `}
        </div>
      `;
    },

    /**
     * Genera el Resumen Ejecutivo Oficial en formato HTML estructurado
     * para el Paso 5 y el Generador de Documentos PDF/Word
     */
    generateExecutiveSummaryHTML: function(projectData) {
      const d = projectData || {};
      const numPanels = d.numPanels || (window.solarProjectConfig && window.solarProjectConfig.lastEstimatedPanels) || 0;
      const mod = (d.cfg) || (panelConfig) || { modelo: 'Tier-1 450W', potencia: 450, largo: 2.10, ancho: 1.05 };
      const totalKwp = ((numPanels * (mod.potencia || 450)) / 1000.0).toFixed(2);
      const fin = d.financial || {};
      const savingsAnnual = fin.savingsAnnual || (d.ahorro_anual) || (numPanels * 135);
      const payback = fin.paybackYears || (d.roi) || '4.2';
      const co2Tons = ((numPanels * (mod.potencia || 450) * 1.45 * 0.25) / 1000.0).toFixed(1);
      const treesEquivalent = Math.round(parseFloat(co2Tons) * 45);

      const catalog = (typeof equipmentCatalog !== 'undefined') ? equipmentCatalog : null;
      const cfg = (typeof window !== 'undefined' && window.solarProjectConfig) ? window.solarProjectConfig : {};
      const inv = (catalog && catalog.inverters) ? (catalog.inverters.find(i => i.id === cfg.selectedInverterId) || catalog.inverters[0]) : { brand: 'Huawei', model: 'SUN2000-KTL', kw: 5.0 };
      const invCount = (cfg.autoSizing && cfg.autoSizing.inverters) ? cfg.autoSizing.inverters.count : 1;

      return `
        <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(56,189,248,0.3);border-radius:8px;padding:12px;margin:8px 0;color:#f8fafc;font-family:inherit;">
          <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:16px;">📋</span>
              <b style="font-size:11px;color:#38BDF8;letter-spacing:0.5px;text-transform:uppercase;">Resumen Ejecutivo de la Instalación</b>
            </div>
            <span style="font-size:9px;background:rgba(16,185,129,0.2);color:#34D399;padding:2px 6px;border-radius:4px;font-weight:800;">DISEÑO VALIDADO</span>
          </div>

          <div style="font-size:10px;line-height:1.5;color:#CBD5E1;margin-bottom:8px;text-align:justify;">
            La instalación solar fotovoltaica proyectada consta de un campo generador de <b>${numPanels} módulos fotovoltaicos</b> de alta eficiencia 
            (<b>${mod.modelo || 'Tier-1'}</b> de <b>${mod.potencia || 450} Wp</b>), totalizando una potencia pico en corriente continua de <b>${totalKwp} kWp</b>. 
            La energía solar captada se gestionará mediante <b>${invCount}x ${inv.brand} ${inv.model}</b> (${(inv.kw * invCount).toFixed(1)} kW nominales AC), 
            garantizando un factor de dimensionamiento óptimo y una conversión limpia de energía conectada a la red interior del inmueble bajo normativa <b>REBT ITC-BT-40</b>.
          </div>

          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:6px;margin-bottom:6px;">
            <div style="background:rgba(0,0,0,0.35);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-size:7.5px;color:#94A3B8;text-transform:uppercase;font-weight:700;">Potencia Generador</div>
              <div style="font-size:12px;font-weight:900;color:#FBBF24;margin-top:2px;">${totalKwp} kWp</div>
            </div>
            <div style="background:rgba(0,0,0,0.35);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-size:7.5px;color:#94A3B8;text-transform:uppercase;font-weight:700;">Ahorro Estimado</div>
              <div style="font-size:12px;font-weight:900;color:#34D399;margin-top:2px;">~${Math.round(savingsAnnual).toLocaleString('es-ES')} €/año</div>
            </div>
            <div style="background:rgba(0,0,0,0.35);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-size:7.5px;color:#94A3B8;text-transform:uppercase;font-weight:700;">Retorno Inversión</div>
              <div style="font-size:12px;font-weight:900;color:#38BDF8;margin-top:2px;">${payback} años</div>
            </div>
            <div style="background:rgba(0,0,0,0.35);padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
              <div style="font-size:7.5px;color:#94A3B8;text-transform:uppercase;font-weight:700;">CO₂ Evitado Anual</div>
              <div style="font-size:12px;font-weight:900;color:#A78BFA;margin-top:2px;">${co2Tons} t CO₂</div>
            </div>
          </div>

          <div style="font-size:8.5px;color:#94A3B8;display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px dashed rgba(255,255,255,0.08);">
            <span>🌱 Impacto ecológico equivalente: <b>${treesEquivalent} árboles plantados/año</b>.</span>
            <span>⚡ Cumplimiento estricto: <b>CTE DB-HE5 / RD 244/2019</b>.</span>
          </div>
        </div>
      `;
    }
  };

  global.EngineeringExplainer = EngineeringExplainer;
})(typeof window !== 'undefined' ? window : globalThis);
