const { EventEmitter } = require("events");
const crypto = require("crypto");
const zlib = require("zlib");
const WebSocket = require("ws");

const API_BASE = "https://api.live.bilibili.com";
const HEADER_LEN = 16;
const PROTOCOL_VERSION_NORMAL = 0;
const PROTOCOL_VERSION_ZLIB = 2;
const PROTOCOL_VERSION_BROTLI = 3;
const OP_HEARTBEAT = 2;
const OP_HEARTBEAT_REPLY = 3;
const OP_MESSAGE = 5;
const OP_AUTH = 7;
const OP_AUTH_REPLY = 8;
const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

let wbiKeyCache = null;

class BilibiliDanmakuClient extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.roomId = null;
    this.realRoomId = null;
    this.heartbeatTimer = null;
    this.popularityTimer = null;
    this.reconnectTimer = null;
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.cookie = "";
    this.uid = 0;
    this.roomEmotes = new Map();
    this.emotePackageIndex = new Map();
    this.emotePackagePromises = new Map();
  }

  async connect(roomId, options = {}) {
    this.disconnect(false);
    this.roomId = String(roomId || "").trim();
    this.cookie = buildCookie(options.sessdata);
    this.uid = 0;
    this.roomEmotes = new Map();
    this.emotePackageIndex = new Map();
    this.emotePackagePromises = new Map();
    if (!/^\d+$/.test(this.roomId)) {
      throw new Error("请输入有效的数字直播间号");
    }

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    await this.open();
  }

  disconnect(emitStatus = true) {
    this.shouldReconnect = false;
    clearInterval(this.heartbeatTimer);
    clearInterval(this.popularityTimer);
    clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.popularityTimer = null;
    this.reconnectTimer = null;

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {
        // Ignore stale socket close errors.
      }
    }

    if (emitStatus) {
      this.emit("status", { state: "disconnected", text: "已断开" });
    }
  }

  async open() {
    try {
      this.emit("status", { state: "connecting", text: "正在解析直播间" });
      const realRoomId = await resolveRealRoomId(this.roomId, this.cookie);
      this.realRoomId = realRoomId;
      this.uid = await getLoginUid(this.cookie);

      this.emit("status", { state: "connecting", text: "正在获取直播表情" });
      const emoteResources = await getEmoticonResources(realRoomId, this.cookie);
      this.roomEmotes = emoteResources.emotes;
      this.emotePackageIndex = emoteResources.packageIndex;

      this.emit("status", { state: "connecting", text: "正在获取弹幕服务器" });
      const conf = await getDanmuInfo(realRoomId, this.cookie);
      const host = chooseHost(conf.host_list);
      const wsUrl = `wss://${host.host}:${host.wss_port || 443}/sub`;

      this.emit("status", { state: "connecting", text: "正在连接弹幕服务器" });
      this.ws = new WebSocket(wsUrl, {
        headers: {
          Origin: "https://live.bilibili.com",
          Referer: `https://live.bilibili.com/${this.roomId}`,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          "User-Agent": defaultUserAgent()
        }
      });

      this.ws.binaryType = "arraybuffer";
      this.ws.on("open", () => {
        this.reconnectAttempts = 0;
        this.sendAuth(conf.token);
        this.sendHeartbeat();
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 30000);
      });

      this.ws.on("message", (data) => {
        this.handlePacket(Buffer.from(data));
      });

      this.ws.on("close", () => {
        clearInterval(this.heartbeatTimer);
        clearInterval(this.popularityTimer);
        this.heartbeatTimer = null;
        this.popularityTimer = null;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        } else {
          this.emit("status", { state: "disconnected", text: "已断开" });
        }
      });

      this.ws.on("error", (error) => {
        this.emit("status", { state: "error", text: error.message || "连接异常" });
      });
    } catch (error) {
      this.emit("status", { state: "error", text: error.message || "连接失败" });
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(30000, 1500 * Math.max(1, 2 ** this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.emit("status", {
      state: "reconnecting",
      text: `${Math.round(delay / 1000)} 秒后重连`
    });
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  sendAuth(token) {
    const body = {
      uid: this.uid || 0,
      roomid: Number(this.realRoomId),
      protover: PROTOCOL_VERSION_BROTLI,
      buvid: makeBuvid(),
      support_ack: true,
      queue_uuid: crypto.randomBytes(4).toString("hex"),
      scene: "",
      platform: "web",
      type: 2,
      key: token
    };
    this.sendPacket(OP_AUTH, JSON.stringify(body));
  }

  sendHeartbeat() {
    this.sendPacket(OP_HEARTBEAT, "");
  }

  startPopularityPolling() {
    clearInterval(this.popularityTimer);
    this.popularityTimer = null;

    const refresh = async () => {
      if (!this.realRoomId || !this.shouldReconnect) {
        return;
      }

      try {
        const popularity = await getRoomPopularity(this.realRoomId, this.cookie);
        if (Number.isFinite(popularity)) {
          this.emit("popularity", popularity);
        }
      } catch {
        // Popularity is auxiliary UI data; keep danmaku connection stable if this API throttles.
      }
    };

    refresh();
    this.popularityTimer = setInterval(refresh, 15000);
  }

  sendPacket(operation, payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const body = Buffer.from(payload);
    const packet = Buffer.alloc(HEADER_LEN + body.length);
    packet.writeUInt32BE(packet.length, 0);
    packet.writeUInt16BE(HEADER_LEN, 4);
    packet.writeUInt16BE(1, 6);
    packet.writeUInt32BE(operation, 8);
    packet.writeUInt32BE(1, 12);
    body.copy(packet, HEADER_LEN);
    this.ws.send(packet);
  }

  handlePacket(buffer) {
    for (const packet of unpackPackets(buffer)) {
      const { version, operation, body } = packet;

      if (operation === OP_AUTH_REPLY) {
        this.emit("status", { state: "connected", text: `已连接 ${this.realRoomId}` });
        this.startPopularityPolling();
        continue;
      }

      if (operation === OP_HEARTBEAT_REPLY) {
        continue;
      }

      if (operation !== OP_MESSAGE) {
        continue;
      }

      if (version === PROTOCOL_VERSION_BROTLI) {
        this.handlePacket(zlib.brotliDecompressSync(body));
      } else if (version === PROTOCOL_VERSION_ZLIB) {
        this.handlePacket(zlib.inflateSync(body));
      } else if (version === PROTOCOL_VERSION_NORMAL || version === 1) {
        const message = parseJsonBody(body);
        if (message) {
          this.emitNormalizedEvent(message);
        }
      }
    }
  }

  async emitNormalizedEvent(message) {
    try {
      await this.ensureEmotesForMessage(message);
      const normalized = normalizeEvent(message, this.roomEmotes);
      if (normalized) {
        this.emit("event", normalized);
      }
    } catch {
      const normalized = normalizeEvent(message, this.roomEmotes);
      if (normalized) {
        this.emit("event", normalized);
      }
    }
  }

  async ensureEmotesForMessage(message) {
    const command = String(message?.cmd || "").split(":")[0];
    if (command !== "DANMU_MSG") {
      return;
    }

    const text = String(message.info?.[1] || "");
    const packageNames = getMissingEmotePackageNames(text, this.roomEmotes, this.emotePackageIndex);
    if (!packageNames.length) {
      return;
    }

    await Promise.all(packageNames.map((packageName) => this.loadEmotePackage(packageName)));
  }

  async loadEmotePackage(packageName) {
    const packageId = this.emotePackageIndex.get(packageName);
    if (!packageId) {
      return;
    }

    const key = `${packageName}:${packageId}`;
    if (this.emotePackagePromises.has(key)) {
      return this.emotePackagePromises.get(key);
    }

    const promise = fetchEmotePackageMap(packageId, this.cookie)
      .then((map) => {
        mergeEmoticonMap(this.roomEmotes, map);
      })
      .catch(() => {
        // Optional package loading should never interrupt danmaku delivery.
      })
      .finally(() => {
        this.emotePackagePromises.delete(key);
      });
    this.emotePackagePromises.set(key, promise);
    return promise;
  }
}

async function resolveRealRoomId(roomId, cookie = "") {
  const payload = await fetchJson(`${API_BASE}/room/v1/Room/room_init?id=${encodeURIComponent(roomId)}`, { cookie });
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "直播间解析失败");
  }
  if (payload.data.live_status === 0) {
    throw new Error("直播间当前未开播");
  }
  return Number(payload.data.room_id || roomId);
}

async function getDanmuInfo(realRoomId, cookie = "") {
  const signedQuery = await signWbiQuery({
    id: realRoomId,
    type: 0,
    web_location: "444.8"
  }, cookie);
  const url = `${API_BASE}/xlive/web-room/v1/index/getDanmuInfo?${signedQuery}`;
  const payload = await fetchJson(url, { cookie });
  if (payload.code !== 0 || !payload.data?.token || !payload.data?.host_list?.length) {
    throw new Error(payload.message || "弹幕服务器信息获取失败");
  }
  return payload.data;
}

async function getRoomPopularity(realRoomId, cookie = "") {
  const url = `${API_BASE}/room/v1/Room/get_info?room_id=${encodeURIComponent(realRoomId)}`;
  const payload = await fetchJson(url, { cookie });
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || "直播间人气获取失败");
  }

  const online = Number(payload.data.online);
  return Number.isFinite(online) ? online : null;
}

async function getEmoticonResources(realRoomId, cookie = "") {
  const emotes = new Map();
  const packageIndex = new Map();
  const urls = [
    `${API_BASE}/xlive/web-ucenter/v2/emoticon/GetEmoticons?platform=pc&room_id=${encodeURIComponent(realRoomId)}`,
    `${API_BASE}/xlive/web-ucenter/v2/emoticon/GetEmoticons?business=reply&platform=pc&room_id=${encodeURIComponent(realRoomId)}`,
    `${API_BASE}/xlive/web-ucenter/v2/emoticon/GetEmoticons?business=danmaku&platform=pc&room_id=${encodeURIComponent(realRoomId)}`,
    "https://api.bilibili.com/x/emote/user/panel/web?business=reply",
    "https://api.bilibili.com/x/emote/user/panel/web?business=dynamic",
    "https://api.bilibili.com/x/emote/setting/panel?business=reply",
    "https://api.bilibili.com/x/emote/setting/panel?business=dynamic"
  ];

  for (const url of urls) {
    try {
      const payload = await fetchJson(url, { cookie });
      if (payload.code === 0 && payload.data) {
        mergeEmoticonMap(emotes, buildRoomEmoticonMap(payload.data));
        mergeEmoticonPackageIndex(packageIndex, buildEmoticonPackageIndex(payload.data));
      }
    } catch {
      // Emoticons are optional. Keep the danmaku connection usable if this API changes.
    }
  }

  return { emotes, packageIndex };
}

async function fetchEmotePackageMap(packageId, cookie = "") {
  const urls = [
    `https://api.bilibili.com/x/emote/package?business=reply&ids=${encodeURIComponent(packageId)}`,
    `https://api.bilibili.com/x/emote/package?business=dynamic&ids=${encodeURIComponent(packageId)}`
  ];

  const map = new Map();
  for (const url of urls) {
    try {
      const payload = await fetchJson(url, { cookie });
      if (payload.code === 0 && payload.data) {
        mergeEmoticonMap(map, buildRoomEmoticonMap(payload.data));
      }
    } catch {
      // Try the next business scope.
    }
  }
  return map;
}

function buildRoomEmoticonMap(data) {
  const map = new Map();
  const packages = [
    ...asArray(data?.data),
    ...asArray(data?.packages),
    ...asArray(data?.user_panel_packages),
    ...asArray(data?.all_packages),
    ...asArray(data?.emoticons),
    ...asArray(data?.emote),
    ...asArray(data)
  ];

  for (const pkg of packages) {
    if (!pkg || typeof pkg !== "object") {
      continue;
    }
    const packageName = String(pkg.pkg_name || pkg.package_name || pkg.name || "").trim();
    const items = [
      ...asArray(pkg.emoticons),
      ...asArray(pkg.emojis),
      ...asArray(pkg.emote),
      ...asArray(pkg.emotes),
      ...asArray(pkg.data)
    ];

    for (const item of items) {
      addRoomEmoticon(map, item, packageName);
    }
  }

  collectNestedRoomEmoticons(map, data);
  return map;
}

function mergeEmoticonMap(target, source) {
  for (const [key, value] of source.entries()) {
    if (!target.has(key)) {
      target.set(key, value);
    }
  }
}

function buildEmoticonPackageIndex(data) {
  const index = new Map();
  collectEmoticonPackageIndex(index, data);
  return index;
}

function collectEmoticonPackageIndex(index, node, depth = 0) {
  if (node == null || depth > 5) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectEmoticonPackageIndex(index, item, depth + 1);
    }
    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const id = node.id || node.package_id || node.pkg_id;
  const name = String(node.text || node.pkg_name || node.package_name || node.name || "").trim();
  if (id && name) {
    for (const alias of buildPackageNameAliases(name)) {
      if (!index.has(alias)) {
        index.set(alias, id);
      }
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (/package|panel|data|list/i.test(key)) {
      collectEmoticonPackageIndex(index, value, depth + 1);
    }
  }
}

function mergeEmoticonPackageIndex(target, source) {
  for (const [key, value] of source.entries()) {
    if (!target.has(key)) {
      target.set(key, value);
    }
  }
}

function buildPackageNameAliases(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return [];
  }

  const aliases = new Set([cleanName]);
  const costumeMatch = cleanName.match(/^(.+?)个性装扮(.+)$/);
  if (costumeMatch) {
    aliases.add(`${costumeMatch[1]}${costumeMatch[2]}`.trim());
  }
  const todayMatch = cleanName.match(/^(.+?)今天吃什么$/);
  if (todayMatch) {
    aliases.add(todayMatch[1].trim());
  }
  return Array.from(aliases);
}

function getMissingEmotePackageNames(messageText, emoteMap, packageIndex) {
  const markers = String(messageText || "").match(EMOTE_MARKER_PATTERN) || [];
  const names = new Set();
  for (const marker of markers) {
    if (emoteMap?.has(marker)) {
      continue;
    }
    const inner = marker.slice(1, -1);
    const separatorIndex = inner.lastIndexOf("_");
    if (separatorIndex <= 0) {
      continue;
    }
    const packageName = inner.slice(0, separatorIndex);
    if (packageIndex?.has(packageName)) {
      names.add(packageName);
    }
  }
  return Array.from(names);
}

function collectNestedRoomEmoticons(map, node, packageName = "", depth = 0) {
  if (node == null || depth > 5) {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectNestedRoomEmoticons(map, item, packageName, depth + 1);
    }
    return;
  }

  if (typeof node !== "object") {
    return;
  }

  const nextPackageName = String(node.pkg_name || node.package_name || node.name || packageName || "").trim();
  addRoomEmoticon(map, node, packageName);

  for (const [key, value] of Object.entries(node)) {
    if (/emot|emoji|package|data|list/i.test(key)) {
      collectNestedRoomEmoticons(map, value, nextPackageName, depth + 1);
    }
  }
}

function addRoomEmoticon(map, item, packageName = "") {
  if (!item || typeof item !== "object") {
    return;
  }
  const url = normalizeImageUrl(pickImageUrl(item));
  if (!url) {
    return;
  }

  const rawNames = [
    item.emoji,
    item.emoticon_name,
    item.emoji_name,
    item.descript,
    item.name,
    item.text,
    item.keyword,
    item.phrase
  ].map((value) => String(value || "").trim()).filter(Boolean);

  for (const rawName of rawNames) {
    const names = buildRoomEmoticonMarkers(rawName, packageName);
    for (const name of names) {
      if (!map.has(name)) {
        map.set(name, {
          text: name,
          url,
          width: pickNumber(item, ["width", "w", "img_width"]),
          height: pickNumber(item, ["height", "h", "img_height"])
        });
      }
    }
  }
}

function buildRoomEmoticonMarkers(rawName, packageName = "") {
  const cleanName = String(rawName || "").trim().replace(/^\[|\]$/g, "");
  const cleanPackageName = String(packageName || "").trim().replace(/^\[|\]$/g, "");
  const markers = new Set();
  if (cleanName) {
    markers.add(`[${cleanName}]`);
  }
  if (cleanPackageName && cleanName && !cleanName.startsWith(`${cleanPackageName}_`)) {
    markers.add(`[${cleanPackageName}_${cleanName}]`);
  }
  return Array.from(markers);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value && typeof value === "object" ? [value] : [];
}

async function signWbiQuery(params, cookie = "") {
  const keys = await getWbiKeys(cookie);
  const wts = Math.round(Date.now() / 1000);
  const signedParams = { ...params, wts };
  const query = Object.keys(signedParams)
    .sort()
    .map((key) => {
      const safeValue = String(signedParams[key]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(safeValue)}`;
    })
    .join("&");
  const wRid = crypto.createHash("md5").update(query + keys.mixinKey).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

async function getWbiKeys(cookie = "") {
  const cacheKey = cookie ? "login" : "guest";
  if (wbiKeyCache?.[cacheKey] && Date.now() - wbiKeyCache[cacheKey].time < 12 * 60 * 60 * 1000) {
    return wbiKeyCache[cacheKey];
  }

  const payload = await fetchJson("https://api.bilibili.com/x/web-interface/nav", { cookie });
  const imgUrl = payload.data?.wbi_img?.img_url;
  const subUrl = payload.data?.wbi_img?.sub_url;
  if (!imgUrl || !subUrl) {
    throw new Error("WBI 签名密钥获取失败");
  }

  const imgKey = getFileStem(imgUrl);
  const subKey = getFileStem(subUrl);
  const original = imgKey + subKey;
  const mixinKey = WBI_MIXIN_KEY_ENC_TAB.map((index) => original[index]).join("").slice(0, 32);
  wbiKeyCache = { ...wbiKeyCache, [cacheKey]: { time: Date.now(), mixinKey } };
  return wbiKeyCache[cacheKey];
}

function getFileStem(url) {
  return String(url).split("/").pop().split(".")[0];
}

async function getLoginUid(cookie = "") {
  if (!cookie) {
    return 0;
  }

  try {
    const payload = await fetchJson("https://api.bilibili.com/x/web-interface/nav", { cookie });
    return Number(payload.data?.mid || 0);
  } catch {
    return 0;
  }
}

async function fetchJson(url, options = {}) {
  const cookie = options.cookie || "";
  const response = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://live.bilibili.com/",
      ...(cookie ? { Cookie: cookie } : {}),
      "User-Agent": defaultUserAgent()
    }
  });
  if (!response.ok) {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  return response.json();
}

function buildCookie(sessdata = "") {
  const value = String(sessdata || "").trim();
  if (!value) {
    return "";
  }
  if (/SESSDATA=/i.test(value)) {
    return value;
  }
  return `SESSDATA=${value}`;
}

function chooseHost(hostList) {
  return hostList.find((item) => item.host && item.wss_port) || hostList[0];
}

function unpackPackets(buffer) {
  const packets = [];
  let offset = 0;

  while (offset + HEADER_LEN <= buffer.length) {
    const packetLen = buffer.readUInt32BE(offset);
    const headerLen = buffer.readUInt16BE(offset + 4);
    const version = buffer.readUInt16BE(offset + 6);
    const operation = buffer.readUInt32BE(offset + 8);

    if (packetLen < headerLen || offset + packetLen > buffer.length) {
      break;
    }

    packets.push({
      version,
      operation,
      body: buffer.subarray(offset + headerLen, offset + packetLen)
    });
    offset += packetLen;
  }

  return packets;
}

function parseJsonBody(body) {
  const text = body.toString("utf8").replace(/\0+$/g, "");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeEvent(raw, roomEmotes = new Map()) {
  const command = String(raw.cmd || "").split(":")[0];
  const now = Date.now();

  if (command === "DANMU_MSG") {
    const text = String(raw.info?.[1] || "");
    return {
      id: makeId(),
      type: "danmaku",
      tag: "弹幕",
      time: now,
      user: raw.info?.[2]?.[1] || "匿名",
      uid: raw.info?.[2]?.[0] || "",
      text,
      medal: extractFansMedal(raw),
      emotes: extractDanmakuEmotes(raw, text, roomEmotes)
    };
  }

  if (command === "SEND_GIFT") {
    const data = raw.data || {};
    const giftCount = Number(data.num || 1);
    const totalCoin = Number(data.total_coin || 0);
    const unitPrice = Number(data.discount_price || data.price || 0);
    const giftValue = totalCoin > 0 ? totalCoin / 1000 : unitPrice * giftCount;
    return {
      id: makeId(),
      type: "gift",
      tag: "礼物",
      time: now,
      user: data.uname || "匿名",
      uid: data.uid || data.sender_uid || "",
      giftName: data.giftName || "礼物",
      giftCount,
      giftValue,
      text: data.giftName || "礼物"
    };
  }

  if (command === "COMBO_SEND") {
    const data = raw.data || {};
    const giftCount = Number(data.combo_num || data.total_num || 1);
    const totalCoin = Number(data.total_coin || 0);
    const unitPrice = Number(data.discount_price || data.price || 0);
    const giftValue = totalCoin > 0 ? totalCoin / 1000 : unitPrice * giftCount;
    return {
      id: makeId(),
      type: "gift",
      tag: "连击",
      time: now,
      user: data.uname || "匿名",
      uid: data.uid || data.sender_uid || "",
      giftName: data.gift_name || "礼物",
      giftCount,
      giftValue,
      text: data.gift_name || "礼物"
    };
  }

  if (command === "SUPER_CHAT_MESSAGE") {
    const data = raw.data || {};
    return {
      id: makeId(),
      type: "superchat",
      tag: "醒目",
      time: now,
      user: data.user_info?.uname || data.uname || "匿名",
      uid: data.uid || data.user_info?.uid || "",
      text: data.message || "",
      price: data.price
    };
  }

  if (command === "GUARD_BUY") {
    const data = raw.data || {};
    return {
      id: makeId(),
      type: "guard",
      tag: "舰长",
      time: now,
      user: data.username || data.uname || "匿名",
      uid: data.uid || data.user_id || "",
      text: `${data.gift_name || "大航海"} x${data.num || 1}`
    };
  }

  if (command === "USER_TOAST_MSG") {
    const data = raw.data || {};
    return {
      id: makeId(),
      type: "guard",
      tag: "上舰",
      time: now,
      user: data.username || data.uname || "匿名",
      uid: data.uid || data.user_id || "",
      text: data.toast_msg || data.role_name || "开通大航海"
    };
  }

  return null;
}

function extractFansMedal(raw) {
  const candidates = [
    raw.info?.[3],
    raw.info?.[0]?.[16],
    raw.info?.[0]?.[17],
    raw.data?.fans_medal,
    raw.data?.medal_info
  ];

  for (const candidate of candidates) {
    const medal = normalizeFansMedal(candidate);
    if (medal) {
      return medal;
    }
  }

  return null;
}

function normalizeFansMedal(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    const level = toPositiveInteger(value[0]);
    const name = cleanMedalText(value[1]);
    const anchor = cleanMedalText(value[2]);
    const roomId = toPositiveInteger(value[3]);
    const isActive = value[11] === undefined ? true : Boolean(Number(value[11]));
    if (!level || !name) {
      return null;
    }
    return { name, level, anchor, roomId, active: isActive };
  }

  if (typeof value === "object") {
    const level = toPositiveInteger(value.medal_level || value.fans_medal_level || value.level);
    const name = cleanMedalText(value.medal_name || value.fans_medal_name || value.name || value.medal);
    const anchor = cleanMedalText(value.anchor_uname || value.anchor_name || value.target_name);
    const roomId = toPositiveInteger(value.room_id || value.target_id);
    const rawActive = value.is_lighted ?? value.light_status ?? value.active;
    const isActive = rawActive === undefined ? true : Boolean(Number(rawActive));
    if (!level || !name) {
      return null;
    }
    return { name, level, anchor, roomId, active: isActive };
  }

  return null;
}

function cleanMedalText(value) {
  return String(value || "").trim();
}

function toPositiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const EMOTE_MARKER_PATTERN = /\[[^\[\]\r\n]{1,40}\]/g;
const EMOTE_CONTAINER_KEY_PATTERN = /^(emots?|emoticons?|emojis?|emoji_info|bulge_display)$/i;
const EMOTE_URL_KEY_PATTERN = /^(url|uri|src|gif_url|webp_url|image_url|img_url)$/i;
const EMOTE_TEXT_KEY_PATTERN = /^(text|name|keyword|phrase|emoji|emote|emoticon|emoticon_name|emoji_name|descript)$/i;

function extractDanmakuEmotes(raw, messageText, roomEmotes = new Map()) {
  const bracketTexts = new Set(String(messageText || "").match(EMOTE_MARKER_PATTERN) || []);
  if (!bracketTexts.size) {
    return [];
  }

  const emotes = new Map();

  const addEmote = (markerValue, urlValue, source = {}) => {
    const marker = normalizeEmoteMarker(markerValue, bracketTexts);
    const url = normalizeImageUrl(urlValue);
    if (!marker || !url) {
      return;
    }
    if (emotes.has(marker)) {
      return;
    }
    emotes.set(marker, {
      text: marker,
      url,
      width: pickNumber(source, ["width", "w", "img_width"]),
      height: pickNumber(source, ["height", "h", "img_height"])
    });
  };

  for (const source of getDanmakuEmoteSources(raw)) {
    inspectEmoteContainer(source, "", bracketTexts, addEmote);
  }

  if (roomEmotes?.size) {
    for (const marker of bracketTexts) {
      const roomEmote = roomEmotes.get(marker);
      if (roomEmote && !emotes.has(marker)) {
        addEmote(marker, roomEmote.url, roomEmote);
      }
    }
  }

  return Array.from(emotes.values());
}

function getDanmakuEmoteSources(raw) {
  const sources = [];
  const meta = Array.isArray(raw.info?.[0]) ? raw.info[0] : [];
  collectEmoteSources(sources, meta[13]);
  collectEmoteSources(sources, meta[14]);
  collectEmoteSources(sources, meta[15]);
  collectEmoteSources(sources, raw.data?.emots);
  collectEmoteSources(sources, raw.data?.emoticons);
  return sources;
}

function collectEmoteSources(sources, value, depth = 0) {
  if (value == null || depth > 5) {
    return;
  }

  const parsed = typeof value === "string" ? maybeParseJson(value) : value;
  if (parsed == null || typeof parsed !== "object") {
    return;
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      collectEmoteSources(sources, item, depth + 1);
    }
    return;
  }

  if (hasBracketEmoteKey(parsed) || (pickEmoteMarker(parsed, "", new Set()) && pickImageUrl(parsed))) {
    sources.push(parsed);
  }

  for (const [key, item] of Object.entries(parsed)) {
    if (EMOTE_CONTAINER_KEY_PATTERN.test(key)) {
      sources.push(item);
      continue;
    }
    if (/^(extra|data)$/i.test(key) || /emot|emoji|bulge/i.test(key)) {
      collectEmoteSources(sources, item, depth + 1);
    }
  }
}

function inspectEmoteContainer(node, keyHint, bracketTexts, addEmote, depth = 0) {
  if (node == null || depth > 5) {
    return;
  }

  const parsed = typeof node === "string" ? maybeParseJson(node) : node;
  if (parsed == null || typeof parsed !== "object") {
    if (isBracketMarker(keyHint) && looksLikeImageUrl(node)) {
      addEmote(keyHint, node);
    }
    return;
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      inspectEmoteContainer(item, keyHint, bracketTexts, addEmote, depth + 1);
    }
    return;
  }

  const directMarker = pickEmoteMarker(parsed, keyHint, bracketTexts);
  const directUrl = pickImageUrl(parsed);
  if (directMarker && directUrl) {
    addEmote(directMarker, directUrl, parsed);
  }

  for (const [key, item] of Object.entries(parsed)) {
    if (isBracketMarker(key)) {
      if (typeof item === "string") {
        addEmote(key, item);
      } else {
        inspectEmoteContainer(item, key, bracketTexts, addEmote, depth + 1);
      }
      continue;
    }
    if (EMOTE_CONTAINER_KEY_PATTERN.test(key)) {
      inspectEmoteContainer(item, "", bracketTexts, addEmote, depth + 1);
    }
  }
}

function hasBracketEmoteKey(value) {
  return Object.keys(value || {}).some((key) => isBracketMarker(key));
}

function pickImageUrl(value) {
  for (const [key, item] of Object.entries(value || {})) {
    if (typeof item === "string" && EMOTE_URL_KEY_PATTERN.test(key) && looksLikeImageUrl(item)) {
      return item;
    }
  }
  return "";
}

function pickEmoteMarker(value, keyHint, bracketTexts) {
  const hinted = normalizeEmoteMarker(keyHint, bracketTexts);
  if (hinted) {
    return hinted;
  }

  for (const [key, item] of Object.entries(value || {})) {
    if (typeof item !== "string") {
      continue;
    }
    if (EMOTE_TEXT_KEY_PATTERN.test(key)) {
      const marker = normalizeEmoteMarker(item, bracketTexts);
      if (marker) {
        return marker;
      }
    }
  }

  return "";
}

function normalizeEmoteMarker(value, bracketTexts) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (isBracketMarker(text) && (!bracketTexts.size || bracketTexts.has(text))) {
    return text;
  }
  const wrapped = `[${text.replace(/^\[|\]$/g, "")}]`;
  if (bracketTexts.has(wrapped)) {
    return wrapped;
  }
  return "";
}

function isBracketMarker(value) {
  return /^\[[^\[\]\r\n]{1,40}\]$/.test(String(value || "").trim());
}

function looksLikeImageUrl(value) {
  return Boolean(normalizeImageUrl(value));
}

function normalizeImageUrl(value) {
  let url = String(value || "").trim();
  if (!url) {
    return "";
  }
  if (url.startsWith("//")) {
    url = `https:${url}`;
  }
  if (url.startsWith("http://")) {
    url = url.replace(/^http:/i, "https:");
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return "";
    }
    const path = parsed.pathname.toLowerCase();
    const isImagePath = /\.(png|jpe?g|gif|webp|avif|svg)$/.test(path);
    const isBiliCdn = /(^|\.)hdslb\.com$|(^|\.)biliimg\.com$/i.test(parsed.hostname);
    return isImagePath || isBiliCdn ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function maybeParseJson(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 6000 || !/^[\[{]/.test(text)) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickNumber(source, keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function makeId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function makeBuvid() {
  return `XY${crypto.randomBytes(16).toString("hex").toUpperCase()}`;
}

function defaultUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
}

module.exports = {
  BilibiliDanmakuClient
};
