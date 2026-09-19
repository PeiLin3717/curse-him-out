# Curse Him Out 🔥

A cathartic venting wall. Type what they did, set your rage level, and **burn it** — your curse joins a shared public Wall of Shame. _Vent it. Burn it. Forget him._

- **Frontend:** static HTML/CSS/JS (in `public/`)
- **Backend:** Node.js + Express (`server.js`)
- **Database:** MySQL (`db.js`)

The frontend still works on its own (open `public/index.html`) — it just falls back to your-browser-only storage when the backend isn't running. Once the backend is up, the wall becomes shared and permanent.

```
Browser  →  Express API (/api/curses)  →  MySQL
  ↑                                         |
  └──────────  the Wall of Shame  ←─────────┘
```

---

## Step 0 — Install Node.js (one time)
This machine doesn't have Node yet. Get the **LTS** version (18 or newer):
- Download from <https://nodejs.org> (the "LTS" button), **or**
- With Homebrew: `brew install node`

Check it worked:
```bash
node -v
npm -v
```

---

## Step 1 — Get a free MySQL database (Aiven)
1. Sign up at <https://aiven.io> (no credit card for the free plan).
2. **Create service → MySQL → Free plan**. Pick the region closest to you.
3. Wait ~2 min for it to say **Running**, then open the service's **Overview** page.
4. Copy these into your notes — you'll need them next:
   - **Host**, **Port**, **User**, **Password**, **Database name** (Aiven's default DB is usually `defaultdb`).

> **No Aiven free plan in your region?** Use **TiDB Cloud Serverless** instead (<https://tidbcloud.com>, 5 GB free, MySQL-compatible). Same code — just paste its host/user/password into `.env` below. It needs `DB_SSL=true` too.

---

## Step 2 — Run it locally
From this folder:
```bash
npm install                # install Express, mysql2, etc.
cp .env.example .env        # make your private config file
```
Open `.env` and paste in your DB values from Step 1 (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). Keep `DB_SSL=true`.

Then start it:
```bash
npm run dev
```
Visit **http://localhost:3000**. The first run auto-creates the `curses` table and seeds a few starter posts. Burn a curse — refresh — it's still there. 🎉

---

## Step 3 — Put the code on GitHub
1. Create a free account at <https://github.com> and a new **empty** repo called `curse-him-out`.
2. In this folder:
```bash
git init
git add .
git commit -m "Curse Him Out: frontend + backend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/curse-him-out.git
git push -u origin main
```
(`.env` and `node_modules/` are git-ignored, so your password stays private.)

---

## Step 4 — Deploy free on Render
1. Sign up at <https://render.com> with your GitHub account.
2. **New → Web Service →** pick your `curse-him-out` repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. **Environment → Add Environment Variable** for each line in your `.env`
   (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `COUNT_BASE`).
   **Do not** set `PORT` — Render provides it.
5. **Create Web Service.** In ~2 min you'll get a public URL like
   `https://curse-him-out.onrender.com`. Share it. 🔥

> **Free-tier nap:** Render's free service sleeps after ~15 min of no visitors, so the *first* visit after a quiet spell takes ~30–60s to wake up. Totally fine to start.

---

## API reference
| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/curses?limit=40` | Recent curses (newest first) |
| `POST` | `/api/curses` | Add one — body: `{ "text": "...", "level": 1-5, "crimes": ["..."] }` |
| `GET`  | `/api/stats` | `{ "count": <base + total> }` for the live counter |
| `GET`  | `/api/health` | Always `200`: `{ "ok": true, "db": true/false, "lastDbError": null/"ENOTFOUND", "uptime": <seconds> }` — `lastDbError` is just the error code |

## Good to know / future
- **Spam guard:** max 10 new curses per minute per IP.
- **Safety:** swearing is the point; the footer asks people to keep it anonymous (no real names). Automated moderation isn't built yet — a good next step if it goes viral.
- **Counter:** starts at `COUNT_BASE` (12,000) plus the real number of curses.
- **Sleepy database:** Aiven's free MySQL powers itself off after a quiet spell, so the server no longer waits on (or dies with) the DB — it starts serving the frontend right away and retries the connection in the background, backing off from 5 s up to 60 s between attempts. While the DB is down, `/api/curses` and `/api/stats` answer `503 {"error":"db_unavailable"}` (with `Retry-After: 30`) and the frontend quietly switches to its browser-only offline mode; the next page load shows the shared wall again once the DB wakes up. Right after a cold start the first API calls wait up to 8 s for the initial connection, so the visitor who woke the instance still gets the shared wall. `/api/health` always returns `200` so Render keeps the instance alive, and its `db`, `lastDbError` (an error code such as `ENOTFOUND` or `ETIMEDOUT` — never the full message, which could reveal the DB host or user) and `uptime` fields tell you what's actually going on.
- **Ideas:** likes/🔥 reactions, report button, "burn of the day."

---

## Working in the cloud (no laptop setup)
You don't need Node or MySQL on your own machine — Render builds and deploys straight from GitHub.

- **The code lives on GitHub.** Every push to `main` auto-deploys on Render in about a minute.
- **CI on every push and PR** — **pending, not yet active**: parked as `.github/workflows-pending/ci.yml` on branch `pending-workflows`, see `docs/OPS.md` section 9. When enabled: installs dependencies, boots the server against a throwaway MySQL and smoke-tests the API and the homepage. A second job confirms the site still starts when the database is unreachable (the fix for the months-long outage).
- **Keep-alive** — **pending, not yet active**: parked as `.github/workflows-pending/keepalive.yml` on branch `pending-workflows`, see `docs/OPS.md` section 9. When enabled: pings `https://cursehimout.com/api/stats` every 10 minutes so Render stays awake and the Aiven free DB isn't auto-paused. GitHub disables this schedule after 60 days without repository activity — if that happens, re-enable it under **Actions → keepalive → Enable workflow** (or `gh workflow enable keepalive.yml`); a commit alone does not turn it back on.
- **Work from any machine:** open this repo in Claude Code on the web (claude.ai/code) or github.dev (press `.` on the repo page), make the change on a branch, push it, then `git push origin <branch>:main` (PRs are not possible with the current token) — Render deploys it.
- **Check health:** `curl https://cursehimout.com/api/health` — `"db": true` means the database is reachable; `false` means the wall is in browser-only mode (most likely the Aiven DB was powered off — turn it back on in the Aiven console).
- **Something red?** Open the repo's **Actions** tab; a failed CI step prints `server.log` right there.
- **New Claude Code session or new machine?** Start with `CLAUDE.md` (the project map: hosting, deploys, credentials by name, pending work) and `docs/OPS.md` (the runbook: Render API, Aiven CLI, troubleshooting, rollback).
