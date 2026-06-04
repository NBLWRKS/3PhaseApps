# PhaseMaster — Render deployment (static site + API service)

Two Render services:

- **phasemaster-web** — the React frontend, served as a static site.
- **phasemaster-api** — the Node/Express API with SQLite on a persistent disk
  (handles auth, reports, photo uploads, and PDF generation).

A `render.yaml` blueprint is included so Render can create both at once.

---

## Why a persistent disk

Render's normal filesystem is wiped on every deploy and restart. The SQLite
database and uploaded photos must live on a **Persistent Disk** so they survive.
The blueprint mounts a 1 GB disk at `/var/data` and points the database
(`DATA_DIR=/var/data/db`) and uploads (`UPLOAD_DIR=/var/data/uploads`) at it.

Persistent disks require a paid instance type (the blueprint uses `starter`,
$7/mo). Disks are not available on the free tier.

---

## Deploy with the blueprint (recommended)

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, select the repo. Render reads `render.yaml`
   and creates both services.
3. After the first build, note the two URLs Render assigns, e.g.
   `https://phasemaster-web.onrender.com` and
   `https://phasemaster-api.onrender.com`.
4. Set the three env vars that were left blank (they cross-reference each other
   so can't be auto-filled), then redeploy both services:

   On **phasemaster-api**:
   - `PUBLIC_URL` = the API URL, e.g. `https://phasemaster-api.onrender.com`
   - `CORS_ORIGIN` = the web URL, e.g. `https://phasemaster-web.onrender.com`

   On **phasemaster-web**:
   - `VITE_API_BASE` = the API URL **with `/api`**, e.g.
     `https://phasemaster-api.onrender.com/api`

   `VITE_API_BASE` is read at build time, so changing it triggers a rebuild —
   that's expected.

---

## Deploy manually (instead of the blueprint)

**API service:** New → Web Service → root directory `server`,
build `npm install`, start `node src/index.js`, health check `/api/health`.
Add a disk mounted at `/var/data`. Set env vars: `NODE_VERSION=20`, `PORT=8080`,
`DATA_DIR=/var/data/db`, `UPLOAD_DIR=/var/data/uploads`, a strong `JWT_SECRET`,
`OPEN_SIGNUP=true`, `REQUIRE_OTP=false`, plus `PUBLIC_URL` and `CORS_ORIGIN`
as above.

**Static site:** New → Static Site → root directory `client`,
build `npm install && npm run build`, publish directory `dist`, and add a
rewrite rule `/*` → `/index.html`. Set `VITE_API_BASE` as above.

---

## Create your admin account

After the API is live, open its **Shell** tab in the Render dashboard and run:

```bash
npm run init-admin you@email.com yourpassword
```

This runs against the same persistent disk the live service uses, so the admin
user is created in the real database. Re-running it updates the password/role.
Regular users who sign up through the app get the `user` role and see only their
own reports.

---

## Custom domains

In each service's **Settings → Custom Domains**, add the domain you want
(e.g. `app.yourdomain.com` for the site, `api.yourdomain.com` for the API),
and add the DNS records Render shows you. Render provisions SSL automatically.
Then update `PUBLIC_URL`, `CORS_ORIGIN`, and `VITE_API_BASE` to use the custom
domains and redeploy.

---

## Notes

- **Free tier cold starts:** if you put the API on the free instance instead of
  `starter`, it sleeps after ~15 min idle and takes a few seconds to wake. But
  the free tier has no persistent disk, so data wouldn't survive restarts —
  use the paid instance for anything real.
- **Signups:** set `OPEN_SIGNUP=false` on the API to disable public
  registration and create accounts only via the Shell `init-admin` command.
- **Translation (optional):** set `ANTHROPIC_API_KEY` on the API service to
  enable the admin Spanish→English translation button. Safe to leave unset.
- **OTP/password-reset emails:** no mail server is wired up, so OTP codes and
  reset links print to the API service logs. Keep `REQUIRE_OTP=false` unless you
  add email sending.
