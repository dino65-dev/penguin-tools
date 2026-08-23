'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  captureWaylandDisplay,
  cropCaptureToDisplay,
  getWaylandCaptureCandidates,
} = require('../src/linux-capture');

const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

test('does not offer native Wayland backends on X11', () => {
  assert.deepEqual(
    getWaylandCaptureCandidates({ XDG_SESSION_TYPE: 'x11' }, display, '/tmp/capture.png'),
    [],
  );
});

test('prefers both Cinnamon screenshot services before any portal-style fallback', () => {
  const output = '/tmp/capture.png';
  const candidates = getWaylandCaptureCandidates({
    XDG_SESSION_TYPE: 'wayland',
    XDG_CURRENT_DESKTOP: 'X-Cinnamon',
  }, display, output);

  assert.deepEqual(candidates.slice(0, 3).map((item) => item.name), [
    'cinnamon-dbus',
    'gnome-shell-dbus',
    'gnome-screenshot',
  ]);
  assert.deepEqual(candidates[0].args.slice(-7), [
    '0', '0', '1920', '1080', 'false', output, 'false',
  ]);
  assert.equal(candidates[1].args.at(-1), output);
});

test('prefers Spectacle on Plasma and grim on wlroots compositors', () => {
  const plasma = getWaylandCaptureCandidates({
    XDG_SESSION_TYPE: 'wayland',
    XDG_CURRENT_DESKTOP: 'KDE',
  }, display, '/tmp/a.png');
  const sway = getWaylandCaptureCandidates({
    XDG_SESSION_TYPE: 'wayland',
    XDG_CURRENT_DESKTOP: 'sway',
  }, display, '/tmp/b.png');

  assert.equal(plasma[0].name, 'spectacle');
  assert.deepEqual(plasma[0].args, [
    '--background', '--nonotify', '--current', '--output', '/tmp/a.png',
  ]);
  assert.equal(sway[0].name, 'grim');
});

test('crops a whole virtual desktop capture to the requested monitor', () => {
  let crop;
  const image = {
    getSize: () => ({ width: 3840, height: 1080 }),
    crop: (rect) => {
      crop = rect;
      return { cropped: true };
    },
  };
  const second = {
    id: 2,
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  };

  const result = cropCaptureToDisplay(image, second, [display, second], false);
  assert.deepEqual(crop, { x: 1920, y: 0, width: 1920, height: 1080 });
  assert.deepEqual(result, { cropped: true });
});

test('uses the next native backend and removes the temporary capture file', async () => {
  const tempFile = path.join(os.tmpdir(), `penguin-tools-test-${process.pid}-${Date.now()}.png`);
  const calls = [];
  const fakeImage = {
    isEmpty: () => false,
    getSize: () => ({ width: 1920, height: 1080 }),
    crop: () => {
      throw new Error('An exact display capture must not be cropped');
    },
  };

  const result = await captureWaylandDisplay({
    display,
    displays: [display],
    env: { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'Cinnamon' },
    platform: 'linux',
    tempFile,
    nativeImage: { createFromBuffer: () => fakeImage },
    runCommand: async (command) => {
      calls.push(command);
      if (calls.length === 1) throw new Error('new Cinnamon API unavailable');
      await fs.promises.writeFile(tempFile, Buffer.from('fake png'));
    },
  });

  assert.equal(result.backend, 'gnome-shell-dbus');
  assert.equal(result.image, fakeImage);
  assert.deepEqual(calls, ['gdbus', 'gdbus']);
  assert.equal(fs.existsSync(tempFile), false);
});
