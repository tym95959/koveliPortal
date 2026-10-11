// Set-up check. Open /api/health in a browser: it says which Vercel settings are present.
// It never shows the values themselves.
const { getAdmin, emailConfigured } = require("./_lib");

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const out = {
        serviceAccountSet: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim()),
        emailSet: emailConfigured(),
        setupKeySet: Boolean(String(process.env.SETUP_KEY || "").trim()),
        firebaseProject: null, databaseReachable: false, staffCount: null, problem: null
    };
    try {
        const fb = getAdmin();
        out.firebaseProject = fb.app().options.credential?.projectId || JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).project_id || null;
        const snap = await fb.firestore().collection("staff").get();
        out.databaseReachable = true;
        out.staffCount = snap.size;
    } catch (error) {
        out.problem = error?.message || String(error);
    }
    return res.status(200).json(out);
};
