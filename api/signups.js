/* GET /api/signups — the sign-up list as a spreadsheet (CSV), behind a password.
   Set ADMIN_KEY in Vercel (Settings > Environment Variables) to a long password; the browser asks for it
   (any username, that password). /api/signups?count=1 shows just the number. No ADMIN_KEY: the page doesn't exist. */
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const COLUMNS = ["signed_up", "updated", "email", "first_name", "instagram", "instagram_page", "youtube", "car", "other_car", "gearbox", "consent", "consent_at"];

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

const digest = s => crypto.createHash("sha256").update(String(s)).digest();
/* a cell for Excel or Sheets: quoted, and never read as a formula */
const cell = v => {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ADMIN_KEY;
  if (!key) return res.status(404).send("Not found");

  const auth = String(req.headers.authorization || "");
  const pass = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString("utf8").split(":").slice(1).join(":") : "";
  if (!crypto.timingSafeEqual(digest(pass), digest(key))) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Torque HQ sign-ups", charset="UTF-8"');
    return res.status(401).send("Password needed");
  }
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(503).send("Sign-ups aren't connected yet: add Upstash for Redis in Vercel > Storage.");

  try {
    const flat = (await redis("HGETALL", "signups")) || [];
    const rows = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { rows.push(JSON.parse(flat[i + 1])); } catch (e) { rows.push({ email: flat[i] }); }
    }
    rows.sort((a, b) => String(a.signed_up || "").localeCompare(String(b.signed_up || "")));
    if (req.query && req.query.count) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(`${rows.length} sign-up${rows.length === 1 ? "" : "s"}`);
    }
    const lines = [COLUMNS.join(",")].concat(rows.map(r => COLUMNS.map(c =>
      cell(c === "instagram_page" ? (r.instagram ? `https://www.instagram.com/${r.instagram}/` : "") : r[c])).join(",")));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="torque-hq-signups.csv"');
    return res.status(200).send("﻿" + lines.join("\r\n") + "\r\n");
  } catch (e) {
    console.error("signups export failed:", e.message);
    return res.status(500).send("Couldn't read the sign-ups. Try again in a minute.");
  }
};
