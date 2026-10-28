Torque HQ site v1.2 — beta website (Vercel)

DEPLOY
  cd torque-hq-site
  vercel --prod
  First time only: say no to linking an existing project and give it a name (torque-hq-site,
  or whatever you like). This is a separate project from the phone app (torque-hq-mobile).

TURN ON SIGN-UPS (once, in the Vercel dashboard)
  1. Open the project > Storage > Create Database > Upstash for Redis (the free plan is plenty).
     Connect it to this project. That adds KV_REST_API_URL and KV_REST_API_TOKEN for you.
  2. Settings > Environment Variables > add  ADMIN_KEY  = a long password only you know.
  3. Deploy again: Deployments > the top one > ... > Redeploy (or  vercel --prod).
  Until step 1 is done, the form says "Sign-ups aren't open yet."

SEE WHO SIGNED UP
  https://<your-site>/admin                  the admin page: everyone who signed up, and their invites (below)
  https://<your-site>/api/signups            downloads torque-hq-signups.csv
  https://<your-site>/api/signups?count=1    just the number
  The browser asks for a password: type anything as the username, and your ADMIN_KEY as the password.
  The spreadsheet has each person's email, Instagram (with a link to their page), YouTube, car and
  gearbox, when they signed up and agreed to the emails, and their invite: code, on or turned off,
  whether the invite email went, and how many phones and browsers have joined with it.
  Signing up twice updates the same row.

BETA INVITES (the admin page)
  Look at someone's Instagram (tap their @ on the admin page), tick the people you want, tap Invite.
  Each invite gets a code like K7P4-2QX9 and a link that opens the app with it. Their card then has:
    Copy message     the invite as a DM, ready to paste into Instagram (link, code, how to install)
    Instagram DM     opens a chat with them
    Copy link        just the link
  Turn off stops an invite (their app locks the next time it opens with signal); Turn back on undoes it.
  Each invite works on up to 6 phones and browsers; Reset devices frees those up.
  Set up once: put the app online on app.yourdomain.com (the app's README). This page finds it there by itself.
  (The app somewhere else? Add APP_URL = its address in this project's Environment Variables, and redeploy.)
  To email the invites too, through MailerLite (optional; without it you send each invite as a DM):
  1. Subscribers > Fields: add two text fields called exactly  invite_code  and  invite_link.
  2. Subscribers > Groups: add a group called exactly "Beta testers".
  3. Automations > Create: starts when a subscriber joins a group > Beta testers, then an email (the words are
     below). Put {$invite_link} as the button's link and {$invite_code} where the code goes. Turn it on.
  4. Invite yourself first (sign up on the site with your own email, then Invite on the admin page) to check
     the email and the app.
  Once the "Beta testers" group exists, inviting someone puts their code and link in their MailerLite fields first,
  then adds them to the group, which sends the email, so it never goes out without them. If the fields are missing
  the admin page says so and nobody is emailed; add them and tap Invite again (same code). Group called something
  else? Add MAILERLITE_TESTER_GROUP = its exact name.

  THE INVITE EMAIL (paste into the automation's email)
    Subject:       Your Torque HQ beta invite
    Preview text:  Your code: {$invite_code}

    You're in.
    Thanks for signing up. Here's your invite to the Torque HQ beta: factory torque specs, bolt sequences and
    removal order for the 350Z (VQ35DE), on your phone.
    [ Open Torque HQ ]   (button, link: {$invite_link})
    Your invite code: {$invite_code}
    Put it on your phone
      iPhone: open the link in Safari, tap Share, then Add to Home Screen. Open Torque HQ from your Home Screen;
      if it asks for your code, enter it once more.
      Android: open the link in Chrome and tap Install app.
    Once it's on your phone it works with no signal.
    This invite is just for you, so please don't pass it on. It works on up to 6 phones and browsers.
    Found a wrong spec or a bug? Reply to this email or send us a DM on Instagram.
    Allan, Torque HQ

SEND SIGN-UPS TO MAILERLITE (automatic, with the welcome email)
  1. MailerLite: a group called exactly "Beta waitlist" (Subscribers > Groups), and text fields called
     instagram, youtube, car and gearbox (Subscribers > Fields).
  2. MailerLite: Integrations > API > generate a new token, and copy it.
  3. Vercel: Settings > Environment Variables > add  MAILERLITE_API_KEY  = that token.
     Group called something else? Also add  MAILERLITE_GROUP  = its exact name.
  4. Deploy again: upload to GitHub (below), or Redeploy in Vercel.
  5. MailerLite: Automations > create one that starts when a subscriber joins a group > Beta waitlist,
     with your welcome email as its first step. Turn it on.
  6. Test: sign up on the site with your own email. The welcome email arrives, and the list's
     "mailerlite" column says ok.
  Signed up before this?  https://<your-site>/api/signups?sync=1  sends them across once (they get the
  welcome email too), and retries anyone whose column says "failed".
  In MailerLite's subscribe settings, leave double opt-in for API and integrations off. With it on, each
  new sign-up has to confirm by email before the welcome goes out.

YOUR INSTAGRAM
  In index.html, near the bottom:  instagram: "yourhandle"
  It adds "Follow on Instagram" in the footer and "Questions? DM us on Instagram" under the form.

EMAILING INVITES
  Every email you send to the list needs a way to unsubscribe. An email tool (MailerLite, Kit) adds
  that link for you. If you email by hand, add a line like "Reply STOP and I'll take you off the list."

UPDATING THE LIVE SITE (deployed from GitHub)
  GitHub > your torque-hq-site repository > Add file > Upload files > drag in everything inside the new
  torque-hq-site folder (not the folder itself) > Commit changes. Files with the same name are replaced.
  Vercel deploys it by itself.

FILES
  index.html        the whole site
  img/              phone screenshots, icons, and og-image.png (the picture shown when the link is shared)
  api/signup.js     takes a sign-up from the form, keeps it, and adds it to MailerLite once connected
  api/signups.js    the password-protected download of the list (and ?sync=1 for MailerLite)
  api/admin.js      the password-protected admin page (/admin): invites, turning them off and on
  vercel.json       security and cache headers, and the /admin address
