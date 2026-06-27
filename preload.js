const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('penguin', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  onStats: (callback) => ipcRenderer.on('stats-update', (_event, stats) => callback(stats)),
  captureRegion: () => ipcRenderer.invoke('capture-region'),
  onCaptureImage: (callback) => ipcRenderer.on('capture-image', (_event, payload) => callback(payload)),
  finishCapture: (rect) => ipcRenderer.send('capture-finish', rect),
  cancelCapture: () => ipcRenderer.send('capture-cancel'),
  onCaptureComplete: (callback) => ipcRenderer.on('capture-complete', (_event, payload) => callback(payload)),
  openCaptureFolder: () => ipcRenderer.invoke('open-capture-folder'),
  launchCalculator: () => ipcRenderer.invoke('launch-calculator'),
  readNotes: () => ipcRenderer.invoke('read-notes'),
  saveNotes: (text) => ipcRenderer.invoke('save-notes', text),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  expand: (expanded) => ipcRenderer.send('toolbar-expand', expanded),
  hide: () => ipcRenderer.send('hide-toolbar'),
  quit: () => ipcRenderer.send('quit-app'),
});

