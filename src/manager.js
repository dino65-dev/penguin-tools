(() => {
  if (!window.penguin) return;

  const text = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value != null) element.textContent = value;
    return element;
  };
  const rows = () => Array.from(document.querySelectorAll('.list-row'));
  const rowByHeading = (heading) => rows().find((row) => row.querySelector('h4')?.textContent.trim() === heading);
  const cardByHeading = (heading) => Array.from(document.querySelectorAll('.mini-card')).find((card) => card.querySelector('h3')?.textContent.trim() === heading);
  const toolByLabel = (label) => Array.from(document.querySelectorAll('.tool-tile')).find((tool) => tool.querySelector('.label')?.textContent.trim() === label);
  const settingRowByTitle = (title) => Array.from(document.querySelectorAll('.settings-row')).find((row) => row.querySelector('.ttl')?.textContent.trim() === title);
  let toastTimer;

  function formatBytes(value, decimals = 1) {
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / (1024 ** index)).toFixed(index ? decimals : 0)} ${units[index]}`;
  }

  function showToast(message, duration = 4200) {
    let toast = document.querySelector('.integration-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'integration-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function showModal(title, content) {
    let modal = document.querySelector('.integration-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'integration-modal';
      modal.innerHTML = '<section class="integration-dialog"><header class="integration-dialog-head"><h3></h3><button aria-label="Close">×</button></header><div class="integration-dialog-body"></div></section>';
      document.body.appendChild(modal);
      modal.querySelector('button').addEventListener('click', () => modal.classList.remove('open'));
      modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('open'); });
    }
    modal.querySelector('h3').textContent = title;
    const body = modal.querySelector('.integration-dialog-body');
    body.replaceChildren(content);
    modal.classList.add('open');
  }

  function navigate(viewId) {
    const nav = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (nav) nav.click();
  }

  function updateStats(stats) {
    text('#memVal', `${stats.memory}%`);
    const memBar = document.getElementById('memBar');
    if (memBar) memBar.style.width = `${stats.memory}%`;
    text('#tmpVal', formatBytes(stats.tempBytes));
    const tmpBar = document.getElementById('tmpBar');
    if (tmpBar) tmpBar.style.width = `${Math.min(100, (stats.tempBytes / (1024 ** 3)) * 100)}%`;
    const procBar = document.getElementById('procBar');
    if (procBar) procBar.style.width = `${Math.min(100, stats.processes / 2)}%`;
    const processRow = rowByHeading('Process management');
    if (processRow) processRow.querySelector('p').innerHTML = `<strong style="color:var(--ice)">${stats.processes || '—'}</strong> running`;

    const processCard = cardByHeading('Running processes');
    const processStrong = processCard?.querySelectorAll('.desc strong');
    if (processStrong?.length) processStrong[processStrong.length - 1].textContent = `${stats.processes || '—'} processes`;

    const storageCard = cardByHeading('Deep cleanup');
    const storageStrong = storageCard?.querySelectorAll('.desc strong');
    if (storageStrong?.length && stats.disk.total) storageStrong[storageStrong.length - 1].textContent = `${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`;

    const disk = document.querySelector('.disk-card');
    if (disk && stats.disk.total) {
      const percent = Math.round((stats.disk.used / stats.disk.total) * 100);
      text('.disk-card .disk-head h4', `Linux filesystem (${stats.disk.target})`);
      text('.disk-card .disk-head .used', `Used ${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}`);
      const segments = disk.querySelectorAll('.disk-usage i');
      if (segments.length) {
        segments.forEach((segment, index) => { segment.style.width = index === 0 ? `${percent}%` : '0%'; });
      }
    }
  }

  async function safeCleanup() {
    const preview = await window.penguin.previewCleanup();
    if (!preview.ok) {
      if (confirm(`${preview.error}\n\nInstall BleachBit and ClamAV now?`)) {
        const install = await window.penguin.installBackends();
        showToast(install.ok ? `Installing with ${install.manager}…` : install.error, 7000);
      }
      return;
    }
    if (!confirm(`BleachBit preview:\n\n${preview.output || 'Safe cleanup targets found.'}\n\nClean these files now?`)) return;
    const result = await window.penguin.runCleanup();
    showToast(result.ok ? result.output || 'Cleanup complete.' : result.error, 7000);
  }

  async function showProcesses() {
    const processes = await window.penguin.getProcesses();
    const container = document.createElement('div');
    if (!processes.length) {
      container.textContent = 'Process information is unavailable on this platform.';
    } else {
      for (const process of processes) {
        const row = document.createElement('div');
        row.className = 'process-row';
        const name = document.createElement('strong');
        name.title = process.name;
        name.textContent = process.name;
        const cpu = document.createElement('span');
        cpu.textContent = `${process.cpu.toFixed(1)}% CPU`;
        const memory = document.createElement('span');
        memory.textContent = `${process.memory.toFixed(1)}% RAM`;
        const pid = document.createElement('span');
        pid.textContent = `PID ${process.pid}`;
        const end = document.createElement('button');
        end.textContent = 'End';
        end.addEventListener('click', async () => {
          if (!confirm(`End ${process.name} (PID ${process.pid})? Unsaved work may be lost.`)) return;
          const result = await window.penguin.terminateProcess(process.pid);
          if (result.ok) {
            row.remove();
            showToast(`${process.name} was asked to close.`);
          } else showToast(result.error);
        });
        row.append(name, cpu, memory, pid, end);
        container.appendChild(row);
      }
    }
    showModal('Running processes', container);
  }

  async function buildClipboardWorkspace() {
    const host = document.querySelector('#view-clipboard .placeholder-card');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = 'true';
    host.className = 'clipboard-workspace';
    host.innerHTML = `
      <section class="clipboard-pane"><h3>Quick note</h3><p>Saved automatically on this computer</p><textarea id="manager-note" placeholder="Write a note…"></textarea></section>
      <section class="clipboard-pane"><h3>Current clipboard text</h3><p>Read or replace the current text clipboard</p><textarea id="manager-clipboard" placeholder="Clipboard is empty"></textarea><button id="write-clipboard">Copy text</button></section>`;
    const note = host.querySelector('#manager-note');
    const clip = host.querySelector('#manager-clipboard');
    note.value = await window.penguin.readNotes();
    clip.value = await window.penguin.readClipboardText();
    let timer;
    note.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.penguin.saveNotes(note.value), 300);
    });
    host.querySelector('#write-clipboard').addEventListener('click', async () => {
      await window.penguin.writeClipboardText(clip.value);
      showToast('Text copied to the clipboard.');
    });
  }

  function renameLinuxLabels() {
    text('.tip-text h3', 'Keep your Linux system healthy');
    text('.tip-text p', 'Use local cleanup, security scanning, and live system monitoring without cloud uploads.');
    text('.boost-head h3', 'Safe system boost');
    text('.boost-desc', 'Preview and remove temporary files using open-source Linux tools');
    const replacements = new Map([
      ['Windows update', 'System updates'],
      ['Taskbar repair', 'Desktop diagnostics'],
      ['Restore default apps', 'Default applications'],
      ['Pop-up management', 'App permissions'],
      ['Microsoft Store', 'Software Center'],
    ]);
    for (const heading of document.querySelectorAll('h4')) {
      const replacement = replacements.get(heading.textContent.trim());
      if (replacement) heading.textContent = replacement;
    }
    const virus = rowByHeading('Virus & threat protection');
    if (virus) virus.querySelector('p').textContent = 'Scan folders using the open-source ClamAV engine';
    const updates = rowByHeading('System updates');
    if (updates) updates.querySelector('p').textContent = 'Open your Linux distribution update manager';
    const store = rowByHeading('Software Center');
    if (store) store.querySelector('p').textContent = 'Discover and manage Linux applications';
    const uninstall = rowByHeading('Deep uninstall');
    if (uninstall) uninstall.querySelector('p').textContent = 'Open your software manager to remove applications';
    const large = rowByHeading('Large files');
    if (large) large.querySelector('p').textContent = 'Open a disk analyzer to inspect large files';
    const duplicates = rowByHeading('Duplicate files');
    if (duplicates) duplicates.querySelector('p').textContent = 'Optional duplicate-file backend is not installed';
    const largeScope = large?.querySelector('.dropdown span');
    if (largeScope) largeScope.textContent = '/home';
    document.querySelectorAll('.tool-tile .label').forEach((label) => {
      if (label.textContent.trim() === 'Edge Quick Links') label.textContent = 'Browser Quick Links';
      if (label.textContent.trim() === 'Bing translator') label.textContent = 'Web translator';
    });
    const restoreText = document.querySelector('#view-restore p');
    if (restoreText) restoreText.textContent = 'Your safety defaults and Penguin Tools settings are ready.';
    const homeStorage = cardByHeading('Deep cleanup');
    const homeStorageLabel = homeStorage?.querySelector('.desc');
    if (homeStorageLabel) homeStorageLabel.textContent = 'Linux filesystem';
    const health = cardByHeading('Health check');
    const healthLines = health?.querySelectorAll('.desc');
    if (healthLines?.length >= 2) {
      healthLines[0].textContent = 'Live monitoring';
      healthLines[1].innerHTML = '<strong>Active now</strong>';
    }
    document.querySelectorAll('.ttl, .sub, p').forEach((element) => {
      element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.textContent = node.textContent.replaceAll('Microsoft PC Manager', 'Penguin PC Manager').replaceAll('Windows', 'Linux');
      });
    });
  }

  function bindActions() {
    const controls = document.querySelectorAll('.win-btns .win-btn');
    if (controls[0]) controls[0].addEventListener('click', () => window.penguin.managerWindow('minimize'));
    if (controls[1]) controls[1].addEventListener('click', () => window.penguin.managerWindow('maximize'));
    if (controls[2]) controls[2].addEventListener('click', () => window.penguin.managerWindow('close'));

    document.querySelector('.capture-btn')?.addEventListener('click', () => window.penguin.captureRegion());
    document.querySelector('.boost-btn')?.addEventListener('click', safeCleanup);

    rowByHeading('Virus & threat protection')?.querySelector('button')?.addEventListener('click', async () => {
      const result = await window.penguin.scanFolder();
      if (!result.ok && !result.canceled) {
        if (confirm(`${result.error}\n\nInstall BleachBit and ClamAV now?`)) {
          const install = await window.penguin.installBackends();
          showToast(install.ok ? `Installing with ${install.manager}…` : install.error, 7000);
        }
      }
    });
    rowByHeading('System updates')?.addEventListener('click', async () => {
      const result = await window.penguin.openSystemTool('updates');
      if (!result.ok) showToast(result.error);
    });
    rowByHeading('Network check')?.addEventListener('click', async () => {
      const result = await window.penguin.openSystemTool('network');
      if (!result.ok) showToast(result.error);
    });
    rowByHeading('Default applications')?.addEventListener('click', async () => {
      const result = await window.penguin.openSystemTool('defaultApps');
      if (!result.ok) showToast(result.error);
    });
    rowByHeading('Default browser settings')?.addEventListener('click', () => window.penguin.openUrl('https://duckduckgo.com'));
    rowByHeading('App permissions')?.addEventListener('click', async () => {
      const result = await window.penguin.openSystemTool('applications');
      if (!result.ok) showToast(result.error);
    });
    rowByHeading('Desktop diagnostics')?.addEventListener('click', () => showToast('Desktop diagnostics are read-only; no settings were changed.'));
    rowByHeading('Disk analysis')?.addEventListener('click', async () => {
      const result = await window.penguin.openSystemTool('disk');
      if (!result.ok) showToast('Install Disk Usage Analyzer (baobab), Filelight, or QDirStat.');
    });
    rowByHeading('Deep cleanup')?.querySelector('button')?.addEventListener('click', safeCleanup);
    rowByHeading('Downloaded files')?.addEventListener('click', () => window.penguin.openUserFolder('downloads'));
    rowByHeading('Large files')?.addEventListener('click', () => window.penguin.openSystemTool('disk'));
    rowByHeading('Duplicate files')?.addEventListener('click', () => showToast('Duplicate removal requires a dedicated backend such as fclones. No files were changed.'));
    rowByHeading('Storage sense')?.addEventListener('click', safeCleanup);
    rowByHeading('Process management')?.addEventListener('click', showProcesses);
    rowByHeading('Deep uninstall')?.addEventListener('click', () => window.penguin.openSystemTool('software'));
    rowByHeading('Software Center')?.addEventListener('click', () => window.penguin.openSystemTool('software'));

    const toolActions = new Map([
      ['Circle to Act', () => window.penguin.captureRegion()],
      ['Snipping tool', () => window.penguin.captureRegion()],
      ['Screenshot folder', () => window.penguin.openCaptureFolder()],
      ['Notepad', () => navigate('view-clipboard')],
      ['Calculator', () => window.penguin.launchCalculator()],
      ['Browser Quick Links', () => window.penguin.openUrl('https://duckduckgo.com')],
      ['Web translator', () => window.penguin.openUrl('https://translate.google.com')],
      ['Currency converter', () => window.penguin.openUrl('https://www.xe.com/currencyconverter/')],
      ['Weather', () => window.penguin.openUrl('https://wttr.in/')],
      ['Image search', () => window.penguin.openUrl('https://images.google.com')],
    ]);
    for (const [label, action] of toolActions) toolByLabel(label)?.addEventListener('click', action);
    document.querySelectorAll('.tool-tile').forEach((tool) => {
      if (!toolActions.has(tool.querySelector('.label')?.textContent.trim())) {
        tool.addEventListener('click', () => showToast('This tool needs an additional Linux backend and is not enabled yet.'));
      }
    });

    document.querySelector('.nav-item[data-view="view-clipboard"]')?.addEventListener('click', buildClipboardWorkspace);

    const toolbarSetting = settingRowByTitle('Show toolbar on the desktop')?.querySelector('.toggle');
    toolbarSetting?.addEventListener('click', () => {
      if (!toolbarSetting.classList.contains('on')) setTimeout(() => window.penguin.hide(), 180);
    });

    const launchSetting = Array.from(document.querySelectorAll('.settings-row')).find((row) => row.querySelector('.ttl')?.textContent.includes('Start Penguin PC Manager automatically'));
    const launchToggle = launchSetting?.querySelector('.toggle');
    launchToggle?.addEventListener('click', () => window.penguin.setSetting('launchAtLogin', launchToggle.classList.contains('on')));
  }

  renameLinuxLabels();
  bindActions();
  window.penguin.onManagerNavigate((view) => {
    navigate(view);
    if (view === 'view-clipboard') buildClipboardWorkspace();
  });
  window.penguin.onStats(updateStats);
  window.penguin.onSecurityProgress(({ status, target, message }) => {
    if (status === 'running') showToast(`Scanning ${target}…`, 2500);
    else showToast(message || status, 8000);
  });
  window.penguin.getStats().then(updateStats);
  window.penguin.getSettings().then((settings) => {
    const launchSetting = Array.from(document.querySelectorAll('.settings-row')).find((row) => row.querySelector('.ttl')?.textContent.includes('Start Penguin PC Manager automatically'));
    launchSetting?.querySelector('.toggle')?.classList.toggle('on', settings.launchAtLogin);
  });
  window.penguin.getDefaultBrowser().then((browser) => {
    const row = rowByHeading('Default browser settings');
    if (row) row.querySelector('p').innerHTML = `Current browser: <strong>${browser}</strong>`;
  });
})();
