// Vercel serverless function: POST /api/roster-ai
// Lets the Roster Assistant in the roster editor ask Claude about the open roster.
//
// Needs these Vercel environment variables:
//   ANTHROPIC_API_KEY              your Claude API key (console.anthropic.com)
//   FIREBASE_SERVICE_ACCOUNT_JSON  already set for the portal; used to check the caller is signed in
//   ANTHROPIC_MODEL                optional, defaults to claude-sonnet-5-5
//
// The editor sends the open roster period, staff, rules and the question.
// Claude answers in plain words and may suggest cell changes; the editor checks
// every suggested change against its own rules before the user can apply it.

const admin = require("firebase-admin");

function firebase() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}")) });
  }
  return admin;
}

const SYSTEM = `You are the roster assistant for the Koveli Lounge duty roster editor. A Supervisor or Admin is building a staff roster.
You get JSON with: the open period (year, month, startDay to endDay), the duty codes, the rules, the staff (id, name, role, A/B group, 6-hour flag),
the roster as roster[staffId][day] = duty code (a missing day means no duty yet), unavailable[staffId] = days they are on leave or weekly OFF,
and the problems the editor has already found.

Duty codes: 0730, 0800, 0830 are morning; 1530, 1630, 1730 are afternoon; 0030 is night; OFF is a day off; A-Leave and Leave are leave.
Rules: each day needs 1 Officer on 0030, 2 Officers on 0830 and 2 Officers on 1630. Rest between two duties must be at least 8 hours.
Nobody works more than 6 days in a row. Officers never work 0800 or 1730. An Officer's first duty after OFF should be 1530 or 1630.
Group A and Group B staff should not share the same exact duty on the same day. Nights should be shared fairly.

Answer the question briefly and concretely, naming people and dates. Only suggest changes inside the open period, only for staff in the list,
and never on days listed as unavailable for that person. Prefer the fewest changes.

Reply with ONLY a JSON object, no other text:
{"answer": "plain-text answer for the user, under 120 words", "changes": [{"staffId": "id", "day": 12, "duty": "1630", "reason": "short reason"}]}
Use an empty changes array when no change is needed or the user only asked a question.`;

function readJson(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { answer: text.trim(), changes: [] };
  try { return JSON.parse(text.slice(start, end + 1)); } catch (_) { return { answer: text.trim(), changes: [] }; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY is not set in Vercel." });

  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in again, then ask." });
  try { await firebase().auth().verifyIdToken(token); }
  catch (_) { return res.status(401).json({ error: "Your sign-in has expired. Reload the page and ask again." }); }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const question = String(body.question || "").slice(0, 1000).trim();
  if (!question) return res.status(400).json({ error: "Type a question." });
  const context = JSON.stringify(body.context || {});
  if (context.length > 180000) return res.status(413).json({ error: "This roster is too large to send. Ask about a shorter period." });
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  const messages = [];
  for (const h of history) {
    const role = h.role === "assistant" ? "assistant" : "user", text = String(h.text || "").slice(0, 600).trim();
    if (!text) continue;
    if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += "\n" + text;
    else messages.push({ role, content: text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (messages.length && messages[messages.length - 1].role === "user") messages.pop();   // the question is sent below
  messages.push({ role: "user", content: `Roster data:\n${context}\n\nQuestion: ${question}` });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1200, system: SYSTEM, messages })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || `Claude API error ${r.status}` });
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    const out = readJson(text);
    return res.status(200).json({ answer: String(out.answer || ""), changes: Array.isArray(out.changes) ? out.changes.slice(0, 40) : [] });
  } catch (e) {
    return res.status(502).json({ error: "Could not reach Claude: " + (e.message || e) });
  }
};
