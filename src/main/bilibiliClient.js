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
    this.reconnectTimer = null;
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.cookie = "";
    this.uid = 0;
  }

  async connect(roomId, options = {}) {
    this.disconnect(false);
    this.roomId = String(roomId || "").trim();
    this.cookie = buildCookie(options.sessdata);
    this.uid = 0;
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
    clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
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
        this.heartbeatTimer = null;
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
        continue;
      }

      if (operation === OP_HEARTBEAT_REPLY && body.length >= 4) {
        this.emit("popularity", body.readUInt32BE(0));
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
          const normalized = normalizeEvent(message);
          if (normalized) {
            this.emit("event", normalized);
          }
        }
      }
    }
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

function normalizeEvent(raw) {
  const command = String(raw.cmd || "").split(":")[0];
  const now = Date.now();

  if (command === "DANMU_MSG") {
    return {
      id: makeId(),
      type: "danmaku",
      tag: "弹幕",
      time: now,
      user: raw.info?.[2]?.[1] || "匿名",
      uid: raw.info?.[2]?.[0] || "",
      text: raw.info?.[1] || ""
    };
  }

  if (command === "SEND_GIFT") {
    const data = raw.data || {};
    return {
      id: makeId(),
      type: "gift",
      tag: "礼物",
      time: now,
      user: data.uname || "匿名",
      uid: data.uid || data.sender_uid || "",
      text: `${data.giftName || "礼物"} x${data.num || 1}`
    };
  }

  if (command === "COMBO_SEND") {
    const data = raw.data || {};
    return {
      id: makeId(),
      type: "gift",
      tag: "连击",
      time: now,
      user: data.uname || "匿名",
      uid: data.uid || data.sender_uid || "",
      text: `${data.gift_name || "礼物"} x${data.combo_num || data.total_num || 1}`
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
