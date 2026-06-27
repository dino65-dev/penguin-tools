const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  screen,
  shell,
  Tray,
} = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

const TOOLBAR_SIZE = { width: 508, height: 72 };
const TOOLBAR_EXPANDED_HEIGHT = 342;
const EDGE_THRESHOLD = 30;
const EDGE_TAB_WIDTH = 14;
const CAPTURE_DIR = path.join(app.getPath('pictures'), 'Penguin Tools');
const NOTES_FILE = path.join(app.getPath('userData'), 'notes.txt');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

let toolbarWindow;
let captureWindow;
let tray;
let captureImage;
let captureDisplay;
let isQuitting = false;
let previousCpu = readCpuTimes();
let previousNetwork = readNetworkBytes();
let previousNetworkAt = Date.now();
let dockSide = null;
let dockDisplayId = null;
let dockHideTimer;
let isDockRevealed = true;
let isProgrammaticMove = false;
let toolbarExpanded = false;

function readSettings() {
  const defaults = {
    alwaysOnTop: true,
    launchAtLogin: false,
    darkMode: nativeTheme.shouldUseDarkColors,
    dockSide: null,
    dockDisplayId: null,
    dockY: null,
  };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return defaults;
  }
}

function writeSettings(next) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
}

function createToolbarWindow() {
  const display = screen.getPrimaryDisplay();
  const x = Math.round(display.workArea.x + (display.workArea.width - TOOLBAR_SIZE.width) / 2);
  const y = Math.round(display.workArea.y + display.workArea.height - TOOLBAR_SIZE.height - 24);
  const settings = readSettings();
  nativeTheme.themeSource = settings.darkMode ? 'dark' : 'light';
  dockSide = settings.dockSide;
  dockDisplayId = settings.dockDisplayId;

  toolbarWindow = new BrowserWindow({
    ...TOOLBAR_SIZE,
    x,
    y,
    minWidth: TOOLBAR_SIZE.width,
    maxWidth: TOOLBAR_SIZE.width,
    minHeight: TOOLBAR_SIZE.height,
    maxHeight: TOOLBAR_EXPANDED_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  toolbarWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  toolbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  toolbarWindow.loadFile(path.join(__dirname, 'src', 'toolbar.html'));
  toolbarWindow.once('ready-to-show', () => {
    toolbarWindow.showInactive();
    toolbarWindow.webContents.send('theme-update', { darkMode: settings.darkMode });
    if (dockSide) {
      const savedDisplay = screen.getAllDisplays().find((item) => item.id === dockDisplayId) || display;
      const dockY = Number.isFinite(settings.dockY) ? settings.dockY : y;
      dockToolbar(dockSide, savedDisplay, dockY, true);
    }
    if (process.argv.includes('--qa-screenshots')) runVisualQa();
    else if (process.argv.includes('--qa-capture')) setTimeout(beginCapture, 700);
    else if (process.argv.includes('--qa-edge')) runEdgeQa();
  });
  toolbarWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      toolbarWindow.hide();
    }
  });
  toolbarWindow.on('moved', handleToolbarMoved);

  if (process.argv.includes('--hidden')) toolbarWindow.once('ready-to-show', () => toolbarWindow.hide());
}

async function runVisualQa() {
  const qaDir = path.join(__dirname, 'work');
  await fs.promises.mkdir(qaDir, { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const collapsed = await toolbarWindow.webContents.capturePage();
  await fs.promises.writeFile(path.join(qaDir, 'toolbar-collapsed.png'), collapsed.toPNG());
  await toolbarWindow.webContents.executeJavaScript("document.getElementById('moreButton').click()", true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const expanded = await toolbarWindow.webContents.capturePage();
  await fs.promises.writeFile(path.join(qaDir, 'toolbar-expanded.png'), expanded.toPNG());
  await toolbarWindow.webContents.executeJavaScript("document.documentElement.dataset.theme='dark'; showTab('power')", true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const darkPower = await toolbarWindow.webContents.capturePage();
  await fs.promises.writeFile(path.join(qaDir, 'toolbar-dark-power.png'), darkPower.toPNG());
  isQuitting = true;
  app.quit();
}

async function runEdgeQa() {
  const original = readSettings();
  const display = screen.getPrimaryDisplay();
  const qaDir = path.join(__dirname, 'work');
  await fs.promises.mkdir(qaDir, { recursive: true });
  dockToolbar('right', display, display.workArea.y + 100, true);
  await new Promise((resolve) => setTimeout(resolve, 1300));
  const hidden = toolbarWindow.getBounds();
  revealDock();
  await new Promise((resolve) => setTimeout(resolve, 450));
  const revealed = toolbarWindow.getBounds();
  const expectedHiddenX = display.workArea.x + display.workArea.width - EDGE_TAB_WIDTH;
  const expectedRevealedX = display.workArea.x + display.workArea.width - TOOLBAR_SIZE.width;
  await fs.promises.writeFile(path.join(qaDir, 'edge-dock-qa.json'), JSON.stringify({
    hidden,
    revealed,
    expectedHiddenX,
    expectedRevealedX,
    passed: hidden.x === expectedHiddenX && revealed.x === expectedRevealedX,
  }, null, 2));
  writeSettings(original);
  isQuitting = true;
  app.quit();
}

function createTray() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="9" fill="#2176ff"/>
      <path d="M8 17.8c3.2-1.1 5.3-3.9 5.9-8.2 3.1 1.2 5.1 3.8 5.3 7.7 1.8.4 3.1 1.6 3.8 3.7-4.9 2.8-10 2.8-15.2 0-.9-.5-.8-2.7.2-3.2Z" fill="white"/>
      <circle cx="17.4" cy="12.6" r="1" fill="#2176ff"/>
    </svg>`);
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`);
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('Penguin Tools');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show toolbar', click: showToolbar },
    { label: 'Capture region', click: beginCapture },
    { label: 'Open screenshots', click: () => openCaptureFolder() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showToolbar);
}

function showToolbar() {
  if (!toolbarWindow) return;
  toolbarWindow.showInactive();
  if (dockSide) {
    revealDock();
    scheduleDockHide(1800);
  }
}

function setToolbarBounds(bounds, animate = false) {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return;
  isProgrammaticMove = true;
  toolbarWindow.setBounds(bounds, animate);
  setTimeout(() => { isProgrammaticMove = false; }, animate ? 320 : 80);
}

function getDockDisplay() {
  return screen.getAllDisplays().find((item) => item.id === dockDisplayId)
    || screen.getDisplayNearestPoint({ x: toolbarWindow.getBounds().x, y: toolbarWindow.getBounds().y });
}

function dockToolbar(side, display, preferredY, hideAfter = true) {
  if (!toolbarWindow) return;
  dockSide = side;
  dockDisplayId = display.id;
  isDockRevealed = true;
  const bounds = toolbarWindow.getBounds();
  const area = display.workArea;
  const y = Math.max(area.y, Math.min(Math.round(preferredY), area.y + area.height - bounds.height));
  const x = side === 'left' ? area.x : area.x + area.width - bounds.width;
  setToolbarBounds({ ...bounds, x, y }, true);
  toolbarWindow.webContents.send('dock-state', { side, revealed: true });
  const settings = readSettings();
  writeSettings({ ...settings, dockSide: side, dockDisplayId: display.id, dockY: y });
  if (hideAfter) scheduleDockHide(850);
}

function handleToolbarMoved() {
  if (isProgrammaticMove || !toolbarWindow || toolbarExpanded) return;
  const bounds = toolbarWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  const area = display.workArea;
  if (bounds.x <= area.x + EDGE_THRESHOLD) return dockToolbar('left', display, bounds.y);
  if (bounds.x + bounds.width >= area.x + area.width - EDGE_THRESHOLD) return dockToolbar('right', display, bounds.y);

  if (dockSide) {
    dockSide = null;
    dockDisplayId = null;
    isDockRevealed = true;
    clearTimeout(dockHideTimer);
    toolbarWindow.webContents.send('dock-state', { side: null, revealed: true });
    const settings = readSettings();
    writeSettings({ ...settings, dockSide: null, dockDisplayId: null, dockY: null });
  }
}

function revealDock() {
  if (!dockSide || !toolbarWindow) return;
  clearTimeout(dockHideTimer);
  const area = getDockDisplay().workArea;
  const bounds = toolbarWindow.getBounds();
  const x = dockSide === 'left' ? area.x : area.x + area.width - bounds.width;
  isDockRevealed = true;
  setToolbarBounds({ ...bounds, x }, true);
  toolbarWindow.webContents.send('dock-state', { side: dockSide, revealed: true });
}

function hideDock() {
  if (!dockSide || !toolbarWindow || toolbarExpanded) return;
  const area = getDockDisplay().workArea;
  const bounds = toolbarWindow.getBounds();
  const x = dockSide === 'left'
    ? area.x - bounds.width + EDGE_TAB_WIDTH
    : area.x + area.width - EDGE_TAB_WIDTH;
  isDockRevealed = false;
  setToolbarBounds({ ...bounds, x }, true);
  toolbarWindow.webContents.send('dock-state', { side: dockSide, revealed: false });
}

function scheduleDockHide(delay = 650) {
  clearTimeout(dockHideTimer);
  if (dockSide && !toolbarExpanded) dockHideTimer = setTimeout(hideDock, delay);
}

function readCpuTimes() {
  return os.cpus().reduce((totals, cpu) => {
    Object.values(cpu.times).forEach((value) => { totals.total += value; });
    totals.idle += cpu.times.idle;
    return totals;
  }, { idle: 0, total: 0 });
}

function cpuPercent() {
  const current = readCpuTimes();
  const idle = current.idle - previousCpu.idle;
  const total = current.total - previousCpu.total;
  previousCpu = current;
  return total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0;
}

function readNetworkBytes() {
  if (process.platform !== 'linux') return null;
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').trim().split('\n').slice(2);
    return lines.reduce((total, line) => {
      const [namePart, valuesPart] = line.split(':');
      const name = namePart.trim();
      if (name === 'lo') return total;
      const values = valuesPart.trim().split(/\s+/).map(Number);
      total.down += values[0] || 0;
      total.up += values[8] || 0;
      return total;
    }, { down: 0, up: 0 });
  } catch {
    return null;
  }
}

function systemStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const now = Date.now();
  const network = readNetworkBytes();
  const elapsed = Math.max((now - previousNetworkAt) / 1000, 0.1);
  const stats = {
    cpu: cpuPercent(),
    memory: Math.round(((total - free) / total) * 100),
    memoryUsed: total - free,
    memoryTotal: total,
    down: network && previousNetwork ? Math.max(0, (network.down - previousNetwork.down) / elapsed) : 0,
    up: network && previousNetwork ? Math.max(0, (network.up - previousNetwork.up) / elapsed) : 0,
    uptime: os.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
  };
  previousNetwork = network;
  previousNetworkAt = now;
  return stats;
}

async function findCaptureSource(display) {
  const width = Math.max(1, Math.round(display.size.width * display.scaleFactor));
  const height = Math.max(1, Math.round(display.size.height * display.scaleFactor));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  return sources.find((source) => String(source.display_id) === String(display.id)) || sources[0];
}

async function beginCapture() {
  if (captureWindow || !toolbarWindow) return;
  const bounds = toolbarWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  toolbarWindow.hide();
  await new Promise((resolve) => setTimeout(resolve, 180));

  try {
    const source = await findCaptureSource(display);
    if (!source || source.thumbnail.isEmpty()) throw new Error('The desktop portal did not return a screen image.');
    captureImage = source.thumbnail;
    captureDisplay = display;
    captureWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#111318',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    captureWindow.setAlwaysOnTop(true, 'screen-saver');
    captureWindow.loadFile(path.join(__dirname, 'src', 'capture.html'));
    captureWindow.webContents.once('did-finish-load', () => {
      captureWindow.webContents.send('capture-image', {
        dataUrl: captureImage.toDataURL(),
        display: { width: display.bounds.width, height: display.bounds.height },
      });
      captureWindow.show();
      if (process.argv.includes('--qa-capture')) runCaptureQa();
    });
    captureWindow.on('closed', () => {
      captureWindow = null;
      captureImage = null;
      captureDisplay = null;
      showToolbar();
    });
  } catch (error) {
    showToolbar();
    notify('Capture unavailable', error.message);
  }
}

async function runCaptureQa() {
  const qaDir = path.join(__dirname, 'work');
  await fs.promises.mkdir(qaDir, { recursive: true });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await captureWindow.webContents.executeJavaScript(`
    hint.style.display = 'none';
    shade.style.display = 'none';
    selection.classList.add('active');
    draw({ x: 140, y: 110, width: Math.min(620, innerWidth - 280), height: Math.min(390, innerHeight - 240) });
  `, true);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const overlay = await captureWindow.webContents.capturePage();
  await fs.promises.writeFile(path.join(qaDir, 'capture-selection.png'), overlay.toPNG());
  isQuitting = true;
  app.quit();
}

async function finishCapture(rect) {
  if (!captureImage || !captureDisplay || !captureWindow) return;
  const imageSize = captureImage.getSize();
  const scaleX = imageSize.width / captureDisplay.bounds.width;
  const scaleY = imageSize.height / captureDisplay.bounds.height;
  const crop = {
    x: Math.max(0, Math.round(rect.x * scaleX)),
    y: Math.max(0, Math.round(rect.y * scaleY)),
    width: Math.max(1, Math.round(rect.width * scaleX)),
    height: Math.max(1, Math.round(rect.height * scaleY)),
  };
  crop.width = Math.min(crop.width, imageSize.width - crop.x);
  crop.height = Math.min(crop.height, imageSize.height - crop.y);

  const result = captureImage.crop(crop);
  clipboard.writeImage(result);
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(CAPTURE_DIR, `Capture ${stamp}.png`);
  await fs.promises.writeFile(filePath, result.toPNG());
  captureWindow.close();
  toolbarWindow.webContents.send('capture-complete', { filePath, width: crop.width, height: crop.height });
  notify('Copied to clipboard', `${crop.width} × ${crop.height} screenshot saved`);
}

function cancelCapture() {
  if (captureWindow) captureWindow.close();
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

async function openCaptureFolder() {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const error = await shell.openPath(CAPTURE_DIR);
  if (error) notify('Could not open folder', error);
}

function launchCalculator() {
  if (process.platform === 'win32') {
    spawn('calc.exe', { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Calculator'], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  const candidates = ['gnome-calculator', 'kcalc', 'galculator', 'mate-calc', 'xcalc'];
  const attempt = (index) => {
    if (index >= candidates.length) {
      notify('Calculator not found', 'Install GNOME Calculator, KCalc, or Galculator.');
      return;
    }
    execFile('sh', ['-lc', `command -v ${candidates[index]}`], (error) => {
      if (error) return attempt(index + 1);
      spawn(candidates[index], [], { detached: true, stdio: 'ignore' }).unref();
    });
  };
  attempt(0);
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
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

async function commandAvailable(command) {
  if (process.platform !== 'linux') return false;
  try {
    await execFileAsync('sh', ['-lc', 'command -v "$1" >/dev/null 2>&1', 'penguin-tools', command], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function getBackends() {
  const [bleachbit, clamav, fastfetch, pkexec] = await Promise.all([
    commandAvailable('bleachbit'),
    commandAvailable('clamscan'),
    commandAvailable('fastfetch'),
    commandAvailable('pkexec'),
  ]);
  return { bleachbit, clamav, fastfetch, pkexec };
}

async function bleachBitCleaners() {
  const { stdout } = await execFileAsync('bleachbit', ['--list-cleaners'], { timeout: 20000 });
  const installed = new Set(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return ['system.cache', 'system.tmp', 'system.trash'].filter((cleaner) => installed.has(cleaner));
}

async function runBleachBit(mode) {
  if (!await commandAvailable('bleachbit')) return { ok: false, error: 'BleachBit is not installed.' };
  try {
    const cleaners = await bleachBitCleaners();
    if (!cleaners.length) return { ok: false, error: 'No safe cleanup targets were found.' };
    const { stdout, stderr } = await execFileAsync('bleachbit', [`--${mode}`, ...cleaners]);
    const output = `${stdout}\n${stderr}`.trim();
    return { ok: true, cleaners, output: output.split(/\r?\n/).slice(-12).join('\n') };
  } catch (error) {
    return { ok: false, error: (error.stderr || error.message || 'BleachBit failed.').trim() };
  }
}

async function startClamScan() {
  if (!await commandAvailable('clamscan')) return { ok: false, error: 'ClamAV is not installed.' };
  const choice = await dialog.showOpenDialog(toolbarWindow, {
    title: 'Choose a folder to scan',
    buttonLabel: 'Scan this folder',
    properties: ['openDirectory'],
  });
  if (choice.canceled || !choice.filePaths[0]) return { ok: false, canceled: true };

  const target = choice.filePaths[0];
  const child = spawn('clamscan', ['--recursive', '--infected', target], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const collect = (chunk) => {
    output = `${output}${chunk}`.slice(-24000);
    toolbarWindow?.webContents.send('security-progress', { status: 'running', target });
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', (error) => toolbarWindow?.webContents.send('security-progress', { status: 'error', target, message: error.message }));
  child.on('close', (code) => {
    const summary = output.split(/\r?\n/).filter(Boolean).slice(-14).join('\n');
    toolbarWindow?.webContents.send('security-progress', {
      status: code === 0 ? 'clean' : code === 1 ? 'infected' : 'error',
      target,
      message: summary || (code === 0 ? 'No threats found.' : `Scanner exited with code ${code}.`),
    });
  });
  return { ok: true, target };
}

async function installPowerBackends() {
  if (process.platform !== 'linux') return { ok: false, error: 'Backend installation is available on Linux.' };
  if (!await commandAvailable('pkexec')) return { ok: false, error: 'Polkit (pkexec) is required for mouse-only installation.' };
  const candidates = [
    { manager: 'apt-get', args: ['install', '-y', 'bleachbit', 'clamav'] },
    { manager: 'dnf', args: ['install', '-y', 'bleachbit', 'clamav'] },
    { manager: 'pacman', args: ['-S', '--needed', '--noconfirm', 'bleachbit', 'clamav'] },
    { manager: 'zypper', args: ['--non-interactive', 'install', 'bleachbit', 'clamav'] },
  ];
  const selected = await candidates.reduce(async (pending, candidate) => {
    const found = await pending;
    return found || (await commandAvailable(candidate.manager) ? candidate : null);
  }, Promise.resolve(null));
  if (!selected) return { ok: false, error: 'Supported package manager not found.' };

  const child = spawn('pkexec', [selected.manager, ...selected.args], { detached: false, stdio: 'ignore' });
  child.on('close', async (code) => {
    toolbarWindow?.webContents.send('backends-changed', { code, backends: await getBackends() });
  });
  child.on('error', (error) => toolbarWindow?.webContents.send('backends-changed', { code: -1, error: error.message }));
  return { ok: true, manager: selected.manager };
}

ipcMain.handle('get-stats', () => systemStats());
ipcMain.handle('capture-region', () => beginCapture());
ipcMain.on('capture-finish', (_event, rect) => finishCapture(rect));
ipcMain.on('capture-cancel', cancelCapture);
ipcMain.handle('open-capture-folder', openCaptureFolder);
ipcMain.handle('launch-calculator', launchCalculator);
ipcMain.handle('read-notes', async () => {
  try { return await fs.promises.readFile(NOTES_FILE, 'utf8'); } catch { return ''; }
});
ipcMain.handle('save-notes', async (_event, text) => {
  await fs.promises.mkdir(path.dirname(NOTES_FILE), { recursive: true });
  await fs.promises.writeFile(NOTES_FILE, String(text).slice(0, 20000), 'utf8');
});
ipcMain.handle('get-settings', () => readSettings());
ipcMain.handle('set-setting', (_event, key, value) => {
  const settings = readSettings();
  if (!['alwaysOnTop', 'launchAtLogin', 'darkMode'].includes(key)) return settings;
  settings[key] = Boolean(value);
  writeSettings(settings);
  if (key === 'alwaysOnTop') toolbarWindow.setAlwaysOnTop(settings[key], 'floating');
  if (key === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: settings[key], args: ['--hidden'] });
  if (key === 'darkMode') {
    nativeTheme.themeSource = settings[key] ? 'dark' : 'light';
    toolbarWindow.webContents.send('theme-update', { darkMode: settings[key] });
  }
  return settings;
});
ipcMain.on('toolbar-expand', (_event, expanded) => {
  if (!toolbarWindow) return;
  toolbarExpanded = expanded;
  clearTimeout(dockHideTimer);
  if (dockSide && !isDockRevealed) revealDock();
  const bounds = toolbarWindow.getBounds();
  const nextHeight = expanded ? TOOLBAR_EXPANDED_HEIGHT : TOOLBAR_SIZE.height;
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  const desiredY = dockSide ? bounds.y : bounds.y - (nextHeight - bounds.height);
  const y = Math.max(display.workArea.y, Math.min(desiredY, display.workArea.y + display.workArea.height - nextHeight));
  setToolbarBounds({ x: bounds.x, y, width: bounds.width, height: nextHeight }, true);
  if (!expanded) scheduleDockHide(900);
});
ipcMain.on('dock-hover', (_event, hovering) => {
  if (hovering) revealDock();
  else scheduleDockHide(520);
});
ipcMain.handle('get-backends', getBackends);
ipcMain.handle('install-backends', installPowerBackends);
ipcMain.handle('preview-cleanup', () => runBleachBit('preview'));
ipcMain.handle('run-cleanup', () => runBleachBit('clean'));
ipcMain.handle('scan-folder', startClamScan);
ipcMain.on('hide-toolbar', () => toolbarWindow?.hide());
ipcMain.on('quit-app', () => { isQuitting = true; app.quit(); });

app.whenReady().then(() => {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  createToolbarWindow();
  createTray();
  setInterval(() => {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.webContents.send('stats-update', systemStats());
  }, 1500).unref();
});

app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => { isQuitting = true; });
app.on('activate', showToolbar);
