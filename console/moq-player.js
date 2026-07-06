// moq-player.js — WAVE Crest browser MoQ player (spine step E5.5).
// Subscribes to a track on the live relay over WebSocket (draft-18), reassembles the H.264 access
// units the publisher (E5.4) sent one-per-object, and decodes them with WebCodecs VideoDecoder to a
// <canvas>. This closes the cloud preview loop: device → relay → any browser, anywhere.
//
// H.264 decode requires a Chrome/Chromium build with proprietary codecs (real Chrome has it).

import {
  MOQ_MSG, MOQ_ROLE, MOQ_OBJECT_STATUS, WS_KIND,
  encodeSetup, encodeSubscribe, decodeObject, parseControl, tagFrame, untagFrame,
} from "./moq-wire-browser.js";

const q = new URLSearchParams(location.search);
const RELAY = q.get("relay") || "wss://moq.wave.online";
const NS = q.get("ns") || "crest-demo";
const TRACK = q.get("track") || "v";

const stats = (window.__crestStats = {
  relay: RELAY, ns: NS, track: TRACK,
  connected: false, subscribed: false, objects: 0, keyframes: 0, configured: false,
  decodedFrames: 0, codec: null, width: 0, height: 0, lastError: null,
});
const setStatus = (t) => { const el = document.getElementById("status"); if (el) el.textContent = t; };
const render = () => {
  const el = document.getElementById("stats");
  if (el) el.textContent = JSON.stringify(stats, null, 2);
};

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");

// ── H.264 Annex-B helpers over a reassembled AU (payload carries 00 00 00 01 start codes) ─────────
function* nals(au) {
  let i = 0;
  const n = au.length;
  const isStart = (p) => p + 2 < n && au[p] === 0 && au[p + 1] === 0 && au[p + 2] === 1;
  // advance to first start code
  while (i < n && !isStart(i)) i++;
  while (i < n) {
    i += 3; // skip 00 00 01
    let j = i;
    while (j < n && !isStart(j)) j++;
    let end = j;
    if (end > i && au[end - 1] === 0) end--; // trailing zero belongs to next start code
    if (end > i) yield au.subarray(i, end);
    i = j;
  }
}
const nalType = (nal) => nal[0] & 0x1f;
function inspect(au) {
  let key = false;
  let sps = null;
  for (const nal of nals(au)) {
    const t = nalType(nal);
    if (t === 5) key = true; // IDR slice
    if (t === 7 && !sps) sps = nal; // SPS
  }
  return { key, sps };
}
function codecFromSps(sps) {
  // sps[0] = NAL header (0x67); profile_idc, constraint_flags, level_idc follow
  if (!sps || sps.length < 4) return "avc1.42E01E";
  const h = (b) => b.toString(16).padStart(2, "0");
  return `avc1.${h(sps[1])}${h(sps[2])}${h(sps[3])}`;
}

let decoder = null;
let tsHz = 30; // assumed fps for monotonic timestamps
let frameIdx = 0;

function onFrame(frame) {
  stats.decodedFrames++;
  stats.width = frame.displayWidth;
  stats.height = frame.displayHeight;
  if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
  if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  frame.close();
  render();
}

function ensureDecoder(sps) {
  if (decoder) return true;
  if (!("VideoDecoder" in window)) { stats.lastError = "WebCodecs VideoDecoder unavailable"; render(); return false; }
  const codec = codecFromSps(sps);
  decoder = new VideoDecoder({
    output: onFrame,
    error: (e) => { stats.lastError = String(e?.message || e); render(); },
  });
  try {
    decoder.configure({ codec, optimizeForLatency: true });
    stats.configured = true;
    stats.codec = codec;
  } catch (e) {
    stats.lastError = `configure failed: ${e?.message || e}`;
    decoder = null;
    render();
    return false;
  }
  return true;
}

function handleAu(au) {
  const { key, sps } = inspect(au);
  if (key) stats.keyframes++;
  // must start decoding on a keyframe (that carries SPS/PPS)
  if (!decoder) {
    if (!key || !sps) return; // wait for first keyframe
    if (!ensureDecoder(sps)) return;
  }
  const type = key ? "key" : "delta";
  try {
    decoder.decode(new EncodedVideoChunk({
      type,
      timestamp: Math.round((frameIdx++ * 1e6) / tsHz),
      data: au,
    }));
  } catch (e) {
    stats.lastError = `decode failed: ${e?.message || e}`;
    render();
  }
}

function start() {
  setStatus(`connecting ${RELAY} …`);
  const url = `${RELAY}/v1/subscribe/${encodeURIComponent(NS)}/${encodeURIComponent(TRACK)}`;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const waiters = new Map(); // control type -> resolve
  const onControl = (type, payload) => { const w = waiters.get(type); if (w) { waiters.delete(type); w(payload); } };
  const waitControl = (type, ms = 10000) =>
    new Promise((res, rej) => {
      const to = setTimeout(() => { waiters.delete(type); rej(new Error(`timeout control 0x${type.toString(16)}`)); }, ms);
      waiters.set(type, (p) => { clearTimeout(to); res(p); });
    });
  const sendControl = (bytes) => ws.send(tagFrame(WS_KIND.CONTROL, bytes));

  ws.addEventListener("message", (ev) => {
    const bytes = new Uint8Array(ev.data);
    let f;
    try { f = untagFrame(bytes); } catch { return; }
    if (f.kind === WS_KIND.CONTROL) {
      let c;
      try { c = parseControl(f.body); } catch { return; }
      onControl(c.type, c.payload);
      return;
    }
    if (f.kind === WS_KIND.OBJECT) {
      let o;
      try { o = decodeObject(f.body); } catch { return; }
      if (o.status !== MOQ_OBJECT_STATUS.NORMAL || o.payload.length === 0) return;
      stats.objects++;
      handleAu(o.payload);
      render();
    }
  });

  ws.addEventListener("open", async () => {
    stats.connected = true;
    setStatus("handshaking …");
    try {
      sendControl(encodeSetup({ role: MOQ_ROLE.SUBSCRIBER, maxSubscriptions: 0n }));
      await waitControl(MOQ_MSG.SETUP);
      sendControl(encodeSubscribe({ requestId: 1n, trackNamespace: [NS], trackName: TRACK }));
      await waitControl(MOQ_MSG.SUBSCRIBE_OK);
      stats.subscribed = true;
      setStatus(`subscribed ns=${NS} track=${TRACK} — waiting for keyframe`);
      render();
    } catch (e) {
      stats.lastError = String(e?.message || e);
      setStatus(`handshake failed: ${stats.lastError}`);
      render();
    }
  });
  ws.addEventListener("error", () => { stats.lastError = stats.lastError || "ws error"; setStatus("ws error"); render(); });
  ws.addEventListener("close", () => { setStatus("closed"); render(); });
}

render();
start();
