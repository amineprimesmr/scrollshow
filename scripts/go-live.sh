#!/usr/bin/env bash
set -euo pipefail
cat <<'HELP'
This legacy clipboard installer has been retired.
Use `vercel env update TIKTOK_CLIENT_SECRET production` with the secret on stdin.
Keep TIKTOK_PUBLISH_ENABLED=0 until TikTok approves the production app.
Validate the build, preview, authentication and health before production deployment.
HELP
