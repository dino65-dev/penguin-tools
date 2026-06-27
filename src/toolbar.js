const shell = document.getElementById('shell');
const panel = document.getElementById('panel');
const moreButton = document.getElementById('moreButton');
const noteField = document.getElementById('noteField');
let expanded = false;
let notesLoaded = false;
let saveTimer;
let dockedSide = null;

function setTheme({ darkMode }) {
  document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
}

function setDockState({ side, revealed }) {
  dockedSide = side;
  shell.classList.toggle('docked', Boolean(side));
  shell.classList.toggle('dock-left', side === 'left');
  shell.classList.toggle('dock-right', side === 'right');
  shell.classList.toggle('dock-hidden', Boolean(side) && !revealed);
}

function bytes(value) {
  if (!Number.isFinite(value) || value < 1) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function memory(value) {
  return `${(value / (1024 ** 3)).toFixed(1)} GB`;
}

function uptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days) return `${days}d ${hours}h uptime`;
  return `${hours}h uptime`;
}

function updateStats(stats) {
  document.getElementById('memoryMeter').style.setProperty('--value', stats.memory);
  document.getElementById('memoryValue').textContent = stats.memory;
  document.getElementById('cpuValue').textContent = `${stats.cpu}%`;
  document.getElementById('cpuTrack').style.width = `${stats.cpu}%`;
  document.getElementById('memoryDetail').textContent = `${memory(stats.memoryUsed)} / ${memory(stats.memoryTotal)}`;
  document.getElementById('memoryTrack').style.width = `${stats.memory}%`;
  document.getElementById('downValue').textContent = `↓ ${bytes(stats.down)}`;
  document.getElementById('upValue').textContent = `↑ ${bytes(stats.up)}`;
  document.getElementById('hostname').textContent = stats.hostname;
  document.getElementById('platform').textContent = stats.platform;
  document.getElementById('uptime').textContent = uptime(stats.uptime);
}

function setExpanded(next) {
  expanded = next;
  shell.classList.toggle('expanded', expanded);
  panel.setAttribute('aria-hidden', String(!expanded));
  moreButton.setAttribute('aria-expanded', String(expanded));
  window.penguin.expand(expanded);
}

async function showTab(name) {
  if (!expanded) setExpanded(true);
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('.tab-view').forEach((view) => view.classList.remove('active'));
  document.getElementById(`${name}View`).classList.add('active');
  if (name === 'note' && !notesLoaded) {
    noteField.value = await window.penguin.readNotes();
    notesLoaded = true;
  }
  if (name === 'power') refreshBackends();
}

async function refreshBackends() {
  const backends = await window.penguin.getBackends();
  document.getElementById('bleachBadge').classList.toggle('ready', backends.bleachbit);
  document.getElementById('clamBadge').classList.toggle('ready', backends.clamav);
  document.getElementById('bleachBadge').textContent = backends.bleachbit ? 'Cleaner ready' : 'Cleaner missing';
  document.getElementById('clamBadge').textContent = backends.clamav ? 'Security ready' : 'Security missing';
  document.getElementById('previewCleanup').disabled = !backends.bleachbit;
  document.getElementById('scanFolder').disabled = !backends.clamav;
  document.getElementById('installBackends').style.display = backends.bleachbit && backends.clamav ? 'none' : 'block';
  document.getElementById('powerOutput').textContent = backends.bleachbit && backends.clamav
    ? 'BleachBit and ClamAV are ready.'
    : 'Install the missing engines for cleanup and threat scanning.';
}

function showToast(payload) {
  const toast = document.getElementById('toast');
  document.getElementById('toastDetail').textContent = `${payload.width} × ${payload.height} · PNG saved`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

document.getElementById('captureButton').addEventListener('click', () => window.penguin.captureRegion());
document.getElementById('folderButton').addEventListener('click', () => window.penguin.openCaptureFolder());
document.getElementById('calculatorButton').addEventListener('click', () => window.penguin.launchCalculator());
document.getElementById('notesButton').addEventListener('click', () => showTab('note'));
moreButton.addEventListener('click', () => setExpanded(!expanded));
document.getElementById('closePanel').addEventListener('click', () => setExpanded(false));
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

noteField.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.penguin.saveNotes(noteField.value), 350);
});

document.getElementById('alwaysOnTop').addEventListener('change', (event) => window.penguin.setSetting('alwaysOnTop', event.target.checked));
document.getElementById('launchAtLogin').addEventListener('change', (event) => window.penguin.setSetting('launchAtLogin', event.target.checked));
document.getElementById('hideButton').addEventListener('click', () => window.penguin.hide());
document.getElementById('quitButton').addEventListener('click', () => window.penguin.quit());
document.getElementById('darkMode').addEventListener('change', (event) => window.penguin.setSetting('darkMode', event.target.checked));

document.body.addEventListener('mouseenter', () => { if (dockedSide) window.penguin.dockHover(true); });
document.body.addEventListener('mouseleave', () => { if (dockedSide) window.penguin.dockHover(false); });
document.getElementById('edgeTab').addEventListener('mouseenter', () => window.penguin.dockHover(true));
document.getElementById('edgeTab').addEventListener('click', () => window.penguin.dockHover(true));

document.getElementById('previewCleanup').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const output = document.getElementById('powerOutput');
  button.disabled = true;
  output.textContent = 'Previewing safe cleanup targets…';
  const result = await window.penguin.previewCleanup();
  output.textContent = result.ok ? result.output || 'Preview complete.' : result.error;
  button.disabled = false;
  document.getElementById('runCleanup').classList.toggle('hidden', !result.ok);
});

document.getElementById('runCleanup').addEventListener('click', async (event) => {
  if (!confirm('Delete the previewed cache, temporary files, and trash?')) return;
  const button = event.currentTarget;
  const output = document.getElementById('powerOutput');
  button.disabled = true;
  output.textContent = 'Cleaning previewed targets…';
  const result = await window.penguin.runCleanup();
  output.textContent = result.ok ? result.output || 'Cleanup complete.' : result.error;
  button.disabled = false;
  button.classList.add('hidden');
});

document.getElementById('scanFolder').addEventListener('click', async () => {
  const output = document.getElementById('powerOutput');
  const result = await window.penguin.scanFolder();
  if (result.ok) output.textContent = `Scanning ${result.target}…`;
  else if (!result.canceled) output.textContent = result.error;
});

document.getElementById('installBackends').addEventListener('click', async () => {
  const output = document.getElementById('powerOutput');
  output.textContent = 'Opening the system authorization prompt…';
  const result = await window.penguin.installBackends();
  if (!result.ok) output.textContent = result.error;
  else output.textContent = `Installing with ${result.manager}…`;
});

window.penguin.onStats(updateStats);
window.penguin.onCaptureComplete(showToast);
window.penguin.onTheme(setTheme);
window.penguin.onDockState(setDockState);
window.penguin.onBackendsChanged(({ code, error, backends }) => {
  document.getElementById('powerOutput').textContent = error || (code === 0 ? 'Backend installation complete.' : `Installer exited with code ${code}.`);
  if (backends) refreshBackends();
});
window.penguin.onSecurityProgress(({ status, target, message }) => {
  const output = document.getElementById('powerOutput');
  if (status === 'running') output.textContent = `Scanning ${target}…`;
  else output.textContent = message || status;
});
window.penguin.getStats().then(updateStats);
window.penguin.getSettings().then((settings) => {
  document.getElementById('alwaysOnTop').checked = settings.alwaysOnTop;
  document.getElementById('launchAtLogin').checked = settings.launchAtLogin;
  document.getElementById('darkMode').checked = settings.darkMode;
  setTheme(settings);
});
