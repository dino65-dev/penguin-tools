'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PIPEWIRE_FEATURE,
  configureLinuxDisplayBackend,
  getSwitchValue,
  isWaylandSession,
} = require('../src/platform');

function appSpy() {
  const switches = [];
  return {
    switches,
    commandLine: {
      appendSwitch(name, value) {
        switches.push([name, value]);
      },
    },
  };
}

test('detects Wayland from either standard session variable', () => {
  assert.equal(isWaylandSession({ XDG_SESSION_TYPE: 'wayland' }), true);
  assert.equal(isWaylandSession({ WAYLAND_DISPLAY: 'wayland-0' }), true);
  assert.equal(isWaylandSession({ XDG_SESSION_TYPE: 'x11' }), false);
});

test('reads inline and separated Chromium switches', () => {
  assert.equal(getSwitchValue(['app', '--ozone-platform=x11'], 'ozone-platform'), 'x11');
  assert.equal(getSwitchValue(['app', '--ozone-platform', 'wayland'], 'ozone-platform'), 'wayland');
});

test('forces XWayland and keeps PipeWire capture in a Wayland session', () => {
  const app = appSpy();
  const result = configureLinuxDisplayBackend(app, {
    platform: 'linux',
    env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' },
    argv: ['electron', '.'],
  });

  assert.deepEqual(result, {
    wayland: true,
    forcedXwayland: true,
    pipeWireEnabled: true,
    backend: 'xwayland',
  });
  assert.deepEqual(app.switches, [
    ['ozone-platform', 'x11'],
    ['enable-features', PIPEWIRE_FEATURE],
  ]);
});

test('preserves existing Chromium features when enabling PipeWire', () => {
  const app = appSpy();
  configureLinuxDisplayBackend(app, {
    platform: 'linux',
    env: { XDG_SESSION_TYPE: 'wayland' },
    argv: ['app', '--enable-features=ExistingFeature'],
  });

  assert.deepEqual(app.switches, [
    ['ozone-platform', 'x11'],
    ['enable-features', `ExistingFeature,${PIPEWIRE_FEATURE}`],
  ]);
});

test('respects an explicit native Wayland opt-in', () => {
  const app = appSpy();
  const result = configureLinuxDisplayBackend(app, {
    platform: 'linux',
    env: {
      XDG_SESSION_TYPE: 'wayland',
      WAYLAND_DISPLAY: 'wayland-0',
      PENGUIN_TOOLS_NATIVE_WAYLAND: '1',
    },
    argv: ['app'],
  });

  assert.equal(result.forcedXwayland, false);
  assert.equal(result.backend, 'wayland');
  assert.deepEqual(app.switches, [['enable-features', PIPEWIRE_FEATURE]]);
});

test('does not change the display backend on X11', () => {
  const app = appSpy();
  const result = configureLinuxDisplayBackend(app, {
    platform: 'linux',
    env: { XDG_SESSION_TYPE: 'x11' },
    argv: ['app'],
  });

  assert.equal(result.wayland, false);
  assert.equal(result.backend, 'x11');
  assert.deepEqual(app.switches, []);
});
