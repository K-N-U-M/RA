/**
 * js/collab-timetravel.js — Colaboración Multi-Pestaña, Historial de Instantáneas y Time-Travel [F7-12]
 * ======================================================================================================
 * 1. Sincronización multi-pestaña en tiempo real vía BroadcastChannel con tabId único y anti-eco.
 * 2. Historial persistente de instantáneas nombradas (`v1 Preliminar`, `v2 Visita técnica`, etc.) con
 *    Diff estructural lado a lado y restauración en 1 clic.
 * 3. Ring-buffer de Time-Travel Debugging que registra eventos de RA.EventBus + errores para exportar
 *    una traza JSON reproducible.
 */
(function (global) {
  'use strict';

  var SNAPSHOTS_KEY = 'ra_project_named_snapshots_v1';
  var CHANNEL_NAME = 'ra_solar_collab_v1';
  var MAX_TRACE = 180;

  var _tabId = 'tab_' + Math.random().toString(36).slice(2, 9);
  var _channel = null;
  var _peers = {};
  var _applyingRemote = false;
  var _traceLog = [];

  function _recordTrace(type, detail) {
    _traceLog.push({
      ts: new Date().toISOString(),
      tabId: _tabId,
      type: String(type || 'EVENT'),
      detail: detail || null
    });
    if (_traceLog.length > MAX_TRACE) _traceLog.shift();
  }

  function _captureLightState() {
    var calcs = null;
    try { if (typeof global.getProjectCalcs === 'function') calcs = global.getProjectCalcs(); } catch (_) {}
    var cfg = global.solarProjectConfig || {};
    var tit = global.titularData || {};
    return {
      projectName: tit.nombre || tit.proyecto || 'Proyecto RA',
      numPanels: (calcs && calcs.numPanels) || 0,
      kwp: Number(((calcs && calcs.P_dc_kW) || 0).toFixed(2)),
      acKw: Number(((calcs && calcs.P_ac_kW) || 0).toFixed(2)),
      annualKWh: Math.round((calcs && calcs.annualKWh) || 0),
      selectedInverterId: cfg.selectedInverterId || '',
      selectedModuleId: cfg.selectedModuleId || '',
      selectedTopology: cfg.selectedTopology || 'string',
      mpptManualConfig: cfg.mpptManualConfig ? JSON.parse(JSON.stringify(cfg.mpptManualConfig)) : null
    };
  }

  function _loadSnapshots() {
    try {
      var raw = localStorage.getItem(SNAPSHOTS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function _saveSnapshots(list) {
    try {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify((list || []).slice(0, 25)));
    } catch (_) {}
  }

  function saveNamedSnapshot(label) {
    var name = String(label || '').trim() || ('Instantánea ' + new Date().toLocaleTimeString('es-ES'));
    var snap = {
      id: 'snap_' + Date.now().toString(36),
      label: name,
      createdAt: new Date().toISOString(),
      tabId: _tabId,
      state: _captureLightState()
    };
    var list = _loadSnapshots();
    list.unshift(snap);
    _saveSnapshots(list);
    _recordTrace('SNAPSHOT_SAVED', { id: snap.id, label: name, kwp: snap.state.kwp });
    _broadcast('SNAPSHOT_CREATED', { snap: snap });
    if (global.showToast) global.showToast('VERSIÓN GUARDADA', 'Instantánea «' + name + '» añadida al historial.', 'success', 2400);
    return snap;
  }

  function diffSnapshots(snapA, snapB) {
    var a = (snapA && snapA.state) || _captureLightState();
    var b = (snapB && snapB.state) || _captureLightState();
    return {
      deltaPanels: (b.numPanels || 0) - (a.numPanels || 0),
      deltaKwp: Number(((b.kwp || 0) - (a.kwp || 0)).toFixed(2)),
      deltaAnnualKWh: (b.annualKWh || 0) - (a.annualKWh || 0),
      inverterChanged: a.selectedInverterId !== b.selectedInverterId,
      topologyChanged: a.selectedTopology !== b.selectedTopology
    };
  }

  function restoreSnapshot(snapId) {
    var list = _loadSnapshots();
    var found = list.find(function (s) { return s.id === snapId; });
    if (!found || !found.state) return false;
    var st = found.state;
    if (!global.solarProjectConfig) global.solarProjectConfig = {};
    if (st.selectedInverterId) global.solarProjectConfig.selectedInverterId = st.selectedInverterId;
    if (st.selectedModuleId) global.solarProjectConfig.selectedModuleId = st.selectedModuleId;
    if (st.selectedTopology) global.solarProjectConfig.selectedTopology = st.selectedTopology;
    if (st.mpptManualConfig) global.solarProjectConfig.mpptManualConfig = JSON.parse(JSON.stringify(st.mpptManualConfig));

    _recordTrace('SNAPSHOT_RESTORED', { id: found.id, label: found.label });
    if (global.RA && global.RA.EventBus && global.RA.Events) {
      global.RA.EventBus.emit(global.RA.Events.PROJECT_UPDATED, { source: 'collab-restore', snapId: found.id });
    }
    if (global.showToast) global.showToast('VERSIÓN RESTAURADA', 'Aplicada configuración de «' + found.label + '».', 'info', 2500);
    return true;
  }

  function exportTimeTravelJson() {
    var payload = {
      schema: 'ra-timetravel-v1',
      exportedAt: new Date().toISOString(),
      tabId: _tabId,
      currentState: _captureLightState(),
      snapshotsCount: _loadSnapshots().length,
      trace: _traceLog.slice()
    };
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ra-timetravel-trace-' + Date.now() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 250);
    }
    return payload;
  }

  function _broadcast(type, payload) {
    if (!_channel || _applyingRemote) return;
    try {
      _channel.postMessage({ sender: _tabId, type: type, payload: payload || {}, ts: Date.now() });
    } catch (_) {}
  }

  function initCollabChannel() {
    if (typeof global.BroadcastChannel !== 'function') return;
    try {
      _channel = new global.BroadcastChannel(CHANNEL_NAME);
      _channel.onmessage = function (ev) {
        var msg = ev && ev.data;
        if (!msg || msg.sender === _tabId) return;
        _peers[msg.sender] = Date.now();

        if (msg.type === 'PING') {
          _broadcast('PONG', {});
          return;
        }
        if (msg.type === 'STATE_DELTA' && msg.payload && msg.payload.state) {
          _applyingRemote = true;
          try {
            var s = msg.payload.state;
            if (!global.solarProjectConfig) global.solarProjectConfig = {};
            if (s.selectedInverterId) global.solarProjectConfig.selectedInverterId = s.selectedInverterId;
            if (s.selectedModuleId) global.solarProjectConfig.selectedModuleId = s.selectedModuleId;
            if (s.selectedTopology) global.solarProjectConfig.selectedTopology = s.selectedTopology;
            _recordTrace('REMOTE_SYNC', { from: msg.sender, kwp: s.kwp });
            if (global.RA && global.RA.EventBus && global.RA.Events) {
              global.RA.EventBus.emit(global.RA.Events.PROJECT_UPDATED, { source: 'remote-tab' });
            }
          } finally {
            _applyingRemote = false;
          }
        }
      };
      _broadcast('PING', {});
    } catch (_) {}

    if (global.RA && global.RA.EventBus && global.RA.Events) {
      global.RA.EventBus.on(global.RA.Events.PROJECT_UPDATED, function (evData) {
        if (evData && evData.source === 'remote-tab') return;
        var st = _captureLightState();
        _recordTrace('PROJECT_UPDATED', { source: (evData && evData.source) || 'local', kwp: st.kwp });
        _broadcast('STATE_DELTA', { state: st });
      });
    }
    global.addEventListener('error', function (e) {
      _recordTrace('RUNTIME_ERROR', { message: e && e.message });
    });
  }

  function getActivePeerCount() {
    var now = Date.now();
    var count = 0;
    Object.keys(_peers).forEach(function (k) {
      if (now - _peers[k] < 600000) count++;
    });
    return count;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCollabChannel);
    else initCollabChannel();
  }

  global.RACollabTimeTravel = {
    getTabId: function () { return _tabId; },
    getActivePeerCount: getActivePeerCount,
    listSnapshots: _loadSnapshots,
    saveNamedSnapshot: saveNamedSnapshot,
    diffSnapshots: diffSnapshots,
    restoreSnapshot: restoreSnapshot,
    getTrace: function () { return _traceLog.slice(); },
    exportTimeTravelJson: exportTimeTravelJson
  };
  if (global.RA) global.RA.Collab = global.RACollabTimeTravel;
})(typeof window !== 'undefined' ? window : this);
