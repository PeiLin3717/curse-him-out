# Curse Him Out: project map for Claude Code

## What this is
https://cursehimout.com is a small public venting wall: type what he did, pick a rage level, hit Burn, and the curse joins a shared Wall of Shame. Stack: Node/Express (`server.js`), MySQL via a `mysql2` pool (`db.js`), and a static frontend in `public/` (`index.html`, `script.js`, `styles.css`). The owner (GitHub `PeiLin3717`) builds everything in the cloud: GitHub -> Render, nothing installed on a laptop. Every Claude Code session on this project should be a cloud session working on a branch and pushing to GitHub.

## Where everything lives
- **Code**: https://github.com/PeiLin3717/curse-him-out (public). Default branch `main`. Branch `pending-workflows` holds parked GitHub Actions files under `.github/workflows-pending/`.
- **Hosting (Render)**: web service `cursehimout`, id `srv-d8d7du6k1jcs738mfh7g`, free plan, region Oregon, runtime node. Build `npm install`, start `npm start`, auto-deploy from `main`, health check path `/api/health`. Live at https://cursehimout.com (apex), https://www.cursehimout.com (301 to apex), https://cursehimout.onrender.com. Free instance sleeps after ~15 min idle; cold start ~50 s. Render uses the newest Node (26.x) because `package.json` says `engines: ">=18"`.
- **Database (Aiven)**: project `cursehimout`, MySQL service `cursehimout`, MySQL 8.4, plan `free-1-1gb`, cloud `do-blr` (DigitalOcean Bangalore). One table `curses` (id, body, level, crimes JSON text, created_at); `db.js` creates and seeds it on first connect. Aiven powers off an idle free service (not deleted). Power on: `avn service update cursehimout --project cursehimout --power-on`, then `avn service wait cursehimout --project cursehimout --timeout 600`; no redeploy needed, the server reconnects by itself.
- **DNS (GoDaddy)**: edited by hand in the GoDaddy web UI (no API for this account); records are in `docs/OPS.md` section 5.

## How deploys work
Push to `main` -> Render builds (~40 s) -> live in about a minute. Render keeps the old version running if the new one fails `/api/health`. Render API commands (deploys, logs, rollback) are in `docs/OPS.md` sections 2 and 8.

There is no test suite and CI is parked, so check before you push: `node --check server.js && node --check db.js`, then start the server with no DB vars (`PORT=3000 node server.js &`) and confirm `curl -s -w ' %{http_code}' localhost:3000/api/health` returns 200 with `db:false` and `curl -s -o /dev/null -w '%{http_code}' localhost:3000/` returns 200 (Node is available in cloud sessions). Sessions never have DB credentials (Render only), so DB-backed routes are checked in production with the Verify block below; undo a bad deploy with `docs/OPS.md` section 8.

## Credentials
- Never in the repo. `.env` is git-ignored; `.env.example` lists the variable names with placeholder values (no real credentials).
- Expected as environment variables: `RENDER_API_KEY`, `AIVEN_AUTH_TOKEN`, `GITHUB_TOKEN`.
- On the owner's laptop they sit in `~/.config/cursehimout/env` (path only; do not read or print it).
- In Claude Code cloud sessions they come from the cloud environment's variables (claude.ai/code environment settings).
- Render holds the DB vars: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. `GET /services/{id}/env-vars` returns values: never print them.
- The GitHub fine-grained token has only **Contents: read/write** on this repo. It can push code but cannot create or edit `.github/workflows/*` and cannot open pull requests. So merges are done with `git push origin <branch>:main`.

## Runtime behavior worth knowing
- Server listens immediately; DB connect runs in the background with retry backoff 5 s doubling to a 60 s cap. A request arriving during the very first connect attempt waits up to 8 s.
- While the DB is down, `/api/curses` and `/api/stats` return `503 {"error":"db_unavailable"}` with `Retry-After: 30`.
- `/api/health` is always HTTP 200: `{ok:true, db:boolean, lastDbError:<code or null>, uptime:<seconds>}`. `db:false` is the real signal. Only the error code is published, never the message.
- `/api/stats` returns `{count: COUNT_BASE + rows}`; COUNT_BASE is a vanity offset, default 12000.
- `GET /api/curses?limit=N` (default 40, max 100). `POST /api/curses {text, level 1-5, crimes[]}` is rate limited to 10/min/IP (`express-rate-limit`, `trust proxy 1`).
- Frontend treats any non-OK API response as offline and falls back to localStorage.
- Censor-o-matic: while typing, a swear is masked only after the following space or punctuation; the burn-time pass censors fully.

## Verify after a deploy
```bash
curl -s https://cursehimout.com/api/health            # expect "db":true
curl -s https://cursehimout.com/api/stats             # expect {"count":12011} as of 2026-09-18 (12000 + 11 rows)
curl -s -o /dev/null -w '%{http_code}\n' https://cursehimout.com/   # expect 200
```

If `db` is false, follow `docs/OPS.md` section 7; it is almost always the Aiven DB powered off. An `uptime` under ~120 s means the free instance just woke up, which is normal.

## Pending work
1. Activate the parked workflows: `ci.yml` (boots the app on GitHub runners against MySQL 8.4, smoke tests, plus a starts-without-db job) and `keepalive.yml` (pings `/api/stats` every 10 min so Render and Aiven stay awake). They live on branch `pending-workflows` in `.github/workflows-pending/` with a README holding the exact `git mv` commands. Blocked until the GitHub token has **Workflows: read and write**. GitHub disables scheduled workflows after 60 days without repo activity; re-enable under Actions.
2. Add `RENDER_API_KEY` and `AIVEN_AUTH_TOKEN` as variables in the Claude Code cloud environment (owner does this in claude.ai/code environment settings).
3. Optional: give the GitHub token **Workflows** and **Pull requests** read/write.

## Ideas the owner likes
- Fire reactions per curse.
- Show the saved-but-hidden crime tags on the wall; move the crime picker above the Burn button.
- Favicon and a share card (Open Graph tags).
- Relative timestamps on the wall ("3 min ago").
- "Burn of the day" pin.
- Honest burn feedback: disable the button during the animation, confirm only after the API returns 201.
- Token-protected admin page listing the last 100 curses with delete.
- (medium) Move the DB to a US region to halve API latency.

## Working with the owner
- Not a professional developer; they "just want to play". Plain English, short messages, no em-dashes. Recommend one path instead of listing options.
- Build in the cloud (GitHub -> Render); never ask them to install anything locally. Always start sessions as cloud sessions.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. PR descriptions end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Git identity for commits: `Pei Lin <161694326+PeiLin3717@users.noreply.github.com>`.

Command-level detail (Render API, Aiven CLI, troubleshooting, rollback, incident history): see `docs/OPS.md`.
