/**
 * The agent's one page, /whatsapp/qr: link the lodge phone, see that it is
 * linked, and log it out or restart it. Self-contained HTML; the script polls
 * /whatsapp/state every two seconds, so a QR WhatsApp has replaced is never
 * left on screen — scanning an expired QR is what "Couldn't link device" means.
 */

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">';

const STYLE = `
  :root { --forest:#0B2D26; --forest2:#123F35; --gold:#F8D272; --ink:#F2F7F5; --muted:#A9BDB6; --line:rgba(242,247,245,.12); --bad:#F2A08A; --good:#8FD9B6; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:radial-gradient(circle at 20% 0%, #164a3e 0, var(--forest) 55%); color:var(--ink);
         font-family:Inter, system-ui, -apple-system, Segoe UI, sans-serif; display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; }
  .wrap { width:100%; max-width:560px; }
  .brand { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
  .brand h1 { margin:0; font-family:'Cormorant Garamond', Georgia, serif; font-weight:500; font-size:28px; color:var(--gold); letter-spacing:.01em; }
  .brand small { display:block; color:var(--muted); font-size:12px; letter-spacing:.18em; text-transform:uppercase; margin-top:2px; }
  .pill { font-size:12px; padding:5px 10px; border-radius:999px; border:1px solid var(--line); color:var(--muted); white-space:nowrap; }
  .pill.ready { color:var(--good); border-color:rgba(143,217,182,.4); }
  .pill.qr { color:var(--gold); border-color:rgba(248,210,114,.4); }
  .pill.bad { color:var(--bad); border-color:rgba(242,160,138,.4); }
  .card { background:rgba(18,63,53,.72); border:1px solid var(--line); border-radius:20px; padding:28px; backdrop-filter:blur(6px); }
  h2 { font-family:'Cormorant Garamond', Georgia, serif; font-weight:500; font-size:30px; margin:0 0 6px; }
  p { line-height:1.55; margin:8px 0; }
  .muted { color:var(--muted); font-size:14px; }
  .center { text-align:center; }
  .qr { display:block; margin:18px auto 10px; width:300px; max-width:100%; background:#fff; padding:12px; border-radius:16px; }
  ol { padding-left:20px; color:var(--muted); font-size:14px; line-height:1.7; margin:14px 0 0; }
  ol b { color:var(--ink); font-weight:500; }
  .row { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
  button, .button { font:inherit; font-size:14px; border-radius:999px; padding:10px 18px; cursor:pointer; border:1px solid var(--line); background:transparent; color:var(--ink); }
  button.primary { background:var(--gold); color:var(--forest); border-color:var(--gold); font-weight:600; }
  button.danger { border-color:rgba(242,160,138,.5); color:var(--bad); }
  button.danger.solid { background:var(--bad); color:var(--forest); border-color:var(--bad); font-weight:600; }
  button:disabled { opacity:.5; cursor:default; }
  input { font:inherit; width:100%; padding:11px 14px; border-radius:12px; border:1px solid var(--line); background:rgba(11,45,38,.6); color:var(--ink); }
  input:focus { outline:2px solid rgba(248,210,114,.5); outline-offset:1px; }
  .code { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:34px; letter-spacing:.18em; color:var(--gold); text-align:center; margin:14px 0 4px; }
  .check { width:64px; height:64px; border-radius:50%; margin:0 auto 14px; display:grid; place-items:center; border:1px solid rgba(143,217,182,.45); color:var(--good); font-size:30px; }
  .spinner { width:38px; height:38px; margin:6px auto 16px; border-radius:50%; border:3px solid var(--line); border-top-color:var(--gold); animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .confirm { margin-top:18px; padding:16px; border-radius:14px; border:1px solid rgba(242,160,138,.35); background:rgba(242,160,138,.06); }
  .error { color:var(--bad); font-size:14px; }
  .foot { margin-top:16px; font-size:12px; color:var(--muted); display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .foot form { margin:0; }
  .foot button { padding:0; border:0; font-size:12px; color:var(--muted); text-decoration:underline; }
  details summary { cursor:pointer; color:var(--gold); font-size:14px; margin-top:18px; }
`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>${FONTS}<style>${STYLE}</style></head>
<body><div class="wrap">
  <div class="brand"><div><h1>Forest Creek</h1><small>WhatsApp agent</small></div><span class="pill" id="pill">&nbsp;</span></div>
  ${body}
</div></body></html>`;
}

export function loginPage(error?: string): string {
  return shell(
    "Sign in — WhatsApp agent",
    `<div class="card">
      <h2>Staff sign in</h2>
      <p class="muted">This page links the lodge's WhatsApp, so it is for staff only.</p>
      <form method="post" action="/whatsapp/login" style="margin-top:18px">
        <input type="password" name="password" placeholder="Admin password" autocomplete="current-password" required autofocus>
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        <div class="row"><button class="primary" type="submit">Sign in</button></div>
      </form>
    </div>`,
  );
}

/**
 * The control page. `controlsEnabled` is false when no admin password is
 * configured: the QR still works, but logout and restart are not offered.
 */
export function controlPage(options: { controlsEnabled: boolean; signedIn: boolean }): string {
  const foot = `<div class="foot">
      <span id="meta"></span>
      ${options.signedIn ? '<form method="post" action="/whatsapp/signout"><button type="submit">Sign out of this page</button></form>' : ""}
    </div>
    ${options.controlsEnabled ? "" : '<p class="muted" style="margin-top:14px">Logout and restart are off: set <code>WHATSAPP_ADMIN_PASSWORD</code> on the agent to protect this page and turn them on.</p>'}`;

  return shell(
    "WhatsApp — Forest Creek agent",
    `<div class="card" id="card"><div class="spinner"></div><p class="center muted">Checking the connection…</p></div>
    ${foot}
    <script>
    var CONTROLS = ${options.controlsEnabled ? "true" : "false"};
    var card = document.getElementById("card");
    var pill = document.getElementById("pill");
    var meta = document.getElementById("meta");
    var last = { key: "" };
    var confirming = false;
    var busy = false;
    var phoneValue = "";
    var pairError = "";

    function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
    function ago(iso) {
      if (!iso) return "";
      var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 60) return s + "s ago";
      if (s < 3600) return Math.round(s / 60) + " min ago";
      if (s < 86400) return Math.round(s / 3600) + " h ago";
      return Math.round(s / 86400) + " days ago";
    }
    function mb(n) { return (n / 1024 / 1024).toFixed(1) + " MB"; }
    function setPill(text, cls) { pill.textContent = text; pill.className = "pill " + (cls || ""); }

    function post(url, body) {
      return fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ("Request failed (" + r.status + ")")); return j; }); });
    }

    function controls(includeLogout) {
      if (!CONTROLS) return "";
      var html = '<div class="row"><button id="restart"' + (busy ? " disabled" : "") + '>Restart connection</button>';
      if (includeLogout) html += '<button class="danger" id="logout"' + (busy ? " disabled" : "") + '>Log out this device</button>';
      html += "</div>";
      if (confirming) {
        html += '<div class="confirm"><p style="margin-top:0"><b>Log out the lodge WhatsApp?</b></p>' +
          '<p class="muted">This unlinks the agent from the phone and deletes the saved session. Guests\\u2019 messages go unanswered until a phone is linked again with the new QR.</p>' +
          '<div class="row"><button class="danger solid" id="confirm-logout"' + (busy ? " disabled" : "") + '>Yes, log out</button><button id="cancel-logout">Cancel</button></div></div>';
      }
      return html;
    }

    function render(s) {
      var html = "";
      if (s.state === "disabled") {
        setPill("Switched off", "bad");
        html = "<h2>WhatsApp is switched off</h2><p class=\\"muted\\">This agent runs with WHATSAPP_ENABLED=false, so no phone can be linked.</p>";
      } else if (s.state === "ready") {
        setPill("Connected", "ready");
        var who = (s.pushName ? esc(s.pushName) + " · " : "") + (s.number ? "+" + esc(s.number) : "");
        var saved = s.session ? "Session saved to the database " + ago(s.session.updatedAt) + " (" + mb(s.session.sizeBytes) + ") — it survives restarts and redeploys."
                              : "Saving the session to the database — this happens within a minute of linking.";
        html = '<div class="center"><div class="check">&#10003;</div><h2>Connected</h2><p>' + (who || "Linked") + "</p>" +
          '<p class="muted">Guests\\u2019 WhatsApp messages are being answered by the booking agent.</p><p class="muted">' + saved + "</p></div>" + controls(true);
      } else if (s.state === "qr") {
        setPill("Waiting to be linked", "qr");
        html = "<h2>Link the lodge phone</h2>" +
          (s.lastError ? '<p class="error">' + esc(s.lastError) + "</p>" : "") +
          (s.qrDataUrl && s.qrSecondsLeft > 2
            ? '<img class="qr" alt="WhatsApp pairing QR code" src="' + s.qrDataUrl + '">' +
              '<p class="center muted">Scan within <b style="color:var(--gold)">' + s.qrSecondsLeft + "s</b> — a new code replaces it by itself.</p>"
            : s.qrDataUrl
              // An expired code is hidden, never left up to be scanned: that is what fails with "Couldn't link device".
              ? '<div class="spinner"></div><p class="center muted">That code has expired. WhatsApp sends a fresh one shortly — this page shows it as soon as it arrives.</p>'
              : '<div class="spinner"></div><p class="center muted">Preparing a QR code…</p>') +
          "<ol><li>Open <b>WhatsApp</b> on the phone you want the agent to answer from.</li>" +
          "<li>Tap <b>Settings</b> (or the \\u22ee menu) \\u2192 <b>Linked devices</b> \\u2192 <b>Link a device</b>.</li>" +
          "<li>Point the camera at this code. Any WhatsApp number can be linked.</li></ol>" +
          "<details" + (s.pairingCode || phoneValue ? " open" : "") + "><summary>Can\\u2019t scan? Link with a phone number instead</summary>" +
          (s.pairingCode
            ? '<div class="code">' + esc(s.pairingCode.code.slice(0, 4)) + "-" + esc(s.pairingCode.code.slice(4)) + "</div>" +
              '<p class="center muted">For +' + esc(s.pairingCode.phone) + ". On that phone: Linked devices \\u2192 Link a device \\u2192 <b>Link with phone number instead</b>, then enter this code.</p>"
            : '<p class="muted">Enter the number of the phone you will link, with its country code. WhatsApp shows a notification there; you type the 8-character code it gives you.</p>') +
          '<form id="pair" class="row" style="margin-top:10px"><input id="phone" inputmode="tel" placeholder="e.g. 263771234567" value="' + esc(phoneValue) + '" style="flex:1;min-width:200px">' +
          '<button class="primary" type="submit"' + (busy ? " disabled" : "") + ">" + (s.pairingCode ? "New code" : "Get code") + "</button></form>" +
          '<p class="error" id="pair-error">' + esc(pairError) + "</p></details>" + controls(false);
      } else if (s.state === "authenticated") {
        setPill("Linking\\u2026", "qr");
        html = '<div class="center"><div class="spinner"></div><h2>Linked — finishing up</h2><p class="muted">WhatsApp accepted the phone. Loading chats\\u2026</p></div>';
      } else if (s.state === "starting") {
        setPill("Starting\\u2026", "");
        html = '<div class="center"><div class="spinner"></div><h2>Starting WhatsApp</h2><p class="muted">Restoring the saved session, or preparing a new QR code.</p></div>';
      } else {
        setPill(s.state === "failed" ? "Error" : "Disconnected", "bad");
        html = "<h2>" + (s.state === "failed" ? "WhatsApp could not start" : "WhatsApp disconnected") + "</h2>" +
          '<p class="error">' + esc(s.lastError || "No connection.") + "</p>" +
          '<p class="muted">The agent tries again by itself in a few seconds' + (CONTROLS ? ", or restart it now." : ".") + "</p>" + controls(false);
      }
      card.innerHTML = html;
      meta.textContent = s.messagesHandled + " messages answered since " + new Date(s.startedAt).toLocaleString();
      bind();
    }

    function bind() {
      var restart = document.getElementById("restart");
      if (restart) restart.onclick = function () { act("/whatsapp/restart"); };
      var logout = document.getElementById("logout");
      if (logout) logout.onclick = function () { confirming = true; refresh(true); };
      var cancel = document.getElementById("cancel-logout");
      if (cancel) cancel.onclick = function () { confirming = false; refresh(true); };
      var yes = document.getElementById("confirm-logout");
      if (yes) yes.onclick = function () { confirming = false; act("/whatsapp/logout"); };
      var phone = document.getElementById("phone");
      if (phone) phone.oninput = function () { phoneValue = phone.value; };
      var pair = document.getElementById("pair");
      if (pair) pair.onsubmit = function (e) {
        e.preventDefault();
        busy = true; refresh(true);
        post("/whatsapp/pairing-code", { phone: phoneValue })
          .then(function () { pairError = ""; }, function (err) { pairError = err.message; })
          .then(function () { busy = false; refresh(true); });
      };
    }

    function act(url) {
      busy = true; refresh(true);
      post(url).catch(function (err) { setPill(err.message, "bad"); }).then(function () { busy = false; refresh(true); });
    }

    var lastState = null;
    function refresh(force) {
      // Typing a number must not be wiped by the two-second refresh.
      var typing = document.activeElement && document.activeElement.id === "phone";
      fetch("/whatsapp/state", { credentials: "same-origin", cache: "no-store" })
        .then(function (r) { if (r.status === 401) { location.reload(); throw new Error("signed out"); } return r.json(); })
        .then(function (s) {
          var key = JSON.stringify([s.state, s.qrDataUrl, s.qrSecondsLeft, s.pairingCode, s.number, s.lastError, s.session && s.session.updatedAt, busy, confirming, pairError]);
          if (s.state !== "ready") confirming = false;
          if (!force && (key === last.key || typing)) { lastState = s; return; }
          last.key = key; lastState = s; render(s);
        })
        .catch(function () { setPill("Agent unreachable", "bad"); });
    }
    refresh(true);
    setInterval(function () { refresh(false); }, 2000);
    </script>`,
  );
}
