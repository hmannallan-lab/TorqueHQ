/* GET /api/signups — the sign-up list as a spreadsheet (CSV), behind a password.
   Set ADMIN_KEY in Vercel (Settings > Environment Variables) to a long password; the browser asks for it
   (any username, that password). No ADMIN_KEY: the page doesn't exist.
     ?count=1     just the number
     ?sync=1      sends everyone not yet in MailerLite (signed up before it was connected, or it failed) to MailerLite
     ?sync=all    sends everyone again (safe: MailerLite updates them, and nobody gets the welcome email twice)
   The invite columns come from the admin page (/admin): each tester's code, whether it's on or turned off, whether the
   invite email went, and how many phones and browsers have joined with it. */
const { redis, toMailerLite, redisReady, mailerLiteReady, adminOk } = require("./signup.js");

const COLUMNS = ["signed_up", "updated", "email", "first_name", "instagram", "instagram_page", "youtube", "car", "other_car", "gearbox",
                 "consent", "consent_at", "mailerlite", "invite_code", "invite_status", "invited_at", "invite_email", "devices"];
/* a cell for Excel or Sheets: quoted, and never read as a formula */
const cell = v => {
  let s = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
const text = (res, code, body) => { res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.status(code).send(body); };
const hash = async name => {
  const flat = (await redis("HGETALL", name)) || [], o = {};
  for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!adminOk(req, res)) return;
  if (!redisReady) return text(res, 503, "Sign-ups aren't connected yet: add Upstash for Redis in Vercel > Storage.");

  try {
    const flat = (await redis("HGETALL", "signups")) || [];
    const rows = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      try { rows.push(JSON.parse(flat[i + 1])); } catch (e) { rows.push({ email: flat[i] }); }
    }
    rows.sort((a, b) => String(a.signed_up || "").localeCompare(String(b.signed_up || "")));
    const q = req.query || {};

    if (q.sync) {
      if (!mailerLiteReady) return text(res, 400, "MailerLite isn't connected: add MAILERLITE_API_KEY in Vercel, then redeploy.");
      const todo = rows.filter(r => r.email && (q.sync === "all" || !String(r.mailerlite || "").startsWith("ok")));
      let ok = 0;
      const failed = [];
      for (const r of todo) {
        r.mailerlite = await toMailerLite(r);
        await redis("HSET", "signups", r.email, JSON.stringify(r));
        if (r.mailerlite.startsWith("ok")) ok++; else failed.push(`${r.email}: ${r.mailerlite}`);
      }
      return text(res, 200, `Sent ${todo.length} of ${rows.length} sign-ups to MailerLite: ${ok} ok, ${failed.length} failed.` +
        (failed.length ? "\n\n" + failed.join("\n") : ""));
    }
    if (q.count) return text(res, 200, `${rows.length} sign-up${rows.length === 1 ? "" : "s"}`);

    const [invites, devices] = await Promise.all([hash("invites"), hash("invite_devices")]);
    const extra = r => {
      let inv = null;
      try { inv = r.invite_code && JSON.parse(invites[r.invite_code]); } catch (e) { inv = null; }
      if (!inv) return {};
      return { invite_status: inv.status === "revoked" ? "turned off" : "invited", invite_email: inv.emailed || "not emailed",
               devices: +devices[r.invite_code] || 0 };
    };
    const lines = [COLUMNS.join(",")].concat(rows.map(r => {
      const x = Object.assign({ instagram_page: r.instagram ? `https://www.instagram.com/${r.instagram}/` : "" }, r, extra(r));
      return COLUMNS.map(c => cell(x[c])).join(",");
    }));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="torque-hq-signups.csv"');
    return res.status(200).send("﻿" + lines.join("\r\n") + "\r\n");
  } catch (e) {
    console.error("signups failed:", e.message);
    return text(res, 500, "Couldn't read the sign-ups. Try again in a minute.");
  }
};
