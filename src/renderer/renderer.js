const api = window.danmakuApp;

const state = {
  settings: null,
  connected: false,
  roomText: "",
  popularityText: "",
  items: []
};

const els = {
  statusText: document.getElementById("statusText"),
  roomInput: document.getElementById("roomInput"),
  connectForm: document.getElementById("connectForm"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  settingsToggle: document.getElementById("settingsToggle"),
  topToggle: document.getElementById("topToggle"),
  throughToggle: document.getElementById("throughToggle"),
  lockToggle: document.getElementById("lockToggle"),
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
  clearSessdataBtn: document.getElementById("clearSessdataBtn"),
  feed: document.getElementById("feed"),
  themeToggle: document.getElementById("themeToggle"),
  minimizeBtn: document.getElementById("minimizeBtn"),
  hideBtn: document.getElementById("hideBtn")
};

init();

async function init() {
  state.settings = await api.getSettings();
  applySettings(state.settings);
  bindEvents();
  bindIpc();
}

function bindEvents() {
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
    state.popularityText = formatNumber(value);
    renderHeaderStatus();
  });

  api.onEvent((event) => {
    appendItem(event);
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
  document.body.classList.toggle("is-click-through", Boolean(settings.clickThrough));
  document.body.classList.toggle("is-opaque", Number(settings.opacity) >= 100);
  updateSettingsToggleText();
  els.feed.style.fontSize = `${settings.fontSize}px`;
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

function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark-theme", dark);
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

function appendItem(item) {
  state.items.push(item);
  trimItems();

  const li = document.createElement("li");
  li.className = `item ${item.type || "danmaku"}`;
  li.dataset.id = item.id;

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = item.tag || "弹幕";

  const content = document.createElement("div");
  content.className = "content";

  const meta = document.createElement("div");
  meta.className = "meta";

  const user = document.createElement("span");
  user.className = "user";
  user.textContent = item.user || "匿名";
  user.title = item.user || "匿名";

  const uid = document.createElement("span");
  uid.className = "uid";
  uid.textContent = item.uid ? `UID:${item.uid}` : "UID:--";

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = item.price ? `${item.text} ¥${item.price}` : item.text;

  meta.append(user, uid);
  content.append(meta, text);
  li.append(tag, content);
  els.feed.append(li);

  while (els.feed.children.length > state.settings.maxItems) {
    els.feed.firstElementChild?.remove();
  }

  els.feed.scrollTop = els.feed.scrollHeight;
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

function setStatus(text) {
  els.statusText.textContent = text;
}

function renderHeaderStatus() {
  if (!state.connected) {
    return;
  }
  const room = state.roomText || state.settings?.roomId || "";
  const popularity = state.popularityText || "0";
  els.statusText.textContent = `已连接 ${room} / 人气 ${popularity}`;
}

function formatNumber(value) {
  const number = Number(value) || 0;
  if (number >= 10000) {
    return `${(number / 10000).toFixed(1)}万`;
  }
  return String(number);
}
