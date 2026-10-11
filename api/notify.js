// One call does everything that tells people about an event:
//   1. saves a message to each recipient's inbox
//   2. sends the phone / browser alert
//   3. sends the email (if "email" is included)
// The pages never talk to Gmail or to phones directly.
const { getAdmin, readBody, list, fail, requireUser, roleOf, getSettings, resolveStaffIds, sendPush, sendEmail, emails } = require("./_lib");

const MAX_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;
const EMAIL_KINDS = ["leave", "duty", "annual", "general"];

module.exports = async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    const user = await requireUser(req, res);
    if (!user) return;
    try {
        const body = readBody(req);
        const recipientIds = list(body.recipientIds);
        const recipientRoles = list(body.recipientRoles).map(roleOf);
        const title = String(body.title || "").trim().slice(0, 140);
        const detail = String(body.detail || "").trim().slice(0, 2000);
        const type = String(body.type || "general").trim();
        const url = String(body.url || "index.html").trim();
        const sourceId = String(body.sourceId || "").trim();
        const popup = body.popup === true;
        // Only an Admin may broadcast a message that pops up on everyone's screen.
        if ((popup || type === "admin-message") && user.role !== "admin") return fail(res, 403, "Only an Admin can send a message to staff.");

        const fb = getAdmin(), db = fb.firestore();
        const out = { success: true, inbox: null, push: null, email: null };

        if (title && (recipientIds.length || recipientRoles.length)) {
            const ref = await db.collection("portalNotifications").add({
                recipientIds, recipientRoles, title, detail, url, type, sourceId, popup,
                actorId: user.uid, actorName: user.name,
                createdAt: fb.firestore.FieldValue.serverTimestamp()
            });
            out.inbox = ref.id;
            if (body.push !== false) {
                try {
                    const ids = await resolveStaffIds(db, recipientIds, recipientRoles);
                    // No alert for your own action, except when an Admin is testing alerts on their own phone.
                    if (!(body.selfTest === true && user.role === "admin")) ids.delete(user.uid);
                    out.push = await sendPush(db, ids, { title, message: detail, data: { type, sourceId, notificationId: ref.id, url } });
                } catch (error) { console.error("notify push:", error); out.push = { error: error?.message || "Push failed" }; }
            }
        }

        const mail = body.email;
        if (mail && typeof mail === "object") {
            const kind = EMAIL_KINDS.includes(mail.kind) ? mail.kind : "general";
            const settings = await getSettings(db);
            const configured = (settings.emails || {})[kind] || [];
            // Add the email addresses of the staff involved (for example the two people in a duty swap).
            const involved = [];
            for (const id of list(mail.staffIds).slice(0, 10)) {
                const snap = await db.collection("staff").doc(id).get();
                if (snap.exists && snap.data().email) involved.push(snap.data().email);
            }
            const to = emails([...configured, ...involved, ...(kind === "general" && user.role === "admin" ? list(mail.to) : [])]);
            const subject = String(mail.subject || title || "Koveli Staff Portal").slice(0, 200);
            const message = String(mail.message || detail || "").slice(0, 20000);
            out.email = await sendEmail({ to, subject, message, replyTo: user.email });

            // A sick-leave document goes only to the people chosen to receive attachments.
            const a = mail.attachment;
            if (a && a.contentBase64) {
                const base64 = String(a.contentBase64).replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
                const bytes = Math.floor(base64.length * 3 / 4);
                const attachTo = emails((settings.emails || {}).leaveAttachment || []);
                if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) out.attachment = { error: "The attached file could not be read." };
                else if (bytes > MAX_ATTACHMENT_BYTES) out.attachment = { error: "The attached file is larger than 2.5 MB." };
                else if (!attachTo.length) out.attachment = { skipped: true, reason: "No one is set to receive attachments." };
                else out.attachment = await sendEmail({
                    to: attachTo, subject: subject + " (document attached)", message, replyTo: user.email,
                    attachment: { filename: String(a.filename || "attachment").slice(0, 120), content: Buffer.from(base64, "base64"), contentType: String(a.contentType || "application/octet-stream") }
                });
            }
        }
        return res.status(200).json(out);
    } catch (error) {
        console.error("notify:", error);
        return fail(res, 500, "The notification could not be sent. " + (error?.message || ""));
    }
};
