<div align="center">

# crest-console

**A standalone, dependency-free browser MoQ (Media over QUIC, draft-ietf-moq-transport-18) player and console — subscribe to a live WAVE Crest track and decode H.264 in-browser via WebCodecs. No build step, no framework.**

![kind](https://img.shields.io/badge/kind-browser--client-555?style=flat-square) ![domain](https://img.shields.io/badge/domain-video--moq-0a7?style=flat-square) ![lang](https://img.shields.io/badge/lang-JavaScript-f7df1e?style=flat-square) ![visibility](https://img.shields.io/badge/visibility-public-brightgreen?style=flat-square) ![license](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)

[Live](https://crest.wave.online) · [wave.online](https://wave.online) · [github](https://github.com/wave-av/crest-console)

</div>

---

## What this is

- `console/moq-wire-browser.js` — a pure-`Uint8Array` browser port of the MoQ draft-18 wire codec
  (ported from WAVE's own relay codec; message types include `SETUP`, `SUBSCRIBE`, `PUBLISH`, `FETCH`,
  `NAMESPACE`, and more).
- `console/moq-player.js` — subscribes to a track over WebSocket, reassembles H.264 access units, and
  decodes them with the WebCodecs `VideoDecoder` API to a `<canvas>`. H.264 decode requires a
  Chrome/Chromium build with proprietary codecs.
- `console/session.js` + `console/index.html` — a minimal console that opens a Crest ingest session
  through a same-origin gateway proxy (`POST /api/v1/crest/session`) and launches the viewer against the
  returned namespace/track.

## Run it

```sh
npm run serve      # or: python3 -m http.server 8080 --directory console
# open http://localhost:8080/
# pass ?relay=wss://…&ns=…&track=… to view a specific track (defaults to wss://moq.wave.online)
```

## The open-core boundary

This is the **open client on-ramp**. The managed WAVE network — gateway auth, metering, the relay, and
the real-time-AI fabric — is a paid service (see [crest.wave.online](https://crest.wave.online)). The
client here is free and open (Apache-2.0); the network is the product.

## License

Apache-2.0 © WAVE Online, LLC. See [LICENSE](./LICENSE).

---

<div align="center">

**Built by [WAVE Online, LLC](https://wave.online)** · [wave.online](https://wave.online) · [Docs](https://docs.wave.online)

</div>
