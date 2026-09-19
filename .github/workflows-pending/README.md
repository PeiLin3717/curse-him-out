# Pending GitHub Actions workflows

These two files are finished and reviewed but are parked here instead of
`.github/workflows/` because the deploy token used on 2026-09-18 did not have
the "Workflows" permission, and GitHub refuses pushes that create workflow files
without it. Nothing in this folder runs.

To activate them once the token has **Workflows: Read and write**:

```bash
git mv .github/workflows-pending/ci.yml .github/workflows/ci.yml
git mv .github/workflows-pending/keepalive.yml .github/workflows/keepalive.yml
git rm .github/workflows-pending/README.md
git commit -m "Enable CI smoke tests and keep-alive ping"
git push
```

- `ci.yml`: on every push/PR, boots the app on GitHub's runners against a real
  MySQL 8.4 and smoke-tests the API and homepage; a second job proves the server
  starts and serves the frontend with the database unreachable.
- `keepalive.yml`: every 10 minutes hits `/api/stats` so Render stays awake and
  the Aiven free database keeps seeing activity (it auto-pauses otherwise).
