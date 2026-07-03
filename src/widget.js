(() => {
  if (!window.penguin) return;

  const widget = document.getElementById('widget');
  const ring = document.getElementById('ringPct');
  const up = document.getElementById('upVal');
  const down = document.getElementById('downVal');
  const menu = document.getElementById('menu');
  const moreButton = document.getElementById('moreBtn');
  const search = document.getElementById('searchInput');
  const memoryRefresh = document.getElementById('memoryRefresh');
  const widgetTools = document.getElementById('widgetTools');
  let refreshingMemory = false;

  const toolCatalog = {
    apps: { title: 'Apps', color: '#7BD7F0', icon: '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>', run: () => window.penguin.openManager('view-apps') },
    notes: { title: 'Notes', color: '#E9C07A', icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>', run: () => window.penguin.openManager('view-clipboard') },
    capture: { title: 'Capture an area', color: '#7BD7F0', icon: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="7" y="7" width="10" height="10" rx="2"/>', run: () => window.penguin.captureRegion() },
    screenshots: { title: 'Screenshot folder', color: '#8BC8FF', icon: '<path d="M3 7h6l2-2h10v14H3z"/><path d="m7 16 3-3 2 2 2-2 3 3"/>', run: () => window.penguin.openCaptureFolder() },
    calculator: { title: 'Calculator', color: '#9AD5B5', icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2"/>', run: () => window.penguin.launchCalculator() },
    browser: { title: 'Browser', color: '#7BD7F0', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>', run: () => window.penguin.openUrl('https://duckduckgo.com') },
    translate: { title: 'Web translator', color: '#B7A5FF', icon: '<path d="M4 5h9M8 3v2M6 8c1 3 4 5 7 6M12 7c-1 4-4 7-8 9M14 19l3-8 3 8M15 16h4"/>', run: () => window.penguin.openUrl('https://translate.google.com') },
    weather: { title: 'Weather', color: '#8BC8FF', icon: '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11-1A4.5 4.5 0 0 0 7 18z"/>', run: () => window.penguin.openUrl('https://wttr.in/') },
    images: { title: 'Image search', color: '#E9C07A', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 3 3 2-2 6 5"/>', run: () => window.penguin.openUrl('https://images.google.com') },
  };

  function renderTools(ids) {
    widgetTools.replaceChildren();
    for (const id of ids) {
      const tool = toolCatalog[id];
      if (!tool) continue;
      const button = document.createElement('button');
      button.className = 'tile';
      button.type = 'button';
      button.title = tool.title;
      button.dataset.toolId = id;
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${tool.color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${tool.icon}</svg>`;
      button.addEventListener('click', tool.run);
      widgetTools.appendChild(button);
    }
  }

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
    moreButton.classList.remove('open');
    await window.penguin.openManager('view-ai-customize');
  });
  document.getElementById('hideToolbar')?.addEventListener('click', () => window.penguin.hide());

  new MutationObserver(() => window.penguin.expand(menu.classList.contains('open')))
    .observe(menu, { attributes: true, attributeFilter: ['class'] });

  document.body.addEventListener('mouseenter', () => window.penguin.dockHover(true));
  document.body.addEventListener('mouseleave', () => window.penguin.dockHover(false));
  window.penguin.onDockState(applyDockState);
  window.penguin.onWidgetToolsChanged(renderTools);
  window.penguin.getDockState().then(applyDockState);
  window.penguin.getWidgetTools().then(renderTools);
  window.penguin.onStats(updateStats);
  window.penguin.getStats().then(updateStats);
})();
