Torque HQ site v1.0 — beta website (Vercel)

DEPLOY
  cd torque-hq-site
  vercel --prod
  First time only: say no to linking an existing project and give it a name (torque-hq-site,
  or whatever you like). This is a separate project from the phone app (torque-hq-mobile).

TURN ON SIGN-UPS (once, in the Vercel dashboard)
  1. Open the project > Storage > Create Database > Upstash for Redis (the free plan is plenty).
     Connect it to this project. That adds KV_REST_API_URL and KV_REST_API_TOKEN for you.
  2. Settings > Environment Variables > add  ADMIN_KEY  = a long password only you know.
  3. Deploy again:  vercel --prod
  Until step 1 is done, the form says "Sign-ups aren't open yet."

SEE WHO SIGNED UP
  https://<your-site>/api/signups            downloads torque-hq-signups.csv
  https://<your-site>/api/signups?count=1    just the number
  The browser asks for a password: type anything as the username, and your ADMIN_KEY as the password.
  The spreadsheet has each person's email, Instagram (with a link to their page), YouTube, car and
  gearbox, and when they signed up and agreed to the emails. Signing up twice updates the same row.

YOUR INSTAGRAM
  In index.html, near the bottom:  instagram: "yourhandle"
  It adds "Follow on Instagram" in the footer and "Questions? DM us on Instagram" under the form.

EMAILING INVITES
  Every email you send to the list needs a way to unsubscribe. An email tool (MailerLite, Kit) adds
  that link for you. If you email by hand, add a line like "Reply STOP and I'll take you off the list."

FILES
  index.html        the whole site
  img/              phone screenshots, icons, and og-image.png (the picture shown when the link is shared)
  api/signup.js     takes a sign-up from the form and keeps it
  api/signups.js    the password-protected download of the list
  vercel.json       security and cache headers
