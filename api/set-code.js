// Change a PIN / pattern.
//  - Staff change their own, and must give their current code.
//  - An Admin can set anyone's code without knowing the old one.
const { getAdmin, readBody, fail, requireUser, hashCode, checkCode, PIN_RULE, validPattern, lockState, recordFailure, clearFailures, LOCK_MINUTES } = require("./_lib");

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    const user = await requireUser(req, res);
    if (!user) return;
    try {
        const body = readBody(req);
        const targetId = String(body.staffId || user.uid).trim();
        const own = targetId === user.uid;
        if (!own && user.role !== "admin") return fail(res, 403, "Only an Admin can set another person's code.");

        const newPin = String(body.newPin || "").trim();
        const newPattern = String(body.newPattern || "").trim();
        if (!newPin && !newPattern) return fail(res, 400, "Enter a new PIN or draw a new pattern.");
        if (newPin && !PIN_RULE.test(newPin)) return fail(res, 400, "PIN must be 4 to 8 digits.");
        if (newPattern && !validPattern(newPattern)) return fail(res, 400, "Pattern must join at least 4 different dots.");

        const fb = getAdmin(), db = fb.firestore();
        if (!(await db.collection("staff").doc(targetId).get()).exists) return fail(res, 404, "That staff record was not found.");

        if (own && !(user.role === "admin" && body.adminReset === true)) {
            const current = String(body.currentCode || "").trim();
            if (!current) return fail(res, 400, "Enter your current PIN.");
            const lock = await lockState(db, targetId);
            if (lock.minutesLeft) return fail(res, 429, `Too many wrong tries. Try again in ${lock.minutesLeft} minutes.`);
            // The current PIN is accepted; someone with only a pattern may type its dot numbers.
            const byPin = await checkCode(db, targetId, "pin", current);
            const ok = byPin.ok || (!byPin.hasPin && (await checkCode(db, targetId, "pattern", current)).ok);
            if (!ok) {
                const f = await recordFailure(lock);
                return fail(res, 401, f.locked ? `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.` : "Current PIN is not correct.");
            }
            await clearFailures(lock);
        }

        const update = { updatedAt: fb.firestore.FieldValue.serverTimestamp(), updatedBy: user.uid };
        if (newPin) { const h = hashCode(newPin); update.pinSalt = h.salt; update.pinHash = h.hash; }
        if (newPattern) { const h = hashCode(newPattern); update.patternSalt = h.salt; update.patternHash = h.hash; }
        await db.collection("staffSecrets").doc(targetId).set(update, { merge: true });
        // Remove any old plain-text copy and any wrong-try lock.
        await db.collection("staff").doc(targetId).update({ pass: fb.firestore.FieldValue.delete(), pattern: fb.firestore.FieldValue.delete() });
        await db.collection("loginAttempts").doc(targetId).delete();
        return res.status(200).json({ success: true, pinChanged: !!newPin, patternChanged: !!newPattern });
    } catch (error) {
        console.error("set-code:", error);
        return fail(res, 500, "The code could not be changed. " + (error?.message || ""));
    }
};
