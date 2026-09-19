# Curse Him Out: operations runbook

Command-level companion to `CLAUDE.md`. Everything here runs from bash or zsh with `curl`, `jq`, `git`, `dig` and `python3`/`pip` (`gh` is optional, section 9 only); nothing needs to be installed on the owner's laptop. Credentials are never in the repo: every command expects them as environment variables (see "Credentials" below).

Contents
1. Credentials
2. Render (hosting)
3. Aiven (MySQL)
4. GitHub
5. DNS (GoDaddy)
6. Verify the site
7. Troubleshooting: site is down
8. Roll back a deploy
9. Activate the parked GitHub Actions workflows
10. Incident history

---

## 1. Credentials

| Variable | Used for | Where it comes from |
|----------|----------|---------------------|
| `RENDER_API_KEY` | Render REST API | Render dashboard, account-level API keys |
| `AIVEN_AUTH_TOKEN` | Aiven CLI (`avn`) | Aiven console, user authentication tokens |
| `GITHUB_TOKEN` | pushing to the repo | GitHub, fine-grained personal access token scoped to this repo |

- On the owner's laptop these live in `~/.config/cursehimout/env`. Load with `source ~/.config/cursehimout/env`. Do not read or print that file in a session transcript.
- In Claude Code cloud sessions they must be added as variables in the cloud environment settings (claude.ai/code). If a command below fails with 401, the variable is probably missing there.
- The app's own DB credentials (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) live only in Render's environment for the service. Never copy their values into the repo, a commit message, or a chat reply.

Quick check that the variables are present without revealing them:

```bash
for v in RENDER_API_KEY AIVEN_AUTH_TOKEN GITHUB_TOKEN; do
  if [ -n "$(printenv "$v")" ]; then echo "$v: set"; else echo "$v: MISSING"; fi
done
```

---

## 2. Render (hosting)

- Service name `cursehimout`, id `srv-d8d7du6k1jcs738mfh7g`, free plan, region Oregon, runtime node.
- Build command `npm install`, start command `npm start`, auto-deploy from `main`, health check path `/api/health` (set 2026-09-18).
- Custom domains: `cursehimout.com` (apex, verified) and `www.cursehimout.com` (redirects to apex). Default URL `https://cursehimout.onrender.com`.
- Free instance sleeps after ~15 min without traffic; the first request after that takes ~50 s.
- Node version: Render picks the newest Node (26.x at the time of writing) because `package.json` has `"engines": {"node": ">=18"}`. Pin it there if a Node upgrade ever breaks the build.
- Env vars set in Render: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Not set (defaults apply): `DB_SSL` (true), `COUNT_BASE` (12000), `PORT` (Render provides it).

All Render calls use the same header and base URL. Claude Code runs every command in a fresh shell, so paste these two lines at the top of each command block; aliases and exports do not carry over between calls (a shell function does work on the same line, an alias does not):

```bash
RENDER_SVC=srv-d8d7du6k1jcs738mfh7g
rcurl() { curl -sS -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" "$@"; }
```

### List services

```bash
rcurl "https://api.render.com/v1/services?limit=20" \
  | jq -r '.[].service | "\(.id)  \(.name)  \(.type)  suspended=\(.suspended)"'
```

### Show this service

```bash
rcurl "https://api.render.com/v1/services/$RENDER_SVC" \
  | jq '{name, id, autoDeploy, branch, repo, region: .serviceDetails.region, plan: .serviceDetails.plan, healthCheckPath: .serviceDetails.healthCheckPath, build: .serviceDetails.envSpecificDetails.buildCommand, start: .serviceDetails.envSpecificDetails.startCommand}'
```

### List recent deploys

```bash
rcurl "https://api.render.com/v1/services/$RENDER_SVC/deploys?limit=10" \
  | jq -r '.[].deploy | "\(.createdAt)  \(.status)  \(.commit.id[0:7])  \(.commit.message | split("\n")[0])"'
```

The sha is truncated to 7 characters for display only; a `POST` needs the full `.commit.id`. Statuses you will see: `created` (what a fresh `POST` returns), `build_in_progress`, `pre_deploy_in_progress`, `update_in_progress`, `live`, `deactivated` (an older deploy replaced by a newer one), `build_failed`, `update_failed`, `canceled`.

### Show one deploy

```bash
DEPLOY_ID=dep-xxxxxxxxxxxxxxxxxxxx   # from the list above
rcurl "https://api.render.com/v1/services/$RENDER_SVC/deploys/$DEPLOY_ID" | jq
```

### Trigger a deploy of the current `main`

```bash
rcurl -X POST "https://api.render.com/v1/services/$RENDER_SVC/deploys" \
  -H "Content-Type: application/json" -d '{}' | jq '{id, status, commit: .commit.id}'
```

### Deploy a specific commit (used for rollback, see section 8)

```bash
rcurl -X POST "https://api.render.com/v1/services/$RENDER_SVC/deploys" \
  -H "Content-Type: application/json" -d '{"commitId":"<full sha from .commit.id>"}' | jq '{id, status, commit: .commit.id}'
```

### Wait for a deploy to finish

```bash
DEPLOY_ID=$(rcurl "https://api.render.com/v1/services/$RENDER_SVC/deploys?limit=1" | jq -r '.[0].deploy.id')   # newest deploy
while :; do
  s=$(rcurl "https://api.render.com/v1/services/$RENDER_SVC/deploys/$DEPLOY_ID" | jq -r .status)
  echo "$(date +%T) $s"
  case "$s" in live|build_failed|update_failed|canceled|deactivated) break;; esac
  sleep 10
done
```

### Environment variable names (values are secrets: print names only)

```bash
rcurl "https://api.render.com/v1/services/$RENDER_SVC/env-vars" | jq -r '.[].envVar.key'
```

Expected output: `DB_HOST DB_NAME DB_PASSWORD DB_PORT DB_USER` (order may vary). Never pipe this endpoint to anything that prints `.value`.

### Set or fix the health check path

```bash
rcurl -X PATCH "https://api.render.com/v1/services/$RENDER_SVC" \
  -H "Content-Type: application/json" \
  -d '{"serviceDetails":{"healthCheckPath":"/api/health"}}' | jq '.serviceDetails.healthCheckPath'
```

### Read logs

Logs need the owner id (workspace id). Take it from the service itself so it is always the right workspace; never commit it.

```bash
OWNER_ID=$(rcurl "https://api.render.com/v1/services/$RENDER_SVC" | jq -r .ownerId)
START=$(date -u -v-30M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
rcurl "https://api.render.com/v1/logs?ownerId=$OWNER_ID&resource=$RENDER_SVC&startTime=$START&endTime=$END&limit=100" \
  | jq -r '.logs[] | "\(.timestamp)  \(.message)"'
```

Useful log lines from the app: `Database connected`, `Database unavailable (...) retrying in Ns`, `Curse Him Out running on http://localhost:PORT`. The "unavailable" line includes the full error message, which can contain the DB host; do not paste it into a public place.

---

## 3. Aiven (MySQL)

- Project `cursehimout`, service `cursehimout`, MySQL 8.4.x, plan `free-1-1gb` (1 CPU, 1 GB RAM, 1 GB disk), cloud `do-blr` (DigitalOcean Bangalore).
- One table `curses` (`id`, `body varchar(1000)`, `level tinyint`, `crimes text` holding a JSON array, `created_at`). `db.js` creates and seeds it on first connect; `schema.sql` is reference only.
- Aiven powers off an idle free service automatically. Powered off means the service is stopped but its data and hostname are kept; it is not deleted. Powering it back on takes a few minutes.
- The connection requires SSL. The app uses `ssl: { rejectUnauthorized: false }` (see `db.js`).

### Install and authenticate the CLI

```bash
python3 -m pip install --user aiven-client
export AIVEN_AUTH_TOKEN=...          # from the cloud environment or ~/.config/cursehimout/env
```

If `avn` is then not found, call it by full path: `$(python3 -m site --user-base)/bin/avn ...`. `avn` reads `AIVEN_AUTH_TOKEN` automatically. Alternative: `avn --auth-token "$AIVEN_AUTH_TOKEN" <command>`.

### List services and their state

```bash
avn service list --project cursehimout
```

State column: `RUNNING` is good; `POWEROFF` means the site is in offline mode.

### Full service details (JSON)

```bash
avn service get cursehimout --project cursehimout --json | jq '{state, plan, cloud_name, service_type, node_states}'
```

Do not print the whole JSON in a public place: it includes the hostname, port and user.

### Power the database on

```bash
avn service update cursehimout --project cursehimout --power-on
# then block until RUNNING (returns on its own; gives up after 10 min):
avn service wait cursehimout --project cursehimout --timeout 600
```

Once it is RUNNING, the app reconnects on its own (retry loop, at most 60 s later). No Render redeploy is needed.

### Power it off on purpose (not normally wanted)

```bash
avn service update cursehimout --project cursehimout --power-off
```

### Recent events (useful to see when Aiven auto-paused it)

```bash
avn events --project cursehimout
```

### Known quirk: the DB admin password

The password shown by the Aiven API / `avn service get` for the DB admin user (Render's `DB_USER`) does NOT authenticate. The password that works is the `DB_PASSWORD` already set in Render's environment. Do not "fix" the Render value to match Aiven's output; the site will break. If a password reset is ever required, do it in Aiven, then update `DB_PASSWORD` in Render and redeploy.

---

## 4. GitHub

- Repo: https://github.com/PeiLin3717/curse-him-out (public). Default branch `main`.
- Other remote branch: `pending-workflows` (parked Actions files, see section 9).
- Git identity for commits: `Pei Lin <161694326+PeiLin3717@users.noreply.github.com>`.
- Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. PR footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

### Token permissions (current fine-grained token)

| Permission | Current | Needed for |
|------------|---------|------------|
| Contents: read/write | yes | pushing branches, pushing to `main` |
| Workflows: read/write | no | creating or editing any file under `.github/workflows/` |
| Pull requests: read/write | no | opening PRs with `gh pr create` or the API |

Because PRs cannot be opened with the current token, the merge path is a fast-forward push straight to `main`.

### Push a branch and fast-forward `main` to it

```bash
git push origin <branch>              # backup of the branch on GitHub
git push origin <branch>:main         # fast-forward main; this triggers the Render deploy
```

If GitHub rejects the second push as non-fast-forward, rebase first: `git fetch origin && git rebase origin/main`, then push again.

### Configure git identity in a fresh session

```bash
git config user.name "Pei Lin"
git config user.email "161694326+PeiLin3717@users.noreply.github.com"
```

### Authenticated push without storing the token

Try a plain `git push origin <branch>:main` first; Claude Code cloud environments usually already have GitHub push access for this repo. Only if that is refused, pass the token on the command line without touching the remote:

```bash
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/PeiLin3717/curse-him-out.git" <branch>:main
```

Nothing is written to `.git/config`, so there is no cleanup step. Never run `git remote set-url` with a URL that contains the token, and never paste the expanded command into a public place.

---

## 5. DNS (GoDaddy)

| Name | Type | Value | Purpose |
|------|------|-------|---------|
| `@` (apex) | A | `216.24.57.1` | Render's static IP for custom domains |
| `www` | CNAME | `cursehimout.onrender.com` | Render redirects www to the apex |

- Nameservers: `ns59.domaincontrol.com`, `ns60.domaincontrol.com`.
- The GoDaddy API is not available to this account (it requires 10+ domains), so any DNS change is manual in the GoDaddy web UI (the domain's DNS management page).
- Check propagation: `dig +short cursehimout.com A` and `dig +short www.cursehimout.com CNAME`.
- Render manages the TLS certificate; nothing to do at GoDaddy for HTTPS.

---

## 6. Verify the site

```bash
curl -s https://cursehimout.com/api/health ; echo
# expect {"ok":true,"db":true,"lastDbError":null,"uptime":<seconds>}

curl -s https://cursehimout.com/api/stats ; echo
# expect {"count":12011} as of 2026-09-18 (12000 vanity base + 11 rows); it grows as people burn

curl -s -o /dev/null -w '%{http_code}\n' https://cursehimout.com/
# expect 200

curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://www.cursehimout.com/
# expect 301 -> https://cursehimout.com/
```

If the first call takes ~50 s, the free instance was asleep; that is normal.

---

## 7. Troubleshooting: site is down

Work top to bottom; stop at the first step that explains it.

1. **Homepage**: `curl -s -o /dev/null -w '%{http_code}\n' https://cursehimout.com/`
   - Timeout or 5xx from Render's edge: check the service in Render (section 2, "Show this service" and "List recent deploys"). A failed deploy keeps the previous version live, so a totally dead site usually means the instance is suspended or Render itself has an incident (https://status.render.com).
   - 200: the web server is fine. Continue.
2. **Health**: `curl -s https://cursehimout.com/api/health`
   - `"db": true`: the backend and DB are fine. If the page still looks wrong, it is a frontend bug; check the browser console.
   - `"db": false`: the DB is unreachable. Note `lastDbError`:
     - `ENOTFOUND` / `ECONNREFUSED` / `ETIMEDOUT` / `EHOSTUNREACH`: the Aiven service is almost certainly powered off. Go to step 3.
     - `ER_ACCESS_DENIED_ERROR`: credentials mismatch. Compare the env var names in Render (section 2) and remember the DB admin password quirk (section 3). Do not print values.
3. **Aiven power state**: `avn service list --project cursehimout`
   - `POWEROFF`: run `avn service update cursehimout --project cursehimout --power-on`, then `avn service wait cursehimout --project cursehimout --timeout 600` (returns once it is `RUNNING`, a few minutes), then re-check `/api/health`. The server reconnects by itself within 60 s; no redeploy needed.
   - `RUNNING` but `db:false` persists for more than 2 minutes: read Render logs (section 2) for the full error text, and check `avn events --project cursehimout` for a recent maintenance or migration.
4. **Data routes**: while `db:false`, `/api/curses` and `/api/stats` answer `503 {"error":"db_unavailable"}` with `Retry-After: 30`. The frontend silently switches to browser-only mode, so visitors still see a working page; they just do not see the shared wall. This is expected, not a second bug.
5. **Still stuck**: trigger a redeploy of `main` (section 2) as a last resort. It restarts the process and re-reads env vars.

---

## 8. Roll back a deploy

Render deploys any commit you name; no revert commit is required.

```bash
RENDER_SVC=srv-d8d7du6k1jcs738mfh7g
rcurl() { curl -sS -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" "$@"; }

# 1. find the last good commit (full sha; the POST below needs it)
rcurl "https://api.render.com/v1/services/$RENDER_SVC/deploys?limit=10" \
  | jq -r '.[].deploy | "\(.createdAt)  \(.status)  \(.commit.id)  \(.commit.message | split("\n")[0])"'

# 2. deploy it
rcurl -X POST "https://api.render.com/v1/services/$RENDER_SVC/deploys" \
  -H "Content-Type: application/json" -d '{"commitId":"<full good sha>"}' | jq '{id, status}'

# 3. wait for status live (loop in section 2), then verify (section 6)
```

Because auto-deploy is on, the next push to `main` will deploy `main` again. To make the rollback permanent, also revert on `main`:

```bash
git revert --no-edit <bad sha>
git push origin HEAD:main
```

---

## 9. Activate the parked GitHub Actions workflows

Two finished workflows are parked on branch `pending-workflows` in `.github/workflows-pending/` because the GitHub token lacks the Workflows permission and GitHub rejects pushes that create workflow files without it.

- `ci.yml`: on every push and PR, boots the app on GitHub runners against MySQL 8.4 and smoke-tests the API and homepage; a second job proves the server starts and serves the frontend with the DB unreachable.
- `keepalive.yml`: every 10 minutes hits `https://cursehimout.com/api/stats` so Render stays awake and the Aiven free DB keeps seeing queries.

Steps, once the token has **Workflows: read and write**:

```bash
git fetch origin main
git fetch origin pending-workflows          # explicit: single-branch clones only track main
git checkout -b enable-workflows FETCH_HEAD
git rebase origin/main
mkdir -p .github/workflows
git mv .github/workflows-pending/ci.yml .github/workflows/ci.yml
git mv .github/workflows-pending/keepalive.yml .github/workflows/keepalive.yml
git rm .github/workflows-pending/README.md
git commit -m "Enable CI smoke tests and keep-alive ping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin enable-workflows:main
```

Afterwards: GitHub disables scheduled workflows in a public repo after 60 days without repository activity. If the keep-alive stops, re-enable it under Actions -> keepalive -> Enable workflow (or `gh workflow enable keepalive.yml`); a commit alone does not turn it back on.

---

## 10. Incident history

| Date | What happened |
|------|---------------|
| 2026-05-30 | Site launched: Render web service + Aiven free MySQL + GoDaddy domain. |
| 2026-05-31 | Aiven auto-powered off the idle free DB one day after creation. The server at the time exited when the DB connect failed, so Render crash-looped and the whole site (including the static frontend) went down. |
| 2026-05-31 to 2026-09-18 | Down for about 3.5 months; nobody noticed because nothing was pinging it. |
| 2026-09-18 | Owner powered the DB back on. Resilience fix deployed (`e011a44`, `f9ce9ba` on `main`): server starts without the DB, retries with backoff, answers 503 on data routes, `/api/health` always 200. Render health check path set to `/api/health`. Keep-alive and CI workflows written but parked (token permission). |

Lessons baked into the code and this runbook: the frontend must never depend on the DB being up, something must ping the site regularly (keep-alive workflow, pending), and `/api/health` `db:false` is the first thing to check.
