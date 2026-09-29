// Test dirty state and shading logic
const assert = require('assert');

// Mock window and DOM
global.window = {};
global.document = {
  getElementById: (id) => {
    return {
      id,
      style: {},
      innerHTML: '',
      textContent: '',
      parentElement: null
    };
  },
  querySelector: () => null
};
global.showStatus = () => {};

// Load solar-heatmap logic
require('../js/solar-heatmap.js');

// 1. Initial State
assert.strictEqual(typeof window.markSimulationDirty, 'function');
console.log('Test 1: markSimulationDirty is exported -> OK');

// Before simulation has run
window.solarSimState = { hasRun: false, isDirty: false };
window.markSimulationDirty('panel_deleted');
assert.strictEqual(window.solarSimState.isDirty, false, 'Should remain false if sim has not run');
console.log('Test 2: Before simulation has run, isDirty remains false -> OK');

// After simulation has run
window.solarSimState.hasRun = true;
window.solarSimState.isDirty = false;
window.solarSimState.avgShadingLossPct = 12.5;

window.markSimulationDirty('panel_deleted');
assert.strictEqual(window.solarSimState.isDirty, true, 'Should become true after sim has run');
console.log('Test 3: After simulation has run, markSimulationDirty sets isDirty = true -> OK');

console.log('ALL TESTS PASSED SUCCESSFULLY!');
