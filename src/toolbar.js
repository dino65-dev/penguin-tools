const shell = document.getElementById('shell');
const panel = document.getElementById('panel');
const moreButton = document.getElementById('moreButton');
const noteField = document.getElementById('noteField');
let expanded = false;
let notesLoaded = false;
let saveTimer;

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

window.penguin.onStats(updateStats);
window.penguin.onCaptureComplete(showToast);
window.penguin.getStats().then(updateStats);
window.penguin.getSettings().then((settings) => {
  document.getElementById('alwaysOnTop').checked = settings.alwaysOnTop;
  document.getElementById('launchAtLogin').checked = settings.launchAtLogin;
});

