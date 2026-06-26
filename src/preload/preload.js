const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("danmakuApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  fetchSessdata: () => ipcRenderer.invoke("sessdata:fetch"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  consumeUpdateNotes: () => ipcRenderer.invoke("update:consume-notes"),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  connect: (roomId) => ipcRenderer.invoke("danmaku:connect", roomId),
  disconnect: () => ipcRenderer.invoke("danmaku:disconnect"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hide: () => ipcRenderer.invoke("window:hide"),
  quit: () => ipcRenderer.invoke("window:quit"),
  onSettingsChanged: (callback) => listen("settings:changed", callback),
  onStatus: (callback) => listen("danmaku:status", callback),
  onEvent: (callback) => listen("danmaku:event", callback),
  onPopularity: (callback) => listen("danmaku:popularity", callback),
  onPresence: (callback) => listen("danmaku:presence", callback),
  onUpdateStatus: (callback) => listen("update:status", callback)
});

function listen(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
