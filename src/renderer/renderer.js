const api = window.danmakuApp;
const MEGA_GIFT_THRESHOLD = 100;
const MEGA_GIFT_DURATION = 12000;
const MEGA_GIFT_LEAVE_DELAY = 11500;
const UPDATE_IDLE_TEXT = "检查更新";
const UPDATE_LATEST_TEXT = "已是最新版本";

const state = {
  settings: null,
  connected: false,
  roomText: "",
  popularityText: "",
  popularityRaw: 0,
  popularityTrend: "",
  popularityTrendTimer: null,
  statusFlashTimer: null,
  statusPulseTimer: null,
  statusModeTipTimer: null,
  updateBannerTimer: null,
  clickThroughWakeTimer: null,
  clickThroughNoticeShown: false,
  startTime: Date.now(),
  uptimeTimer: null,
  hudDimTimer: null,
  messageCount: 0,
  updateButtonText: UPDATE_IDLE_TEXT,
  isFeedHovered: false,
  isFeedScrolledUp: false,
  isMutatingFeed: false,
  hasFeedScrollIntent: false,
  newMessagesWhileLocked: 0,
  items: []
};

const els = {
  statusText: document.getElementById("statusText"),
  appContainer: document.querySelector(".app-container"),
  headerSection: document.querySelector(".header-section"),
  statusDot: document.querySelector(".status-dot"),
  statusModeTip: document.getElementById("statusModeTip"),
  roomInput: document.getElementById("roomInput"),
  connectForm: document.getElementById("connectForm"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  settingsToggle: document.getElementById("settingsToggle"),
  topToggle: document.getElementById("topToggle"),
  throughToggle: document.getElementById("throughToggle"),
  lockToggle: document.getElementById("lockToggle"),
  copyToggle: document.getElementById("copyToggle"),
  opacityRange: document.getElementById("opacityRange"),
  fontRange: document.getElementById("fontRange"),
  maxRange: document.getElementById("maxRange"),
  opacityValue: document.getElementById("opacityValue"),
  fontValue: document.getElementById("fontValue"),
  maxValue: document.getElementById("maxValue"),
  sessdataField: document.getElementById("sessdataField"),
  sessdataInput: document.getElementById("sessdataInput"),
  sessdataMask: document.getElementById("sessdataMask"),
  sessdataSummary: document.getElementById("sessdataSummary"),
  fetchSessdataBtn: document.getElementById("fetchSessdataBtn"),
  clearSessdataBtn: document.getElementById("clearSessdataBtn"),
  updateBtn: document.getElementById("updateBtn"),
  helpMenu: document.querySelector(".help-menu"),
  updateBanner: document.getElementById("updateBanner"),
  updateBannerTitle: document.getElementById("updateBannerTitle"),
  updateBannerBody: document.getElementById("updateBannerBody"),
  updateBannerClose: document.getElementById("updateBannerClose"),
  updateProgress: document.getElementById("updateProgress"),
  updateProgressBar: document.getElementById("updateProgressBar"),
  megaGiftZone: document.getElementById("megaGiftZone"),
  feed: document.getElementById("feed"),
  runTime: document.getElementById("run-time"),
  msgCount: document.getElementById("msg-count"),
  themeToggle: document.getElementById("themeToggle"),
  minimizeBtn: document.getElementById("minimizeBtn"),
  hideBtn: document.getElementById("hideBtn")
};

init();

async function init() {
  state.settings = await api.getSettings();
  applySettings(state.settings);
  updateRuntimeDashboard();
  state.uptimeTimer = setInterval(updateRuntimeDashboard, 60000);
  bindEvents();
  bindIpc();
  consumeUpdateNotes();
}

function bindEvents() {
  document.body.addEventListener("mouseenter", handleHudWake);
  document.body.addEventListener("mouseleave", scheduleHudDim);
  document.addEventListener("pointermove", handleHudPointerMove);
  document.addEventListener("mousemove", handleHudPointerMove);
  els.feed.addEventListener("mouseenter", handleFeedHoverStart);
  els.feed.addEventListener("mouseleave", handleFeedHoverEnd);
  els.feed.addEventListener("pointerover", syncInkFocus);
  els.feed.addEventListener("pointermove", syncInkFocus);
  els.feed.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget || !els.feed.contains(event.relatedTarget)) {
      clearInkFocus();
    }
  });
  document.addEventListener("pointermove", syncFeedHoverFromPointer);
  document.addEventListener("mouseleave", handleFeedHoverEnd);
  els.feed.addEventListener("wheel", () => {
    if (isClickThroughMode()) {
      return;
    }
    state.hasFeedScrollIntent = true;
  }, { passive: true });
  els.feed.addEventListener("pointerdown", (event) => {
    if (isClickThroughMode()) {
      return;
    }
    if (isPointerOnFeedScrollbar(event)) {
      state.hasFeedScrollIntent = true;
    }
  });
  els.feed.addEventListener("scroll", () => {
    updateFeedScrollState();
  });

  els.connectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const roomId = els.roomInput.value.trim();
    if (!roomId) {
      setStatus("请输入直播间号");
      return;
    }

    setStatus("正在连接");
    els.connectBtn.disabled = true;
    try {
      await api.connect(roomId);
    } catch (error) {
      setStatus(error.message || "连接失败");
      els.connectBtn.disabled = false;
    }
  });

  els.disconnectBtn.addEventListener("click", async () => {
    await api.disconnect();
    state.connected = false;
    els.connectBtn.disabled = false;
    document.body.classList.remove("is-settings-collapsed");
    syncConnectionUi(false);
    setStatus("已断开");
  });

  els.settingsToggle.addEventListener("click", () => {
    document.body.classList.toggle("is-settings-collapsed");
    updateSettingsToggleText();
  });

  els.topToggle.addEventListener("click", () => updateSetting("alwaysOnTop", !state.settings.alwaysOnTop));
  els.throughToggle.addEventListener("click", () => updateSetting("clickThrough", !state.settings.clickThrough));
  els.lockToggle.addEventListener("click", () => updateSetting("locked", !state.settings.locked));
  els.copyToggle.addEventListener("click", () => updateSetting("copyOnTagClick", !state.settings.copyOnTagClick));
  els.opacityRange.addEventListener("input", () => updateSetting("opacity", Number(els.opacityRange.value)));
  els.fontRange.addEventListener("input", () => updateSetting("fontSize", Number(els.fontRange.value)));
  els.maxRange.addEventListener("input", () => updateSetting("maxItems", Number(els.maxRange.value)));
  bindScrubbableNumber(els.opacityValue, "opacity", els.opacityRange, 35, 100, 1, (value) => `${value}%`);
  bindScrubbableNumber(els.fontValue, "fontSize", els.fontRange, 12, 24, 1, String);
  bindScrubbableNumber(els.maxValue, "maxItems", els.maxRange, 20, 200, 10, String);
  els.sessdataMask.addEventListener("click", beginSessdataEdit);
  els.sessdataInput.addEventListener("change", () => updateSetting("sessdata", els.sessdataInput.value.trim()));
  els.sessdataInput.addEventListener("blur", endSessdataEdit);
  els.sessdataInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" && event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    els.sessdataInput.blur();
  });
  els.fetchSessdataBtn.addEventListener("click", handleSessdataFetch);
  els.updateBtn.addEventListener("click", handleUpdateCheck);
  els.helpMenu?.addEventListener("mouseenter", resetUpdateButtonResult);
  els.helpMenu?.addEventListener("focusin", resetUpdateButtonResult);
  document.querySelectorAll("[data-external-url]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      api.openExternal?.(link.getAttribute("data-external-url"));
    });
  });
  els.updateBannerClose.addEventListener("click", hideUpdateBanner);
  els.clearSessdataBtn.addEventListener("click", () => {
    endSessdataEdit();
    updateSetting("sessdata", "");
  });
  els.themeToggle.addEventListener("click", () => {
    const nextTheme = state.settings.theme === "dark" ? "light" : "dark";
    updateSetting("theme", nextTheme);
  });
  els.minimizeBtn.addEventListener("click", () => api.minimize());
  els.hideBtn.addEventListener("click", () => api.hide());
}

function bindIpc() {
  api.onSettingsChanged((nextSettings) => {
    state.settings = nextSettings;
    applySettings(nextSettings);
  });

  api.onStatus((status) => {
    setStatus(status.text || status.state || "");
    const connectedUi = status.state === "connected" || status.state === "reconnecting";
    state.connected = status.state === "connected";
    els.connectBtn.disabled = ["connecting", "connected", "reconnecting"].includes(status.state);
    syncConnectionUi(connectedUi);
    if (status.state === "connected") {
      document.body.classList.add("is-settings-collapsed");
    }
    if (["disconnected", "error"].includes(status.state)) {
      els.connectBtn.disabled = false;
      document.body.classList.remove("is-settings-collapsed");
    }
    updateSettingsToggleText();
    if (status.state === "connected") {
      state.roomText = status.text.replace("已连接", "").trim();
      renderHeaderStatus();
    }
  });

  api.onPopularity((value) => {
    const nextPopularity = Number(value) || 0;
    const previousPopularity = state.popularityRaw;
    state.popularityRaw = nextPopularity;
    state.popularityText = formatNumber(value);
    state.popularityTrend = "";
    if (previousPopularity > 0 && nextPopularity !== previousPopularity) {
      state.popularityTrend = nextPopularity > previousPopularity ? "up" : "down";
      clearTimeout(state.popularityTrendTimer);
      state.popularityTrendTimer = setTimeout(() => {
        state.popularityTrend = "";
        renderHeaderStatus();
      }, 1500);
    }
    renderHeaderStatus();
  });

  api.onEvent((event) => {
    appendItem(event);
  });

  api.onUpdateStatus((status) => {
    handleUpdateStatus(status);
  });
}

async function updateSetting(key, value) {
  state.settings = await api.updateSettings({ [key]: value });
  applySettings(state.settings);
}

function bindScrubbableNumber(output, key, range, min, max, step, format) {
  let drag = null;

  output.tabIndex = 0;
  output.title = "左右拖动调整";
  output.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    output.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: Number(range.value)
    };
    document.body.classList.add("is-scrubbing");
    output.classList.add("is-scrubbing");
  });

  output.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaSteps = Math.round((event.clientX - drag.startX) / 8);
    const next = clampToStep(drag.startValue + deltaSteps * step, min, max, step);
    range.value = next;
    output.textContent = format(next);
    updateSetting(key, next);
  });

  output.addEventListener("pointerup", () => {
    drag = null;
    endScrub(output);
  });
  output.addEventListener("pointercancel", () => {
    drag = null;
    endScrub(output);
  });
  output.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
    const next = clampToStep(Number(range.value) + direction * step, min, max, step);
    updateSetting(key, next);
  });
}

function endScrub(output) {
  document.body.classList.remove("is-scrubbing");
  output.classList.remove("is-scrubbing");
}

function clampToStep(value, min, max, step) {
  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(clamped / step) * step;
}

function applySettings(settings) {
  const wasClickThrough = document.body.classList.contains("is-click-through");
  els.roomInput.value = settings.roomId || els.roomInput.value || "";
  els.opacityRange.value = settings.opacity;
  els.fontRange.value = settings.fontSize;
  els.maxRange.value = settings.maxItems;
  els.opacityValue.textContent = `${settings.opacity}%`;
  els.fontValue.textContent = settings.fontSize;
  els.maxValue.textContent = settings.maxItems;
  els.sessdataInput.value = settings.sessdata || "";
  renderSessdataSummary(settings.sessdata || "");
  applyTheme(settings.theme);
  els.topToggle.classList.toggle("active", Boolean(settings.alwaysOnTop));
  updateToggleMark(els.topToggle, settings.alwaysOnTop);
  els.throughToggle.classList.toggle("active", Boolean(settings.clickThrough));
  updateToggleMark(els.throughToggle, settings.clickThrough);
  els.lockToggle.classList.toggle("active", Boolean(settings.locked));
  updateToggleMark(els.lockToggle, settings.locked);
  els.copyToggle.classList.toggle("active", Boolean(settings.copyOnTagClick));
  updateToggleMark(els.copyToggle, settings.copyOnTagClick);
  document.body.classList.toggle("is-locked", Boolean(settings.locked));
  document.body.classList.toggle("is-click-through", Boolean(settings.clickThrough));
  document.body.classList.toggle("is-tag-copy-enabled", Boolean(settings.copyOnTagClick));
  document.body.classList.toggle("is-opaque", Number(settings.opacity) >= 100);
  updateCopyHintTitles(Boolean(settings.copyOnTagClick));
  syncClickThroughMode(Boolean(settings.clickThrough), wasClickThrough);
  updateSettingsToggleText();
  els.feed.style.setProperty("--feed-font-size", `${settings.fontSize}px`);
  trimItems();
}

function beginSessdataEdit() {
  els.sessdataField.classList.add("is-editing");
  els.sessdataInput.focus();
  els.sessdataInput.select();
}

function endSessdataEdit() {
  els.sessdataField.classList.remove("is-editing");
}

function renderSessdataSummary(value) {
  const hasSecret = Boolean(value);
  els.sessdataField.classList.toggle("has-secret", hasSecret);
  els.sessdataSummary.textContent = hasSecret ? "已保存" : "未填写";
}

async function handleSessdataFetch() {
  endSessdataEdit();
  const originalText = els.fetchSessdataBtn.textContent;
  els.fetchSessdataBtn.disabled = true;
  els.fetchSessdataBtn.textContent = "获取中";
  flashStatus("请在弹出的 B 站窗口登录");

  try {
    await api.fetchSessdata();
    flashStatus("SESSDATA 已保存");
  } catch (error) {
    flashStatus(error.message || "获取 SESSDATA 失败", 2400);
  } finally {
    els.fetchSessdataBtn.disabled = false;
    els.fetchSessdataBtn.textContent = originalText;
  }
}

async function handleUpdateCheck() {
  if (!api.checkForUpdates) {
    flashStatus("当前版本不支持自动更新", 2400);
    return;
  }

  let keepResultText = false;
  els.updateBtn.disabled = true;
  setUpdateButtonText("检查中");
  try {
    const result = await api.checkForUpdates();
    if (result?.status === "no-update") {
      flashStatus("已是最新版", 2000);
      setUpdateButtonText(UPDATE_LATEST_TEXT);
      keepResultText = true;
    } else if (result?.status === "skipped") {
      flashStatus("已稍后更新", 1600);
    } else if (result?.status === "error") {
      flashStatus(formatUpdateError(result.message), 3200);
    }
  } catch (error) {
    flashStatus(formatUpdateError(error), 3200);
  } finally {
    if (!els.updateBtn.dataset.busy) {
      els.updateBtn.disabled = false;
      if (!keepResultText) {
        setUpdateButtonText(UPDATE_IDLE_TEXT);
      }
    }
  }
}

function resetUpdateButtonResult() {
  if (!els.updateBtn || els.updateBtn.disabled || els.updateBtn.dataset.busy) {
    return;
  }
  if (state.updateButtonText === UPDATE_LATEST_TEXT) {
    setUpdateButtonText(UPDATE_IDLE_TEXT);
  }
}

function handleUpdateStatus(status = {}) {
  if (!els.updateBtn) {
    return;
  }

  if (status.state === "checking") {
    els.updateBtn.dataset.busy = "1";
    els.updateBtn.disabled = true;
    setUpdateButtonText("检查中");
    showUpdateBanner({
      title: "正在检查更新",
      body: "正在连接更新源，请稍候。",
      progress: 8,
      sticky: true,
      mode: "progress"
    });
    return;
  }

  if (status.state === "available") {
    setUpdateButtonText("可更新");
    showUpdateBanner({
      title: `发现 ${status.release?.version || "新版本"}`,
      body: "请在确认窗口中选择是否立即更新。",
      progress: 18,
      sticky: true,
      mode: "progress"
    });
    return;
  }

  if (status.state === "downloading") {
    els.updateBtn.dataset.busy = "1";
    els.updateBtn.disabled = true;
    const progress = Number.isFinite(Number(status.progress)) ? Number(status.progress) : 0;
    const visibleProgress = Math.max(0, Math.min(99, Math.round(progress)));
    setUpdateButtonText(`${visibleProgress}%`);
    showUpdateBanner({
      title: "正在下载更新包",
      body: `${visibleProgress}%${status.sourceLabel ? ` / ${status.sourceLabel}` : ""}`,
      progress: visibleProgress,
      sticky: true,
      mode: "progress"
    });
    return;
  }

  if (status.state === "installing") {
    els.updateBtn.dataset.busy = "1";
    els.updateBtn.disabled = true;
    setUpdateButtonText("重启中");
    showUpdateBanner({
      title: "正在重启替换",
      body: "应用会短暂关闭并自动打开，请不要手动结束更新进程。",
      progress: 100,
      sticky: true,
      mode: "progress"
    });
    return;
  }

  delete els.updateBtn.dataset.busy;
  els.updateBtn.disabled = false;
  setUpdateButtonText(UPDATE_IDLE_TEXT);

  if (status.state === "error" && status.message) {
    const message = formatUpdateError(status.message);
    flashStatus(message, 3600);
    showUpdateBanner({
      title: "更新失败",
      body: message,
      sticky: false,
      mode: "error"
    });
  }
}

function formatUpdateError(error) {
  const raw = String(error?.message || error || "").trim();
  const cleaned = raw
    .replace(/^Error invoking remote method 'update:check':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
  const text = cleaned || "检查更新失败，请稍后重试";

  if (/^Error invoking remote method/i.test(raw)) {
    return text === raw ? "检查更新失败，请稍后重试" : text;
  }

  return text.length > 38 ? `${text.slice(0, 36)}...` : text;
}

function setUpdateButtonText(text) {
  state.updateButtonText = text;
  if (els.updateBtn) {
    els.updateBtn.textContent = text;
  }
}

async function consumeUpdateNotes() {
  if (!api.consumeUpdateNotes) {
    return;
  }
  try {
    const notes = await api.consumeUpdateNotes();
    if (notes) {
      showUpdateBanner(formatUpdateNotice(notes));
    }
  } catch {
    // Update notes are decorative; failures should not interrupt the live feed.
  }
}

function formatUpdateNotice(notes) {
  if (notes?.failed) {
    const message = Array.isArray(notes.features) && notes.features[0]
      ? notes.features[0]
      : notes.message || "更新没有完成，请稍后重试。";
    return {
      title: notes.version ? `v${notes.version} 更新失败` : "更新失败",
      body: message,
      mode: "error",
      sticky: false
    };
  }

  const version = notes.version ? `v${notes.version}` : "新版";
  const features = Array.isArray(notes.features) ? notes.features.filter(Boolean).slice(0, 3) : [];
  return {
    title: `${version} 已更新`,
    body: features.length ? features.join(" / ") : (notes.title || "新特性已准备好。"),
    mode: "success",
    sticky: false
  };
}

function showUpdateBanner(details) {
  if (!els.updateBanner) {
    return;
  }

  const {
    title = "更新中",
    body = "正在准备更新。",
    progress = null,
    sticky = false,
    mode = ""
  } = details || {};

  clearTimeout(state.updateBannerTimer);
  els.updateBanner.classList.toggle("is-error", mode === "error");
  els.updateBanner.classList.toggle("is-progress", mode === "progress");
  els.updateBanner.classList.toggle("is-success", mode === "success");
  els.updateBannerTitle.textContent = title;
  els.updateBannerBody.textContent = body;
  if (els.updateProgress && els.updateProgressBar) {
    const hasProgress = Number.isFinite(Number(progress));
    els.updateProgress.hidden = !hasProgress;
    els.updateProgressBar.style.width = hasProgress ? `${Math.max(0, Math.min(100, Number(progress)))}%` : "0%";
  }
  els.updateBanner.hidden = false;
  requestAnimationFrame(() => {
    els.updateBanner.classList.add("is-visible");
  });
  if (!sticky) {
    state.updateBannerTimer = window.setTimeout(() => {
      hideUpdateBanner();
    }, mode === "error" ? 9000 : 12000);
  }
}

function hideUpdateBanner() {
  if (!els.updateBanner || els.updateBanner.hidden) {
    return;
  }
  clearTimeout(state.updateBannerTimer);
  els.updateBanner.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!els.updateBanner.classList.contains("is-visible")) {
      els.updateBanner.hidden = true;
      els.updateBanner.classList.remove("is-error", "is-progress", "is-success");
      if (els.updateProgress && els.updateProgressBar) {
        els.updateProgress.hidden = true;
        els.updateProgressBar.style.width = "0%";
      }
    }
  }, 260);
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark-theme", dark);
  document.body.classList.toggle("light-theme", !dark);
  els.themeToggle.classList.toggle("active", dark);
  els.themeToggle.title = dark ? "切换浅色主题" : "切换暗色主题";
  els.themeToggle.setAttribute("aria-label", els.themeToggle.title);
}

function updateToggleMark(toggle, active) {
  const mark = toggle.querySelector(".chk-mark");
  if (mark) {
    mark.textContent = active ? "x" : "";
  }
}

function syncConnectionUi(connectedUi) {
  document.body.classList.toggle("is-connected", connectedUi);
  els.disconnectBtn.hidden = !connectedUi;
}

function updateSettingsToggleText() {
  const collapsed = document.body.classList.contains("is-settings-collapsed");
  els.settingsToggle.querySelector("span").textContent = collapsed ? "设置 ▾" : "设置 ▴";
}

function appendUsernameRuns(target, value) {
  const text = value || "匿名";
  let buffer = "";
  let currentType = "";

  const flush = () => {
    if (!buffer) return;
    const span = document.createElement("span");
    span.className = `user-run user-${currentType}`;
    span.textContent = buffer;
    target.append(span);
    buffer = "";
  };

  for (const char of Array.from(text)) {
    const type = /[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/u.test(char) ? "cjk" : "latin";
    if (currentType && type !== currentType) {
      flush();
    }
    currentType = type;
    buffer += char;
  }

  flush();
}

function appendContentRuns(target, value, emotes = []) {
  const text = String(value || "");
  const emoteMap = buildEmoteMap(emotes);
  if (emoteMap.size) {
    appendContentRunsWithEmotes(target, text, emoteMap);
    return;
  }
  appendPlainContentRuns(target, text);
}

function getContentEmoteProfile(value, emotes = []) {
  const text = String(value || "");
  const emoteMap = buildEmoteMap(emotes);
  let remainingText = text;
  let emoteCount = 0;

  const markers = Array.from(emoteMap.keys()).sort((a, b) => b.length - a.length);
  for (const marker of markers) {
    if (!marker || !remainingText.includes(marker)) {
      continue;
    }
    const markerPattern = escapeRegExp(marker);
    const matches = remainingText.match(new RegExp(markerPattern, "g"));
    emoteCount += matches ? matches.length : 0;
    remainingText = remainingText.replace(new RegExp(markerPattern, "g"), "");
  }

  const emojiPattern = /\p{Extended_Pictographic}/u;
  const segments = typeof Intl !== "undefined" && Intl.Segmenter
    ? Array.from(new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(remainingText), (entry) => entry.segment)
    : Array.from(remainingText);

  const textSegments = [];
  for (const segment of segments) {
    if (emojiPattern.test(segment)) {
      emoteCount += 1;
    } else {
      textSegments.push(segment);
    }
  }

  const meaningfulText = textSegments
    .join("")
    .replace(/[\s\u200b-\u200f\uFE0E\uFE0F!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）《》【】…·￥]+/g, "");
  const textLength = getGraphemeLength(meaningfulText);

  return {
    hasEmotes: emoteCount > 0,
    isMostlyEmotes: emoteCount > 0 && (textLength === 0 || (emoteCount >= 2 && textLength <= 2))
  };
}

function appendPlainContentRuns(target, value) {
  const text = String(value || "");
  const emojiPattern = /\p{Extended_Pictographic}/u;
  const segments = typeof Intl !== "undefined" && Intl.Segmenter
    ? Array.from(new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(text), (entry) => entry.segment)
    : Array.from(text);

  for (const segment of segments) {
    if (!emojiPattern.test(segment)) {
      target.append(document.createTextNode(segment));
      continue;
    }
    const emoji = document.createElement("span");
    emoji.className = "emoji";
    emoji.textContent = segment;
    target.append(emoji);
  }
}

function appendContentRunsWithEmotes(target, text, emoteMap) {
  const markers = Array.from(emoteMap.keys()).sort((a, b) => b.length - a.length);
  let cursor = 0;

  while (cursor < text.length) {
    let matchedMarker = "";
    for (const marker of markers) {
      if (text.startsWith(marker, cursor)) {
        matchedMarker = marker;
        break;
      }
    }

    if (!matchedMarker) {
      const nextIndex = findNextMarkerIndex(text, markers, cursor + 1);
      appendPlainContentRuns(target, text.slice(cursor, nextIndex));
      cursor = nextIndex;
      continue;
    }

    appendBilibiliEmote(target, matchedMarker, emoteMap.get(matchedMarker));
    cursor += matchedMarker.length;
  }
}

function appendBilibiliEmote(target, marker, emote) {
  if (!isSafeImageUrl(emote?.url)) {
    appendPlainContentRuns(target, marker);
    return;
  }

  const image = document.createElement("img");
  image.className = "emoji bilibili-emote";
  image.src = emote.url;
  image.alt = marker;
  image.title = marker;
  image.decoding = "async";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.draggable = false;
  if (emote.width && emote.height) {
    image.width = emote.width;
    image.height = emote.height;
  }
  image.addEventListener("error", () => {
    image.replaceWith(document.createTextNode(marker));
  }, { once: true });
  target.append(image);
}

function buildEmoteMap(emotes) {
  const map = new Map();
  if (!Array.isArray(emotes)) {
    return map;
  }

  for (const emote of emotes) {
    const marker = String(emote?.text || "").trim();
    if (!/^\[[^\[\]\r\n]{1,40}\]$/.test(marker) || !isSafeImageUrl(emote?.url)) {
      continue;
    }
    map.set(marker, {
      url: emote.url,
      width: Number(emote.width) || undefined,
      height: Number(emote.height) || undefined
    });
  }
  return map;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNextMarkerIndex(text, markers, start) {
  let nextIndex = text.length;
  for (const marker of markers) {
    const index = text.indexOf(marker, start);
    if (index !== -1 && index < nextIndex) {
      nextIndex = index;
    }
  }
  return nextIndex;
}

function isSafeImageUrl(value) {
  try {
    return new URL(String(value || "")).protocol === "https:";
  } catch {
    return false;
  }
}

function getGraphemeLength(value) {
  const text = String(value || "");
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(text)).length;
  }
  return Array.from(text).length;
}

function createFansMedalElement(medal) {
  const name = String(medal?.name || "").trim();
  const level = Number.parseInt(medal?.level, 10);
  if (!name || !Number.isFinite(level) || level <= 0) {
    return null;
  }

  const element = document.createElement("span");
  element.className = "fans-medal fans-badge-container";
  if (medal.active === false) {
    element.classList.add("is-dimmed");
  }
  element.title = medal.anchor ? `${name} · LV${level} · ${medal.anchor}` : `${name} · LV${level}`;

  const medalName = document.createElement("span");
  medalName.className = "fans-medal-name fans-badge-name";
  medalName.textContent = name;

  const medalLevel = document.createElement("span");
  medalLevel.className = "fans-medal-level fans-badge-level";
  medalLevel.textContent = level;

  element.append(medalName, medalLevel);
  return element;
}

function appendItem(item) {
  maybeShowMegaGiftBanner(item);
  const shouldAutoScroll = shouldAutoScrollFeed();
  state.isMutatingFeed = true;
  state.items.push(item);
  trimItems();

  if (item.type === "gift" && tryStackGiftCombo(item)) {
    finalizeAppendedItem(shouldAutoScroll);
    return;
  }

  const li = document.createElement("li");
  const itemType = item.type || "danmaku";
  li.className = `item danmaku-item is-entering ${itemType}`;
  if (itemType !== "danmaku") {
    li.classList.add(`is-${itemType}`);
  }
  li.dataset.id = item.id;

  const labelStack = document.createElement("div");
  labelStack.className = "danmaku-label-stack";

  const tag = document.createElement("span");
  tag.className = "tag danmaku-badge-text";
  tag.textContent = item.tag || "弹幕";
  labelStack.append(tag);

  const medal = createFansMedalElement(item.medal);
  if (medal) {
    labelStack.append(medal);
  }

  const content = document.createElement("div");
  content.className = "content danmaku-content-wrap";

  const meta = document.createElement("div");
  meta.className = "meta";

  const user = document.createElement("span");
  user.className = "user danmaku-username";
  const userName = item.user || "匿名";
  if (getGraphemeLength(userName) > 14) {
    user.classList.add("is-faded");
  }
  appendUsernameRuns(user, userName);
  user.title = userName;

  const uid = document.createElement("span");
  uid.className = "uid";
  uid.textContent = item.uid ? `UID:${item.uid}` : "UID:--";

  const text = document.createElement("span");
  text.className = "text danmaku-content";
  const displayText = item.price ? `${item.text} ¥${item.price}` : item.text;
  const emoteProfile = getContentEmoteProfile(displayText, item.emotes);
  if (emoteProfile.hasEmotes) {
    li.classList.add("has-emote");
  }
  if (emoteProfile.isMostlyEmotes) {
    li.classList.add("is-emote-message");
  }
  appendContentRuns(text, displayText, item.emotes);

  meta.append(user, uid);
  if (itemType === "gift") {
    li.dataset.giftUid = String(item.uid || "");
    li.dataset.giftName = String(item.giftName || item.text || "");
    content.classList.add("gift-content");
    text.textContent = "";
    const giftText = item.giftName || item.text || "礼物";
    appendContentRuns(text, giftText);
    const multiplier = document.createElement("span");
    multiplier.className = "gift-multiplier";
    multiplier.textContent = `x${Math.max(1, Number(item.giftCount || 1))}`;
    meta.append(user);
    content.append(meta, text, multiplier);
  } else {
    content.append(meta, text);
  }
  li.dataset.copyText = buildCopyText(item, itemType);
  li.title = state.settings?.copyOnTagClick ? "单击复制弹幕内容" : "";
  li.addEventListener("click", handleItemCopyClick);
  li.append(labelStack, content);
  els.feed.append(li);
  requestAnimationFrame(() => {
    li.classList.add("has-entered");
  });

  while (els.feed.children.length > state.settings.maxItems) {
    els.feed.firstElementChild?.remove();
  }

  finalizeAppendedItem(shouldAutoScroll);
}

function tryStackGiftCombo(item) {
  const lastItem = els.feed.lastElementChild;
  if (!(lastItem instanceof HTMLElement) || !lastItem.classList.contains("is-gift")) {
    return false;
  }
  const incomingUid = String(item.uid || "");
  const incomingGiftName = String(item.giftName || item.text || "");
  if (lastItem.dataset.giftUid !== incomingUid || lastItem.dataset.giftName !== incomingGiftName) {
    return false;
  }
  const multiplier = lastItem.querySelector(".gift-multiplier");
  if (!(multiplier instanceof HTMLElement)) {
    return false;
  }
  const currentCount = Number(multiplier.textContent.replace(/[^\d]/g, "")) || 1;
  const nextCount = currentCount + Math.max(1, Number(item.giftCount || 1));
  multiplier.textContent = `x${nextCount}`;
  const lastStateItem = state.items[state.items.length - 1];
  if (lastStateItem && lastStateItem.type === "gift" && String(lastStateItem.uid || "") === incomingUid) {
    lastStateItem.giftCount = nextCount;
  }
  lastItem.dataset.copyText = buildCopyText({ ...item, giftCount: nextCount }, "gift");
  multiplier.classList.remove("pop-active");
  void multiplier.offsetWidth;
  multiplier.classList.add("pop-active");
  window.setTimeout(() => {
    multiplier.classList.remove("pop-active");
  }, 200);
  return true;
}

async function handleItemCopyClick(event) {
  if (!state.settings?.copyOnTagClick || isClickThroughMode()) {
    return;
  }
  const item = event.currentTarget;
  if (!(item instanceof HTMLElement)) {
    return;
  }
  const text = item?.dataset.copyText || "";
  if (!text) {
    return;
  }
  try {
    await api.writeClipboardText?.(text);
    showTagCopyToast(item);
    flashStatus("已复制弹幕", 1100);
  } catch {
    flashStatus("复制失败", 1600);
  }
}

function showTagCopyToast(item) {
  if (!(item instanceof HTMLElement)) {
    return;
  }
  item.querySelector(".copy-toast")?.remove();
  const toast = document.createElement("span");
  toast.className = "copy-toast";
  toast.textContent = "已复制";
  item.append(toast);
  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });
  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 900);
}

function buildCopyText(item, itemType) {
  if (itemType === "gift") {
    const giftName = item.giftName || item.text || "礼物";
    const giftCount = Math.max(1, Number(item.giftCount || 1));
    return `${giftName} x${giftCount}`;
  }
  if (itemType === "superchat") {
    return `${item.text || ""}${item.price ? ` ¥${item.price}` : ""}`.trim();
  }
  return String(item.text || "").trim();
}

function updateCopyHintTitles(enabled) {
  const title = enabled ? "单击复制弹幕内容" : "";
  els.feed.querySelectorAll(".danmaku-item").forEach((item) => {
    item.title = title;
  });
}

function finalizeAppendedItem(shouldAutoScroll) {
  if (shouldAutoScroll) {
    scrollFeedToBottom("smooth");
    state.newMessagesWhileLocked = 0;
  } else {
    state.newMessagesWhileLocked += 1;
  }
  requestAnimationFrame(() => {
    state.isMutatingFeed = false;
    if (!state.isFeedHovered) {
      updateFeedScrollState({ userInitiated: false });
    }
  });
  state.messageCount += 1;
  updateMessageCount();
  triggerStatusPulse();
}

function maybeShowMegaGiftBanner(item) {
  if (!isMegaGiftEvent(item) || !els.megaGiftZone) {
    return;
  }
  const banner = document.createElement("div");
  banner.className = "mega-gift-banner";

  const meta = document.createElement("div");
  meta.className = "mega-gift-meta";

  const user = document.createElement("span");
  user.className = "mega-gift-user";
  user.textContent = item.user || "匿名";

  const action = document.createElement("span");
  action.className = "mega-gift-action";
  action.textContent = buildMegaGiftAction(item);

  const progress = document.createElement("div");
  progress.className = "mega-gift-progress";

  meta.append(user, action);
  banner.append(meta, progress);
  els.megaGiftZone.append(banner);

  window.setTimeout(() => {
    banner.classList.add("is-leaving");
  }, MEGA_GIFT_LEAVE_DELAY);

  window.setTimeout(() => {
    banner.remove();
  }, MEGA_GIFT_DURATION);
}

function isMegaGiftEvent(item) {
  if (!item) {
    return false;
  }
  if (item.type === "superchat") {
    return true;
  }
  if (item.type === "gift") {
    return Number(item.giftValue || 0) >= MEGA_GIFT_THRESHOLD;
  }
  return false;
}

function buildMegaGiftAction(item) {
  if (item.type === "superchat") {
    return `发送了醒目留言 ${item.price ? `¥${item.price}` : ""}`.trim();
  }
  const giftName = item.giftName || item.text || "礼物";
  const giftCount = Math.max(1, Number(item.giftCount || 1));
  return `赠送了 ${giftName} x${giftCount}`;
}

function trimItems() {
  const max = Number(state.settings?.maxItems || 80);
  if (state.items.length > max) {
    state.items = state.items.slice(-max);
  }
  while (els.feed.children.length > max) {
    els.feed.firstElementChild?.remove();
  }
}

function isFeedAtBottom() {
  const threshold = 40;
  return els.feed.scrollHeight - els.feed.scrollTop - els.feed.clientHeight <= threshold;
}

function updateFeedScrollState({ userInitiated = false } = {}) {
  if (state.isMutatingFeed) {
    return;
  }
  if (isClickThroughMode()) {
    state.isFeedHovered = false;
    state.isFeedScrolledUp = false;
    state.hasFeedScrollIntent = false;
    state.newMessagesWhileLocked = 0;
    return;
  }
  const atBottom = isFeedAtBottom();
  if (atBottom) {
    state.isFeedScrolledUp = false;
    state.newMessagesWhileLocked = 0;
    state.hasFeedScrollIntent = false;
    return;
  }
  if (userInitiated || state.hasFeedScrollIntent) {
    els.feed.style.removeProperty("--feed-bottom-pad");
    state.isFeedScrolledUp = true;
  }
}

function shouldAutoScrollFeed() {
  if (isClickThroughMode()) {
    return true;
  }
  return !state.isFeedHovered && !state.isFeedScrolledUp;
}

function scrollFeedToBottom(behavior = "auto") {
  const targetTop = prepareBottomAlignedScrollTop();
  els.feed.scrollTo({
    top: targetTop,
    behavior
  });
  if (behavior === "smooth") {
    window.setTimeout(() => {
      const settledTop = prepareBottomAlignedScrollTop();
      if (Math.abs(els.feed.scrollTop - settledTop) > 1) {
        els.feed.scrollTo({ top: settledTop, behavior: "auto" });
      }
    }, 360);
  }
}

function prepareBottomAlignedScrollTop() {
  els.feed.style.removeProperty("--feed-bottom-pad");
  const rawTop = Math.max(0, els.feed.scrollHeight - els.feed.clientHeight);
  const safetyTop = rawTop + 1;
  const items = Array.from(els.feed.querySelectorAll(".danmaku-item"));
  const cutIndex = items.findIndex((item) => {
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    return itemTop < safetyTop && itemBottom > safetyTop;
  });
  if (cutIndex < 0) {
    return rawTop;
  }
  const dimmed = els.appContainer?.classList.contains("is-hud-dimmed");
  const baseBottomPad = dimmed ? 10 : 24;
  const maxExtraPad = dimmed ? 18 : 32;
  const cutItem = items[cutIndex];
  const upwardShift = rawTop - cutItem.offsetTop;
  if (upwardShift > 0 && upwardShift <= baseBottomPad) {
    return Math.max(0, cutItem.offsetTop);
  }
  const nextItem = items[cutIndex + 1];
  if (!nextItem) {
    return rawTop;
  }
  const extraPad = Math.min(Math.ceil(nextItem.offsetTop - rawTop), maxExtraPad);
  if (extraPad <= 1) {
    return rawTop;
  }
  els.feed.style.setProperty("--feed-bottom-pad", `${baseBottomPad + extraPad}px`);
  return Math.max(0, els.feed.scrollHeight - els.feed.clientHeight);
}

function handleFeedHoverStart() {
  if (isClickThroughMode()) {
    return;
  }
  state.isFeedHovered = true;
  if (isFeedAtBottom()) {
    state.isFeedScrolledUp = false;
    state.hasFeedScrollIntent = false;
  }
}

function handleFeedHoverEnd() {
  clearInkFocus();
  if (isClickThroughMode()) {
    state.isFeedHovered = false;
    state.isFeedScrolledUp = false;
    state.hasFeedScrollIntent = false;
    state.newMessagesWhileLocked = 0;
    return;
  }
  if (!state.isFeedHovered) {
    return;
  }
  state.isFeedHovered = false;
  if (!isFeedAtBottom() || state.newMessagesWhileLocked > 0) {
    scrollFeedToBottom("smooth");
  }
  state.isFeedScrolledUp = false;
  state.hasFeedScrollIntent = false;
  state.newMessagesWhileLocked = 0;
}

function handleHudWake() {
  if (isClickThroughMode()) {
    return;
  }
  clearTimeout(state.hudDimTimer);
  state.hudDimTimer = null;
  els.appContainer?.classList.remove("is-hud-dimmed");
}

function scheduleHudDim() {
  clearTimeout(state.hudDimTimer);
  state.hudDimTimer = setTimeout(() => {
    updateHudCollapseOffset();
    els.appContainer?.classList.add("is-hud-dimmed");
    if (!isClickThroughMode()) {
      state.clickThroughNoticeShown = false;
      updateSetting("clickThrough", true);
    }
  }, 5000);
}

function updateHudCollapseOffset() {
  if (!els.appContainer || !els.headerSection) {
    return;
  }
  const reserve = 20;
  const measured = Math.max(45, Math.round(els.headerSection.offsetHeight - reserve));
  els.appContainer.style.setProperty("--hud-collapse-offset", `${measured}px`);
  els.appContainer.style.setProperty("--hud-dot-offset", `${measured + 1}px`);
}

function isClickThroughMode() {
  return Boolean(state.settings?.clickThrough);
}

function syncClickThroughMode(enabled, wasEnabled) {
  if (!enabled) {
    clearTimeout(state.clickThroughWakeTimer);
    state.clickThroughWakeTimer = null;
    clearInkFocus();
    if (wasEnabled) {
      showStatusModeTip("已恢复交互", 1800);
    }
    return;
  }

  clearInkFocus();
  state.isFeedHovered = false;
  state.isFeedScrolledUp = false;
  state.hasFeedScrollIntent = false;
  state.newMessagesWhileLocked = 0;
  if (!state.clickThroughNoticeShown || !wasEnabled) {
    state.clickThroughNoticeShown = true;
    showStatusModeTip("穿透中 · 停留红点 1 秒恢复", 4200);
  }
}

function handleClickThroughWakePointer(event) {
  if (!isPointerInStatusWakeZone(event)) {
    clearTimeout(state.clickThroughWakeTimer);
    state.clickThroughWakeTimer = null;
    els.statusDot?.classList.remove("is-waking");
    return;
  }

  if (state.clickThroughWakeTimer) {
    return;
  }

  els.statusDot?.classList.add("is-waking");
  showStatusModeTip("保持停留 · 正在恢复", 1100);
  state.clickThroughWakeTimer = setTimeout(() => {
    state.clickThroughWakeTimer = null;
    els.statusDot?.classList.remove("is-waking");
    updateSetting("clickThrough", false);
  }, 800);
}

function isPointerInStatusWakeZone(event) {
  if (!els.statusDot) {
    return false;
  }
  const rect = els.statusDot.getBoundingClientRect();
  const radius = 24;
  const nearRenderedDot = event.clientX >= rect.left - radius
    && event.clientX <= rect.right + radius
    && event.clientY >= rect.top - radius
    && event.clientY <= rect.bottom + radius;
  if (nearRenderedDot) {
    return true;
  }

  // While mouse events are forwarded through a transparent Electron window,
  // native drag regions may lag behind the renderer state. Keep a small
  // fixed top-left recovery zone so click-through can be restored immediately.
  return event.clientX >= 8
    && event.clientX <= 64
    && event.clientY >= 6
    && event.clientY <= 62;
}

function showStatusModeTip(text, duration = 3200) {
  if (!els.statusModeTip) {
    return;
  }
  els.statusModeTip.textContent = text;
  els.statusModeTip.classList.add("is-visible");
  clearTimeout(state.statusModeTipTimer);
  state.statusModeTipTimer = setTimeout(() => {
    els.statusModeTip.classList.remove("is-visible");
  }, duration);
}

function handleHudPointerMove(event) {
  if (isClickThroughMode()) {
    handleClickThroughWakePointer(event);
    return;
  }
  const rect = document.body.getBoundingClientRect();
  const insideApp = event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
  if (insideApp) {
    handleHudWake();
  }
}

function syncInkFocus(event) {
  if (isClickThroughMode()) {
    clearInkFocus();
    return;
  }
  const item = event.target instanceof Element ? event.target.closest(".danmaku-item") : null;
  if (!item || !els.feed.contains(item)) {
    clearInkFocus();
    return;
  }
  if (item.classList.contains("is-focused")) {
    els.feed.classList.add("is-ink-active");
    return;
  }
  els.feed.querySelector(".danmaku-item.is-focused")?.classList.remove("is-focused");
  item.classList.add("is-focused");
  els.feed.classList.add("is-ink-active");
}

function clearInkFocus() {
  els.feed.classList.remove("is-ink-active");
  els.feed.querySelector(".danmaku-item.is-focused")?.classList.remove("is-focused");
}

function syncFeedHoverFromPointer(event) {
  if (isClickThroughMode()) {
    return;
  }
  if (!state.isFeedHovered) {
    return;
  }
  const rect = els.feed.getBoundingClientRect();
  const insideFeed = event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
  if (!insideFeed) {
    handleFeedHoverEnd();
  }
}

function isPointerOnFeedScrollbar(event) {
  const scrollbarWidth = els.feed.offsetWidth - els.feed.clientWidth;
  if (scrollbarWidth <= 0) {
    return false;
  }
  const rect = els.feed.getBoundingClientRect();
  return event.clientX >= rect.right - scrollbarWidth - 2;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function flashStatus(text, duration = 1800) {
  setStatus(text);
  clearTimeout(state.statusFlashTimer);
  state.statusFlashTimer = setTimeout(() => {
    if (state.connected) {
      renderHeaderStatus();
      return;
    }
    setStatus("未连接");
  }, duration);
}

function renderHeaderStatus() {
  if (!state.connected) {
    return;
  }
  const room = state.roomText || state.settings?.roomId || "";
  const popularity = state.popularityText || "0";
  const exactPopularity = formatFullNumber(state.popularityRaw);

  els.statusText.replaceChildren();
  els.statusText.append(document.createTextNode("已连接 "));

  const roomValue = document.createElement("span");
  roomValue.className = "status-data status-room";
  roomValue.textContent = room;

  els.statusText.append(roomValue, document.createTextNode(" / 人气 "));

  const popularityWrap = document.createElement("span");
  popularityWrap.className = "status-data popularity-inline";
  popularityWrap.title = exactPopularity;

  const shortValue = document.createElement("span");
  shortValue.className = "popularity-short";
  shortValue.textContent = popularity;

  const fullValue = document.createElement("span");
  fullValue.className = "popularity-full";
  fullValue.textContent = exactPopularity;

  const trend = document.createElement("span");
  trend.className = `popularity-trend${state.popularityTrend ? ` is-${state.popularityTrend}` : ""}`;
  trend.textContent = state.popularityTrend === "down" ? "↓" : "↑";
  trend.setAttribute("aria-hidden", "true");

  popularityWrap.append(shortValue, fullValue, trend);
  els.statusText.append(popularityWrap);
}

function formatNumber(value) {
  const number = Number(value) || 0;
  if (number >= 10000) {
    return `${(number / 10000).toFixed(1)}万`;
  }
  return String(number);
}

function formatFullNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function updateRuntimeDashboard() {
  if (!els.runTime) {
    return;
  }
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - state.startTime) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  els.runTime.textContent = `${String(hours).padStart(2, "0")}H ${String(minutes).padStart(2, "0")}M`;
}

function updateMessageCount() {
  if (els.msgCount) {
    els.msgCount.textContent = String(state.messageCount);
  }
}

function triggerStatusPulse() {
  if (!els.statusDot) {
    return;
  }
  els.statusDot.classList.remove("pulse-active");
  void els.statusDot.offsetWidth;
  els.statusDot.classList.add("pulse-active");
  clearTimeout(state.statusPulseTimer);
  state.statusPulseTimer = setTimeout(() => {
    els.statusDot.classList.remove("pulse-active");
  }, 650);
}
