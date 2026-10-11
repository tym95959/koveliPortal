// ============================================================
// KOVELI STAFF PORTAL - shared script, loaded by every page
// Sign-in, top bar, inbox, alerts, pop-ups and small helpers.
// Everything is reached through the single global "K".
// ============================================================
(function () {
  "use strict";

  const TZ = "Indian/Maldives";
  const SEEN_KEY = "koveliSeen:";
  const DEVICE_KEY = "koveliDeviceId";
  const MESSAGING_SDK = "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js";

  const K = {};
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  K.$ = $; K.esc = esc;
  K.id = id => document.getElementById(id);

  // ---------- Dates (always Maldives time) ----------
  const pad = n => String(n).padStart(2, "0");
  K.iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  K.parse = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  K.today = () => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
  K.addDays = (isoDate, n) => { const d = K.parse(isoDate); d.setDate(d.getDate() + n); return K.iso(d); };
  K.fmt = (isoDate, long) => {
    if (!isoDate) return "";
    const d = K.parse(isoDate);
    return d.toLocaleDateString("en-GB", long ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };
  K.millis = v => !v ? 0 : typeof v === "number" ? v : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  K.when = v => { const t = K.millis(v); return t ? new Date(t).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };

  // ---------- Roles ----------
  K.roleOf = v => { const r = String(v || "").trim().toLowerCase(); return r === "admin" || r === "administrator" ? "admin" : r === "supervisor" || r === "sup" ? "supervisor" : "staff"; };
  K.roleLabel = r => ({ admin: "Admin", supervisor: "Supervisor", staff: "Staff" }[K.roleOf(r)]);

  // ---------- Duty codes ----------
  const DUTY_CLASS = { "0730": "d0730", "0800": "d0800", "0830": "d0830", "1530": "d1530", "1630": "d1630", "1730": "d1730", "0030": "d0030", "OFF": "dOFF", "A-Leave": "dALEAVE" };
  K.DUTY_ORDER = ["0730", "0800", "0830", "1530", "1630", "1730", "0030"];
  K.dutyClass = code => DUTY_CLASS[code] || (code ? "dCUSTOM" : "");
  K.dutyChip = code => code ? `<span class="duty ${K.dutyClass(code)}">${esc(code)}</span>` : "";
  K.tag = status => { const s = String(status || "pending").toLowerCase(); return `<span class="tag ${esc(s)}">${esc(s.charAt(0).toUpperCase() + s.slice(1))}</span>`; };

  // ---------- Small pop-ups ----------
  let toastTimer = null;
  K.toast = (message, kind) => {
    let t = K.id("kToast");
    if (!t) { t = document.createElement("div"); t.id = "kToast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = String(message);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, kind === "bad" ? 6000 : 3600);
  };

  K.sheet = ({ title, html = "", foot = "", wide = false, onClose } = {}) => {
    const veil = document.createElement("div");
    veil.className = "veil";
    veil.innerHTML = `<div class="sheet${wide ? " wide" : ""}" role="dialog" aria-modal="true"><div class="sheet-head"><h2>${esc(title || "")}</h2><button class="x" type="button" aria-label="Close">×</button></div><div class="sheet-body">${html}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ""}</div>`;
    const close = () => { veil.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); };
    const onKey = e => { if (e.key === "Escape") close(); };
    veil.addEventListener("click", e => { if (e.target === veil) close(); });
    $(".x", veil).onclick = close;
    document.addEventListener("keydown", onKey);
    document.body.appendChild(veil);
    return { el: veil, body: $(".sheet-body", veil), close };
  };

  K.confirm = (text, { ok = "Yes", danger = false, title = "Please confirm" } = {}) => new Promise(resolve => {
    let answered = false;
    const s = K.sheet({
      title, html: `<p>${esc(text).replace(/\n/g, "<br>")}</p>`,
      foot: `<button class="btn" data-no type="button">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-yes type="button">${esc(ok)}</button>`,
      onClose: () => { if (!answered) resolve(false); }
    });
    $("[data-no]", s.el).onclick = () => s.close();
    $("[data-yes]", s.el).onclick = () => { answered = true; resolve(true); s.close(); };
    $("[data-yes]", s.el).focus();
  });

  K.ask = (text, { ok = "Save", placeholder = "", title = "One more thing" } = {}) => new Promise(resolve => {
    let answered = false;
    const s = K.sheet({
      title, html: `<label class="field"><span>${esc(text)}</span><textarea id="kAsk" rows="3" placeholder="${esc(placeholder)}"></textarea></label>`,
      foot: `<button class="btn" data-no type="button">Cancel</button><button class="btn primary" data-yes type="button">${esc(ok)}</button>`,
      onClose: () => { if (!answered) resolve(null); }
    });
    $("[data-no]", s.el).onclick = () => s.close();
    $("[data-yes]", s.el).onclick = () => { answered = true; resolve($("#kAsk", s.el).value.trim()); s.close(); };
    $("#kAsk", s.el).focus();
  });

  // Runs a task behind a button: no double clicks, and a failure is always shown.
  K.busy = async (button, task) => {
    if (button && button.disabled) return;
    const label = button ? button.innerHTML : "";
    if (button) { button.disabled = true; button.innerHTML = "Working…"; }
    try { return await task(); }
    catch (error) { console.error(error); K.toast(K.explain(error), "bad"); }
    finally { if (button) { button.disabled = false; button.innerHTML = label; } }
  };

  K.explain = error => {
    const text = String(error?.message || error || "Something went wrong.");
    if (/permission|insufficient/i.test(text)) return "You are not allowed to do that. If this looks wrong, ask an Admin.";
    if (/offline|network|unavailable|failed to fetch/i.test(text)) return "No connection. Check the internet and try again.";
    return text;
  };

  // ---------- Server calls ----------
  K.api = async (path, body, { open = false } = {}) => {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (!open) {
      const user = firebase.auth().currentUser;
      if (user) headers.Authorization = "Bearer " + await user.getIdToken();
    }
    const response = await fetch(path, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || `The server answered ${response.status}.`);
    return data;
  };

  // Inbox + phone alert + email, in one call. A failure here never undoes the action itself.
  K.notify = async payload => {
    try { return await K.api("/api/notify", payload); }
    catch (error) { console.warn("Notify:", error); return { error: K.explain(error) }; }
  };

  // ---------- Sign-in ----------
  function authReady() {
    return new Promise(resolve => { const stop = firebase.auth().onAuthStateChanged(user => { stop(); resolve(user || null); }); });
  }

  K.directory = () => K.api("/api/staff-directory", undefined, { open: true });

  K.signIn = async ({ staffId, method, code, remember }) => {
    const data = await K.api("/api/login", { staffId, method, code }, { open: true });
    const auth = firebase.auth();
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithCustomToken(data.token);
    try { localStorage.setItem("koveliLastUser", JSON.stringify({ id: data.profile.id, name: data.profile.name })); } catch (_) {}
    return data.profile;
  };

  K.signOut = async () => {
    try { await forgetDevice(); } catch (_) {}
    try { await firebase.auth().signOut(); } catch (_) {}
    location.href = "index.html";
  };

  function pageName() { return (location.pathname.split("/").pop() || "index.html").toLowerCase(); }

  // Call once per page. Returns the signed-in person, or null on the sign-in page.
  K.start = async ({ need = "any", shell = true } = {}) => {
    K.db = firebase.firestore();
    K.stamp = () => firebase.firestore.FieldValue.serverTimestamp();
    const onIndex = pageName() === "index.html";
    const toSignIn = () => { location.replace("index.html?next=" + encodeURIComponent(pageName() + location.search)); };

    const user = await authReady();
    if (!user) { if (!onIndex) toSignIn(); return null; }

    let staff = null;
    try {
      const snap = await K.db.collection("staff").doc(user.uid).get();
      staff = snap.exists ? snap.data() : null;
    } catch (error) {
      K.toast(K.explain(error), "bad");
      throw error;
    }
    if (!staff || staff.active === false) {
      await firebase.auth().signOut();
      if (!onIndex) toSignIn();
      return null;
    }

    K.me = {
      id: user.uid, name: staff.name || "Staff", role: K.roleOf(staff.role), rcno: staff.rcno || user.uid, email: staff.email || "",
      sickAllowance: Number(staff.sickAllowance ?? 30), frlAllowance: Number(staff.frlAllowance ?? 5), frlRenewal: staff.frlRenewal || ""
    };
    K.isAdmin = K.me.role === "admin";
    K.isManager = K.me.role !== "staff";

    if ((need === "admin" && !K.isAdmin) || (need === "manager" && !K.isManager)) {
      location.replace("index.html");
      return null;
    }
    if (shell) { drawShell(); startInbox(); refreshAlerts(); }
    return K.me;
  };

  // ---------- Top bar and phone tab bar ----------
  const ICON = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    roster: '<path d="M3 5h18v15H3zM3 10h18M8 3v4M16 3v4"/>',
    leave: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
    annual: '<path d="M2 16l20-6-3-3-6 2-7-5-2 1 5 6-5 2-2-2-1 1z"/>',
    duty: '<path d="M7 7h13l-3-3M17 17H4l3 3"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  function drawShell() {
    if ($(".topbar")) return;
    const page = pageName();
    const links = [
      ["index.html", "Home", "home"], ["roster.html", "Roster", "roster"], ["leave.html", "Leave", "leave"],
      ["annual.html", "Annual leave", "annual"], ["duty.html", "Duty change", "duty"]
    ];
    const extra = [];
    if (K.isManager) extra.push(["roster-editor.html", "Roster editor"]);
    if (K.isAdmin) extra.push(["admin.html", "Admin"]);
    const on = href => page === href ? ' class="on" aria-current="page"' : "";

    const bar = document.createElement("header");
    bar.className = "topbar no-print";
    bar.innerHTML = `<div class="topbar-inner">
      <a class="brand" href="index.html"><span class="brand-mark"><img src="icons/logo-96.png" alt=""></span><span class="brand-name">Koveli</span></a>
      <nav class="nav" aria-label="Main">${links.concat(extra).map(([href, label]) => `<a href="${href}"${on(href)}>${label}</a>`).join("")}</nav>
      <div class="topbar-tools">
        <div class="who"><b>${esc(K.me.name)}</b><span>${K.roleLabel(K.me.role)}</span></div>
        <button class="icon-btn" id="kInboxBtn" type="button">Inbox <span class="count" id="kInboxCount"></span></button>
        <button class="icon-btn" id="kMenuBtn" type="button" aria-label="Menu">Menu</button>
      </div></div>`;
    document.body.prepend(bar);

    const tabs = document.createElement("nav");
    tabs.className = "tabbar no-print";
    tabs.setAttribute("aria-label", "Main");
    tabs.innerHTML = links.map(([href, label, icon]) => `<a href="${href}"${on(href)}>${svg(icon)}<span>${label.replace("Annual leave", "Annual").replace("Duty change", "Duty")}</span></a>`).join("");
    document.body.appendChild(tabs);
    document.body.classList.add("has-shell");

    K.id("kInboxBtn").onclick = openInbox;
    K.id("kMenuBtn").onclick = () => {
      const s = K.sheet({
        title: K.me.name,
        html: `<p class="hint" style="margin-bottom:12px">${K.roleLabel(K.me.role)}, staff number ${esc(K.me.rcno)}</p>
          <div class="stack" style="gap:8px">
            ${extra.map(([href, label]) => `<a class="btn block" href="${href}">${label}</a>`).join("")}
            <a class="btn block" href="security.html">Change PIN or pattern</a>
            <button class="btn block" id="kAlertsBtn" type="button">Turn on alerts on this device</button>
            <button class="btn block danger" id="kOutBtn" type="button">Sign out</button>
          </div>`
      });
      $("#kOutBtn", s.el).onclick = K.signOut;
      const alerts = $("#kAlertsBtn", s.el);
      alertsOn().then(yes => { if (yes) alerts.textContent = "Alerts are on for this device"; });
      alerts.onclick = () => K.busy(alerts, async () => { await enableAlerts(true); K.toast("Alerts are on for this device.", "ok"); s.close(); });
    };
  }

  // ---------- Inbox ----------
  let notes = [], seen = new Set(), popupOpen = false;
  const seenKey = () => SEEN_KEY + K.me.id;
  function saveSeen() { try { localStorage.setItem(seenKey(), JSON.stringify([...seen].slice(-400))); } catch (_) {} }
  const unread = () => notes.filter(n => !seen.has(n.id));

  function startInbox() {
    try { seen = new Set(JSON.parse(localStorage.getItem(seenKey()) || "[]")); } catch (_) { seen = new Set(); }
    const parts = { mine: [], role: [] };
    const cutoff = Date.now() - 60 * 86400000;
    const rebuild = () => {
      const map = new Map();
      [...parts.mine, ...parts.role].forEach(n => { if (n.time >= cutoff && n.actorId !== K.me.id) map.set(n.id, n); });
      notes = [...map.values()].sort((a, b) => b.time - a.time).slice(0, 120);
      const count = K.id("kInboxCount");
      if (count) count.textContent = unread().length ? String(Math.min(unread().length, 99)) : "";
      showPopup();
    };
    const read = snap => snap.docs.map(d => { const x = d.data() || {}; return { id: d.id, ...x, time: K.millis(x.createdAt) || Date.now() }; });
    const col = K.db.collection("portalNotifications");
    col.where("recipientIds", "array-contains", K.me.id).onSnapshot(s => { parts.mine = read(s); rebuild(); }, e => console.warn("Inbox:", e.message));
    col.where("recipientRoles", "array-contains", K.me.role).onSnapshot(s => { parts.role = read(s); rebuild(); }, e => console.warn("Inbox:", e.message));
  }

  function openInbox() {
    const s = K.sheet({
      title: "Inbox", wide: true,
      html: notes.length
        ? `<div style="margin:-16px">${notes.map(n => `<button class="inbox-item${seen.has(n.id) ? "" : " new"}" data-id="${esc(n.id)}" data-url="${esc(n.url || "")}" type="button"><b>${esc(n.title)}</b><span>${esc(n.detail)}</span><small>${esc(n.actorName ? n.actorName + ", " : "")}${esc(K.when(n.time))}</small></button>`).join("")}</div>`
        : `<div class="empty">Nothing here yet. Approvals, requests and messages from Admin will show up here.</div>`,
      foot: notes.length ? `<button class="btn" id="kReadAll" type="button">Mark all as read</button>` : ""
    });
    const markAll = () => { notes.forEach(n => seen.add(n.id)); saveSeen(); const c = K.id("kInboxCount"); if (c) c.textContent = ""; };
    const all = $("#kReadAll", s.el);
    if (all) all.onclick = () => { markAll(); s.close(); };
    s.el.querySelectorAll(".inbox-item").forEach(item => item.onclick = () => {
      seen.add(item.dataset.id); saveSeen();
      const url = item.dataset.url;
      if (url && url !== pageName()) location.href = url; else { s.close(); const c = K.id("kInboxCount"); if (c) c.textContent = unread().length ? String(unread().length) : ""; }
    });
    try { navigator.clearAppBadge && navigator.clearAppBadge(); } catch (_) {}
  }

  // Messages from Admin open by themselves once, and stay in the inbox afterwards.
  function showPopup() {
    if (popupOpen) return;
    const next = notes.filter(n => n.popup && !seen.has(n.id)).sort((a, b) => a.time - b.time)[0];
    if (!next) return;
    popupOpen = true;
    const s = K.sheet({
      title: next.title, html: `<p style="white-space:pre-wrap">${esc(next.detail)}</p><p class="hint" style="margin-top:12px">From ${esc(next.actorName || "Admin")}, ${esc(K.when(next.time))}</p>`,
      foot: `<button class="btn primary" data-ok type="button">I have read this</button>`,
      onClose: () => { seen.add(next.id); saveSeen(); popupOpen = false; const c = K.id("kInboxCount"); if (c) c.textContent = unread().length ? String(unread().length) : ""; setTimeout(showPopup, 200); }
    });
    $("[data-ok]", s.el).onclick = () => s.close();
  }

  // ---------- Alerts (push) ----------
  function deviceId() {
    let id = "";
    try { id = localStorage.getItem(DEVICE_KEY) || ""; if (!id) { id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE_KEY, id); } }
    catch (_) { id = "dev_" + Math.random().toString(36).slice(2, 12); }
    return id;
  }
  const isNative = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (_) { return false; } };
  function loadScript(src) {
    return new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Could not load " + src)); document.head.appendChild(s); });
  }
  async function nativeBridge() {
    if (!window.KoveliNativePush) await loadScript("js/native-push.bundle.js");
    if (!window.KoveliNativePush) throw new Error("Alerts are not available in this version of the app.");
    return window.KoveliNativePush;
  }
  const vapid = () => { const k = typeof KOVELI_VAPID_KEY === "string" ? KOVELI_VAPID_KEY.trim() : ""; return k && !k.startsWith("PASTE") ? k : ""; };

  async function alertsOn() {
    try {
      if (isNative()) return String((await (await nativeBridge()).checkPermissions())?.receive || "").toLowerCase() === "granted";
      return "Notification" in window && Notification.permission === "granted" && !!vapid();
    } catch (_) { return false; }
  }

  async function saveToken(token, platform) {
    await K.db.collection("pushDevices").doc(deviceId()).set({
      deviceId: deviceId(), staffId: K.me.id, staffName: K.me.name, token, platform, enabled: true, updatedAt: K.stamp()
    });
  }
  async function forgetDevice() {
    if (K.db && K.me) await K.db.collection("pushDevices").doc(deviceId()).delete();
  }

  async function enableAlerts(askPermission) {
    if (isNative()) {
      const bridge = await nativeBridge();
      let state = String((await bridge.checkPermissions())?.receive || "").toLowerCase();
      if (askPermission && state.startsWith("prompt")) state = String((await bridge.requestPermissions())?.receive || "").toLowerCase();
      if (state !== "granted") throw new Error("Alerts are blocked. Allow notifications for Koveli in the phone settings.");
      const token = await bridge.register();
      if (!token) throw new Error("The phone did not give an alert address. Try again.");
      await saveToken(token, bridge.platform || "android");
      if (!enableAlerts.bound && bridge.onAction) {
        enableAlerts.bound = true;
        bridge.onAction(action => { const url = String(action?.notification?.data?.url || "").trim(); if (url) location.href = url; });
      }
      return true;
    }
    if (!vapid()) throw new Error("Browser alerts are not set up yet. Add the Web Push key to js/firebase-config.js.");
    if (!("Notification" in window) || !("serviceWorker" in navigator)) throw new Error("This browser cannot show alerts.");
    let permission = Notification.permission;
    if (permission === "default" && askPermission) permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Alerts are blocked. Allow notifications for this site in the browser settings.");
    if (!firebase.messaging) await loadScript(MESSAGING_SDK);
    const registration = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }));
    await navigator.serviceWorker.ready;
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: vapid(), serviceWorkerRegistration: registration });
    if (!token) throw new Error("The browser did not give an alert address. Try again.");
    await saveToken(token, "web");
    if (!enableAlerts.bound) { enableAlerts.bound = true; messaging.onMessage(p => K.toast((p?.data?.title || "New message") + (p?.data?.body ? ": " + p.data.body : ""))); }
    return true;
  }

  // If alerts were already allowed, keep this device registered to whoever is signed in now.
  async function refreshAlerts() {
    try { if (await alertsOn()) await enableAlerts(false); }
    catch (error) { console.warn("Alerts:", error.message || error); }
  }

  // ---------- Shared data ----------
  let staffCache = null, settingsCache = null;
  K.staff = async force => {
    if (!staffCache || force) {
      const snap = await K.db.collection("staff").get();
      staffCache = snap.docs.map(d => ({ id: d.id, ...d.data(), rcno: d.data().rcno || d.id })).filter(s => s.name).sort((a, b) => a.name.localeCompare(b.name));
    }
    return staffCache;
  };
  K.settings = async force => {
    if (!settingsCache || force) {
      const snap = await K.db.collection("settings").doc("portal").get();
      settingsCache = { annualCapacity: 2, dutyLimit: true, emails: {}, ...(snap.exists ? snap.data() : {}) };
    }
    return settingsCache;
  };

  // Sick leave counts per calendar year. FRL counts from its renewal date each year.
  K.leaveUsage = (requests, person) => {
    const today = K.today(), year = today.slice(0, 4);
    let frlFrom = `${year}-01-01`;
    const renew = String(person.frlRenewal || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(renew)) {
      const thisYear = `${year}-${renew.slice(5)}`;
      frlFrom = thisYear <= today ? thisYear : `${Number(year) - 1}-${renew.slice(5)}`;
    }
    const counts = r => ["pending", "approved"].includes(String(r.status || "pending").toLowerCase());
    const sickUsed = requests.filter(r => r.type === "sick" && counts(r) && String(r.date || "").startsWith(year)).length;
    const frlUsed = requests.filter(r => r.type === "frl" && counts(r) && String(r.date || "") >= frlFrom).length;
    const sickAllowance = Number(person.sickAllowance ?? 30), frlAllowance = Number(person.frlAllowance ?? 5);
    return { sickUsed, frlUsed, sickLeft: sickAllowance - sickUsed, frlLeft: frlAllowance - frlUsed, sickAllowance, frlAllowance, frlFrom, frlNext: K.iso(new Date(Number(frlFrom.slice(0, 4)) + 1, Number(frlFrom.slice(5, 7)) - 1, Number(frlFrom.slice(8, 10)))) };
  };

  // ---------- Published roster, kept on the device ----------
  let idbPromise = null, versions, versionsAt = 0;
  function idb() {
    return idbPromise || (idbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open("koveliRosterCache", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("months");
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    }));
  }
  async function idbGet(key) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction("months").objectStore("months").get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
  async function idbPut(key, value) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction("months", "readwrite"); t.objectStore("months").put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function rosterVersions(force) {
    if (!force && versions !== undefined && Date.now() - versionsAt < 60000) return versions;
    try { const snap = await K.db.collection("systemControl").doc("rosterVersions").get(); versions = snap.exists ? snap.data() : {}; }
    catch (_) { versions = null; }
    versionsAt = Date.now();
    return versions;
  }
  const ROSTER_ROLES = ["Snr. Executive", "Executive", "Supervisor", "Officers", "HK"];
  K.ROSTER_ROLES = ROSTER_ROLES;

  // Returns one month of the published roster. Uses the copy saved on this device
  // unless a newer roster has been published since (one small check per minute).
  K.rosterMonth = async (ym, force) => {
    let cached = null;
    try { cached = await idbGet(ym); } catch (_) {}
    const v = await rosterVersions(force), stamp = v ? v[ym] : undefined;
    if (cached && !force) {
      if (v === null) return { ...cached, from: "saved copy (offline)" };
      if (stamp !== undefined ? cached.version === stamp : Date.now() - cached.fetchedAt < 3 * 3600000) return { ...cached, from: "saved copy" };
    }
    try {
      const snaps = await Promise.all([1, 2].map(n => K.db.collection("dutyRosters").doc(`${ym}-part${n}`).get()));
      const roster = {}, staff = {};
      snaps.forEach(snap => {
        if (!snap.exists) return;
        const data = snap.data() || {};
        Object.entries(data.roster || {}).forEach(([id, days]) => { roster[id] = Object.assign(roster[id] || {}, days || {}); });
        Object.entries(data.staff || {}).forEach(([id, s]) => {
          if (ROSTER_ROLES.includes(s.rosterRole)) staff[id] = { id, name: s.name || "Staff", rcNo: s.rcNo || id, rosterRole: s.rosterRole, rosterNo: Number(s.rosterNo || s.sortOrder || 0) };
        });
      });
      const record = { roster, staff, version: stamp === undefined ? null : stamp, fetchedAt: Date.now() };
      try { await idbPut(ym, record); } catch (_) {}
      return { ...record, from: "just loaded" };
    } catch (error) {
      if (cached) return { ...cached, from: "saved copy (could not reach the server)" };
      throw error;
    }
  };
  K.dutyOn = async (staffId, isoDate) => {
    try { const m = await K.rosterMonth(isoDate.slice(0, 7)); return m.roster?.[staffId]?.[Number(isoDate.slice(8, 10))] || ""; }
    catch (_) { return ""; }
  };

  // ---------- Approved leave and approved swaps, laid over the published roster ----------
  // The roster shows them the moment Admin approves, without republishing the roster.
  let overlayCache = null, overlayAt = 0;
  K.rosterOverlay = async force => {
    if (!overlayCache || force || Date.now() - overlayAt > 60000) {
      const [swaps, leave] = await Promise.all([
        K.db.collection("dutyChanges").where("status", "==", "approved").get(),
        K.db.collection("annualLeaveRequests").where("status", "==", "approved").get()
      ]);
      overlayCache = { swaps: swaps.docs.map(d => d.data()), leave: leave.docs.map(d => d.data()) };
      overlayAt = Date.now();
    }
    const { swaps, leave } = overlayCache;
    // Returns { code, note } for one person on one date, starting from the published code.
    return (staffId, isoDate, base) => {
      const id = String(staffId);
      const swap = swaps.find(r => r.swapDate === isoDate && (String(r.requesterId) === id || String(r.acceptStaffId) === id));
      if (swap) {
        const mine = String(swap.requesterId) === id;
        return { code: mine ? swap.acceptStaffDuty : swap.requesterDuty, note: `Swapped with ${mine ? swap.acceptStaffName : swap.requesterName}. Was ${base || "empty"}.` };
      }
      const away = leave.find(r => String(r.staffId) === id && r.startDate <= isoDate && r.endDate >= isoDate);
      if (away && base !== "A-Leave" && base !== "OFF") return { code: "A-Leave", note: `Annual leave ${K.fmt(away.startDate)} to ${K.fmt(away.endDate)}.` + (base ? ` Roster had ${base}.` : "") };
      return { code: base || "", note: "" };
    };
  };

  // ---------- Request lists (each person only loads what they are allowed to see) ----------
  const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  K.load = {
    leave: async () => docs(await (K.isManager ? K.db.collection("leaveRequests") : K.db.collection("leaveRequests").where("staffId", "==", K.me.id)).get()),
    annual: async () => docs(await K.db.collection("annualLeaveRequests").get()),
    duty: async () => {
      const col = K.db.collection("dutyChanges");
      if (K.isManager) return docs(await col.get());
      const [sent, received] = await Promise.all([col.where("requesterId", "==", K.me.id).get(), col.where("acceptStaffId", "==", K.me.id).get()]);
      const map = new Map();
      [...docs(sent), ...docs(received)].forEach(r => map.set(r.id, r));
      return [...map.values()];
    }
  };
  K.statusOf = r => String(r.status || "pending").toLowerCase();

  window.K = K;
})();
