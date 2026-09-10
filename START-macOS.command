#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then open STRATA-Offline.html; exit; fi
node scripts/launch.mjs
