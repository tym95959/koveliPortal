// Names and staff numbers for the sign-in screen. No codes, emails or phone numbers.
const { getAdmin, fail } = require("./_lib");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") return fail(res, 405, "Method not allowed");
    try {
        const snap = await getAdmin().firestore().collection("staff").get();
        const staff = [];
        snap.forEach(doc => {
            const d = doc.data() || {};
            if (!d.name || d.active === false) return;
            staff.push({ id: String(doc.id), name: String(d.name), rcno: String(d.rcno || doc.id) });
        });
        staff.sort((a, b) => a.name.localeCompare(b.name));
        res.setHeader("Cache-Control", "no-store");
        // setupNeeded tells the sign-in page to offer "create the first Admin".
        return res.status(200).json({ success: true, staff, setupNeeded: snap.empty });
    } catch (error) {
        console.error("staff-directory:", error);
        // The reason is shown on the sign-in page so a set-up mistake is easy to spot.
        return fail(res, 500, "The staff list could not be loaded. " + (error?.message || ""));
    }
};
