// First-time set-up: creates the first Admin. Works only while there are no staff at all,
// and only with the SETUP_KEY you chose in Vercel.
const { getAdmin, readBody, fail, hashCode, PIN_RULE } = require("./_lib");

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    try {
        const expected = String(process.env.SETUP_KEY || "").trim();
        if (!expected) return fail(res, 403, "SETUP_KEY is not set in Vercel.");
        const body = readBody(req);
        if (String(body.setupKey || "").trim() !== expected) return fail(res, 403, "That set-up key is not correct.");

        const name = String(body.name || "").trim();
        const staffId = String(body.staffId || "").trim().replace(/[\/\s]+/g, "");
        const pin = String(body.pin || "").trim();
        if (!name || !staffId) return fail(res, 400, "Enter your name and staff number.");
        if (!PIN_RULE.test(pin)) return fail(res, 400, "PIN must be 4 to 8 digits.");

        const fb = getAdmin(), db = fb.firestore();
        const existing = await db.collection("staff").limit(1).get();
        if (!existing.empty) return fail(res, 409, "Set-up is already done. Ask an Admin to add you.");

        const h = hashCode(pin);
        await db.collection("staff").doc(staffId).set({
            name, rcno: staffId, role: "Admin", active: true, email: String(body.email || "").trim(),
            sickAllowance: 30, frlAllowance: 5, createdAt: fb.firestore.FieldValue.serverTimestamp()
        });
        await db.collection("staffSecrets").doc(staffId).set({ pinSalt: h.salt, pinHash: h.hash });
        return res.status(200).json({ success: true, staffId });
    } catch (error) {
        console.error("setup:", error);
        return fail(res, 500, "Set-up failed. " + (error?.message || ""));
    }
};
