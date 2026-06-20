const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, globalShortcut } = require("electron");
const fs = require("fs");
const path = require("path");
const { BilibiliDanmakuClient } = require("./bilibiliClient");
const { DEFAULT_SETTINGS } = require("../shared/defaults");

const APP_NAME = "Sugaryfish的弹幕姬";

let mainWindow = null;
let sessdataLoginWindow = null;
let sessdataFetchPromise = null;
let tray = null;
let settings = { ...DEFAULT_SETTINGS };
const client = new BilibiliDanmakuClient();

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  app.setName(APP_NAME);
  app.setAppUserModelId("com.sugaryfish.danmaku-hime");
  settings = loadSettings();
  createWindow();
  createTray();
  bindClientEvents();
  registerShortcuts();
});

app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  client.disconnect(false);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 300,
    minHeight: 280,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    title: APP_NAME,
    icon: getIconPath(),
    alwaysOnTop: settings.alwaysOnTop,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    applyWindowSettings(settings);
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.on("double-click", () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? "隐藏窗口" : "显示窗口",
      click: () => {
        if (!mainWindow) return;
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        updateTrayMenu();
      }
    },
    { type: "separator" },
    {
      label: "置顶",
      accelerator: "Ctrl+Alt+T",
      type: "checkbox",
      checked: settings.alwaysOnTop,
      click: (menuItem) => setSettings({ alwaysOnTop: menuItem.checked })
    },
    {
      label: "鼠标穿透",
      accelerator: "Ctrl+Alt+J",
      type: "checkbox",
      checked: settings.clickThrough,
      click: (menuItem) => setSettings({ clickThrough: menuItem.checked })
    },
    {
      label: "锁定位置",
      accelerator: "Ctrl+Alt+L",
      type: "checkbox",
      checked: settings.locked,
      click: (menuItem) => setSettings({ locked: menuItem.checked })
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function bindClientEvents() {
  client.on("status", (status) => {
    mainWindow?.webContents.send("danmaku:status", status);
  });

  client.on("event", (event) => {
    mainWindow?.webContents.send("danmaku:event", event);
  });

  client.on("popularity", (value) => {
    mainWindow?.webContents.send("danmaku:popularity", value);
  });
}

function registerShortcuts() {
  registerShortcut("CommandOrControl+Alt+J", () => {
    setSettings({ clickThrough: !settings.clickThrough });
    showWindowAfterShortcut();
  });

  registerShortcut("CommandOrControl+Alt+T", () => {
    setSettings({ alwaysOnTop: !settings.alwaysOnTop });
    showWindowAfterShortcut();
  });

  registerShortcut("CommandOrControl+Alt+L", () => {
    setSettings({ locked: !settings.locked });
    showWindowAfterShortcut();
  });
}

function registerShortcut(accelerator, callback) {
  const ok = globalShortcut.register(accelerator, callback);
  if (!ok) {
    console.warn(`快捷键注册失败：${accelerator}`);
  }
}

function showWindowAfterShortcut() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
}

function setSettings(patch) {
  settings = sanitizeSettings({ ...settings, ...patch });
  saveSettings(settings);
  applyWindowSettings(settings);
  updateTrayMenu();
  mainWindow?.webContents.send("settings:changed", settings);
  return settings;
}

function applyWindowSettings(nextSettings) {
  if (!mainWindow) return;

  mainWindow.setAlwaysOnTop(Boolean(nextSettings.alwaysOnTop), "screen-saver");
  mainWindow.setMovable(!nextSettings.locked);
  mainWindow.setResizable(!nextSettings.locked);
  mainWindow.setOpacity(Math.max(0.35, Math.min(1, Number(nextSettings.opacity) / 100)));
  mainWindow.setIgnoreMouseEvents(Boolean(nextSettings.clickThrough), { forward: true });
}

ipcMain.handle("settings:get", () => settings);
ipcMain.handle("settings:update", (_event, patch) => setSettings(patch));

ipcMain.handle("sessdata:fetch", async () => {
  const sessdata = await fetchSessdataFromBilibiliLogin();
  setSettings({ sessdata });
  return { ok: true };
});

ipcMain.handle("danmaku:connect", async (_event, roomId) => {
  await client.connect(roomId, { sessdata: settings.sessdata });
  setSettings({ roomId: String(roomId || "").trim() });
  return { ok: true };
});

ipcMain.handle("danmaku:disconnect", () => {
  client.disconnect();
  return { ok: true };
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:hide", () => {
  mainWindow?.hide();
  updateTrayMenu();
});

ipcMain.handle("window:quit", () => {
  app.isQuitting = true;
  app.quit();
});

function fetchSessdataFromBilibiliLogin() {
  if (sessdataFetchPromise) {
    if (sessdataLoginWindow && !sessdataLoginWindow.isDestroyed()) {
      sessdataLoginWindow.show();
      sessdataLoginWindow.focus();
    }
    return sessdataFetchPromise;
  }

  sessdataFetchPromise = new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    let timeout = null;

    sessdataLoginWindow = new BrowserWindow({
      width: 980,
      height: 720,
      minWidth: 720,
      minHeight: 560,
      parent: mainWindow || undefined,
      title: "获取 SESSDATA",
      autoHideMenuBar: true,
      show: false,
      icon: getIconPath(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:bilibili-login"
      }
    });

    const loginWindow = sessdataLoginWindow;
    loginWindow.webContents.setUserAgent(chromeLikeUserAgent());

    const cleanup = () => {
      clearInterval(timer);
      clearTimeout(timeout);
      timer = null;
      timeout = null;
      sessdataFetchPromise = null;
      if (sessdataLoginWindow === loginWindow) {
        sessdataLoginWindow = null;
      }
    };

    const finish = (error, value) => {
      if (done) return;
      done = true;
      cleanup();
      if (!loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    };

    const readCookie = async () => {
      if (done || loginWindow.isDestroyed()) return;
      const cookies = await loginWindow.webContents.session.cookies.get({ name: "SESSDATA" });
      const cookie = chooseSessdataCookie(cookies);
      if (cookie?.value) {
        finish(null, cookie.value);
      }
    };

    loginWindow.once("ready-to-show", () => {
      loginWindow.show();
      loginWindow.focus();
    });

    loginWindow.on("closed", () => {
      finish(new Error("已取消获取 SESSDATA"));
    });

    loginWindow.webContents.on("did-finish-load", () => {
      readCookie().catch(() => {});
    });

    timer = setInterval(() => {
      readCookie().catch(() => {});
    }, 1000);

    timeout = setTimeout(() => {
      finish(new Error("获取超时，请确认已在 B 站登录"));
    }, 5 * 60 * 1000);

    loginWindow.loadURL("https://passport.bilibili.com/login").catch((error) => {
      finish(new Error(error.message || "打开 B 站登录页失败"));
    });
  });

  return sessdataFetchPromise;
}

function chooseSessdataCookie(cookies) {
  const now = Date.now() / 1000;
  return cookies
    .filter((cookie) => {
      const domain = String(cookie.domain || "").replace(/^\./, "");
      const expires = Number(cookie.expirationDate || 0);
      return domain.endsWith("bilibili.com") && (!expires || expires > now);
    })
    .sort((a, b) => Number(b.expirationDate || 0) - Number(a.expirationDate || 0))[0];
}

function chromeLikeUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
}

function getIconPath() {
  return path.join(__dirname, "../../assets/icon.png");
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(nextSettings) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(sanitizeSettings(nextSettings), null, 2));
  } catch {
    // Settings persistence should never break the floating window.
  }
}

function sanitizeSettings(value) {
  return {
    roomId: String(value.roomId || ""),
    alwaysOnTop: Boolean(value.alwaysOnTop),
    clickThrough: Boolean(value.clickThrough),
    locked: Boolean(value.locked),
    opacity: clampNumber(value.opacity, 35, 100, DEFAULT_SETTINGS.opacity),
    fontSize: clampNumber(value.fontSize, 12, 24, DEFAULT_SETTINGS.fontSize),
    maxItems: clampNumber(value.maxItems, 20, 200, DEFAULT_SETTINGS.maxItems),
    sessdata: String(value.sessdata || "").trim(),
    theme: value.theme === "dark" ? "dark" : "light"
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}
