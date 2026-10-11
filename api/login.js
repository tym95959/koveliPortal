// Sign in: checks the PIN or pattern on the server and returns a Firebase sign-in token.
const { getAdmin, readBody, fail, roleOf, checkCode, lockState, recordFailure, clearFailures, LOCK_MINUTES } = require("./_lib");

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    try {
        const body = readBody(req);
        const staffId = String(body.staffId || "").trim();
        const method = body.method === "pin" ? "pin" : "pattern";
        const code = String(body.code || "").trim();
        if (!staffId || !code) return fail(res, 400, "Choose your name and enter your code.");

        const fb = getAdmin(), db = fb.firestore();
        const lock = await lockState(db, staffId);
        if (lock.minutesLeft) return fail(res, 429, `Too many wrong tries. Try again in ${lock.minutesLeft} minute${lock.minutesLeft === 1 ? "" : "s"}.`);

        const snap = await db.collection("staff").doc(staffId).get();
        if (!snap.exists) return fail(res, 401, "Wrong code. Try again.");
        const staff = snap.data() || {};
        if (staff.active === false) return fail(res, 403, "This profile is switched off. Ask an Admin.");

        const result = await checkCode(db, staffId, method, code);
        if (result.noCode) return fail(res, 403, "No login code is set for this profile. Ask an Admin to set one.");
        if (!result.ok) {
            const f = await recordFailure(lock);
            const what = method === "pin" ? "PIN" : "pattern";
            return fail(res, 401, f.locked ? `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.` : `Wrong ${what}. ${f.left} ${f.left === 1 ? "try" : "tries"} left.`);
        }
        await clearFailures(lock);

        const token = await fb.auth().createCustomToken(staffId);
        return res.status(200).json({
            success: true, token,
            profile: { id: staffId, name: String(staff.name || ""), role: roleOf(staff.role), rcno: String(staff.rcno || staffId), email: String(staff.email || "") }
        });
    } catch (error) {
        console.error("login:", error);
        return fail(res, 500, "Sign-in is not working right now. " + (error?.message || ""));
    }
};
