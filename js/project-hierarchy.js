/**
 * ============================================================================
 * 🌳 PROJECT HIERARCHY — RA SOLAR 3D (BIM SCENE GRAPH)
 * Arquitectura de Jerarquía BIM Estricta:
 * Proyecto
 *  ├─ 🏢 Edificios 3D
 *  │   ├─ 🏠 Cubiertas / Planos de Trabajo asociados
 *  │   │   └─ ✏️ Faldones FV
 *  │   │       └─ ☀️ Módulos FV (Metrado en vivo: panelsCount, kWp)
 *  │   └─ 📦 Obstáculos en Cubierta
 *  ├─ 🏠 Planos de Cubierta Independientes
 *  │   └─ ✏️ Faldones FV
 *  ├─ 📐 Faldones Autónomos
 *  └─ 📦 Obstáculos en Terreno / Globales
 * ============================================================================
 */

(function(global) {
  'use strict';

  const listeners = [];

  const ProjectHierarchy = {
    subscribe: function(cb) {
      if (typeof cb === 'function' && !listeners.includes(cb)) {
        listeners.push(cb);
      }
    },

    unsubscribe: function(cb) {
      const idx = listeners.indexOf(cb);
      if (idx !== -1) listeners.splice(idx, 1);
    },

    notify: function(event, data) {
      listeners.forEach(function(fn) {
        try { fn(event, data); } catch(err) { console.error('[ProjectHierarchy.notify]', err); }
      });
    },

    getTree: function() {
      const wp = global.WP || { planes: [], polylines: [], activePlaneIdx: -1, selectedPolyIdx: -1 };
      const buildings = Array.isArray(global.buildings) ? global.buildings : [];
      const obstacles = Array.isArray(global.obstacles) ? global.obstacles : [];
      const planes = Array.isArray(wp.planes) ? wp.planes : [];
      const polylines = Array.isArray(wp.polylines) ? wp.polylines : [];
      const renderedPanels = Array.isArray(global.allRenderedPanels) ? global.allRenderedPanels : [];

              function getPolylineStats(poly, polyIdx) {
          let pCount = 0;
          if (renderedPanels.length > 0) {
            pCount = renderedPanels.filter(function(p) {
              if (!p || p.deleted) return false;
              if (typeof p.polyIdx === 'number') return p.polyIdx === polyIdx;
              if (typeof p.faldonIndex === 'number') return p.faldonIndex === polyIdx;
              if (p.rawPanel && typeof p.rawPanel.polyIdx === 'number') return p.rawPanel.polyIdx === polyIdx;
              return polylines.length <= 1;
            }).length;
          }
          if (pCount === 0) {
            if (poly && Array.isArray(poly.panels) && poly.panels.length > 0) {
              pCount = poly.panels.filter(function(p) { return p && !p.deleted; }).length;
            } else if (poly && poly.roofInfo && Array.isArray(poly.roofInfo.panels) && poly.roofInfo.panels.length > 0) {
              pCount = poly.roofInfo.panels.filter(function(p) { return p && !p.deleted; }).length;
            } else if (poly && typeof poly.panelCount === 'number' && poly.panelCount > 0) {
              pCount = poly.panelCount;
            } else if (typeof global.computeSinglePolylineRoofInfo === 'function' && poly && Array.isArray(poly.points) && poly.points.length >= 3) {
              try {
                const freshInfo = global.computeSinglePolylineRoofInfo(poly.points, poly);
                if (freshInfo && Array.isArray(freshInfo.panels)) {
                  poly.roofInfo = freshInfo;
                  pCount = freshInfo.panels.filter(function(p) { return p && !p.deleted; }).length;
                }
              } catch(eRec) {}
            }
          }
          let modW = (poly && poly.moduleConfig && (poly.moduleConfig.wp || poly.moduleConfig.potencia));
          if (!modW && poly && poly.moduleId && global.equipmentCatalog && Array.isArray(global.equipmentCatalog.modules)) {
            const polyMod = global.equipmentCatalog.modules.find(function(m) { return m.id === poly.moduleId; });
            if (polyMod && (polyMod.wp || polyMod.potencia)) modW = polyMod.wp || polyMod.potencia;
          }
          if (!modW && global.solarProjectConfig && global.solarProjectConfig.selectedModule && (global.solarProjectConfig.selectedModule.wp || global.solarProjectConfig.selectedModule.potencia)) {
            modW = global.solarProjectConfig.selectedModule.wp || global.solarProjectConfig.selectedModule.potencia;
          }
          if (!modW && global.solarProjectConfig && global.solarProjectConfig.selectedModuleId && global.equipmentCatalog) {
            const mod = (typeof global.equipmentCatalog.getModule === 'function')
              ? global.equipmentCatalog.getModule(global.solarProjectConfig.selectedModuleId)
              : (Array.isArray(global.equipmentCatalog.modules)
                  ? global.equipmentCatalog.modules.find(function(m) { return m.id === global.solarProjectConfig.selectedModuleId; })
                  : null);
            if (mod && (mod.wp || mod.potencia)) modW = mod.wp || mod.potencia;
          }
          if (!modW && global.panelConfig && (global.panelConfig.wp || global.panelConfig.potencia)) {
            modW = global.panelConfig.wp || global.panelConfig.potencia;
          }
          if (!modW) modW = 450;
  
          const kwp = (pCount * modW) / 1000.0;
          const area = (poly && poly.area) || (poly && poly.roofInfo && poly.roofInfo.area3D) || 0;
          return { panelsCount: pCount, kwp: kwp, areaM2: area, modW: modW };
        }

      const assignedPlaneIndices = new Set();
      const assignedPolyIndices = new Set();
      const assignedObsIndices = new Set();

      // 1. Mapear Edificios 3D con sus Cubiertas, Faldones y Obstáculos hijos
      const bldNodes = buildings.map(function(bld, bIdx) {
        const bNode = {
          id: bld.id || ('bld_' + bIdx),
          index: bIdx,
          name: bld.name || ('Edificio #' + (bIdx + 1)),
          height: bld.height || 6.0,
          numFloors: bld.numFloors || 2,
          roofType: bld.roofType || 'flat',
          roofPitch: bld.roofPitch !== undefined ? bld.roofPitch : 25,
          roofAzimuth: bld.roofAzimuth !== undefined ? bld.roofAzimuth : 180,
          isSelected: global.selectedBuildingId === bld.id,
          visible: bld.visible !== false,
          planes: [],
          obstacles: [],
          panelsCount: 0,
          totalKwp: 0.0,
          totalAreaM2: 0.0
        };

        // Planos asociados a este edificio
        planes.forEach(function(pl, pIdx) {
          const isPlaneOfBld = (pl.buildingId === bld.id) || (pl.id && (pl.id.startsWith('plane_roof_' + bld.id) || pl.id.includes(bld.id)));
          if (isPlaneOfBld) {
            assignedPlaneIndices.add(pIdx);
            const pNode = {
              id: pl.id || ('plane_' + pIdx),
              index: pIdx,
              buildingId: bld.id,
              name: pl.name || ('Cubierta ' + bld.name),
              tiltDeg: typeof pl.tiltDeg === 'number' ? Math.round(pl.tiltDeg) : (typeof pl.pitch === 'number' ? Math.round(pl.pitch) : 0),
              azimuthDeg: typeof pl.azimuthDeg === 'number' ? Math.round(pl.azimuthDeg) : (typeof pl.azimuth === 'number' ? Math.round(pl.azimuth) : 180),
              isActive: pIdx === wp.activePlaneIdx,
              visible: pl.visible !== false,
              polylines: [],
              panelsCount: 0,
              totalKwp: 0.0
            };

            // Faldones de este plano o del edificio
            polylines.forEach(function(poly, polyIdx) {
              if (poly && (poly.planeIdx === pIdx || poly.buildingId === bld.id)) {
                assignedPolyIndices.add(polyIdx);
                const stats = getPolylineStats(poly, polyIdx);
                pNode.panelsCount += stats.panelsCount;
                pNode.totalKwp += stats.kwp;
                bNode.panelsCount += stats.panelsCount;
                bNode.totalKwp += stats.kwp;
                bNode.totalAreaM2 += stats.areaM2;

                pNode.polylines.push({
                  id: poly.id || ('poly_' + polyIdx),
                  index: polyIdx,
                  planeIdx: pIdx,
                  buildingId: bld.id,
                  name: poly.name || ('Faldón #' + (polyIdx + 1)),
                  areaM2: stats.areaM2,
                  panelsCount: stats.panelsCount,
                  kwp: stats.kwp,
                  isSelected: polyIdx === wp.selectedPolyIdx,
                  visible: poly.visible !== false,
                  panelsVisible: poly.panelsVisible !== false
                });
              }
            });

            bNode.planes.push(pNode);
          }
        });

        // Obstáculos situados en la cubierta de este edificio
        obstacles.forEach(function(o, oIdx) {
          if (o && (o.buildingId === bld.id || (o.planeId && o.planeId.includes(bld.id)))) {
            assignedObsIndices.add(oIdx);
            bNode.obstacles.push({
              id: o.id || ('obs_' + oIdx),
              index: oIdx,
              buildingId: bld.id,
              type: o.type || 'caseton',
              name: o.name || (o.type ? (o.type.toUpperCase() + ' #' + (oIdx + 1)) : ('Obstáculo #' + (oIdx + 1))),
              w: o.w || 1.0,
              l: o.l || 1.0,
              h: o.h || 1.5,
              rot: o.rot || 0,
              visible: o.visible !== false,
              isSelected: global.selectedObstacleId === o.id
            });
          }
        });

        return bNode;
      });

      // 2. Mapear Planos Independientes (planos en fotogrametría sin edificio 3D)
      const indepPlanes = [];
      planes.forEach(function(pl, pIdx) {
        if (!assignedPlaneIndices.has(pIdx)) {
          const pNode = {
            id: pl.id || ('plane_' + pIdx),
            index: pIdx,
            name: pl.name || ('Plano #' + (pIdx + 1)),
            tiltDeg: typeof pl.tiltDeg === 'number' ? Math.round(pl.tiltDeg) : (typeof pl.pitch === 'number' ? Math.round(pl.pitch) : 0),
            azimuthDeg: typeof pl.azimuthDeg === 'number' ? Math.round(pl.azimuthDeg) : (typeof pl.azimuth === 'number' ? Math.round(pl.azimuth) : 180),
            isActive: pIdx === wp.activePlaneIdx,
            visible: pl.visible !== false,
            polylines: [],
            panelsCount: 0,
            totalKwp: 0.0
          };

          polylines.forEach(function(poly, polyIdx) {
            if (poly && poly.planeIdx === pIdx) {
              assignedPolyIndices.add(polyIdx);
              const stats = getPolylineStats(poly, polyIdx);
              pNode.panelsCount += stats.panelsCount;
              pNode.totalKwp += stats.kwp;

              pNode.polylines.push({
                id: poly.id || ('poly_' + polyIdx),
                index: polyIdx,
                planeIdx: pIdx,
                name: poly.name || ('Faldón #' + (polyIdx + 1)),
                areaM2: stats.areaM2,
                panelsCount: stats.panelsCount,
                kwp: stats.kwp,
                isSelected: polyIdx === wp.selectedPolyIdx,
                visible: poly.visible !== false,
                panelsVisible: poly.panelsVisible !== false
              });
            }
          });

          indepPlanes.push(pNode);
        }
      });

      // 3. Mapear Faldones Autónomos (polilíneas sin plano formal asignado)
      const standalonePolylines = [];
      polylines.forEach(function(poly, polyIdx) {
        if (!assignedPolyIndices.has(polyIdx)) {
          const stats = getPolylineStats(poly, polyIdx);
          standalonePolylines.push({
            id: poly.id || ('poly_' + polyIdx),
            index: polyIdx,
            planeIdx: poly.planeIdx !== undefined ? poly.planeIdx : -1,
            name: poly.name || ('Faldón #' + (polyIdx + 1)),
            areaM2: stats.areaM2,
            panelsCount: stats.panelsCount,
            kwp: stats.kwp,
            isSelected: polyIdx === wp.selectedPolyIdx,
            visible: poly.visible !== false,
            panelsVisible: poly.panelsVisible !== false
          });
        }
      });

      // 4. Mapear Obstáculos en Terreno / Globales (sin edificio asignado)
      const globalObstacles = [];
      obstacles.forEach(function(o, oIdx) {
        if (!assignedObsIndices.has(oIdx)) {
          globalObstacles.push({
            id: o.id || ('obs_' + oIdx),
            index: oIdx,
            type: o.type || 'caseton',
            name: o.name || (o.type ? (o.type.toUpperCase() + ' #' + (oIdx + 1)) : ('Obstáculo #' + (oIdx + 1))),
            w: o.w || 1.0,
            l: o.l || 1.0,
            h: o.h || 1.5,
            rot: o.rot || 0,
            visible: o.visible !== false,
            isSelected: global.selectedObstacleId === o.id
          });
        }
      });

      // 4.5 Mapear Equipos Eléctricos y Cuadros (Paso 4)
      const electricalEquipment = [];
      const elecState = global.inverterEquipmentState;
      if (elecState) {
        // 1. Inversor / Cuadro Central Híbrido
        if (elecState.position && elecState.entity) {
          const invObj = (typeof global.getSelectedElectricalObject === 'function' && global.selectedElectricalId === 'inverter')
            ? global.getSelectedElectricalObject() : null;
          const invName = (invObj && invObj.name) || 'Cuadro Eléctrico & Inversor Híbrido';
          electricalEquipment.push({
            id: 'inverter',
            type: 'inverter',
            name: invName,
            icon: '⚡',
            position: elecState.position,
            visible: elecState.entity.show !== false,
            isSelected: global.selectedElectricalId === 'inverter'
          });
        }
        // 2. Cuadro de Protección DC (SPD II)
        if (elecState.dcProtectionPosition && elecState.dcProtectionEntity) {
          const cat = global.equipmentCatalog || global.DEFAULT_EQUIPMENT_CATALOG;
          const cfg = global.solarProjectConfig || {};
          const dcPanel = (cat && cat.electricalPanels) ? (cat.electricalPanels.find(p => p.id === cfg.selectedProtectionDcId) || cat.electricalPanels[1]) : null;
          const dcModelName = dcPanel ? (dcPanel.brand + ' ' + dcPanel.model) : 'Cuadro Protección DC 1000V SPD II';
          electricalEquipment.push({
            id: 'dc_protection',
            type: 'dc_protection',
            name: dcModelName,
            icon: '🛡️',
            position: elecState.dcProtectionPosition,
            visible: elecState.dcProtectionEntity.show !== false,
            isSelected: global.selectedElectricalId === 'dc_protection'
          });
        }
        // 2b. Sistema de Almacenamiento / Batería LFP
        if (elecState.batteryPosition && elecState.batteryEntity) {
          const cat = global.equipmentCatalog || global.DEFAULT_EQUIPMENT_CATALOG;
          const cfg = global.solarProjectConfig || {};
          const batItem = (cat && cat.batteries && cfg.selectedBatteryId) ? cat.batteries.find(b => b.id === cfg.selectedBatteryId) : null;
          const batName = batItem ? (batItem.brand + ' ' + batItem.model) : 'Sistema de Baterías LFP';
          electricalEquipment.push({
            id: 'battery',
            type: 'battery',
            name: batName,
            icon: '🔋',
            position: elecState.batteryPosition,
            visible: elecState.batteryEntity.show !== false,
            isSelected: global.selectedElectricalId === 'battery'
          });
        }
        // 3. Combiner Box (si está habilitada)
        if (elecState.combinerBox && elecState.combinerBox.position && elecState.combinerBox.isEnabled) {
          electricalEquipment.push({
            id: 'combiner',
            type: 'combiner',
            name: 'Caja de Conexión DC / Combiner Box',
            icon: '📦',
            position: elecState.combinerBox.position,
            visible: elecState.combinerBox.entity ? (elecState.combinerBox.entity.show !== false) : true,
            isSelected: global.selectedElectricalId === 'combiner'
          });
        }
        // 4. Contador de Red & Cuadro General AC
        if (elecState.gridMeter && elecState.gridMeter.position) {
          electricalEquipment.push({
            id: 'meter',
            type: 'meter',
            name: 'Contador de Red & Cuadro General AC',
            icon: '🔌',
            position: elecState.gridMeter.position,
            visible: elecState.gridMeter.entity ? (elecState.gridMeter.entity.show !== false) : true,
            isSelected: global.selectedElectricalId === 'meter'
          });
        }
        // 5. Tiradas de Cable Medidas (DC & AC)
        if (elecState.L_dc_measured > 0 || elecState.L_ac_measured > 0) {
          const lDc = (elecState.L_dc_measured || 0).toFixed(1);
          const lAc = (elecState.L_ac_measured || 0).toFixed(1);
          electricalEquipment.push({
            id: 'cables_run',
            type: 'cables_run',
            name: `Cableado: DC ${lDc}m · AC ${lAc}m`,
            icon: '📏',
            position: elecState.position || (elecState.gridMeter ? elecState.gridMeter.position : null),
            visible: true,
            isSelected: false,
            isCableMetric: true,
            L_dc: elecState.L_dc_measured || 0,
            L_ac: elecState.L_ac_measured || 0
          });
        }
      }

      // 5. Metrado Total de Proyecto
      let totalPanels = 0, totalKwp = 0.0, totalArea = 0.0;
      bldNodes.forEach(function(b) {
        totalPanels += b.panelsCount;
        totalKwp += b.totalKwp;
        totalArea += b.totalAreaM2;
      });
      indepPlanes.forEach(function(p) {
        totalPanels += p.panelsCount;
        totalKwp += p.totalKwp;
        p.polylines.forEach(function(pl) { totalArea += pl.areaM2; });
      });
      standalonePolylines.forEach(function(pl) {
        totalPanels += pl.panelsCount;
        totalKwp += pl.kwp;
        totalArea += pl.areaM2;
      });

      return {
        id: 'project_root',
        name: (global.solarProjectConfig && global.solarProjectConfig.projectName) || 'Proyecto Fotovoltaico',
        buildings: bldNodes,
        planes: indepPlanes,
        standalonePolylines: standalonePolylines,
        obstacles: globalObstacles,
        electrical: electricalEquipment,
        totals: {
          buildingsCount: buildings.length,
          planesCount: planes.length,
          polylinesCount: polylines.length,
          obstaclesCount: obstacles.length,
          electricalCount: electricalEquipment.length,
          panelsCount: totalPanels,
          totalKwp: totalKwp,
          totalAreaM2: totalArea
        }
      };
    },

    selectElectrical: function(elecId, shouldFly) {
      if (!elecId) return;
      const s = global.inverterEquipmentState;
      if (s) {
        let ent = null;
        if (elecId === 'inverter') ent = s.entity;
        else if (elecId === 'dc_protection') ent = s.dcProtectionEntity;
        else if (elecId === 'battery') ent = s.batteryEntity;
        else if (elecId === 'combiner' && s.combinerBox) ent = s.combinerBox.entity;
        else if (elecId === 'meter' && s.gridMeter) ent = s.gridMeter.entity;
        if (ent && ent.show === false) {
          if (typeof global.showToast === 'function') global.showToast('EQUIPO OCULTO', 'Haz visible el equipo para poder seleccionarlo.', 'warning', 2500);
          return;
        }
      }
      if (typeof global.selectElectricalObject === 'function') {
        global.selectElectricalObject(elecId);
      } else {
        global.selectedElectricalId = elecId;
      }
      if (shouldFly !== false && s && typeof global.viewer !== 'undefined' && global.viewer && typeof Cesium !== 'undefined') {
        let pos = null;
        if (elecId === 'inverter') pos = s.position;
        else if (elecId === 'dc_protection') pos = s.dcProtectionPosition;
        else if (elecId === 'battery') pos = s.batteryPosition;
        else if (elecId === 'combiner' && s.combinerBox) pos = s.combinerBox.position;
        else if (elecId === 'meter' && s.gridMeter) pos = s.gridMeter.position;

        if (pos && typeof pos.x === 'number') {
          try {
            const bs = new Cesium.BoundingSphere(pos, 2.5);
            global.viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.0,
              offset: new Cesium.HeadingPitchRange(global.viewer.camera.heading, Cesium.Math.toRadians(-45.0), bs.radius * 2.2)
            });
          } catch(eCam) { console.warn('[selectElectrical flyTo]', eCam); }
        }
      }
      this.notify('electrical_selected', { id: elecId });
    },

    selectBuilding: function(bldId, shouldFly) {
      if (!bldId) return;
      const bld = Array.isArray(global.buildings) ? global.buildings.find(function(b) { return b.id === bldId; }) : null;
      if (bld && bld.visible === false) {
        if (typeof global.showToast === 'function') global.showToast('EDIFICIO OCULTO', 'Haz visible el edificio para poder seleccionarlo.', 'warning', 2500);
        return;
      }
      if (typeof global.selectBuilding === 'function') {
        global.selectBuilding(bldId);
      } else {
        global.selectedBuildingId = bldId;
      }
      if (shouldFly !== false && typeof global.viewer !== 'undefined' && global.viewer && typeof Cesium !== 'undefined') {
        if (bld && bld.points && bld.points.length > 0) {
          try {
            const bs = Cesium.BoundingSphere.fromPoints(bld.points);
            global.viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.2,
              offset: new Cesium.HeadingPitchRange(global.viewer.camera.heading, Cesium.Math.toRadians(-40.0), bs.radius * 2.8)
            });
          } catch(eCam) { console.warn('[selectBuilding flyTo]', eCam); }
        }
      }
      this.notify('building_selected', { id: bldId });
    },

    selectPlane: function(pIdx, shouldFly) {
      const wp = global.WP;
      if (wp && wp.planes && wp.planes[pIdx] && wp.planes[pIdx].visible === false) {
        if (typeof global.showToast === 'function') global.showToast('PLANO OCULTO', 'Haz visible el plano para poder seleccionarlo.', 'warning', 2500);
        return;
      }
      if (typeof global.wpSelectActivePlane === 'function') {
        global.wpSelectActivePlane(pIdx, shouldFly !== false);
      }
      this.notify('plane_selected', { index: pIdx });
    },

    selectPolyline: function(polyIdx, shouldFly) {
      const wp = global.WP;
      if (!wp || !Array.isArray(wp.polylines) || !wp.polylines[polyIdx]) return;
      const poly = wp.polylines[polyIdx];
      if (poly.visible === false) {
        if (typeof global.showToast === 'function') global.showToast('FALDÓN OCULTO', 'Haz visible el faldón para poder seleccionarlo.', 'warning', 2500);
        return;
      }

      wp.selectedPolyIdx = polyIdx;

      if (typeof poly.planeIdx === 'number' && poly.planeIdx >= 0 && poly.planeIdx !== wp.activePlaneIdx) {
        if (typeof global.wpSelectActivePlane === 'function') {
          global.wpSelectActivePlane(poly.planeIdx, false);
        }
      }

      if (poly.points && poly.points.length >= 3) {
        global.polygonPoints = poly.points.map(function(p) {
          return (typeof Cesium !== 'undefined' && Cesium.Cartesian3 && typeof Cesium.Cartesian3.clone === 'function')
            ? Cesium.Cartesian3.clone(p)
            : Object.assign({}, p);
        });
      }

      if (typeof global.wpRenderAllPolylines === 'function') {
        global.wpRenderAllPolylines();
      }

      if (shouldFly !== false && poly.points && poly.points.length > 0 && typeof global.viewer !== 'undefined' && global.viewer && typeof Cesium !== 'undefined') {
        try {
          const bs = Cesium.BoundingSphere.fromPoints(poly.points);
          global.viewer.camera.flyToBoundingSphere(bs, {
            duration: 1.2,
            offset: new Cesium.HeadingPitchRange(global.viewer.camera.heading, Cesium.Math.toRadians(-40.0), bs.radius * 2.5)
          });
        } catch(eCam) { console.warn('[selectPolyline flyTo]', eCam); }
      }

      this.notify('polyline_selected', { index: polyIdx, poly: poly });
    },

    selectObstacle: function(obsId, shouldFly) {
      if (!obsId) return;
      const o = Array.isArray(global.obstacles) ? global.obstacles.find(function(item) { return item.id === obsId; }) : null;
      if (o && o.visible === false) {
        if (typeof global.showToast === 'function') global.showToast('OBSTÁCULO OCULTO', 'Haz visible el obstáculo para poder seleccionarlo.', 'warning', 2500);
        return;
      }
      if (typeof global.selectObstacle === 'function') {
        global.selectObstacle(obsId);
      } else {
        global.selectedObstacleId = obsId;
      }
      if (shouldFly !== false && o && typeof global.viewer !== 'undefined' && global.viewer && typeof Cesium !== 'undefined') {
        const pos = o.cartesian;
        if (pos && typeof pos.x === 'number') {
          try {
            const rad = Math.max(o.w || 2, o.l || 2, o.h || 2) * 2.5;
            const bs = new Cesium.BoundingSphere(pos, rad);
            global.viewer.camera.flyToBoundingSphere(bs, {
              duration: 1.0,
              offset: new Cesium.HeadingPitchRange(global.viewer.camera.heading, Cesium.Math.toRadians(-45.0), bs.radius * 2.0)
            });
          } catch(eCam) { console.warn('[selectObstacle flyTo]', eCam); }
        }
      }
      this.notify('obstacle_selected', { id: obsId });
    },

    renameItem: function(type, idOrIdx, newName) {
      if (!newName || !newName.trim()) return;
      const cleanName = newName.trim();
      const wp = global.WP;
      if (type === 'building' && Array.isArray(global.buildings)) {
        const bld = (typeof idOrIdx === 'string') ? global.buildings.find(function(b) { return b.id === idOrIdx; }) : global.buildings[idOrIdx];
        if (bld) bld.name = cleanName;
      } else if (type === 'plane' && wp && wp.planes && wp.planes[idOrIdx]) {
        wp.planes[idOrIdx].name = cleanName;
      } else if (type === 'polyline' && wp && wp.polylines && wp.polylines[idOrIdx]) {
        wp.polylines[idOrIdx].name = cleanName;
      } else if (type === 'obstacle' && Array.isArray(global.obstacles)) {
        const o = (typeof idOrIdx === 'string') ? global.obstacles.find(function(item) { return item.id === idOrIdx; }) : global.obstacles[idOrIdx];
        if (o) o.name = cleanName;
      }
      this.notify('item_renamed', { type: type, target: idOrIdx, name: cleanName });
    },

    toggleVisibility: function(type, idOrIdx) {
      const wp = global.WP;
      if (type === 'building' && Array.isArray(global.buildings)) {
        const bld = (typeof idOrIdx === 'string') ? global.buildings.find(function(b) { return b.id === idOrIdx; }) : global.buildings[idOrIdx];
        if (bld) {
          bld.visible = (bld.visible === false) ? true : false;
          if (bld.visible === false && (global.selectedBuildingId === bld.id || (typeof window !== 'undefined' && window.selectedBuildingId === bld.id))) {
            if (typeof global.selectBuilding === 'function') global.selectBuilding(null);
            else if (typeof window !== 'undefined' && typeof window.selectBuilding === 'function') window.selectBuilding(null);
            global.selectedBuildingId = null;
            if (typeof window !== 'undefined') window.selectedBuildingId = null;
          }
          if (typeof global.render3DBuildingsInCesium === 'function') global.render3DBuildingsInCesium();
          if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
          if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
        }
      } else if (type === 'plane' && wp && wp.planes && wp.planes[idOrIdx]) {
        wp.planes[idOrIdx].visible = (wp.planes[idOrIdx].visible === false) ? true : false;
        if (typeof global.wpRenderActivePlaneGizmo === 'function') global.wpRenderActivePlaneGizmo();
        if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
        if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
      } else if (type === 'polyline' && wp && wp.polylines && wp.polylines[idOrIdx]) {
        const isVis = (wp.polylines[idOrIdx].visible === false) ? true : false;
        wp.polylines[idOrIdx].visible = isVis;
        if (!isVis && wp.selectedPolyIdx === idOrIdx) {
          wp.selectedPolyIdx = -1;
          wp.selectedVtxIdx = -1;
          global.polygonPoints = [];
        }
        // [AUD-2026] Ocultar un faldón debe ocultar también sus paneles y primitivas asociadas.
        // Se respeta el estado propio de "paneles" del faldón (poly.panelsVisible) para no
        // resucitar paneles que el usuario había ocultado por separado.
        const polyRef = wp.polylines[idOrIdx];
        const panelsVisible = (polyRef.panelsVisible !== false) && isVis;
        if (Array.isArray(global.simulatedPanelEntities)) {
          global.simulatedPanelEntities.forEach(function(pe) {
            const pIdx = (pe && typeof pe.polyIdx === 'number') ? pe.polyIdx : (pe && pe.pData && typeof pe.pData.polyIdx === 'number' ? pe.pData.polyIdx : null);
            if (pIdx === idOrIdx) pe.show = panelsVisible;
          });
        }
        if (polyRef.panelsPrimitive && typeof polyRef.panelsPrimitive.show !== 'undefined') {
          polyRef.panelsPrimitive.show = panelsVisible;
        }
        if (global._faldonPanelsPrimitives && typeof global._faldonPanelsPrimitives.get === 'function') {
          const fp = global._faldonPanelsPrimitives.get(idOrIdx);
          if (fp) fp.show = panelsVisible;
        }
        if (global._faldonSupportCollections && typeof global._faldonSupportCollections.get === 'function') {
          const sp = global._faldonSupportCollections.get(idOrIdx);
          if (sp) sp.show = panelsVisible;
        }
        if (typeof global.wpRenderAllPolylines === 'function') global.wpRenderAllPolylines();
        if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
        if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
      } else if (type === 'poly_panels' && wp && wp.polylines && wp.polylines[idOrIdx]) {
        const poly = wp.polylines[idOrIdx];
        const isPanelsVis = (poly.panelsVisible === false) ? true : false;
        poly.panelsVisible = isPanelsVis;

        // Si ocultamos las placas de este faldón, deseleccionar cualquier placa seleccionada perteneciente a este faldón
        if (!isPanelsVis) {
          const panelsList = (Array.isArray(global.allRenderedPanels) && global.allRenderedPanels.length > 0)
            ? global.allRenderedPanels
            : ((global.lastRoofInfo && Array.isArray(global.lastRoofInfo.panels)) ? global.lastRoofInfo.panels : []);
          if (Array.isArray(global.selectedPanelIndices) && global.selectedPanelIndices.length > 0) {
            global.selectedPanelIndices = global.selectedPanelIndices.filter(function(pIdx) {
              const p = panelsList[pIdx];
              return !p || p.polyIdx !== idOrIdx;
            });
            if (typeof window !== 'undefined') window.selectedPanelIndices = global.selectedPanelIndices;
          }
          if (typeof global.selectedPanelIndex === 'number' && global.selectedPanelIndex >= 0) {
            const selP = panelsList[global.selectedPanelIndex];
            if (selP && selP.polyIdx === idOrIdx) {
              global.selectedPanelIndex = (Array.isArray(global.selectedPanelIndices) && global.selectedPanelIndices.length > 0)
                ? global.selectedPanelIndices[global.selectedPanelIndices.length - 1]
                : -1;
              if (typeof window !== 'undefined') window.selectedPanelIndex = global.selectedPanelIndex;
            }
          }
          if (typeof global.updatePanelSelectionUI === 'function') global.updatePanelSelectionUI();
        }

        if (Array.isArray(global.simulatedPanelEntities)) {
          global.simulatedPanelEntities.forEach(function(pe) {
            const pIdx = (pe && typeof pe.polyIdx === 'number') ? pe.polyIdx : (pe && pe.pData && typeof pe.pData.polyIdx === 'number' ? pe.pData.polyIdx : null);
            if (pIdx === idOrIdx) pe.show = isPanelsVis;
          });
        }
        if (poly.panelsPrimitive && typeof poly.panelsPrimitive.show !== 'undefined') {
          poly.panelsPrimitive.show = isPanelsVis;
        }
        if (global._faldonPanelsPrimitives && typeof global._faldonPanelsPrimitives.get === 'function') {
          const fp = global._faldonPanelsPrimitives.get(idOrIdx);
          if (fp) fp.show = isPanelsVis;
        }
        if (global._faldonSupportCollections && typeof global._faldonSupportCollections.get === 'function') {
          const sp = global._faldonSupportCollections.get(idOrIdx);
          if (sp) sp.show = isPanelsVis;
        }
        if (typeof global.wpFastRenderSimulatedPanels === 'function') {
          global.wpFastRenderSimulatedPanels();
        }
        if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
        if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
      } else if (type === 'wind_turbine') {
        if (global.RAWindTurbine && typeof global.RAWindTurbine.toggleVisibility === 'function') {
          global.RAWindTurbine.toggleVisibility(idOrIdx);
        } else if (Array.isArray(global.obstacles)) {
          const o = (typeof idOrIdx === 'string') ? global.obstacles.find(function(item) { return item.id === idOrIdx; }) : global.obstacles[idOrIdx];
          if (o) {
            o.visible = (o.visible === false) ? true : false;
            if (o.visible === false && (global.selectedObstacleId === o.id || (typeof window !== 'undefined' && window.selectedObstacleId === o.id))) {
              if (typeof global.selectObstacle === 'function') global.selectObstacle(null);
              else if (typeof window !== 'undefined' && typeof window.selectObstacle === 'function') window.selectObstacle(null);
              global.selectedObstacleId = null;
              if (typeof window !== 'undefined') window.selectedObstacleId = null;
            }
          }
        }
        if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
      } else if (type === 'obstacle' && Array.isArray(global.obstacles)) {
        const o = (typeof idOrIdx === 'string') ? global.obstacles.find(function(item) { return item.id === idOrIdx; }) : global.obstacles[idOrIdx];
        if (o) {
          o.visible = (o.visible === false) ? true : false;
          if (o.visible === false && (global.selectedObstacleId === o.id || (typeof window !== 'undefined' && window.selectedObstacleId === o.id))) {
            if (typeof global.selectObstacle === 'function') global.selectObstacle(null);
            else if (typeof window !== 'undefined' && typeof window.selectObstacle === 'function') window.selectObstacle(null);
            global.selectedObstacleId = null;
            if (typeof window !== 'undefined') window.selectedObstacleId = null;
          }
          if (typeof global.render3DObstaclesInCesium === 'function') global.render3DObstaclesInCesium();
          if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
          if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
        }
      } else if (type === 'electrical') {
        const s = global.inverterEquipmentState;
        if (s) {
          let ent = null;
          if (idOrIdx === 'inverter') ent = s.entity;
          else if (idOrIdx === 'dc_protection') ent = s.dcProtectionEntity;
          else if (idOrIdx === 'battery') ent = s.batteryEntity;
          else if (idOrIdx === 'combiner' && s.combinerBox) ent = s.combinerBox.entity;
          else if (idOrIdx === 'meter' && s.gridMeter) ent = s.gridMeter.entity;
          if (ent) {
            ent.show = (ent.show === false) ? true : false;
            if (ent.show === false && (global.selectedElectricalId === idOrIdx || (typeof window !== 'undefined' && window.selectedElectricalId === idOrIdx))) {
              if (typeof global.selectElectricalObject === 'function') global.selectElectricalObject(null);
              else if (typeof window !== 'undefined' && typeof window.selectElectricalObject === 'function') window.selectElectricalObject(null);
              global.selectedElectricalId = null;
              if (typeof window !== 'undefined') window.selectedElectricalId = null;
            }
            if (typeof global.renderTriad2D === 'function') global.renderTriad2D();
            if (global.viewer && global.viewer.scene && typeof global.viewer.scene.requestRender === 'function') global.viewer.scene.requestRender();
          }
        }
      }
      this.notify('visibility_changed', { type: type, target: idOrIdx });
    },

    deleteItem: function(type, idOrIdx) {
      const wp = global.WP;
      if (type === 'building' && Array.isArray(global.buildings)) {
        const bldId = (typeof idOrIdx === 'string') ? idOrIdx : (global.buildings[idOrIdx] ? global.buildings[idOrIdx].id : null);
        if (bldId) {
          global.selectedBuildingId = bldId;
          if (typeof global.deleteSelectedBuilding === 'function') {
            global.deleteSelectedBuilding();
          }
        }
      } else if (type === 'plane' && wp && wp.planes && wp.planes[idOrIdx]) {
        if (typeof global.wpDeletePlane === 'function') {
          global.wpDeletePlane(idOrIdx);
        } else if (typeof global.wpDeleteActivePlane === 'function') {
          wp.activePlaneIdx = idOrIdx;
          global.wpDeleteActivePlane();
        } else {
          wp.planes.splice(idOrIdx, 1);
          if (wp.activePlaneIdx >= wp.planes.length) wp.activePlaneIdx = wp.planes.length - 1;
        }
      } else if (type === 'polyline' && wp && wp.polylines && wp.polylines[idOrIdx]) {
        if (typeof global.wpDeleteSelectedPolyline === 'function') {
          wp.selectedPolyIdx = idOrIdx;
          global.wpDeleteSelectedPolyline();
        } else {
          wp.polylines.splice(idOrIdx, 1);
          if (wp.selectedPolyIdx >= wp.polylines.length) wp.selectedPolyIdx = wp.polylines.length - 1;
          if (typeof global.wpRenderAllPolylines === 'function') global.wpRenderAllPolylines();
        }
      } else if (type === 'obstacle' && Array.isArray(global.obstacles)) {
        const o = (typeof idOrIdx === 'string') ? global.obstacles.find(function(item) { return item.id === idOrIdx; }) : global.obstacles[idOrIdx];
        if (o) {
          global.selectedObstacleId = o.id;
          if (typeof global.deleteSelectedObstacle === 'function') {
            global.deleteSelectedObstacle();
          }
        }
      } else if (type === 'electrical') {
        if (typeof global.selectElectricalObject === 'function') {
          global.selectElectricalObject(idOrIdx);
        }
        if (typeof global.deleteSelectedElectricalEquipment === 'function') {
          global.deleteSelectedElectricalEquipment();
        }
      }
      this.notify('item_deleted', { type: type, target: idOrIdx });
    },

    selectPanel: function(idx, isMulti) {
      if (typeof global.selectPanel === 'function') {
        global.selectPanel(idx, isMulti);
      }
      this.notify('selection_changed', { type: 'panel', index: idx });
    },

    selectAllPanelsInPolyline: function(polyIdx) {
      if (typeof global.selectAllPanelsInPolyline === 'function') {
        global.selectAllPanelsInPolyline(polyIdx);
      }
      this.notify('selection_changed', { type: 'panels_polyline', polyIdx: polyIdx });
    },

    selectAllPanels: function() {
      if (typeof global.selectAllPanels === 'function') {
        global.selectAllPanels();
      }
      this.notify('selection_changed', { type: 'panels_all' });
    },

    deselectAllPanels: function() {
      if (typeof global.deselectAllPanels === 'function') {
        global.deselectAllPanels();
      } else if (typeof global.selectPanel === 'function') {
        global.selectPanel(-1);
      }
      this.notify('selection_changed', { type: 'panel', index: -1 });
    }
  };

  global.ProjectHierarchy = ProjectHierarchy;

})(typeof window !== 'undefined' ? window : this);

