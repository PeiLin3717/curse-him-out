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
| `GET`  | `/api/health` | `{ "ok": true }` |

## Good to know / future
- **Spam guard:** max 10 new curses per minute per IP.
- **Safety:** swearing is the point; the footer asks people to keep it anonymous (no real names). Automated moderation isn't built yet — a good next step if it goes viral.
- **Counter:** starts at `COUNT_BASE` (12,000) plus the real number of curses.
- **Ideas:** likes/🔥 reactions, report button, "burn of the day," custom domain.
