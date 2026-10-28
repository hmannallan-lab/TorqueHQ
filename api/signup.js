/* POST /api/signup — one beta sign-up from the website's form, kept in Upstash Redis and, once it's connected,
   added to the MailerLite waitlist group too (joining that group starts the welcome email).
   Each email is one entry in the "signups" hash, so signing up twice updates it instead of adding a copy.
   It keeps the consent wording and time with each sign-up, and allows 10 tries an hour from one network.
   Redis: Upstash, connected in Vercel (KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL / _TOKEN).
   MailerLite (optional): MAILERLITE_API_KEY, and MAILERLITE_GROUP if the group isn't called "Beta waitlist".
   api/signups.js and api/admin.js use the Redis, MailerLite and password code below too (every file in api/ is a page,
   so it lives here). */
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ML_KEY = process.env.MAILERLITE_API_KEY;
const ML_GROUP = (process.env.MAILERLITE_GROUP || "Beta waitlist").trim();
const ML_TESTERS = (process.env.MAILERLITE_TESTER_GROUP || "Beta testers").trim();
const ML_API = (process.env.MAILERLITE_API_URL || "https://connect.mailerlite.com/api").replace(/\/$/, "");

async function redis(...cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || `Redis answered ${r.status}`);
  return d.result;
}

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

async function ml(path, init) {
  const r = await fetch(ML_API + path, Object.assign({}, init, {
    headers: { Authorization: `Bearer ${ML_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  }));
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}

const groupIds = {};                                               // a group named rather than numbered is looked up once
async function mlGroup(name = ML_GROUP) {
  if (/^\d+$/.test(name)) return name;
  const k = name.toLowerCase();
  if (groupIds[k]) return groupIds[k];
  const r = await ml("/groups?limit=100&filter[name]=" + encodeURIComponent(name));
  if (!r.ok) throw new Error(`MailerLite groups answered ${r.status}${r.d && r.d.message ? ": " + r.d.message : ""}`);
  const g = (r.d.data || []).find(x => String(x.name || "").trim().toLowerCase() === k);
  if (!g) throw new Error(`no MailerLite group called "${name}"`);
  return (groupIds[k] = String(g.id));
}
const mlSays = r => `MailerLite answered ${r.status}${r.d && r.d.message ? ": " + r.d.message : ""}`;

/* Add or update the sign-up in MailerLite, in the waitlist group (joining it is what starts the welcome email).
   Returns what to keep in the sign-up's "mailerlite" column: "" (not connected), "ok", "ok (…)" or "failed: …". */
async function toMailerLite(rec) {
  if (!ML_KEY) return "";
  try {
    const group = await mlGroup();
    const car = rec.car === "Other" ? (rec.other_car || "Other") : rec.car;
    const fields = {};
    for (const [k, v] of [["name", rec.first_name], ["instagram", rec.instagram], ["youtube", rec.youtube], ["car", car], ["gearbox", rec.gearbox]]) if (v) fields[k] = v;
    const send = f => ml("/subscribers", { method: "POST", body: JSON.stringify({ email: rec.email, fields: f, groups: [group] }) });
    let r = await send(fields);
    if (r.status === 422 && Object.keys(fields).some(k => k !== "name")) {   // a field MailerLite doesn't have: send the rest
      r = await send(fields.name ? { name: fields.name } : {});
      if (r.ok) return "ok (add the instagram, youtube, car and gearbox fields in MailerLite to keep those too)";
    }
    if (!r.ok) return "failed: " + mlSays(r);
    return "ok";
  } catch (e) {
    return "failed: " + (e.name === "TimeoutError" ? "MailerLite took too long" : e.message);
  }
}

/* Invite emails are on once MailerLite is connected and has a "Beta testers" group (MAILERLITE_TESTER_GROUP).
   The group's id, or "" when there's no such group (then invites are sent by hand, as Instagram DMs). A missing group
   is looked up again after 20 seconds, so making it in MailerLite turns the emails on without a redeploy. */
let noTesterGroupUntil = 0;
async function testerGroup() {
  if (!ML_KEY || Date.now() < noTesterGroupUntil) return "";
  try {
    return await mlGroup(ML_TESTERS);
  } catch (e) {
    if (!/^no MailerLite group called/.test(e.message)) throw e;
    noTesterGroupUntil = Date.now() + 20000;
    return "";
  }
}
async function inviteEmailsOn() {                                   // for the admin page: unsure (MailerLite down) counts as on
  try { return Boolean(await testerGroup()); } catch (e) { return true; }
}

/* Email a tester their invite: their code and link go into their MailerLite fields first, and only once MailerLite has
   kept both are they added to the testers group (joining it is what sends the invite email), so the email never goes
   out without them. Returns what the admin page shows: "" (invite emails not set up), "ok" or "failed: …". */
async function inviteToMailerLite(rec, code, link) {
  if (!ML_KEY) return "";
  const FIELDS = "failed: add the invite_code and invite_link fields in MailerLite (Subscribers > Fields), then invite again";
  try {
    const group = await testerGroup();
    if (!group) return "";
    const fields = { invite_code: code, invite_link: link };
    if (rec.first_name) fields.name = rec.first_name;
    const r = await ml("/subscribers", { method: "POST", body: JSON.stringify({ email: rec.email, fields }) });
    if (r.status === 422 && /field/i.test(JSON.stringify(r.d || {}))) return FIELDS;
    if (!r.ok) return "failed: " + mlSays(r);
    const sub = (r.d && r.d.data) || {};
    if (!sub.fields || sub.fields.invite_code !== code || sub.fields.invite_link !== link) return FIELDS;
    if (sub.status && sub.status !== "active") return `failed: MailerLite won't email them (they're ${sub.status}), so send them the link yourself`;
    if (!sub.id) return "failed: MailerLite didn't answer with the subscriber";
    const g = await ml(`/subscribers/${encodeURIComponent(sub.id)}/groups/${encodeURIComponent(group)}`, { method: "POST" });
    if (!g.ok) return "failed: " + mlSays(g);
    return "ok";
  } catch (e) {
    return "failed: " + (e.name === "TimeoutError" ? "MailerLite took too long" : e.message);
  }
}

/* The browser's own password box guards the list and the admin page: any username, ADMIN_KEY as the password.
   No ADMIN_KEY set: those pages don't exist. Answers the request and returns false when the password isn't right. */
const digest = s => crypto.createHash("sha256").update(String(s)).digest();
function adminOk(req, res) {
  const key = process.env.ADMIN_KEY;
  if (!key) { res.status(404).send("Not found"); return false; }
  const auth = String(req.headers.authorization || "");
  const pass = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString("utf8").split(":").slice(1).join(":") : "";
  if (!crypto.timingSafeEqual(digest(pass), digest(key))) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Torque HQ sign-ups", charset="UTF-8"');
    res.status(401).send("Password needed");
    return false;
  }
  return true;
}

const CONSENT = "Email me my beta invite and news about Torque HQ. I can unsubscribe any time.";

function instagram(v) {
  let h = clean(v, 200);
  const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(h);
  if (m) h = m[1];
  h = h.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  if (!(REDIS_URL && REDIS_TOKEN)) return res.status(503).json({ error: "Sign-ups aren't open yet. Try again soon." });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ error: "Send the form as JSON." });
  if (clean(b.website, 200)) return res.status(200).json({ ok: true });            // the hidden field only a bot fills in

  const email = clean(b.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "Enter your email address, like you@example.com." });
  const ig = instagram(b.instagram);
  if (!ig) return res.status(400).json({ error: "Enter your Instagram handle, like @your350z." });
  if (b.consent !== true) return res.status(400).json({ error: "Tick the box so we're allowed to email you the invite." });

  const ip = clean(String(req.headers["x-forwarded-for"] || "").split(",")[0], 64) || "unknown";
  const limitKey = "rl:" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) + ":" + Math.floor(Date.now() / 3600000);
  try {
    const tries = await redis("INCR", limitKey);
    if (tries === 1) await redis("EXPIRE", limitKey, 3600);
    if (tries > 10) return res.status(429).json({ error: "Too many tries from this network. Try again in an hour." });

    const now = new Date().toISOString();
    const prev = await redis("HGET", "signups", email);
    let first = now;
    if (prev) { try { first = JSON.parse(prev).signed_up || now; } catch (e) { /* keep now */ } }
    const record = {
      signed_up: first, updated: now, email, first_name: clean(b.first_name, 60), instagram: ig,
      youtube: clean(b.youtube, 200), car: clean(b.car, 60), other_car: clean(b.other_car, 80), gearbox: clean(b.gearbox, 20),
      consent: CONSENT, consent_at: now, source: "website",
    };
    record.mailerlite = await toMailerLite(record);                             // never stops the sign-up: a failure is noted
    await redis("HSET", "signups", email, JSON.stringify(record));
    return res.status(200).json({ ok: true, updated: Boolean(prev) });
  } catch (e) {
    console.error("signup failed:", e.message);
    return res.status(500).json({ error: "Something went wrong on our end. Try again in a minute." });
  }
};

/* for api/signups.js and api/admin.js */
Object.assign(module.exports, { redis, toMailerLite, inviteToMailerLite, inviteEmailsOn, adminOk, testerGroupName: ML_TESTERS,
  redisReady: Boolean(REDIS_URL && REDIS_TOKEN), mailerLiteReady: Boolean(ML_KEY) });
