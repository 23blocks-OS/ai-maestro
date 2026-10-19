#!/bin/bash
# pm2 starts the bridge through this script. Settings (and nothing secret except the .env that is already here) come from .env.
cd "$(dirname "$0")" || exit 1
set -a
[ -f .env ] && source .env
set +a
exec npx tsx src/email-bridge.ts
