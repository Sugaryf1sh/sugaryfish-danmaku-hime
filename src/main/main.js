const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, globalShortcut, dialog, net, session, shell, clipboard } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { BilibiliDanmakuClient } = require("./bilibiliClient");
const { DEFAULT_SETTINGS } = require("../shared/defaults");

const APP_NAME = "Sugaryfish的弹幕姬";
const UPDATE_REPO_OWNER = "Sugaryf1sh";
const UPDATE_REPO_NAME = "sugaryfish-danmaku-hime";
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`;
const UPDATE_MANIFEST_URLS = [
  `https://cdn.jsdelivr.net/gh/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}@main/updates/latest.json`,
  `https://fastly.jsdelivr.net/gh/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}@main/updates/latest.json`,
  `https://gcore.jsdelivr.net/gh/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}@main/updates/latest.json`,
  `https://raw.githubusercontent.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/main/updates/latest.json`
];
const UPDATE_TIMEOUT_MS = 12000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const UPDATE_DOWNLOAD_STALL_MS = 45000;
const UPDATE_MIRROR_PREFIXES = [
  "https://gh.llkk.cc/",
  "https://ghfast.top/",
  "https://ghproxy.net/"
];

let mainWindow = null;
let sessdataLoginWindow = null;
let sessdataFetchPromise = null;
let updateCheckPromise = null;
let updateDownloadInProgress = false;
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
  scheduleAutoUpdateCheck();
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
  // Keep the native window movable so frameless hover/leave behavior stays intact.
  // The renderer disables drag regions when "locked" is enabled.
  mainWindow.setMovable(true);
  mainWindow.setResizable(!nextSettings.locked);
  mainWindow.setOpacity(Math.max(0.35, Math.min(1, Number(nextSettings.opacity) / 100)));
  mainWindow.setIgnoreMouseEvents(Boolean(nextSettings.clickThrough), { forward: true });
}

ipcMain.handle("settings:get", () => settings);
ipcMain.handle("settings:update", (_event, patch) => setSettings(patch));
ipcMain.handle("app:get-info", () => ({
  version: app.getVersion()
}));
ipcMain.handle("update:check", async () => {
  try {
    return await checkForUpdates({ silent: false, prompt: true });
  } catch (error) {
    return { status: "error", message: buildUpdateErrorMessage(error) };
  }
});
ipcMain.handle("update:consume-notes", () => consumePendingUpdateNotes());
ipcMain.handle("shell:open-external", (_event, url) => {
  const href = String(url || "");
  if (!/^https:\/\/github\.com\/Sugaryf1sh\/sugaryfish-danmaku-hime(?:[/?#].*)?$/i.test(href)) {
    return { ok: false };
  }
  shell.openExternal(href);
  return { ok: true };
});
ipcMain.handle("clipboard:write-text", (_event, text) => {
  clipboard.writeText(String(text || ""));
  return { ok: true };
});

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

function scheduleAutoUpdateCheck() {
  setTimeout(() => {
    checkForUpdates({ silent: true, prompt: true }).catch((error) => {
      console.warn(`自动检查更新失败：${error.message}`);
    });
  }, 8000);
}

async function checkForUpdates({ silent, prompt }) {
  if (updateCheckPromise) {
    return updateCheckPromise;
  }

  updateCheckPromise = doCheckForUpdates({ silent, prompt }).finally(() => {
    updateCheckPromise = null;
  });

  return updateCheckPromise;
}

async function doCheckForUpdates({ silent, prompt }) {
  if (!silent) {
    notifyUpdateStatus({ state: "checking" });
  }

  try {
    await applyUpdateProxyFromEnvironment();
    const release = await loadLatestUpdateInfo();
    const currentVersion = app.getVersion();

    if (!release || !isVersionGreater(release.version, currentVersion)) {
      if (!silent) {
        notifyUpdateStatus({ state: "idle" });
      }
      return { status: "no-update", currentVersion, latestVersion: release?.version || currentVersion };
    }

    notifyUpdateStatus({ state: "available", release });

    if (!prompt) {
      return { status: "available", release };
    }

    const accepted = await askUserToApplyUpdate(release, currentVersion);
    if (!accepted) {
      if (!silent) {
        notifyUpdateStatus({ state: "idle" });
      }
      return { status: "skipped", release };
    }

    await downloadAndApplyUpdate(release);
    return { status: "installing", release };
  } catch (error) {
    const message = buildUpdateErrorMessage(error);
    if (!silent) {
      notifyUpdateStatus({ state: "error", message });
    }
    if (!silent) {
      throw new Error(message);
    }
    return { status: "error", message };
  }
}

async function loadLatestUpdateInfo() {
  const errors = [];
  const releases = [];

  for (const url of getUpdateManifestUrls()) {
    try {
      const manifest = await requestJson(url, {
        Accept: "application/json",
        "User-Agent": `${APP_NAME}/${app.getVersion()}`
      });
      const release = normalizeManifestRelease(manifest, url);
      if (release) {
        releases.push(release);
      }
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  try {
    const release = normalizeGitHubRelease(await requestJson(getUpdateApiUrl(), {
      Accept: "application/vnd.github+json",
      "User-Agent": `${APP_NAME}/${app.getVersion()}`
    }));
    if (release) {
      releases.push(release);
    }
  } catch (error) {
    errors.push(`GitHub API: ${error.message}`);
  }

  const latest = pickLatestRelease(releases);
  if (latest) {
    return latest;
  }

  throw new Error(`无法获取更新信息，已尝试国内 CDN 与 GitHub。${errors.slice(-2).join("；")}`);
}

function pickLatestRelease(releases) {
  return releases
    .filter((release) => release?.version)
    .sort((a, b) => compareVersions(b.version, a.version))[0] || null;
}

function getUpdateManifestUrls() {
  const custom = String(process.env.DANMAKU_UPDATE_MANIFEST_URL || "")
    .split(/[;,]/)
    .map((url) => url.trim())
    .filter(Boolean);
  return [...custom, ...UPDATE_MANIFEST_URLS];
}

function getUpdateApiUrl() {
  const apiBase = String(process.env.DANMAKU_GITHUB_API_BASE || "").trim().replace(/\/$/, "");
  if (!apiBase) {
    return UPDATE_API_URL;
  }
  return `${apiBase}/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`;
}

async function applyUpdateProxyFromEnvironment() {
  const proxy = String(
    process.env.DANMAKU_UPDATE_PROXY
    || process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY
    || process.env.ALL_PROXY
    || ""
  ).trim();

  if (!proxy) {
    return;
  }

  const proxyRules = normalizeProxyRules(proxy);
  if (!proxyRules) {
    return;
  }

  await session.defaultSession.setProxy({ proxyRules });
}

function normalizeProxyRules(value) {
  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    const host = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    if (!host) {
      return "";
    }
    if (parsed.protocol.startsWith("socks")) {
      return `socks=${host}`;
    }
    return `http=${host};https=${host}`;
  } catch {
    return value;
  }
}

function requestJson(url, headers = {}) {
  return requestText(url, { headers }).then((text) => JSON.parse(stripBom(text)));
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function requestText(url, { headers = {}, timeout = UPDATE_TIMEOUT_MS, redirectsLeft = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: "GET", url });
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error("连接超时"));
    }, timeout);

    for (const [key, value] of Object.entries(headers)) {
      request.setHeader(key, value);
    }

    request.on("response", (response) => {
      const statusCode = Number(response.statusCode || 0);
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectsLeft > 0) {
        clearTimeout(timer);
        resolve(requestText(new URL(location, url).toString(), { headers, timeout, redirectsLeft: redirectsLeft - 1 }));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        clearTimeout(timer);
        const body = Buffer.concat(chunks).toString("utf8");
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`服务返回异常状态：${statusCode}`));
          return;
        }
        resolve(body);
      });
      response.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    request.end();
  });
}

function normalizeManifestRelease(data, sourceUrl) {
  if (!data || data.draft || data.prerelease) {
    return null;
  }

  const version = normalizeVersion(data.version || data.tag || data.tag_name || "");
  const appPackage = normalizeUpdateAsset(data.package || data.appPackage || data.resourcePackage, `Sugaryfish的弹幕姬-App-${version}.zip`);
  const installer = normalizeUpdateAsset(data.installer, `Sugaryfish的弹幕姬-Setup-${version}.exe`);

  if (!version || (!appPackage && !installer)) {
    return null;
  }

  const notes = String(data.notes || data.body || "").trim();
  return {
    version,
    tag: data.tag || data.tag_name || `v${version}`,
    title: data.title || data.name || `Sugaryfish 的弹幕姬 ${version}`,
    notes,
    features: normalizeFeatures(data.features, notes),
    releaseUrl: data.releaseUrl || data.html_url || `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/tag/v${version}`,
    package: appPackage,
    installer,
    sourceUrl,
    publishedAt: data.publishedAt || data.published_at || ""
  };
}

function normalizeUpdateAsset(asset, fallbackName) {
  if (!asset) {
    return null;
  }

  if (typeof asset === "string") {
    return {
      type: inferUpdateAssetType(asset),
      name: basenameFromUrl(asset) || fallbackName,
      url: asset,
      sha256: ""
    };
  }

  const url = String(asset.url || asset.downloadUrl || asset.browser_download_url || "").trim();
  if (!url) {
    return null;
  }

  return {
    type: asset.type || inferUpdateAssetType(url),
    name: asset.name || basenameFromUrl(url) || fallbackName,
    url,
    sha256: normalizeSha256(asset.sha256 || asset.digest || "")
  };
}

function basenameFromUrl(value) {
  try {
    return decodeURIComponent(path.basename(new URL(value).pathname));
  } catch {
    return "";
  }
}

function inferUpdateAssetType(value) {
  const name = String(value || "").toLowerCase();
  if (name.endsWith(".asar")) {
    return "app-asar";
  }
  if (name.endsWith(".zip")) {
    return "app-dir-zip";
  }
  if (name.endsWith(".exe")) {
    return "installer";
  }
  return "app-dir-zip";
}

function normalizeGitHubRelease(data) {
  if (!data || data.draft || data.prerelease) {
    return null;
  }

  const version = normalizeVersion(data.tag_name || data.name || "");
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const notes = String(data.body || "").trim();
  const appPackageAsset = assets.find((asset) => {
    const name = String(asset.name || "");
    return name.endsWith(".zip") && name.includes(`App-${version}`);
  }) || assets.find((asset) => {
    const name = String(asset.name || "").toLowerCase();
    return name.endsWith(".zip") && /app|resource|update/.test(name);
  });
  const installerAsset = assets.find((asset) => {
    const name = String(asset.name || "");
    return name.endsWith(".exe") && name.includes(`Setup-${version}`);
  }) || assets.find((asset) => {
    const name = String(asset.name || "");
    return name.endsWith(".exe") && !name.endsWith(".blockmap");
  });

  if (!version || (!appPackageAsset && !installerAsset)) {
    return null;
  }

  const appPackage = appPackageAsset ? {
    type: inferUpdateAssetType(appPackageAsset.name),
    name: appPackageAsset.name,
    url: appPackageAsset.browser_download_url,
    sha256: normalizeSha256(appPackageAsset.digest || parseNotesSha256(notes, appPackageAsset.name))
  } : null;
  const installer = installerAsset ? {
    type: "installer",
    name: installerAsset.name,
    url: installerAsset.browser_download_url,
    sha256: normalizeSha256(installerAsset.digest || parseNotesSha256(notes, installerAsset.name))
  } : null;

  return {
    version,
    tag: data.tag_name || `v${version}`,
    title: data.name || `Sugaryfish 的弹幕姬 ${version}`,
    notes,
    features: extractReleaseFeatures(notes),
    releaseUrl: data.html_url || `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/tag/v${version}`,
    package: appPackage,
    installer,
    sourceUrl: data.html_url || "GitHub Release",
    publishedAt: data.published_at || ""
  };
}

function normalizeVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

function normalizeSha256(value) {
  const text = String(value || "").trim().replace(/^sha256:/i, "");
  const match = text.match(/[a-f0-9]{64}/i);
  return match ? match[0].toLowerCase() : "";
}

function parseNotesSha256(notes, assetName) {
  const lines = String(notes || "").split(/\r?\n/);
  const exactLine = lines.find((line) => assetName && line.includes(assetName) && /[a-f0-9]{64}/i.test(line));
  const fallbackLine = lines.find((line) => /sha256/i.test(line) && /[a-f0-9]{64}/i.test(line));
  return normalizeSha256(exactLine || fallbackLine || "");
}

function isVersionGreater(next, current) {
  return compareVersions(next, current) > 0;
}

function compareVersions(next, current) {
  const nextParts = normalizeVersion(next).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = normalizeVersion(current).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(nextParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = nextParts[index] || 0;
    const b = currentParts[index] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
}

function normalizeFeatures(features, notes) {
  if (Array.isArray(features)) {
    return features.map((feature) => String(feature).trim()).filter(Boolean).slice(0, 6);
  }
  return extractReleaseFeatures(notes);
}

function extractReleaseFeatures(notes) {
  const bullets = String(notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/sha256/i.test(line));

  if (bullets.length) {
    return bullets.slice(0, 6);
  }

  return String(notes || "")
    .split(/\r?\n{2,}/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/sha256/i.test(line))
    .slice(0, 4);
}

async function askUserToApplyUpdate(release, currentVersion) {
  if (!release.package) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["知道了"],
      defaultId: 0,
      title: "无法免安装更新",
      message: `发现 ${release.version}，当前版本 ${currentVersion}`,
      detail: "这个版本没有提供免安装资源包。为了避免重新安装，已停止自动更新。"
    });
    return false;
  }

  if (!release.package.sha256) {
    await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["知道了"],
      defaultId: 0,
      title: "更新包缺少校验值",
      message: `发现 ${release.version}，当前版本 ${currentVersion}`,
      detail: "该更新包缺少 SHA256 校验值。为了保证国内加速下载的安全性，已停止自动更新。"
    });
    return false;
  }

  const featureText = release.features.length
    ? release.features.map((feature) => `- ${feature}`).join("\n")
    : release.notes || "GitHub Release 未提供详细更新说明。";

  const result = await dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["立即更新", "稍后"],
    defaultId: 0,
    cancelId: 1,
    title: "发现新版本",
    message: `发现 ${release.version}，当前版本 ${currentVersion}`,
    detail: `${release.title}\n\n${featureText}\n\n本次将下载轻量资源包并替换应用文件，不会重新安装，也不会清除设置。国内网络会优先使用 CDN，并自动尝试 GitHub 加速节点；下载完成后会校验 SHA256。`
  });

  return result.response === 0;
}

async function downloadAndApplyUpdate(release) {
  if (updateDownloadInProgress) {
    return;
  }
  if (!release.package) {
    throw new Error("该版本没有免安装更新包");
  }
  if (!release.package.sha256) {
    throw new Error("更新包缺少 SHA256 校验值");
  }
  if (!app.isPackaged && process.env.DANMAKU_ALLOW_DEV_UPDATE !== "1") {
    throw new Error("开发模式下不会执行自动替换，打包版本会正常更新");
  }

  updateDownloadInProgress = true;
  notifyUpdateStatus({ state: "downloading", release, progress: 0 });

  try {
    const target = getResourceUpdateTarget(release.package.type);
    const updaterDir = path.join(app.getPath("temp"), "sugaryfish-danmaku-hime-updater");
    fs.rmSync(updaterDir, { recursive: true, force: true });
    fs.mkdirSync(updaterDir, { recursive: true });

    const packagePath = path.join(updaterDir, safeFilename(release.package.name || `Sugaryfish的弹幕姬-App-${release.version}.zip`));
    const downloaded = await downloadFileWithFallback(release.package.url, packagePath, (progress, sourceLabel, receivedBytes = 0) => {
      notifyUpdateStatus({ state: "downloading", release, progress, sourceLabel, receivedBytes });
    }, release.package.sha256);

    const actualSha = await sha256File(downloaded);
    if (actualSha !== release.package.sha256) {
      fs.rmSync(downloaded, { force: true });
      throw new Error("更新包 SHA256 校验失败");
    }

    const notesSource = path.join(updaterDir, "pending-update-notes.json");
    writePendingUpdateNotesFile(notesSource, release);
    notifyUpdateStatus({ state: "installing", release, progress: 100 });
    launchResourceUpdaterAndQuit({ packagePath: downloaded, notesSource, target, expectedVersion: release.version });
  } finally {
    updateDownloadInProgress = false;
  }
}

function getResourceUpdateTarget(packageType) {
  const resourcesPath = path.resolve(process.resourcesPath || "");
  const appPath = path.resolve(app.getAppPath());
  const appDir = path.join(resourcesPath, "app");
  const asarPath = path.join(resourcesPath, "app.asar");
  const mode = packageType === "app-asar" ? "app-asar" : "app-dir";
  const targetPath = mode === "app-asar" ? asarPath : (path.basename(appPath).toLowerCase() === "app" ? appPath : appDir);

  if (!isPathInside(targetPath, resourcesPath)) {
    throw new Error("更新目标路径校验失败");
  }
  if (mode === "app-dir" && path.basename(targetPath).toLowerCase() !== "app") {
    throw new Error("应用目录结构不支持免安装更新");
  }
  if (mode === "app-asar" && path.basename(targetPath).toLowerCase() !== "app.asar") {
    throw new Error("应用归档结构不支持免安装更新");
  }

  return { mode, targetPath, resourcesPath, currentExe: process.execPath };
}

function isPathInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function downloadFileWithFallback(url, destination, onProgress, expectedSha256 = "") {
  const candidates = buildDownloadCandidates(url);
  const errors = [];

  for (const candidate of candidates) {
    try {
      fs.rmSync(destination, { force: true });
      onProgress(1, candidate.label, 0);
      await downloadFile(candidate.url, destination, (progress, receivedBytes = 0) => onProgress(progress, candidate.label, receivedBytes));
      if (expectedSha256) {
        const actualSha = await sha256File(destination);
        if (actualSha !== expectedSha256) {
          fs.rmSync(destination, { force: true });
          errors.push(`${candidate.label}: SHA256 校验失败`);
          continue;
        }
      }
      return destination;
    } catch (error) {
      errors.push(`${candidate.label}: ${error.message}`);
    }
  }

  throw new Error(`下载更新失败，已尝试 ${candidates.map((candidate) => candidate.label).join("、")}。${errors.slice(-2).join("；")}`);
}

function buildDownloadCandidates(url) {
  const candidates = [];
  const customPrefix = String(process.env.DANMAKU_UPDATE_PROXY_PREFIX || "").trim();
  if (customPrefix) {
    candidates.push({ label: "自定义加速", url: joinMirrorPrefix(customPrefix, url) });
  }

  if (isJsDelivrUrl(url)) {
    candidates.push({ label: "CDN", url });
  }

  for (const cdnUrl of buildJsDelivrAlternates(url)) {
    candidates.push({ label: "CDN", url: cdnUrl });
  }

  const githubUrls = isGitHubDownloadUrl(url) ? [url] : buildGitHubRawAlternates(url);
  for (const githubUrl of githubUrls) {
    for (const prefix of getPreferredMirrorPrefixes()) {
      candidates.push({ label: "国内加速", url: joinMirrorPrefix(prefix, githubUrl) });
    }
    if (githubUrl !== url) {
      candidates.push({ label: "GitHub 直连", url: githubUrl });
    }
    for (const prefix of getMirrorPrefixes().filter((prefix) => !getPreferredMirrorPrefixes().includes(prefix))) {
      candidates.push({ label: "国内加速", url: joinMirrorPrefix(prefix, githubUrl) });
    }
  }

  if (!isJsDelivrUrl(url)) {
    candidates.push({ label: "原始源", url });
  }

  return dedupeCandidates(candidates);
}

function getPreferredMirrorPrefixes() {
  return ["https://ghproxy.net/"];
}

function getMirrorPrefixes() {
  const custom = String(process.env.DANMAKU_UPDATE_MIRROR_PREFIXES || "")
    .split(/[;,]/)
    .map((prefix) => prefix.trim())
    .filter(Boolean);
  return custom.length ? custom : UPDATE_MIRROR_PREFIXES;
}

function buildJsDelivrAlternates(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!["cdn.jsdelivr.net", "fastly.jsdelivr.net", "gcore.jsdelivr.net"].includes(host)) {
      return [];
    }
    return ["cdn.jsdelivr.net", "fastly.jsdelivr.net", "gcore.jsdelivr.net"]
      .filter((candidateHost) => candidateHost !== host)
      .map((candidateHost) => {
        const next = new URL(parsed.toString());
        next.hostname = candidateHost;
        return next.toString();
      });
  } catch {
    return [];
  }
}

function isJsDelivrUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["cdn.jsdelivr.net", "fastly.jsdelivr.net", "gcore.jsdelivr.net"].includes(host);
  } catch {
    return false;
  }
}

function buildGitHubRawAlternates(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!["cdn.jsdelivr.net", "fastly.jsdelivr.net", "gcore.jsdelivr.net"].includes(host)) {
      return [];
    }

    const match = parsed.pathname.match(/^\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(.+)$/);
    if (!match) {
      return [];
    }

    const [, owner, repo, ref, filePath] = match;
    return [`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`];
  } catch {
    return [];
  }
}

function isGitHubDownloadUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host.endsWith("githubusercontent.com");
  } catch {
    return false;
  }
}

function joinMirrorPrefix(prefix, url) {
  return `${prefix.replace(/\/?$/, "/")}${url}`;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
}

function downloadFile(url, destination, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    const request = net.request({ method: "GET", url });
    request.setHeader("User-Agent", `${APP_NAME}/${app.getVersion()}`);

    let finished = false;
    let timeoutTimer = null;
    let stallTimer = null;
    let file = null;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearTimeout(stallTimer);
    };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      file?.destroy();
      reject(error);
    };
    const resetStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        request.abort();
        fail(new Error("下载长时间无响应"));
      }, UPDATE_DOWNLOAD_STALL_MS);
    };

    timeoutTimer = setTimeout(() => {
      request.abort();
      fail(new Error("下载更新超时"));
    }, UPDATE_DOWNLOAD_TIMEOUT_MS);
    resetStallTimer();

    request.on("response", (response) => {
      resetStallTimer();
      const statusCode = Number(response.statusCode || 0);
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectsLeft > 0) {
        cleanup();
        resolve(downloadFile(new URL(location, url).toString(), destination, onProgress, redirectsLeft - 1));
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        fail(new Error(`下载服务返回异常状态：${statusCode}`));
        return;
      }

      const total = Number(response.headers["content-length"] || 0);
      let received = 0;
      file = fs.createWriteStream(destination);

      response.on("data", (chunk) => {
        resetStallTimer();
        received += chunk.length;
        if (total > 0) {
          onProgress(Math.min(99, Math.round((received / total) * 100)));
        } else {
          const softProgress = Math.min(92, 3 + Math.floor(received / 32768));
          onProgress(softProgress, received);
        }
      });

      response.pipe(file);

      response.on("end", () => {
        clearTimeout(stallTimer);
      });

      response.on("error", fail);
      file.on("error", fail);
      file.on("finish", () => {
        if (finished) return;
        finished = true;
        cleanup();
        file.close(() => resolve(destination));
      });
    });

    request.on("error", fail);
    request.end();
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function safeFilename(value) {
  return String(value || "update.zip").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function launchResourceUpdaterAndQuit({ packagePath, notesSource, target, expectedVersion }) {
  const scriptPath = path.join(path.dirname(packagePath), "apply-resource-update.ps1");
  const notesTarget = getPendingUpdateNotesPath();
  const script = `param(
  [string]$PackagePath,
  [string]$TargetPath,
  [string]$ResourcesPath,
  [string]$CurrentExe,
  [string]$NotesSource,
  [string]$NotesTarget,
  [string]$Mode,
  [int]$ParentProcessId,
  [string]$ExpectedVersion
)
$ErrorActionPreference = "Stop"
$log = Join-Path $env:TEMP "sugaryfish-update-error.log"
$stage = Join-Path $env:TEMP ("sugaryfish-update-stage-" + [guid]::NewGuid().ToString("N"))
$backup = $null
$resolvedTarget = $null
$success = $false

function Write-UpdateLog {
  param([string]$Message)
  $timestamp = (Get-Date).ToString("s")
  Add-Content -LiteralPath $log -Value ("[" + $timestamp + "] " + $Message) -Encoding UTF8
}

function Write-UpdateResult {
  param(
    [string]$Status,
    [string]$Message
  )
  try {
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $NotesTarget)) | Out-Null
    $payload = [ordered]@{
      version = $ExpectedVersion
      title = if ($Status -eq "success") { "更新完成" } else { "更新失败" }
      failed = ($Status -ne "success")
      status = $Status
      message = $Message
      features = @($Message)
      shownAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $payload | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $NotesTarget -Encoding UTF8
  } catch {
    Write-UpdateLog ("Write result failed: " + $_.Exception.Message)
  }
}

function Invoke-WithRetry {
  param(
    [scriptblock]$Action,
    [string]$Label,
    [int]$Attempts = 50,
    [int]$DelayMs = 400
  )
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      & $Action
      return
    } catch {
      if ($i -ge $Attempts) {
        throw ($Label + " failed after " + $Attempts + " attempts: " + $_.Exception.Message)
      }
      Start-Sleep -Milliseconds $DelayMs
    }
  }
}

function Read-AppVersion {
  param([string]$AppPath)
  $packageFile = Join-Path $AppPath "package.json"
  if (!(Test-Path -LiteralPath $packageFile)) {
    return ""
  }
  try {
    return [string]((Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json).version)
  } catch {
    return ""
  }
}

try {
  Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
  Write-UpdateLog "Updater started"
  Write-UpdateResult "pending" "正在替换应用资源，请稍候。"
  if ($ParentProcessId -gt 0) {
    try {
      Wait-Process -Id $ParentProcessId -Timeout 20 -ErrorAction SilentlyContinue
    } catch {
      Write-UpdateLog ("Parent wait skipped: " + $_.Exception.Message)
    }
  }
  Start-Sleep -Milliseconds 1200

  $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)
  $resolvedResources = [System.IO.Path]::GetFullPath($ResourcesPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $targetParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $resolvedTarget)).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  if (![System.String]::Equals($targetParent, $resolvedResources, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Target path is outside resources"
  }

  Invoke-WithRetry { [System.IO.Directory]::CreateDirectory($stage) | Out-Null } "Create staging directory"

  if ($Mode -eq "app-dir") {
    if ((Split-Path -Leaf $resolvedTarget) -ne "app") {
      throw "Target guard failed"
    }
    Invoke-WithRetry { Expand-Archive -LiteralPath $PackagePath -DestinationPath $stage -Force } "Expand update package"
    $sourceApp = Join-Path $stage "app"
    if (!(Test-Path -LiteralPath (Join-Path $sourceApp "package.json"))) {
      throw "Update package is missing app/package.json"
    }
    $sourceVersion = Read-AppVersion $sourceApp
    if ($ExpectedVersion -and $sourceVersion -ne $ExpectedVersion) {
      throw ("Update package version mismatch: expected " + $ExpectedVersion + ", got " + $sourceVersion)
    }

    $backup = Join-Path (Split-Path -Parent $resolvedTarget) ("app.backup." + (Get-Date -Format "yyyyMMddHHmmss"))
    if (Test-Path -LiteralPath $resolvedTarget) {
      Invoke-WithRetry { Move-Item -LiteralPath $resolvedTarget -Destination $backup -Force } "Move current app to backup"
    }
    Invoke-WithRetry { Move-Item -LiteralPath $sourceApp -Destination $resolvedTarget -Force } "Move new app into place"
    $installedVersion = Read-AppVersion $resolvedTarget
    if ($ExpectedVersion -and $installedVersion -ne $ExpectedVersion) {
      throw ("Installed version mismatch: expected " + $ExpectedVersion + ", got " + $installedVersion)
    }
  } elseif ($Mode -eq "app-asar") {
    if ((Split-Path -Leaf $resolvedTarget) -ne "app.asar") {
      throw "Target guard failed"
    }
    $backup = $resolvedTarget + ".backup." + (Get-Date -Format "yyyyMMddHHmmss")
    if (Test-Path -LiteralPath $resolvedTarget) {
      Invoke-WithRetry { Move-Item -LiteralPath $resolvedTarget -Destination $backup -Force } "Move current asar to backup"
    }
    Invoke-WithRetry { Copy-Item -LiteralPath $PackagePath -Destination $resolvedTarget -Force } "Copy new asar into place"
  } else {
    throw "Unsupported update mode"
  }

  Invoke-WithRetry { [System.IO.Directory]::CreateDirectory((Split-Path -Parent $NotesTarget)) | Out-Null } "Create notes directory"
  Invoke-WithRetry { Copy-Item -LiteralPath $NotesSource -Destination $NotesTarget -Force } "Copy update notes"
  $success = $true
  Write-UpdateLog "Updater finished successfully"
} catch {
  $failureText = ($_ | Out-String).Trim()
  Write-UpdateLog ("Updater failed: " + $failureText)
  Write-UpdateResult "failed" $failureText
  if ($backup -and (Test-Path -LiteralPath $backup)) {
    try {
      if ($resolvedTarget -and (Test-Path -LiteralPath $resolvedTarget)) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force -ErrorAction SilentlyContinue
      }
      if ($resolvedTarget -and !(Test-Path -LiteralPath $resolvedTarget)) {
        Move-Item -LiteralPath $backup -Destination $resolvedTarget -Force
        Write-UpdateLog "Backup restored"
      }
    } catch {
      Write-UpdateLog ("Backup restore failed: " + $_.Exception.Message)
    }
  }
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $CurrentExe) {
    Start-Process -FilePath $CurrentExe -ErrorAction SilentlyContinue
  }
}
if (!$success) { exit 1 }
`;

  fs.writeFileSync(scriptPath, `\ufeff${script}`, "utf8");
  const powershellPath = getWindowsPowerShellPath();
  const child = spawn(powershellPath, [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", scriptPath,
    "-PackagePath", packagePath,
    "-TargetPath", target.targetPath,
    "-ResourcesPath", target.resourcesPath,
    "-CurrentExe", target.currentExe,
    "-NotesSource", notesSource,
    "-NotesTarget", notesTarget,
    "-Mode", target.mode,
    "-ParentProcessId", String(process.pid),
    "-ExpectedVersion", expectedVersion || ""
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.on("error", (error) => {
    try {
      fs.appendFileSync(path.join(app.getPath("temp"), "sugaryfish-update-error.log"), `Updater launch failed: ${error.message}\n`);
    } catch {
      // The updater is already in a best-effort shutdown path.
    }
  });
  child.unref();

  app.isQuitting = true;
  app.quit();
  setTimeout(() => app.exit(0), 500).unref();
}

function getWindowsPowerShellPath() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const powershellPath = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return fs.existsSync(powershellPath) ? powershellPath : "powershell.exe";
}

function writePendingUpdateNotesFile(file, release) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(buildPendingUpdateNotesPayload(release), null, 2));
}

function savePendingUpdateNotes(release) {
  writePendingUpdateNotesFile(getPendingUpdateNotesPath(), release);
}

function buildPendingUpdateNotesPayload(release) {
  return {
    version: release.version,
    title: release.title,
    notes: release.notes,
    features: release.features,
    releaseUrl: release.releaseUrl,
    publishedAt: release.publishedAt,
    shownAt: new Date().toISOString()
  };
}

function consumePendingUpdateNotes() {
  try {
    const file = getPendingUpdateNotesPath();
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.rmSync(file, { force: true });
    return payload;
  } catch {
    return null;
  }
}

function getPendingUpdateNotesPath() {
  return path.join(app.getPath("userData"), "pending-update-notes.json");
}

function notifyUpdateStatus(payload) {
  mainWindow?.webContents.send("update:status", payload);
}

function buildUpdateErrorMessage(error) {
  const message = error?.message || "检查更新失败";
  if (message.includes("已自动尝试国内 CDN")) {
    return message;
  }
  return `${message}。已自动尝试国内 CDN、直连和可校验的 GitHub 加速下载。`;
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
    copyOnTagClick: Boolean(value.copyOnTagClick),
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
