'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { isWaylandSession } = require('./platform');

const CAPTURE_COMMAND_TIMEOUT_MS = 12000;
const CAPTURE_FILE_WAIT_MS = 1600;

function desktopName(env = process.env) {
  return [env.XDG_CURRENT_DESKTOP, env.XDG_SESSION_DESKTOP]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(':')
    .toLowerCase();
}

function makeTempPath() {
  const token = Math.random().toString(36).slice(2);
  return path.join(os.tmpdir(), `penguin-tools-capture-${process.pid}-${Date.now()}-${token}.png`);
}

function gdbusCinnamonArea(display, output) {
  const { x, y, width, height } = display.bounds;
  return {
    name: 'cinnamon-dbus',
    command: 'gdbus',
    args: [
      'call',
      '--session',
      '--dest', 'org.cinnamon.Screenshot',
      '--object-path', '/org/cinnamon/Screenshot',
      '--method', 'org.cinnamon.Screenshot.ScreenshotArea',
      String(Math.round(x)),
      String(Math.round(y)),
      String(Math.round(width)),
      String(Math.round(height)),
      'false',
      output,
      'false',
    ],
    exactDisplay: true,
  };
}

function gdbusGnomeArea(display, output) {
  const { x, y, width, height } = display.bounds;
  return {
    name: 'gnome-shell-dbus',
    command: 'gdbus',
    args: [
      'call',
      '--session',
      '--dest', 'org.gnome.Shell.Screenshot',
      '--object-path', '/org/gnome/Shell/Screenshot',
      '--method', 'org.gnome.Shell.Screenshot.ScreenshotArea',
      String(Math.round(x)),
      String(Math.round(y)),
      String(Math.round(width)),
      String(Math.round(height)),
      'false',
      output,
    ],
    exactDisplay: true,
  };
}

function spectacleCurrentDisplay(output) {
  return {
    name: 'spectacle',
    command: 'spectacle',
    args: ['--background', '--nonotify', '--current', '--output', output],
    exactDisplay: true,
  };
}

function grimDesktop(output) {
  return {
    name: 'grim',
    command: 'grim',
    args: [output],
    exactDisplay: false,
  };
}

function gnomeScreenshotDesktop(output) {
  return {
    name: 'gnome-screenshot',
    command: 'gnome-screenshot',
    args: ['--file', output],
    exactDisplay: false,
  };
}

function uniqueCandidates(candidates) {
  const names = new Set();
  return candidates.filter((candidate) => {
    if (names.has(candidate.name)) return false;
    names.add(candidate.name);
    return true;
  });
}

function getWaylandCaptureCandidates(env, display, output) {
  if (!isWaylandSession(env)) return [];

  const desktop = desktopName(env);
  const cinnamon = gdbusCinnamonArea(display, output);
  const gnome = gdbusGnomeArea(display, output);
  const spectacle = spectacleCurrentDisplay(output);
  const grim = grimDesktop(output);
  const gnomeScreenshot = gnomeScreenshotDesktop(output);
  const preferred = [];

  if (desktop.includes('cinnamon')) preferred.push(cinnamon, gnome, gnomeScreenshot);
  else if (desktop.includes('gnome') || desktop.includes('unity')) preferred.push(gnome, gnomeScreenshot);
  else if (desktop.includes('kde') || desktop.includes('plasma')) preferred.push(spectacle);
  else if (/(hyprland|sway|wlroots|river|wayfire)/.test(desktop)) preferred.push(grim);

  return uniqueCandidates([
    ...preferred,
    cinnamon,
    gnome,
    spectacle,
    grim,
    gnomeScreenshot,
  ]);
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      timeout: CAPTURE_COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function readCaptureFile(filePath, fileSystem = fs.promises) {
  const deadline = Date.now() + CAPTURE_FILE_WAIT_MS;
  do {
    try {
      const data = await fileSystem.readFile(filePath);
      if (data.length > 0) return data;
    } catch {
      // Native screenshot tools may return just before their file is fully visible.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return null;
}

function displayUnion(displays) {
  const left = Math.min(...displays.map((item) => item.bounds.x));
  const top = Math.min(...displays.map((item) => item.bounds.y));
  const right = Math.max(...displays.map((item) => item.bounds.x + item.bounds.width));
  const bottom = Math.max(...displays.map((item) => item.bounds.y + item.bounds.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function cropCaptureToDisplay(image, display, displays, exactDisplay = false) {
  if (exactDisplay || !Array.isArray(displays) || displays.length < 2) return image;

  const size = image.getSize();
  const expectedWidth = Math.round(display.bounds.width * (display.scaleFactor || 1));
  const expectedHeight = Math.round(display.bounds.height * (display.scaleFactor || 1));
  if (Math.abs(size.width - expectedWidth) <= 3 && Math.abs(size.height - expectedHeight) <= 3) {
    return image;
  }

  const union = displayUnion(displays);
  if (union.width <= 0 || union.height <= 0) return image;
  const scaleX = size.width / union.width;
  const scaleY = size.height / union.height;
  const x = Math.max(0, Math.round((display.bounds.x - union.x) * scaleX));
  const y = Math.max(0, Math.round((display.bounds.y - union.y) * scaleY));
  const width = Math.min(size.width - x, Math.max(1, Math.round(display.bounds.width * scaleX)));
  const height = Math.min(size.height - y, Math.max(1, Math.round(display.bounds.height * scaleY)));
  if (width <= 0 || height <= 0) return image;
  return image.crop({ x, y, width, height });
}

async function captureWaylandDisplay(options) {
  const {
    display,
    displays = [display],
    env = process.env,
    platform = process.platform,
    nativeImage,
    runCommand = execFileAsync,
    fileSystem = fs.promises,
    tempFile = makeTempPath(),
  } = options;

  if (platform !== 'linux' || !isWaylandSession(env)) return null;
  if (!display || !display.bounds || !nativeImage?.createFromBuffer) return null;

  const candidates = getWaylandCaptureCandidates(env, display, tempFile);
  for (const candidate of candidates) {
    try {
      await fileSystem.unlink(tempFile).catch(() => {});
      await runCommand(candidate.command, candidate.args);
      const data = await readCaptureFile(tempFile, fileSystem);
      if (!data) continue;
      const loaded = nativeImage.createFromBuffer(data);
      if (!loaded || loaded.isEmpty()) continue;
      const image = cropCaptureToDisplay(
        loaded,
        display,
        displays,
        candidate.exactDisplay,
      );
      return { image, backend: candidate.name };
    } catch {
      // Try the next compositor-native backend. Missing commands are expected.
    } finally {
      await fileSystem.unlink(tempFile).catch(() => {});
    }
  }
  return null;
}

module.exports = {
  captureWaylandDisplay,
  cropCaptureToDisplay,
  desktopName,
  getWaylandCaptureCandidates,
};
