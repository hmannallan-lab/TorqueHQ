/* POST /api/signup — one beta sign-up from the website's form, kept in Upstash Redis.
   Connect Upstash in Vercel (Storage > Upstash for Redis) and it sets KV_REST_API_URL and KV_REST_API_TOKEN
   (or UPSTASH_REDIS_REST_URL / _TOKEN); until then the form says sign-ups aren't open yet.
   Each email is one entry in the "signups" hash, so signing up twice updates it instead of adding a copy.
   It keeps the consent wording and time with each sign-up, and allows 10 tries an hour from one network. */
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CONSENT = "Email me my beta invite and news about Torque HQ. I can unsubscribe any time.";

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
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(503).json({ error: "Sign-ups aren't open yet. Try again soon." });

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
    await redis("HSET", "signups", email, JSON.stringify(record));
    return res.status(200).json({ ok: true, updated: Boolean(prev) });
  } catch (e) {
    console.error("signup failed:", e.message);
    return res.status(500).json({ error: "Something went wrong on our end. Try again in a minute." });
  }
};
