# WAVE Crest — open MoQ console

A standalone, dependency-free **browser MoQ player + console** for the open
[Media over QUIC](https://datatracker.ietf.org/wg/moq/about/) transport (draft-ietf-moq-transport-18).
Subscribe to a live WAVE Crest track and decode H.264 in the browser via WebCodecs — no build step, no
framework, no server of its own.

## What this is

- `console/moq-wire-browser.js` — a pure-`Uint8Array` port of the MoQ draft-18 wire codec.
- `console/moq-player.js` — WebSocket subscribe → H.264 Annex-B reassembly → WebCodecs decode → canvas.
- `console/session.js` + `console/index.html` — a minimal console that opens a Crest ingest session and
  launches the viewer.

## Run it

```sh
npm run serve      # or: python3 -m http.server 8080 --directory console
# open http://localhost:8080/  — pass ?relay=wss://… &ns=… &track=… to view a track
```

## The open-core boundary

This is the **open client on-ramp**. The managed WAVE network — gateway auth, metering, the relay, and
the real-time-AI fabric — is a paid service (see [crest.wave.online](https://crest.wave.online)). The
client is free and open (Apache-2.0); the network is the product.

## License

Apache-2.0 © WAVE Online LLC. See [LICENSE](./LICENSE).
## Buildkite runbook

`guard-content-policy` refuses fork PRs (`BUILDKITE_PULL_REQUEST_REPO !=
BUILDKITE_REPO`) because secrets-queue steps consume host credentials.
Trusted re-run procedure for a fork PR: (a) the host checks out the
trusted base revision — not the PR head — for secrets-queue steps;
(b) the host withholds secret injection for the fork build; (c) a
manual approval gate is required before any trusted re-run. Never
approve a re-run that executes PR-head code with host credentials.
