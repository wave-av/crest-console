// moq-wire-browser.js — browser port of the draft-ietf-moq-transport-18 wire codec.
// Ported VERBATIM in behaviour from WAVE's own MoQ wire codec (itself vendored from the
// live relay's the relay codec); node:buffer stripped, Uint8Array/DataView + global TextEncoder used so
// it runs in a browser. Guaranteed wire-compatible with wss://moq.wave.online. Do not hand-diverge —
// resync from the relay codec if the relay's codec changes (freshness: draft-18, verified 2026-07-05).

export const MOQ_MSG = {
  SETUP: 12032, GOAWAY: 16, SUBSCRIBE: 3, SUBSCRIBE_OK: 4, REQUEST_ERROR: 5,
  PUBLISH_NAMESPACE: 6, REQUEST_OK: 7, REQUEST_UPDATE: 2, PUBLISH: 29, PUBLISH_DONE: 11,
  FETCH: 22, FETCH_OK: 24, TRACK_STATUS: 13, SUBSCRIBE_NAMESPACE: 80, NAMESPACE: 8, NAMESPACE_DONE: 14,
};
export const MOQ_OBJECT_STATUS = { NORMAL: 0, END_OF_GROUP: 3, END_OF_TRACK: 4 };
export const MOQ_ROLE = { PUBLISHER: 0, SUBSCRIBER: 1, PUBSUB: 2 };
export const WS_KIND = { CONTROL: 0, OBJECT: 1 };

export class Writer {
  buf = [];
  bytes() { return new Uint8Array(this.buf); }
  u8(v) { this.buf.push(v & 255); return this; }
  u16(v) { this.buf.push((v >> 8) & 255, v & 255); return this; }
  raw(b) { for (const x of b) this.buf.push(x); return this; }
  varint(value) {
    const v = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
    if (v < 0n) throw new RangeError("varint must be non-negative");
    let n = 9;
    for (let k = 1; k <= 8; k++) { if (v < 1n << BigInt(7 * k)) { n = k; break; } }
    if (n === 9 && v >= 1n << 64n) throw new RangeError("varint exceeds 2^64-1");
    const out = new Uint8Array(n);
    let tmp = v;
    for (let i = n - 1; i >= 0; i--) { out[i] = Number(tmp & 0xffn); tmp >>= 8n; }
    if (n <= 8) out[0] |= (255 << (9 - n)) & 255; else out[0] = 255;
    return this.raw(out);
  }
  bytesLP(b) { return this.varint(b.length).raw(b); }
  strLP(s) { return this.bytesLP(new TextEncoder().encode(s)); }
  tuple(fields) { this.varint(fields.length); for (const f of fields) this.strLP(f); return this; }
}

export class Reader {
  b; pos = 0;
  constructor(b) { this.b = b; }
  get remaining() { return this.b.length - this.pos; }
  u8() { if (this.pos >= this.b.length) throw new RangeError("read past end (u8)"); return this.b[this.pos++]; }
  u16() { const hi = this.u8(); const lo = this.u8(); return (hi << 8) | lo; }
  raw(len) {
    if (this.pos + len > this.b.length) throw new RangeError("read past end (raw)");
    const out = this.b.subarray(this.pos, this.pos + len); this.pos += len; return out;
  }
  varint() {
    const b0 = this.u8(); let lead = 0; let probe = b0;
    while (lead < 8 && probe & 128) { lead++; probe = (probe << 1) & 255; }
    if (lead === 8) { let v2 = 0n; for (let i = 0; i < 8; i++) v2 = (v2 << 8n) | BigInt(this.u8()); return v2; }
    const n = lead + 1;
    let v = BigInt(b0 & (255 >> n));
    for (let i = 1; i < n; i++) v = (v << 8n) | BigInt(this.u8());
    return v;
  }
  varintNum() {
    const v = this.varint();
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("varint exceeds safe integer");
    return Number(v);
  }
  bytesLP() { return this.raw(this.varintNum()); }
  strLP() { return new TextDecoder().decode(this.bytesLP()); }
}

export function frameControl(type, payload) {
  if (payload.length > 65535) throw new RangeError("control payload exceeds 16-bit length");
  return new Writer().varint(type).u16(payload.length).raw(payload).bytes();
}
export function parseControl(bytes) {
  const r = new Reader(bytes);
  const type = r.varintNum();
  const len = r.u16();
  return { type, payload: r.raw(len) };
}
export function encodeSetup(m) {
  const w = new Writer().varint(m.role).varint(m.maxSubscriptions);
  if (m.path !== undefined) w.varint(1).varint(1).strLP(m.path); else w.varint(0);
  return frameControl(MOQ_MSG.SETUP, w.bytes());
}
export function encodeSubscribe(m) {
  const w = new Writer().varint(m.requestId).tuple(m.trackNamespace).strLP(m.trackName);
  return frameControl(MOQ_MSG.SUBSCRIBE, w.bytes());
}
export function tagFrame(kind, body) {
  const out = new Uint8Array(body.length + 1); out[0] = kind & 255; out.set(body, 1); return out;
}
export function untagFrame(bytes) {
  if (bytes.length < 1) throw new RangeError("empty WS frame");
  return { kind: bytes[0], body: bytes.subarray(1) };
}
export function decodeObject(bytes) {
  const r = new Reader(bytes);
  const trackAlias = r.varint();
  const groupId = r.varint();
  const objectId = r.varint();
  const status = r.varintNum();
  const payload = r.bytesLP();
  return { trackAlias, groupId, objectId, status, payload };
}
