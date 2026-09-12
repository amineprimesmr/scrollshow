#!/usr/bin/env bash
# Explicit target, account and secret file; default is validation only.
set -euo pipefail
exec node "$(dirname "$0")/configure-billing.mjs" "$@"
