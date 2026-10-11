// ============================================================
// KOVELI STAFF PORTAL - shared server code
// Files starting with "_" are not exposed as web addresses by Vercel.
// ============================================================
const admin = require("firebase-admin");
const crypto = require("crypto");

function readServiceAccount() {
    const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set in Vercel.");
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file."); }
    if (parsed.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    return parsed;
}

function getAdmin() {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(readServiceAccount()) });
    return admin;
}

function roleOf(value) {
    const role = String(value || "").trim().toLowerCase();
    if (role === "admin" || role === "administrator") return "admin";
    if (role === "supervisor" || role === "sup") return "supervisor";
    return "staff";
}

function readBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    try { return JSON.parse(String(req.body || "{}")); } catch (_) { return {}; }
}

function list(value) {
    const src = Array.isArray(value) ? value : (value ? String(value).split(/[;,\n]/) : []);
    return [...new Set(src.map(v => String(v || "").trim()).filter(Boolean))];
}

function fail(res, code, error, extra = {}) {
    return res.status(code).json({ success: false, error, ...extra });
}

// ---- Who is calling? ---------------------------------------------------
// Pages send "Authorization: Bearer <Firebase ID token>". The role is read from
// the staff record every time, so changing someone's role takes effect at once.
async function getUser(req) {
    const header = String(req.headers?.authorization || req.headers?.Authorization || "");
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return null;
    try {
        const fb = getAdmin();
        const decoded = await fb.auth().verifyIdToken(match[1]);
        const snap = await fb.firestore().collection("staff").doc(String(decoded.uid)).get();
        if (!snap.exists) return null;
        const staff = snap.data() || {};
        if (staff.active === false) return null;
        return { uid: String(decoded.uid), role: roleOf(staff.role), name: String(staff.name || ""), email: String(staff.email || "") };
    } catch (_) {
        return null;
    }
}

async function requireUser(req, res, { adminOnly = false } = {}) {
    const user = await getUser(req);
    if (!user) { fail(res, 401, "Your sign-in has expired. Please sign in again."); return null; }
    if (adminOnly && user.role !== "admin") { fail(res, 403, "Only an Admin can do this."); return null; }
    return user;
}

// ---- Login codes -------------------------------------------------------
// PINs and patterns are stored scrambled (scrypt). Nobody, including Admin, can read them back.
function hashCode(code, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(String(code), salt, 32).toString("hex");
    return { salt, hash };
}

function codeMatches(code, salt, hash) {
    if (!salt || !hash) return false;
    const a = Buffer.from(crypto.scryptSync(String(code), salt, 32).toString("hex"));
    const b = Buffer.from(String(hash));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function plainMatches(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

const PIN_RULE = /^\d{4,8}$/;
function validPattern(p) { return /^[1-9]{4,9}$/.test(p) && new Set(p).size === p.length; }

// Checks a code and moves any old plain-text code into scrambled storage the first time it is used.
async function checkCode(db, staffId, method, code) {
    const secretRef = db.collection("staffSecrets").doc(staffId);
    const staffRef = db.collection("staff").doc(staffId);
    const [secretSnap, staffSnap] = await Promise.all([secretRef.get(), staffRef.get()]);
    const secrets = secretSnap.exists ? (secretSnap.data() || {}) : {};
    const staff = staffSnap.exists ? (staffSnap.data() || {}) : {};
    const hasPin = !!secrets.pinHash || !!String(staff.pass || "").trim();
    const hasPattern = !!secrets.patternHash || !!String(staff.pattern || "").trim();
    if (!hasPin && !hasPattern) return { ok: false, noCode: true };

    let ok = method === "pin"
        ? codeMatches(code, secrets.pinSalt, secrets.pinHash)
        : codeMatches(code, secrets.patternSalt, secrets.patternHash);

    if (!ok) {
        const legacy = String((method === "pin" ? staff.pass : staff.pattern) || "").trim();
        const alreadyMoved = method === "pin" ? !!secrets.pinHash : !!secrets.patternHash;
        if (!alreadyMoved && legacy && plainMatches(legacy, code)) ok = true;
    }
    if (ok && (staff.pass !== undefined || staff.pattern !== undefined)) {
        const update = {};
        if (!secrets.pinHash && String(staff.pass || "").trim()) { const h = hashCode(String(staff.pass).trim()); update.pinSalt = h.salt; update.pinHash = h.hash; }
        if (!secrets.patternHash && String(staff.pattern || "").trim()) { const h = hashCode(String(staff.pattern).trim()); update.patternSalt = h.salt; update.patternHash = h.hash; }
        if (Object.keys(update).length) await secretRef.set(update, { merge: true });
        await staffRef.update({ pass: admin.firestore.FieldValue.delete(), pattern: admin.firestore.FieldValue.delete() });
    }
    return { ok, hasPin, hasPattern };
}

// ---- Wrong-code lock ----------------------------------------------------
const MAX_FAILURES = 5, LOCK_MINUTES = 5;
async function lockState(db, staffId) {
    const ref = db.collection("loginAttempts").doc(staffId);
    const data = (await ref.get()).data() || {};
    const lockedUntil = Number(data.lockedUntil || 0);
    return { ref, data, minutesLeft: lockedUntil > Date.now() ? Math.ceil((lockedUntil - Date.now()) / 60000) : 0 };
}
async function recordFailure(state) {
    const count = Number(state.data.count || 0) + 1, lock = count >= MAX_FAILURES;
    await state.ref.set({ count: lock ? 0 : count, lockedUntil: lock ? Date.now() + LOCK_MINUTES * 60000 : 0, lastFailedAt: Date.now() });
    return { locked: lock, left: MAX_FAILURES - count };
}
async function clearFailures(state) {
    if (state.data.count || state.data.lockedUntil) await state.ref.delete();
}

// ---- Settings -----------------------------------------------------------
async function getSettings(db) {
    const snap = await db.collection("settings").doc("portal").get();
    return snap.exists ? (snap.data() || {}) : {};
}

// ---- Push ---------------------------------------------------------------
async function resolveStaffIds(db, recipientIds, recipientRoles) {
    const ids = new Set(list(recipientIds));
    const roles = list(recipientRoles).map(roleOf);
    if (roles.length) {
        const snap = await db.collection("staff").get();
        snap.forEach(doc => {
            const d = doc.data() || {};
            if (d.active !== false && roles.includes(roleOf(d.role))) ids.add(String(doc.id));
        });
    }
    return ids;
}

async function sendPush(db, ids, { title, message, data = {} }) {
    if (!ids.size) return { sent: 0, failed: 0, devices: 0 };
    const fb = getAdmin();
    const snap = await db.collection("pushDevices").get();
    const tokens = new Map(), phones = new Set();
    snap.forEach(doc => {
        const d = doc.data() || {};
        const token = String(d.token || "").trim();
        if (d.enabled === false || !token || !ids.has(String(d.staffId || ""))) return;
        tokens.set(token, doc.id);
        if (String(d.platform || "web") !== "web") phones.add(token);
    });
    const all = [...tokens.keys()];
    if (!all.length) return { sent: 0, failed: 0, devices: 0 };

    const stringData = {};
    Object.entries({ title, body: message, message, detail: message, ...data }).forEach(([k, v]) => { stringData[k] = String(v ?? ""); });

    let sent = 0, failed = 0;
    const dead = [];
    // Browsers get data only (sw.js draws the alert). The phone app cannot draw its own alert
    // while it is closed, so phones get a ready-made alert that Android shows by itself.
    const groups = [
        { list: all.filter(t => !phones.has(t)), extra: { webpush: { headers: { Urgency: "high" } } } },
        { list: all.filter(t => phones.has(t)), extra: {
            notification: { title: String(title || "Koveli"), body: String(message || "") },
            android: { priority: "high", notification: { channelId: "koveli_alerts", sound: "default" } }
        } }
    ];
    for (const group of groups) {
        for (let i = 0; i < group.list.length; i += 500) {
            const batch = group.list.slice(i, i + 500);
            const response = await fb.messaging().sendEachForMulticast({ tokens: batch, data: stringData, ...group.extra });
            sent += response.successCount; failed += response.failureCount;
            response.responses.forEach((r, index) => {
                const code = String(r.error?.code || "");
                if (!r.success && (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token"))) dead.push(tokens.get(batch[index]));
            });
        }
    }
    if (dead.length) {
        const writer = db.batch();
        dead.forEach(id => writer.delete(db.collection("pushDevices").doc(id)));
        await writer.commit();
    }
    return { sent, failed, devices: all.length };
}

// ---- Email --------------------------------------------------------------
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function emails(value) { return list(value).map(v => v.toLowerCase()).filter(v => EMAIL_RULE.test(v)); }

function emailConfigured() {
    return Boolean(String(process.env.EMAIL_USER || "").trim() && String(process.env.EMAIL_PASS || "").replace(/\s/g, ""));
}

async function sendEmail({ to, subject, message, replyTo, attachment }) {
    const recipients = emails(to);
    if (!recipients.length) return { skipped: true, reason: "No email recipients are set." };
    if (!emailConfigured()) return { skipped: true, reason: "EMAIL_USER or EMAIL_PASS is not set in Vercel." };
    const nodemailer = require("nodemailer");
    const user = String(process.env.EMAIL_USER).trim();
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass: String(process.env.EMAIL_PASS).replace(/\s/g, "") } });
    const options = {
        from: `"${String(process.env.EMAIL_FROM_NAME || "Koveli Staff Portal").replace(/"/g, "")}" <${user}>`,
        to: recipients, subject: String(subject || "Koveli Staff Portal"), text: String(message || ""),
        replyTo: EMAIL_RULE.test(String(replyTo || "")) ? replyTo : undefined
    };
    if (attachment) options.attachments = [attachment];
    try {
        const info = await transporter.sendMail(options);
        const rejected = Array.isArray(info.rejected) ? info.rejected : [];
        return { sent: recipients.length - rejected.length, rejected };
    } catch (error) {
        const text = String(error?.message || "");
        const auth = error?.code === "EAUTH" || Number(error?.responseCode) === 535 || /invalid login|not accepted|authentication/i.test(text);
        return { error: auth ? "Gmail refused the sign-in. EMAIL_PASS must be a Google App Password for EMAIL_USER." : text || "Email could not be sent." };
    }
}

module.exports = {
    getAdmin, roleOf, readBody, list, fail, getUser, requireUser,
    hashCode, checkCode, PIN_RULE, validPattern,
    lockState, recordFailure, clearFailures, LOCK_MINUTES,
    getSettings, resolveStaffIds, sendPush, emails, sendEmail, emailConfigured
};
