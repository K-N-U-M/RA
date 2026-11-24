/**
 * RA — Infografías Vectoriales y Páginas CEL para Propuesta Comercial (Extraído de financials.js · F4-07)
 */
(function(window) {
  "use strict";

// ── INFOGRAFÍAS VECTORIALES PARA HUMANOS (FASE 4) ──────────────────────────
  function buildInfografiasHTML(m, pal, annualYieldKWh, layoutStyle, billOpts) {
    layoutStyle = layoutStyle || 'editorial';
    billOpts = billOpts || {};
    var SvgCat = (typeof window !== 'undefined' && window.RA_SvgCatalog) ? window.RA_SvgCatalog : null;
    function getIcon(name, col, sz) {
      if (!SvgCat || typeof SvgCat.render !== 'function') return '';
      return SvgCat.render(name, col || pal.primary, sz || 36);
    }

    var batKwh = (m.batCap && m.batCap > 0) ? m.batCap : (m.batCost > 0 ? 5.12 : 0);
    var hasBat = batKwh > 0;
    var modality = billOpts.installationModality || 'grid_surplus_cel';
    var isOffGrid = (modality === 'off_grid');
    var isGridZero = (modality === 'grid_zero');
    var isGridBackup = (modality === 'grid_backup');
    var refGridPrice = (typeof billOpts.referenceGridPriceEUR === 'number' && billOpts.referenceGridPriceEUR > 0)
      ? billOpts.referenceGridPriceEUR
      : (m.precioRedEUR || 0.22);

    // [SSOT] Priorizar factura real auditada del cliente frente a estimación paramétrica
    var fallbackGastoSin = Math.round(((m.consumoAnual || 3500) * (m.precioRedEUR || 0.18)) / 12) || 120;
    var gastoSin = (billOpts.gastoSin && billOpts.gastoSin > 0) ? Math.round(billOpts.gastoSin) : fallbackGastoSin;
    var gastoCon = (billOpts.gastoCon && billOpts.gastoCon > 0) ? Math.round(billOpts.gastoCon) : Math.max(15, Math.round(gastoSin - (m.ahorroMensualLuz || 65)));
    var cuotaFin = Math.round(m.cuotaMensual) || 85;
    var cuotaTotalFin = gastoCon + cuotaFin;
    var balanceFinMes = gastoSin - cuotaTotalFin;

    // Métricas específicas para instalaciones Aisladas de Red (Off-Grid) sin comparativa de facturas
    var valorEnergiaAnual = Math.round(annualYieldKWh * refGridPrice);
    var valorEnergiaMes = Math.round(valorEnergiaAnual / 12);
    var lcoePropio = (typeof m.lcoe === 'number' && m.lcoe > 0) ? m.lcoe : (m.capexNeto / Math.max(1, annualYieldKWh * 25));
    var lcoeStr = lcoePropio.toFixed(3).replace('.', ',');
    var refPriceStr = refGridPrice.toFixed(2).replace('.', ',');
    var dieselLitersAvoided = Math.round(annualYieldKWh * 0.32);
    var backupHours = hasBat ? Math.max(4, Math.round((batKwh / Math.max(0.35, (m.consumoAnual || 3500) / 8760)) * 0.85)) : 0;

    // Espaciado y padding adaptativo según layoutStyle
    var isEditorial = (layoutStyle === 'editorial');
    var isInfographic = (layoutStyle === 'infographic');
    var cardPad = isEditorial ? '18px 20px' : (isInfographic ? '16px 18px' : '12px 14px');
    var cardMargin = isEditorial ? '20px 0' : (isInfographic ? '16px 0' : '12px 0');
    var cardShadow = isEditorial ? '0 4px 16px rgba(0,0,0,0.05)' : '0 2px 8px rgba(0,0,0,0.04)';
    var cardBorder = isEditorial ? '1.5px solid #e2e8f0' : '1px solid #cbd5e1';

    // 1. Cara a cara de tu bolsillo (o Valor Económico de la Energía Generada en modo Off-Grid)
    var infoCaraACara = '';
    if (isOffGrid) {
      infoCaraACara = '<div class="ra-infographic-card ra-card-cara-a-cara" style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
        '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            getIcon('savingsChart', pal.primary, 24) +
            '<span>Coste de la Instalación y Valor de tu Energía Generada</span>' +
          '</div>' +
          '<span style="font-size:9.5px;color:' + pal.primary + ';font-weight:800;letter-spacing:0.5px;">INSTALACIÓN 100% AISLADA DE RED</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1.1fr 1.05fr;gap:14px;align-items:stretch;">' +
          '<div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('piggyBank', '#0f172a', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#475569;text-transform:uppercase;">COSTE DE LA INSTALACIÓN</div>' +
              '<div style="font-size:20px;font-weight:900;color:#0f172a;margin:4px 0;">' + Math.round(m.capexBruto).toLocaleString('es-ES') + ' €</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#334155;line-height:1.3;margin-top:6px;">Llave en mano (o <b>' + cuotaFin + ' €/mes</b> financiado)<br><b>0 € en acometidas ni recibos</b></div>' +
          '</div>' +
          '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('zeroEuro', '#16a34a', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#166534;text-transform:uppercase;">ENERGÍA QUE NO COMPRAS A LA RED</div>' +
              '<div style="font-size:20px;font-weight:900;color:#16a34a;margin:4px 0;">' + valorEnergiaAnual.toLocaleString('es-ES') + ' €/año</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#14532d;line-height:1.3;margin-top:6px;"><b>' + Math.round(annualYieldKWh).toLocaleString('es-ES') + ' kWh/año</b> generados (' + valorEnergiaMes + ' €/mes valorados a ' + refPriceStr + ' €/kWh)</div>' +
          '</div>' +
          '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('shieldCheck', '#2563eb', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#1e40af;text-transform:uppercase;">PRECIO PROPIO DE TU ENERGÍA (25 AÑOS)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#2563eb;margin:4px 0;">' + lcoeStr + ' €/kWh</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#1e3a8a;line-height:1.3;margin-top:6px;">' +
              'Frente a ' + refPriceStr + ' €/kWh en red eléctrica<br>' +
              '<b style="color:#16a34a;">Evita ~' + dieselLitersAvoided.toLocaleString('es-ES') + ' L/año de diésel</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    } else {
      var modeBadge = isGridZero ? 'AUTOCONSUMO ADAPTADO AL CONSUMO' : (isGridBackup ? 'ESTUDIO DE FACTURA + RESPALDO LFP' : 'ESTUDIO DE FACTURA');
      infoCaraACara = '<div class="ra-infographic-card ra-card-cara-a-cara" style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
        '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            getIcon('savingsChart', pal.primary, 24) +
            '<span>El Cara a Cara de tu Bolsillo (Impacto Mensual)</span>' +
          '</div>' +
          '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">' + modeBadge + '</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1.15fr;gap:14px;align-items:stretch;">' +
          '<div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('billCut', '#dc2626', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#991b1b;text-transform:uppercase;">HOY (SIN PLACAS)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#dc2626;margin:4px 0;">-' + gastoSin + ' €/mes</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#7f1d1d;line-height:1.3;margin-top:6px;">Dinero 100% perdido en alquiler a la eléctrica</div>' +
          '</div>' +
          '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('zeroEuro', '#16a34a', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#166534;text-transform:uppercase;">CON SOLAR (CONTADO)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#16a34a;margin:4px 0;">' + gastoCon + ' €/mes</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#14532d;line-height:1.3;margin-top:6px;"><b>Ahorro directo de hasta el 85%</b></div>' +
          '</div>' +
          '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:12px 10px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;">' +
            '<div>' +
              '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('piggyBank', '#2563eb', 32) + '</div>' +
              '<div style="font-size:9px;font-weight:800;color:#1e40af;text-transform:uppercase;">FINANCIADO (0 € ENTRADA)</div>' +
              '<div style="font-size:20px;font-weight:900;color:#2563eb;margin:4px 0;">' + cuotaTotalFin + ' €/mes</div>' +
            '</div>' +
            '<div style="font-size:8.5px;color:#1e3a8a;line-height:1.3;margin-top:6px;">' +
              'Recibo (' + gastoCon + '€) + Cuota (' + cuotaFin + '€)<br>' +
              '<b style="color:' + (balanceFinMes >= 0 ? '#16a34a' : '#2563eb') + ';">' + (balanceFinMes >= 0 ? ('¡Te sobran +' + balanceFinMes + ' €/mes!') : 'Se paga sola con el ahorro') + '</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // 2. El Reloj Solar de 24 Horas
    var genDia = Math.round(annualYieldKWh / 365);
    var excDia = Math.round((m.excedenteKWh || annualYieldKWh * 0.35) / 365);
    var relojTitle = isOffGrid
      ? 'Ciclo de Autonomía 24 Horas & Reserva Independiente'
      : (isGridBackup ? 'Ciclo Solar 24 Horas & Escudo Anti-Apagones' : 'El Ciclo de 24 Horas de tu Tejado Solar');
    var relojBadge = isOffGrid
      ? 'SUPERVIVENCIA OFF-GRID 24/7'
      : (isGridZero ? 'VERTIDO CERO · AJUSTADO A DEMANDA' : (isGridBackup ? 'AUTARQUÍA + BACKUP CRÍTICO' : 'AUTARQUÍA EN TIEMPO REAL'));
    var midCardText = '';
    if (isOffGrid) {
      midCardText = '<b>Generación propia (~' + genDia + ' kWh/día)</b>. Alimenta la vivienda al 100% y recarga prioritariamente tu reserva de baterías (' + (hasBat ? (batKwh + ' kWh LFP') : 'banco acumulador') + ').';
    } else if (isGridZero) {
      midCardText = '<b>Energía gratis (~' + genDia + ' kWh/día)</b>. El inversor modula la producción adaptándola exactamente a tu curva de consumo e inyectando en batería sin verter a la red.';
    } else {
      midCardText = '<b>Energía gratis (~' + genDia + ' kWh/día)</b>. Climatización sin coste. Los excedentes (~' + excDia + ' kWh/día) ' + (hasBat ? 'cargan tu batería LFP.' : 'generan saldo en tu monedero solar.');
    }
    var nightCardText = '';
    if (isOffGrid) {
      nightCardText = hasBat
        ? ('Suministro 100% autónomo desde tus <b>' + batKwh + ' kWh LFP (~' + backupHours + 'h de reserva)</b> con 0 € de red y sin ruido de generador diésel.')
        : 'Suministro nocturno cubierto íntegramente mediante tu sistema de acumulación aislado sin depender de la red.';
    } else if (isGridBackup && hasBat) {
      nightCardText = 'Alimentación desde tus <b>' + batKwh + ' kWh LFP</b> con <b>respaldo anti-apagones (~' + backupHours + 'h de autonomía crítica)</b> ante caídas de red.';
    } else if (isGridZero && !hasBat) {
      nightCardText = 'Transición automática y transparente al suministro de red tras cubrir el 100% del consumo solar diurno.';
    } else {
      nightCardText = (hasBat ? ('Alimentación limpia desde los <b>' + batKwh + ' kWh guardados en tu Batería</b> sin consumir de la red.') : 'Compensación nocturna automática con los excedentes vertidos a la red durante el día.');
    }

    var infoRelojSolar = '<div class="ra-infographic-card ra-card-reloj-solar" style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('energyFlow24h', pal.primary, 24) +
          '<span>' + relojTitle + '</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">' + relojBadge + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
        '<div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('morningSun', '#d97706', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#b45309;">08:00 - 11:00<br><span style="font-size:9px;font-weight:700;color:#92400e;">Despertar Solar</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#78350f;line-height:1.4;">' +
            'Tus placas captan los primeros rayos. Cubren el consumo base matinal (frigoríficos, bombas, iluminación y equipos en espera).' +
          '</div>' +
        '</div>' +
        '<div style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('peakSun', '#16a34a', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#15803d;">11:00 - 17:00<br><span style="font-size:9px;font-weight:700;color:#14532d;">' + (isOffGrid ? 'Cosecha & Carga LFP' : 'Pico 100% Gratis') + '</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#14532d;line-height:1.4;">' +
            midCardText +
          '</div>' +
        '</div>' +
        '<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:12px 10px;text-align:left;">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            getIcon('eveningMoon', '#475569', 28) +
            '<div style="font-size:10.5px;font-weight:900;color:#334155;">17:00 - 08:00<br><span style="font-size:9px;font-weight:700;color:#1e293b;">' + (isOffGrid ? 'Autonomía Nocturna' : 'Noche Protegida') + '</span></div>' +
          '</div>' +
          '<div style="font-size:9px;color:#475569;line-height:1.4;">' +
            nightCardText +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 3. Anatomía del Tejado Blindado (4 Escudos Técnicos)
    var infoTejadoBlindado = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('shieldCheck', pal.primary, 24) +
          '<span>Seguridad Técnica & Garantías de la Instalación</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">NORMATIVA CTE & REBT</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('structure', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">Triple Estanqueidad</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Juntas EPDM estancas sin perforación invasiva. Cero goteras garantizadas.</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('panel', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">Vientos 120 km/h</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Estructura calculada según CTE DB-SE-AE. Perfilería aluminio anodizado e inox A2.</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('protections', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">Doble Protección</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Descargadores SPD Clase II contra sobretensiones y seccionador DC homologado.</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 8px;text-align:center;">' +
          '<div style="display:flex;justify-content:center;margin-bottom:6px;">' + getIcon('warranty25', pal.primary, 30) + '</div>' +
          '<div style="font-weight:800;font-size:10px;color:#0f172a;margin:2px 0;">25 Años Rendimiento</div>' +
          '<div style="font-size:8px;color:#64748b;line-height:1.3;">Garantía de producción lineal Tier-1 con rendimiento ≥84,8% a 25 años.</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 4. Cascada del Escudo Fiscal (Waterfall)
    var ibiEur = Math.round(m.ahorroIBITotal || 0);
    var isEmpresa = (m.customerProfile === 'empresa');
    var deducNombre = isEmpresa
      ? ('Libertad Amortización IS (' + Math.round((m.isRate || 0.25) * 100) + '%)')
      : ('Deducción IRPF' + (m.irpfPct ? ' (' + Math.round(m.irpfPct * 100) + '%)' : ''));
    var deducEur = isEmpresa ? Math.round(m.ahorroSociedades || 0) : Math.round(m.ahorroIRPF || 0);
    var capexNet = Math.round(m.capexNeto || (m.capexBruto - ibiEur - deducEur));
    var infoCascadaFiscal = '<div style="background:#ffffff;border:' + cardBorder + ';border-radius:12px;padding:' + cardPad + ';margin:' + cardMargin + ';box-shadow:' + cardShadow + ';">' +
      '<div style="font-weight:900;font-size:12px;color:#0f172a;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          getIcon('certifiedEngineer', pal.primary, 24) +
          '<span>La Cascada del Escudo Fiscal (Tus Ahorros en Impuestos)</span>' +
        '</div>' +
        '<span style="font-size:9.5px;color:#64748b;font-weight:700;letter-spacing:0.5px;">BONIFICACIONES OFICIALES</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.1fr auto 1fr auto 1fr auto 1.2fr;align-items:center;gap:8px;font-size:9.5px;text-align:center;">' +
        '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:#64748b;font-weight:700;">Inversión Llave en Mano</div>' +
          '<b style="font-size:13px;color:#0f172a;display:block;margin-top:2px;">' + Math.round(m.capexBruto).toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:bold;color:#94a3b8;">−</span>' +
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:#166534;font-weight:700;">Bonificación IBI</div>' +
          '<b style="font-size:13px;color:#16a34a;display:block;margin-top:2px;">' + ibiEur.toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:bold;color:#94a3b8;">−</span>' +
        '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:#166534;font-weight:700;">' + deducNombre + '</div>' +
          '<b style="font-size:13px;color:#16a34a;display:block;margin-top:2px;">' + deducEur.toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
        '<span style="font-size:16px;font-weight:bold;color:#94a3b8;">=</span>' +
        '<div style="background:' + pal.light + ';border:2px solid ' + pal.primary + ';border-radius:8px;padding:10px 8px;">' +
          '<div style="font-size:8.5px;color:' + pal.dark + ';font-weight:800;">COSTE NETO REAL</div>' +
          '<b style="font-size:14px;color:' + pal.primary + ';display:block;margin-top:2px;">' + capexNet.toLocaleString('es-ES') + ' €</b>' +
        '</div>' +
      '</div>' +
    '</div>';

    return {
      caraACara: infoCaraACara,
      relojSolar: infoRelojSolar,
      tejadoBlindado: infoTejadoBlindado,
      cascadaFiscal: infoCascadaFiscal
    };
  }

  // ── COMUNIDAD ENERGÉTICA LOCAL (CEL · MARCO RDL 7/2026 RADIO 5 KM) ──────────
  function calculateCELMetrics(d, m, customCelPrice) {
    d = d || {};
    m = m || {};
    var genKWh = Math.round(m.annualYieldKWh || (d && d.annualKWh) || 0);
    var autoKWh = Math.round(m.autoconsumoDirecto || (genKWh * (m.autarquiaPct || 65) / 100));
    var batKWh = Math.round(m.bateriaKWh || 0);
    var excKWh = Math.round(m.excedenteKWh != null ? m.excedenteKWh : Math.max(0, genKWh - autoKWh - batKWh));
    if (excKWh <= 0 && genKWh > 0) {
      excKWh = Math.round(genKWh * 0.35); // Estimación canónica de vertido estacional
    }

    var precioPool = (m && typeof m.precioCompensacionEUR === 'number' && m.precioCompensacionEUR > 0)
      ? m.precioCompensacionEUR
      : 0.05; // Alineado con compensación / pool del motor financiero
    var precioCEL = (typeof customCelPrice === 'number' && customCelPrice > 0) ? customCelPrice : 0.11; // €/kWh Venta local P2P CEL

    var ingresoPoolAnual = Math.round(excKWh * precioPool);
    var ingresoCELAnual = Math.round(excKWh * precioCEL);
    var beneficioExtraCEL = Math.max(0, ingresoCELAnual - ingresoPoolAnual);
    var ahorroTotalConCEL = Math.round((m.ahorroLuzAnio1 || 0) + beneficioExtraCEL);

    // [SSOT Dinámico] Deducir el payback tradicional y CEL del flujo de caja acumulado real (con degradación, rescate fiscal e IPC)
    var paybackTradicional = 25;
    if (m && Array.isArray(m.cashflowAcumSinCEL) && m.cashflowAcumSinCEL.length > 1) {
      for (var yt = 1; yt < m.cashflowAcumSinCEL.length; yt++) {
        if (m.cashflowAcumSinCEL[yt] >= 0) {
          var ptv = m.cashflowAcumSinCEL[yt - 1];
          var dtv = m.cashflowAcumSinCEL[yt] - ptv;
          paybackTradicional = dtv > 0 ? (yt - 1) + (-ptv / dtv) : yt;
          break;
        }
      }
    } else if (m.paybackYears && isFinite(m.paybackYears) && m.paybackYears > 0) {
      paybackTradicional = m.paybackYears;
    } else {
      paybackTradicional = 6.5;
    }

    var paybackCEL = 25;
    if (m && Array.isArray(m.cashflowAcum) && m.cashflowAcum.length > 1) {
      for (var yc = 1; yc < m.cashflowAcum.length; yc++) {
        if (m.cashflowAcum[yc] >= 0) {
          var pcv = m.cashflowAcum[yc - 1];
          var dcv = m.cashflowAcum[yc] - pcv;
          paybackCEL = dcv > 0 ? (yc - 1) + (-pcv / dcv) : yc;
          break;
        }
      }
    }
    // Fallback si no cruzó cero en 25 años o no había serie
    if (!paybackCEL || paybackCEL >= 25) {
      var capexNeto = (m.capexNeto && isFinite(m.capexNeto) && m.capexNeto > 0) ? m.capexNeto : (m.capexBruto || 6000);
      paybackCEL = (capexNeto > 0 && ahorroTotalConCEL > 0)
        ? Math.round((capexNeto / ahorroTotalConCEL) * 10) / 10
        : Math.round(paybackTradicional * 0.72 * 10) / 10;
    } else {
      paybackCEL = Math.round(paybackCEL * 10) / 10;
    }
    paybackTradicional = Math.round(paybackTradicional * 10) / 10;

    var reduccionPaybackAnios = Math.max(0.2, Math.round((paybackTradicional - paybackCEL) * 10) / 10);

    var familiasBeneficiadas = Math.max(1, Math.round((excKWh / 1800) * 10) / 10);
    var co2EvitadoKg = Math.round(excKWh * (((typeof window !== 'undefined' && window.SOLAR_ENGINE_CONSTANTS && window.SOLAR_ENGINE_CONSTANTS.CO2_FACTOR_SPAIN) || 0.259)));

    var autoPct = genKWh > 0 ? Math.round((autoKWh / genKWh) * 100) : 55;
    var batPct = (genKWh > 0 && batKWh > 0) ? Math.round((batKWh / genKWh) * 100) : 0;
    var excPct = Math.max(0, 100 - autoPct - batPct);

    return {
      genKWh: genKWh,
      autoKWh: autoKWh,
      batKWh: batKWh,
      excKWh: excKWh,
      autoPct: autoPct,
      batPct: batPct,
      excPct: excPct,
      precioPool: precioPool,
      precioCEL: precioCEL,
      ingresoPoolAnual: ingresoPoolAnual,
      ingresoCELAnual: ingresoCELAnual,
      beneficioExtraCEL: beneficioExtraCEL,
      ahorroTotalConCEL: ahorroTotalConCEL,
      paybackTradicional: paybackTradicional,
      paybackCEL: paybackCEL,
      reduccionPaybackAnios: reduccionPaybackAnios,
      familiasBeneficiadas: familiasBeneficiadas,
      co2EvitadoKg: co2EvitadoKg,
      distanciaMaxKm: 5,
      distanciaMaxMetros: 5000,
      areaKm2: 78.5,
      normativa: 'Real Decreto-ley 7/2026',
      normativaCompleta: 'Real Decreto-ley 7/2026 (amplía el radio de autoconsumo colectivo a 5 km)',
      ordenTED: 'Orden TED/1247/2021 (Coeficientes horarios dinámicos βh)'
    };
  }

  function buildCELPageHTML(d, m, pal, cel, pageNum, totPages, companyName, pageNum2, buildInnerHeaderFn, studioCfg) {
    pal = pal || { primary: '#059669', light: '#d1fae5', accent: '#10b981', dark: '#065f46' };
    cel = cel || calculateCELMetrics(d, m);
    d = d || {};
    pageNum = pageNum || 5;
    pageNum2 = pageNum2 || (pageNum + 1);
    totPages = totPages || 8;
    companyName = companyName || 'SOLAR 3D PRO';
    var _escCel = function(v) {
      if (window.RASanitize && typeof window.RASanitize.plain === 'function') return window.RASanitize.plain(v);
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    const cfg = studioCfg || {};
    const flowH = (typeof cfg.celFlowBarHeightPx === 'number' && cfg.celFlowBarHeightPx >= 18) ? cfg.celFlowBarHeightPx : 26;
    const flowSize = (typeof cfg.celFlowFontSize === 'number') ? cfg.celFlowFontSize : 9.5;
    const flowDescSize = (typeof cfg.celFlowDescFontSize === 'number') ? cfg.celFlowDescFontSize : 9.0;
    const radarH = (typeof cfg.celRadarHeightPx === 'number' && cfg.celRadarHeightPx >= 160) ? Math.max(cfg.celRadarHeightPx, 290) : 310;
    const radarLblSize = (typeof cfg.celRadarLabelFontSize === 'number') ? cfg.celRadarLabelFontSize : 11.5;
    const radarDistSize = (typeof cfg.celRadarDistanceFontSize === 'number') ? cfg.celRadarDistanceFontSize : 10.5;
    const celCardsGap = (typeof cfg.celCardsGapPx === 'number') ? cfg.celCardsGapPx : 8;

    var autoW = Math.max(15, cel.autoPct);
    var batW = cel.batPct > 0 ? Math.max(10, cel.batPct) : 0;
    var excW = Math.max(15, 100 - autoW - batW);

    // Desglose proporcional de los excedentes e ingresos por nodo receptor según perfil horario βh
    var excTotal = Math.max(0, Math.round(cel.excKWh || 0));
    var ingTotal = Math.max(0, Math.round(cel.ingresoCELAnual || 0));
    var n1Kwh = Math.round(excTotal * 0.25), n1Eur = Math.round(ingTotal * 0.25); // Viviendas (25%)
    var n2Kwh = Math.round(excTotal * 0.30), n2Eur = Math.round(ingTotal * 0.30); // Comercio (30%)
    var n3Kwh = Math.round(excTotal * 0.15), n3Eur = Math.round(ingTotal * 0.15); // Colegio (15%)
    var n4Kwh = Math.round(excTotal * 0.20), n4Eur = Math.round(ingTotal * 0.20); // PYME / Taller (20%)
    var n5Kwh = Math.max(0, excTotal - n1Kwh - n2Kwh - n3Kwh - n4Kwh);            // Comunidad Vecinos (10%)
    var n5Eur = Math.max(0, ingTotal - n1Eur - n2Eur - n3Eur - n4Eur);
    var pCelStr = (typeof cel.precioCEL === 'number' ? cel.precioCEL.toFixed(2).replace('.', ',') : '0,11');

    // SVG Mapa Técnico-Comercial Clean-Tech de Cobertura 5.000 metros (78,5 km² según RDL 7/2026)
    // Proporción métrica real (1 km = 25px, 2,5 km = 62,5px, 5 km = 125px) + Tarjetas de Liquidación Horaria βh sin colisiones
    var radarSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 390" width="100%" height="100%" style="display:block;">' +
      '<defs>' +
        '<radialGradient id="celRadarGlowClean" cx="50%" cy="50%" r="50%">' +
          '<stop offset="0%" stop-color="' + pal.primary + '" stop-opacity="0.18"/>' +
          '<stop offset="55%" stop-color="' + pal.accent + '" stop-opacity="0.08"/>' +
          '<stop offset="100%" stop-color="#f8fafc" stop-opacity="0.0"/>' +
        '</radialGradient>' +
        '<linearGradient id="celHeaderBar" x1="0%" y1="0%" x2="100%" y2="0%">' +
          '<stop offset="0%" stop-color="#0f172a"/>' +
          '<stop offset="100%" stop-color="#1e293b"/>' +
        '</linearGradient>' +
        '<filter id="celCardShadow" x="-8%" y="-8%" width="116%" height="120%">' +
          '<feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.07"/>' +
        '</filter>' +
      '</defs>' +

      // Fondo Clean-Tech luminoso apto para pantalla e impresión ejecutiva
      '<rect x="0" y="0" width="680" height="390" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>' +

      // Cabecera integrada sin colisiones
      '<path d="M 0 10 Q 0 0 10 0 L 670 0 Q 680 0 680 10 L 680 34 L 0 34 Z" fill="url(#celHeaderBar)"/>' +
      '<circle cx="16" cy="17" r="4.5" fill="#10b981"/>' +
      '<text x="27" y="21" fill="#f8fafc" font-size="9.5" font-weight="900" letter-spacing="0.4">REPARTO LOCAL P2P · TELEMEDIDA HORARIA βh (ORDEN TED/1247/2021)</text>' +
      '<rect x="478" y="6" width="192" height="22" rx="4" fill="rgba(16,185,129,0.18)" stroke="#10b981" stroke-width="1"/>' +
      '<text x="574" y="20.5" fill="#6ee7b7" font-size="9" font-weight="900" text-anchor="middle" letter-spacing="0.3">RADIO LEGAL 5.000 m (78,5 km²)</text>' +

      // Ejes cartesianos y retícula topográfica sutil
      '<line x1="340" y1="40" x2="340" y2="338" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>' +
      '<line x1="185" y1="186" x2="495" y2="186" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3,3"/>' +

      // Anillos concéntricos con escala métrica verdadera (25px = 1 km)
      // Anillo 5.000 m (r = 125)
      '<circle cx="340" cy="186" r="125" fill="url(#celRadarGlowClean)" stroke="' + pal.primary + '" stroke-width="2" stroke-dasharray="6,4"/>' +
      // Anillo 2.500 m (r = 62.5)
      '<circle cx="340" cy="186" r="62.5" fill="none" stroke="#64748b" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.65"/>' +
      // Anillo 1.000 m (r = 25)
      '<circle cx="340" cy="186" r="25" fill="none" stroke="#64748b" stroke-width="1.1" opacity="0.5"/>' +

      // Etiquetas de anillos radiales (con pastilla de lectura limpia)
      '<rect x="344" y="152" width="52" height="13" rx="3" fill="#ffffff" opacity="0.88"/>' +
      '<text x="347" y="161" fill="#475569" font-size="8" font-weight="800" font-family="monospace">1,0 km</text>' +
      '<rect x="344" y="115" width="52" height="13" rx="3" fill="#ffffff" opacity="0.88"/>' +
      '<text x="347" y="124" fill="#475569" font-size="8" font-weight="800" font-family="monospace">2,5 km</text>' +
      '<rect x="292" y="53" width="96" height="15" rx="4" fill="' + pal.light + '" stroke="' + pal.primary + '" stroke-width="1"/>' +
      '<text x="340" y="63.5" fill="' + pal.dark + '" font-size="8.5" font-weight="900" font-family="monospace" text-anchor="middle">PERÍMETRO 5,0 km</text>' +

      //Vectores de despacho energético desde el Hub Central (340, 186) hasta la posición real en escala de cada consumidor
      // 1. Viviendas (1,2 km -> r=30px, Noroeste: 318, 165) -> Conector a tarjeta Izquierda-Arriba
      '<polyline points="340,186 318,165 202,92" fill="none" stroke="#0284c7" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 2. Comercio (2,1 km -> r=52.5px, Noreste: 383, 156) -> Conector a tarjeta Derecha-Arriba
      '<polyline points="340,186 383,156 478,92" fill="none" stroke="#d97706" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 3. Colegio (3,8 km -> r=95px, Sureste: 424, 230) -> Conector a tarjeta Derecha-Abajo
      '<polyline points="340,186 424,230 478,244" fill="none" stroke="#7c3aed" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 4. PYME / Taller (4,4 km -> r=110px, Suroeste: 242, 236) -> Conector a tarjeta Izquierda-Abajo
      '<polyline points="340,186 242,236 202,244" fill="none" stroke="#059669" stroke-width="1.8" stroke-dasharray="3,2"/>' +
      // 5. Comunidad Vecinos (4,9 km -> r=122.5px, Sur: 340, 308.5) -> Conector a tarjeta Sur
      '<line x1="340" y1="186" x2="340" y2="308.5" stroke="#db2777" stroke-width="1.8" stroke-dasharray="3,2"/>' +

      // Puntos geográficos exactos dentro del radar
      '<circle cx="318" cy="165" r="6" fill="#0284c7" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="383" cy="156" r="6" fill="#d97706" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="424" cy="230" r="6" fill="#7c3aed" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="242" cy="236" r="6" fill="#059669" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="340" cy="308.5" r="6" fill="#db2777" stroke="#ffffff" stroke-width="2"/>' +

      // ── TARJETA NODO 1: VIVIENDAS (1,2 km · Noroeste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="14" y="58" width="188" height="64" rx="7" fill="#ffffff" stroke="#bae6fd" stroke-width="1.5"/>' +
        '<rect x="14" y="58" width="5" height="64" rx="2.5" fill="#0284c7"/>' +
        '<text x="26" y="74" fill="#0f172a" font-size="10.5" font-weight="900">Viviendas Residenciales</text>' +
        '<rect x="150" y="63" width="44" height="14" rx="3" fill="#e0f2fe"/>' +
        '<text x="172" y="73" fill="#0369a1" font-size="8.5" font-weight="900" text-anchor="middle">1,2 km</text>' +
        '<text x="26" y="88" fill="#475569" font-size="8.5" font-weight="700">βh = 0,25 · Demanda Tarde / Fin Sem.</text>' +
        '<text x="26" y="103" fill="#0369a1" font-size="9.5" font-weight="900">' + n1Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n1Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="26" y="115" fill="#64748b" font-size="7.8" font-weight="600">Climatización, ACS y electrodomésticos</text>' +
      '</g>' +

      // ── TARJETA NODO 2: COMERCIO LOCAL (2,1 km · Noreste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="478" y="58" width="188" height="64" rx="7" fill="#ffffff" stroke="#fde68a" stroke-width="1.5"/>' +
        '<rect x="478" y="58" width="5" height="64" rx="2.5" fill="#d97706"/>' +
        '<text x="490" y="74" fill="#0f172a" font-size="10.5" font-weight="900">Comercio y Hostelería</text>' +
        '<rect x="614" y="63" width="44" height="14" rx="3" fill="#fef3c7"/>' +
        '<text x="636" y="73" fill="#b45309" font-size="8.5" font-weight="900" text-anchor="middle">2,1 km</text>' +
        '<text x="490" y="88" fill="#475569" font-size="8.5" font-weight="700">βh = 0,30 · Curva Plana 09h–21h</text>' +
        '<text x="490" y="103" fill="#b45309" font-size="9.5" font-weight="900">' + n2Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n2Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="490" y="115" fill="#64748b" font-size="7.8" font-weight="600">Cámaras frigoríficas y climatización</text>' +
      '</g>' +

      // ── TARJETA NODO 3: COLEGIO / EQUIPAMIENTO (3,8 km · Sureste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="478" y="210" width="188" height="64" rx="7" fill="#ffffff" stroke="#ddd6fe" stroke-width="1.5"/>' +
        '<rect x="478" y="210" width="5" height="64" rx="2.5" fill="#7c3aed"/>' +
        '<text x="490" y="226" fill="#0f172a" font-size="10.5" font-weight="900">Colegio / Centro Público</text>' +
        '<rect x="614" y="215" width="44" height="14" rx="3" fill="#ede9fe"/>' +
        '<text x="636" y="225" fill="#6d28d9" font-size="8.5" font-weight="900" text-anchor="middle">3,8 km</text>' +
        '<text x="490" y="240" fill="#475569" font-size="8.5" font-weight="700">βh = 0,15 · Punta Matinal 08h–16h</text>' +
        '<text x="490" y="255" fill="#6d28d9" font-size="9.5" font-weight="900">' + n3Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n3Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="490" y="267" fill="#64748b" font-size="7.8" font-weight="600">Sincronía 100% con cenit solar diurno</text>' +
      '</g>' +

      // ── TARJETA NODO 4: PYME / TALLER (4,4 km · Suroeste) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="14" y="210" width="188" height="64" rx="7" fill="#ffffff" stroke="#a7f3d0" stroke-width="1.5"/>' +
        '<rect x="14" y="210" width="5" height="64" rx="2.5" fill="#059669"/>' +
        '<text x="26" y="226" fill="#0f172a" font-size="10.5" font-weight="900">PYME / Taller Industrial</text>' +
        '<rect x="150" y="215" width="44" height="14" rx="3" fill="#d1fae5"/>' +
        '<text x="172" y="225" fill="#047857" font-size="8.5" font-weight="900" text-anchor="middle">4,4 km</text>' +
        '<text x="26" y="240" fill="#475569" font-size="8.5" font-weight="700">βh = 0,20 · Jornada Intensiva L–V</text>' +
        '<text x="26" y="255" fill="#047857" font-size="9.5" font-weight="900">' + n4Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n4Eur.toLocaleString('es-ES') + ' €/año</text>' +
        '<text x="26" y="267" fill="#64748b" font-size="7.8" font-weight="600">Maquinaria, compresores y recarga VE</text>' +
      '</g>' +

      // ── TARJETA NODO 5: COMUNIDAD DE VECINOS (4,9 km · Sur) ──
      '<g filter="url(#celCardShadow)">' +
        '<rect x="354" y="286" width="196" height="50" rx="7" fill="#ffffff" stroke="#fbcfe8" stroke-width="1.5"/>' +
        '<rect x="354" y="286" width="5" height="50" rx="2.5" fill="#db2777"/>' +
        '<text x="366" y="301" fill="#0f172a" font-size="10" font-weight="900">Comunidad Vecinal (4,9 km)</text>' +
        '<text x="366" y="314" fill="#475569" font-size="8.2" font-weight="700">βh = 0,10 · Ascensores, garaje y bombeo</text>' +
        '<text x="366" y="328" fill="#be185d" font-size="9.2" font-weight="900">' + n5Kwh.toLocaleString('es-ES') + ' kWh/año → +' + n5Eur.toLocaleString('es-ES') + ' €/año</text>' +
      '</g>' +

      // ── NÚCLEO CENTRAL: TU HUB GENERADOR ──
      '<circle cx="340" cy="186" r="22" fill="' + pal.primary + '" opacity="0.22"/>' +
      '<circle cx="340" cy="186" r="13" fill="#ffffff" stroke="' + pal.primary + '" stroke-width="3.5"/>' +
      '<circle cx="340" cy="186" r="5.5" fill="' + pal.dark + '"/>' +
      '<g filter="url(#celCardShadow)">' +
        '<rect x="268" y="198" width="144" height="32" rx="6" fill="#0f172a" stroke="' + pal.primary + '" stroke-width="1.5"/>' +
        '<text x="340" y="211" fill="#ffffff" font-size="9.5" font-weight="900" text-anchor="middle" letter-spacing="0.4">TU HUB GENERADOR</text>' +
        '<text x="340" y="223" fill="#34d399" font-size="8.5" font-weight="800" text-anchor="middle">Excedente: ' + excTotal.toLocaleString('es-ES') + ' kWh/a</text>' +
      '</g>' +

      // ── BARRA INFERIOR DE LIQUIDACIÓN ECONÓMICA (EL CIERRE DE VENTAS) ──
      '<rect x="10" y="344" width="660" height="38" rx="7" fill="#0f172a"/>' +
      '<text x="24" y="360" fill="#94a3b8" font-size="8.5" font-weight="700">LIQUIDACIÓN ANUAL DE EXCEDENTES (' + excTotal.toLocaleString('es-ES') + ' kWh):</text>' +
      '<text x="24" y="374" fill="#cbd5e1" font-size="9.5" font-weight="700">Pool Mayorista (0,05 €/kWh): <tspan fill="#f87171" font-weight="900">' + cel.ingresoPoolAnual.toLocaleString('es-ES') + ' €/año</tspan>   vs.   Venta Directa CEL (' + pCelStr + ' €/kWh): <tspan fill="#34d399" font-weight="900">+' + ingTotal.toLocaleString('es-ES') + ' €/año</tspan></text>' +
      '<rect x="492" y="351" width="168" height="24" rx="5" fill="#059669"/>' +
      '<text x="576" y="366.5" fill="#ffffff" font-size="9.5" font-weight="900" text-anchor="middle">BENEFICIO EXTRA: +' + cel.beneficioExtraCEL.toLocaleString('es-ES') + ' €/AÑO</text>' +
    '</svg>'

    // HOJA 1 CEL: MODELO ECONÓMICO Y HOMOLOGACIÓN
    var page1Html = '<div class="page-sheet" data-section-id="cel">' +
      '<div>' +
        (typeof buildInnerHeaderFn === 'function'
          ? buildInnerHeaderFn('COMUNIDAD ENERGÉTICA LOCAL &amp; <span style="color:' + pal.primary + '">HUB DE EXCEDENTES</span>', 'Marco Regulatorio Real Decreto-ley 7/2026 · Radio de Cobertura hasta 5.000 metros (78,5 km²)', pageNum)
          : ('<div class="cover-header">' +
              '<div class="company-text">' +
                '<div class="name">COMUNIDAD ENERGÉTICA LOCAL &amp; <span style="color:' + pal.primary + '">HUB DE EXCEDENTES</span></div>' +
                '<div class="sub">Marco Regulatorio Real Decreto-ley 7/2026 · Radio de Cobertura hasta 5.000 metros (78,5 km²)</div>' +
              '</div>' +
              '<div class="doc-ref-box"><b>Ref: ' + (d.refNum || 'PROY') + '</b><br>Hoja ' + pageNum + ' de ' + totPages + '</div>' +
            '</div>')) +

        '<!-- 4 HEROS MONUMENTALES DE COMUNIDAD ENERGÉTICA -->' +
        '<div class="hero-grid" style="grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 26px 0 36px;">' +
          '<div class="hero-card" style="border-top: 3px solid #f59e0b; background: #fffbeb;">' +
            '<div class="hero-lbl" style="color: #b45309;">Excedente Solar Anual</div>' +
            '<div class="hero-val" style="color: #b45309; font-size: 20px;">' + cel.excKWh.toLocaleString('es-ES') + ' kWh</div>' +
            '<div style="font-size: 9px; color: #92400e; margin-top: 4px;">' + cel.excPct + '% de tu producción total</div>' +
          '</div>' +
          '<div class="hero-card highlight" style="border-top: 3px solid ' + pal.primary + '; background: linear-gradient(135deg, ' + pal.light + ', #ffffff);">' +
            '<div class="hero-lbl" style="color: ' + pal.dark + ';">Valorización CEL (' + (typeof cel.precioCEL === 'number' ? cel.precioCEL.toFixed(2).replace('.', ',') : '0,11') + ' €/kWh)</div>' +
            '<div class="hero-val primary" style="font-size: 21px;">+' + cel.ingresoCELAnual.toLocaleString('es-ES') + ' €/año</div>' +
            '<div style="font-size: 9px; color: ' + pal.dark + '; margin-top: 4px; font-weight: 700;">+' + cel.beneficioExtraCEL.toLocaleString('es-ES') + ' € más que vertiendo a red</div>' +
          '</div>' +
          '<div class="hero-card" style="border-top: 3px solid #0284c7; background: #f0f9ff;">' +
            '<div class="hero-lbl" style="color: #0369a1;">Payback Acelerado</div>' +
            '<div class="hero-val" style="color: #0284c7; font-size: 20px;">' + cel.paybackCEL.toFixed(1) + ' Años</div>' +
            '<div style="font-size: 9px; color: #0284c7; margin-top: 4px; font-weight: 700;">-' + cel.reduccionPaybackAnios.toFixed(1) + ' años de amortización</div>' +
          '</div>' +
          '<div class="hero-card" style="border-top: 3px solid #10b981; background: #f0fdf4;">' +
            '<div class="hero-lbl" style="color: #047857;">Impacto en el Barrio</div>' +
            '<div class="hero-val" style="color: #10b981; font-size: 20px;">~' + cel.familiasBeneficiadas + ' Familias</div>' +
            '<div style="font-size: 9px; color: #065f46; margin-top: 4px;">abastecidas con energía km 0</div>' +
          '</div>' +
        '</div>' +

        '<!-- CARA A CARA: RED CONVENCIONAL VS COMUNIDAD ENERGÉTICA LOCAL -->' +
        '<div style="display: grid; grid-template-columns: 1fr 1.15fr; gap: 18px; margin-bottom: 36px;">' +
          '<div class="tech-card cel-card" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; background: #f8fafc; display: flex; flex-direction: column; justify-content: space-between; position: relative;">' +
            '<div>' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                '<span style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">RÉGIMEN TRADICIONAL (RD 244/2019)</span>' +
                '<span style="font-size: 8px; background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 4px; font-weight: 700;">RED GENERAL</span>' +
              '</div>' +
              '<div style="font-size: 12px; font-weight: 900; color: #1e293b;">Compensación Simplificada en Factura</div>' +
              '<div style="font-size: 19px; font-weight: 900; color: #64748b; margin: 3px 0;">0,05 €/kWh <span style="font-size: 9.5px; font-weight: 600; color: #94a3b8;">(precio medio pool)</span></div>' +
              '<div style="font-size: 9.5px; color: #475569; line-height: 1.35; margin-top: 3px;">' +
                'Ingreso anual estimado: <b>~' + cel.ingresoPoolAnual.toLocaleString('es-ES') + ' €/año</b>.' +
              '</div>' +
            '</div>' +
            '<div style="margin-top: 6px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 5px; padding: 6px 8px; font-size: 8.5px; color: #991b1b; line-height: 1.3;">' +
              _mSvg('alert', 12, '#dc2626', 'margin-right:4px;') + '<b>Tope Legal Mensual a 0 €:</b> Todo kWh vertido por encima del importe de energía de tu factura se regala obligatoriamente a la eléctrica sin retribución alguna.' +
            '</div>' +
          '</div>' +

          '<div class="tech-card cel-card" style="border: 2px solid ' + pal.primary + '; border-radius: 8px; padding: 16px 18px; background: #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.06); display: flex; flex-direction: column; justify-content: space-between; position: relative;">' +
            '<div style="position: absolute; top: -9px; right: 12px; background: ' + pal.primary + '; color: #fff; font-size: 8px; font-weight: 900; padding: 2px 8px; border-radius: 8px; letter-spacing: 0.5px;">¡+120% MÁS RENTABLE!</div>' +
            '<div>' +
              '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">' +
                '<span style="font-size: 8.5px; font-weight: 800; color: ' + pal.dark + '; text-transform: uppercase;">MARCO REGULATORIO RDL 7/2026</span>' +
                '<span style="font-size: 8px; background: ' + pal.light + '; color: ' + pal.dark + '; padding: 2px 6px; border-radius: 4px; font-weight: 800;">RADIO HASTA 5 KM</span>' +
              '</div>' +
              '<div style="font-size: 12px; font-weight: 900; color: #0f172a;">Comunidad Energética Local (CEL) P2P</div>' +
              '<div style="font-size: 20px; font-weight: 900; color: ' + pal.primary + '; margin: 3px 0;">' + (typeof cel.precioCEL === 'number' ? cel.precioCEL.toFixed(2).replace('.', ',') : '0,11') + ' €/kWh <span style="font-size: 9.5px; font-weight: 700; color: ' + pal.dark + ';">precio local justo acordado</span></div>' +
              '<div style="font-size: 9.5px; color: #334155; line-height: 1.35; margin-top: 3px;">' +
                'Ingreso anual estimado: <b style="color:' + pal.primary + ';font-size:10.5px;">+' + cel.ingresoCELAnual.toLocaleString('es-ES') + ' €/año</b> (<b style="color:#059669;">+' + cel.beneficioExtraCEL.toLocaleString('es-ES') + ' €/año netos extra</b>).' +
              '</div>' +
            '</div>' +
            '<div style="margin-top: 6px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 5px; padding: 6px 8px; font-size: 8.5px; color: #166534; line-height: 1.3;">' +
              _mSvg('checkCircle', 12, '#16a34a', 'margin-right:4px;') + '<b>Sin Límite de Factura:</b> Liquidación íntegra hora a hora mediante coeficientes de reparto dinámicos βh (Orden TED/1247/2021). Tus vecinos ahorran un 35% y tú duplicas ingresos.' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- SELLO DE HOMOLOGACIÓN CEL-READY -->' +
        '<div class="tech-card cel-card" style="border: 1.5px solid #10b981; border-radius: 8px; padding: 16px 18px; background: linear-gradient(135deg, #f0fdf4, #ffffff); display: flex; align-items: center; justify-content: space-between; gap: 14px; box-shadow: 0 2px 6px rgba(16,185,129,0.06); margin-top: 24px; position: relative;">' +
          '<div style="display: flex; align-items: center; gap: 10px;">' +
            '<span style="display:inline-flex;color:#059669;">' + _mSvg('shield', 24, '#059669') + '</span>' +
            '<div>' +
              '<div style="font-size: 11px; font-weight: 900; color: #065f46; letter-spacing: 0.3px;">DISEÑO DE INGENIERÍA 100% HOMOLOGADO CEL-READY</div>' +
              '<div style="font-size: 8.5px; color: #047857; margin-top: 2px; line-height: 1.35;">' +
                'La instalación incorpora <b>telemedida horaria bidireccional</b> homologada y soporte de coeficientes dinámicos <b>βh (Orden TED/1247/2021)</b>. No requiere obras de tendido vecinal ni cableado exterior: la energía se comparte a través de la red de distribución existente según el <b>Real Decreto-ley 7/2026</b>.' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align: right; white-space: nowrap;">' +
            '<span style="font-size: 9px; font-weight: 900; color: #065f46; background: #d1fae5; padding: 3px 8px; border-radius: 5px; border: 1px solid #10b981; display: inline-block;">COMPATIBLE RDL 7/2026</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- PIE DE HOJA CEL 1 -->' +
      '<div class="cover-footer">' +
        '<span>Marco legal: RDL 7/2026 (BOE) · Orden TED/1247/2021 · RD 244/2019 · REBT ITC-BT-40</span>' +
        '<span>' + _escCel(companyName) + ' · Ref: ' + _escCel(d.refNum || 'PROY') + '</span>' +
      '</div>' +
    '</div>';

    // HOJA 2 CEL: FLUJO DE DESPACHO ENERGÉTICO Y RADAR DE COBERTURA 5 KM (ESPACIOSO)
    var page2Html = '<div class="page-sheet" data-section-id="cel_financials">' +
      '<div>' +
        (typeof buildInnerHeaderFn === 'function'
          ? buildInnerHeaderFn('DISTRIBUCIÓN ENERGÉTICA &amp; <span style="color:' + pal.primary + '">COBERTURA 5 KM</span>', 'Despacho Horario de Generación · Radio de Reparto Vecinal P2P de 78,5 km²', pageNum2)
          : ('<div class="cover-header">' +
              '<div class="company-text">' +
                '<div class="name">DISTRIBUCIÓN ENERGÉTICA &amp; <span style="color:' + pal.primary + '">COBERTURA 5 KM</span></div>' +
                '<div class="sub">Despacho Horario de Generación · Radio de Reparto Vecinal P2P de 78,5 km²</div>' +
              '</div>' +
              '<div class="doc-ref-box"><b>Ref: ' + (d.refNum || 'PROY') + '</b><br>Hoja ' + pageNum2 + ' de ' + totPages + '</div>' +
            '</div>')) +

        '<!-- 1. DESPACHO DEL FLUJO ENERGÉTICO EN GRAN FORMATO -->' +
        '<div class="tech-card cel-card cel-flow-card" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; background: #f8fafc; margin: 4px 0 ' + celCardsGap + 'px; position: relative;">' +
          '<div style="font-size: 11px; font-weight: 900; color: #1e293b; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">' +
            '<div style="display: flex; align-items: center; gap: 6px;"><span style="display:inline-flex;color:' + pal.primary + ';">' + _mSvg('bolt', 14, pal.primary) + '</span><span>1. Despacho del Flujo Energético Generado</span></div>' +
            '<span style="font-size: 8.5px; font-weight: 800; color: ' + pal.primary + '; background: ' + pal.light + '; padding: 2px 7px; border-radius: 4px;">Balance 100% Optimizado</span>' +
          '</div>' +

          '<div style="width: 100%; height: ' + flowH + 'px; border-radius: 6px; overflow: hidden; display: flex; margin-bottom: 8px; border: 1.5px solid #cbd5e1; box-shadow: inset 0 2px 4px rgba(0,0,0,0.08);">' +
            '<div style="width:' + autoW + '%; background: linear-gradient(135deg, #059669, #10b981); color: #fff; font-size: ' + flowSize + 'pt; font-weight: 900; display: flex; align-items: center; justify-content: center; padding: 0 4px; white-space: nowrap;">' +
              cel.autoPct + '% Autoconsumo' +
            '</div>' +
            (cel.batPct > 0 ? (
              '<div style="width:' + batW + '%; background: linear-gradient(135deg, #0284c7, #38bdf8); color: #fff; font-size: ' + flowSize + 'pt; font-weight: 900; display: flex; align-items: center; justify-content: center; padding: 0 4px; white-space: nowrap;">' +
                cel.batPct + '% Batería' +
              '</div>'
            ) : '') +
            '<div style="width:' + excW + '%; background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; font-size: ' + flowSize + 'pt; font-weight: 900; display: flex; align-items: center; justify-content: center; padding: 0 4px; white-space: nowrap;">' +
              cel.excPct + '% Inyección CEL (5 km)' +
            '</div>' +
          '</div>' +

          '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: ' + celCardsGap + 'px; font-size: ' + flowDescSize + 'pt; line-height: 1.35;">' +
            '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
              '<span style="color: #059669; font-weight: 900; font-size: 11px;">■</span>' +
              '<div><b>Autoconsumo Inmueble (' + cel.autoKWh.toLocaleString('es-ES') + ' kWh/año):</b> Cubre consumos instantáneos diurnos a coste 0 €. Máxima prioridad operativa.</div>' +
            '</div>' +
            (cel.batKWh > 0 ? (
              '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
                '<span style="color: #0284c7; font-weight: 900; font-size: 11px;">■</span>' +
                '<div><b>Batería LFP (' + cel.batKWh.toLocaleString('es-ES') + ' kWh/año):</b> Reserva energética gestionada para consumos nocturnos o picos tarifarios.</div>' +
              '</div>'
            ) : '') +
            '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
              '<span style="color: #d97706; font-weight: 900; font-size: 11px;">■</span>' +
              '<div><b>Inyección CEL (' + cel.excKWh.toLocaleString('es-ES') + ' kWh/año):</b> Compartida con el vecindario a <b>' + cel.precioCEL.toFixed(2) + ' €/kWh</b>.</div>' +
            '</div>' +
            '<div style="display: flex; align-items: flex-start; gap: 6px; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">' +
              '<span style="color: #64748b; font-weight: 900; font-size: 11px;">■</span>' +
              '<div><b>Respaldo de Red Eléctrica:</b> Suministro ininterrumpido 24 horas y balance de seguridad permanente ante contingencias.</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- 2. RADAR DE COBERTURA 5 KM EN GRAN FORMATO -->' +
        '<div class="tech-card chart-box cel-card cel-radar-card" style="border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.04); position: relative;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
            '<div style="font-size: 11.5px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.2px;">2. Radar de Cobertura y Topología de Reparto (5 km)</div>' +
            '<span style="font-size: 8.5px; font-weight: 800; color: ' + pal.primary + '; background: ' + pal.light + '; padding: 2px 8px; border-radius: 5px;">RDL 7/2026 · 78,5 km² de Cobertura</span>' +
          '</div>' +
          '<div class="cel-radar-inner" style="width: 100%; height: ' + radarH + 'px; min-height: 280px; border-radius: 10px; overflow: hidden; background: #f8fafc; box-shadow: 0 2px 10px rgba(15,23,42,0.06);">' +
            radarSvg +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 9px; color: #64748b; line-height: 1.35; gap: 12px;">' +
            '<span style="flex: 1;">Topología de reparto P2P homologada para consumidores residenciales, comerciales e industriales en baja y media tensión.</span>' +
            '<span style="font-weight: 800; color: ' + pal.primary + '; white-space: nowrap; background: ' + pal.light + '; padding: 2px 7px; border-radius: 4px;">Telemedida horaria activa</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- PIE DE HOJA CEL 2 -->' +
      '<div class="cover-footer">' +
        '<span>Marco legal: RDL 7/2026 (BOE) · Orden TED/1247/2021 · RD 244/2019 · REBT ITC-BT-40</span>' +
        '<span>' + _escCel(companyName) + ' · Ref: ' + _escCel(d.refNum || 'PROY') + '</span>' +
      '</div>' +
    '</div>';

    return page1Html + page2Html;
  }

  window.buildInfografiasHTML = buildInfografiasHTML;
  window.calculateCELMetrics = calculateCELMetrics;
  window.buildCELPageHTML = buildCELPageHTML;
  window.RAProposalInfographics = Object.freeze({
    buildInfografiasHTML: buildInfografiasHTML,
    calculateCELMetrics: calculateCELMetrics,
    buildCELPageHTML: buildCELPageHTML
  });
})(typeof window !== "undefined" ? window : globalThis);
