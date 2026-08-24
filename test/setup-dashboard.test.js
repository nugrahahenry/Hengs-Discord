const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DASHBOARD_ACTION_IDS,
  buildDashboardComponents,
  buildDisableConfirmationComponents,
  resolveDashboardAction,
} = require('../src/guilds/setup-dashboard');

function ids(rows) {
  return rows.flatMap(row => row.toJSON().components.map(component => component.custom_id));
}

test('dashboard exposes only fixed pending and public actions', () => {
  assert.deepEqual(ids(buildDashboardComponents('pending')), [
    DASHBOARD_ACTION_IDS.start,
    DASHBOARD_ACTION_IDS.refresh,
  ]);
  assert.deepEqual(ids(buildDashboardComponents('public')), [
    DASHBOARD_ACTION_IDS.refresh,
    DASHBOARD_ACTION_IDS.repair,
    DASHBOARD_ACTION_IDS.preview,
    DASHBOARD_ACTION_IDS.insights,
    DASHBOARD_ACTION_IDS.disable,
  ]);
  assert.deepEqual(buildDashboardComponents('home'), []);
  assert.deepEqual(buildDashboardComponents('denied'), []);
});

test('disable confirmation has one destructive action and one cancel action', () => {
  const rows = buildDisableConfirmationComponents();
  const components = rows[0].toJSON().components;
  assert.deepEqual(components.map(component => component.custom_id), [
    DASHBOARD_ACTION_IDS.confirmDisable,
    DASHBOARD_ACTION_IDS.cancelDisable,
  ]);
  assert.equal(components[0].style, 4);
  assert.equal(components[1].style, 2);
});

test('dashboard action resolver accepts only exact button IDs', () => {
  assert.equal(resolveDashboardAction({
    customId: DASHBOARD_ACTION_IDS.refresh,
    isButton: () => true,
  }), 'refresh');
  assert.equal(resolveDashboardAction({
    customId: 'hengs-setup:dashboard:refresh:forged',
    isButton: () => true,
  }), null);
  assert.equal(resolveDashboardAction({
    customId: DASHBOARD_ACTION_IDS.refresh,
    isButton: () => false,
  }), null);
});
