// WAVE Crest console — open an ingest session through the same-origin gateway proxy, then relaunch the
// viewer against the returned MoQ namespace/track. No inline JS (CSP script-src 'self'); no imports.
const $ = (id) => document.getElementById(id);

async function openSession() {
  const key = $("key").value.trim();
  const out = $("session");
  out.textContent = "opening…";
  try {
    const res = await fetch("/api/v1/crest/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: "Bearer " + key } : {}),
      },
      body: JSON.stringify({ label: "console" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      out.textContent = "error " + res.status + ": " + (data.error || res.statusText);
      return;
    }
    out.textContent = JSON.stringify(data, null, 2);
    // Relaunch the viewer bound to this session's track. The player reads ns/track/relay from the query.
    const u = new URL(location.href);
    u.searchParams.set("ns", data.namespace);
    u.searchParams.set("track", data.track);
    u.searchParams.set("relay", data.relay);
    location.href = u.toString();
  } catch (e) {
    out.textContent = "network error: " + (e && e.message ? e.message : String(e));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const b = $("open");
  if (b) b.addEventListener("click", openSession);
});
