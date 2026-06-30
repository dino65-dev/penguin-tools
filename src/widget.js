(() => {
  if (!window.penguin) return;

  const widget = document.getElementById('widget');
  const ring = document.getElementById('ringPct');
  const up = document.getElementById('upVal');
  const down = document.getElementById('downVal');
  const menu = document.getElementById('menu');
  const search = document.getElementById('searchInput');
  const memoryRefresh = document.getElementById('memoryRefresh');
  let refreshingMemory = false;

  function applyDockState(state) {
    const side = state?.side || null;
    document.body.classList.toggle('docked', Boolean(side));
    document.body.classList.toggle('docked-left', side === 'left');
    document.body.classList.toggle('docked-right', side === 'right');
    document.body.classList.toggle('dock-hidden', Boolean(side) && state.revealed === false);
  }

  function rate(value) {
    if (!Number.isFinite(value) || value < 1) return '0B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const amount = value / (1024 ** index);
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)}${units[index]}`;
  }

  function updateStats(stats) {
    widget.style.setProperty('--p', stats.memory);
    if (!refreshingMemory) ring.textContent = `${stats.memory}%`;
    up.textContent = rate(stats.up);
    down.textContent = rate(stats.down);
  }

  async function searchWeb() {
    const query = search.value.trim();
    if (query) await window.penguin.webSearch(query);
    else if (document.body.classList.contains('docked')) await window.penguin.openUrl('https://duckduckgo.com');
  }

  async function refreshMemoryStatus() {
    if (refreshingMemory) return;
    refreshingMemory = true;
    memoryRefresh.classList.add('refreshing');
    memoryRefresh.setAttribute('aria-busy', 'true');
    ring.textContent = '↻';
    const started = Date.now();
    try {
      const result = await window.penguin.refreshMemory();
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 900 - (Date.now() - started))));
      updateStats(result.stats || await window.penguin.getStats());
      memoryRefresh.title = `${result.message}. Linux manages and reclaims system cache automatically.`;
    } finally {
      refreshingMemory = false;
      memoryRefresh.classList.remove('refreshing');
      memoryRefresh.removeAttribute('aria-busy');
      const stats = await window.penguin.getStats();
      updateStats(stats);
    }
  }

  const tiles = Array.from(document.querySelectorAll('.tile'));
  if (tiles[0]) tiles[0].addEventListener('click', () => window.penguin.openManager('view-apps'));
  if (tiles[1]) tiles[1].addEventListener('click', () => window.penguin.openManager('view-clipboard'));
  if (tiles[2]) tiles[2].addEventListener('click', () => window.penguin.captureRegion());

  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchWeb();
  });
  document.querySelector('.search .mag')?.addEventListener('click', searchWeb);
  memoryRefresh.addEventListener('click', refreshMemoryStatus);
  memoryRefresh.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      refreshMemoryStatus();
    }
  });

  document.getElementById('addTools')?.addEventListener('click', async () => {
    menu.classList.remove('open');
    await window.penguin.openManager('view-ai');
  });
  document.getElementById('hideToolbar')?.addEventListener('click', () => window.penguin.hide());

  new MutationObserver(() => window.penguin.expand(menu.classList.contains('open')))
    .observe(menu, { attributes: true, attributeFilter: ['class'] });

  document.body.addEventListener('mouseenter', () => window.penguin.dockHover(true));
  document.body.addEventListener('mouseleave', () => window.penguin.dockHover(false));
  window.penguin.onDockState(applyDockState);
  window.penguin.getDockState().then(applyDockState);
  window.penguin.onStats(updateStats);
  window.penguin.getStats().then(updateStats);
})();
