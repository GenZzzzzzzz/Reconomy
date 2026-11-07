#!/bin/sh
# Copies the shared decision logic into the Lambda package. Run after editing logic.js.
set -e
cd "$(dirname "$0")/.."
cp logic.js backend/src/decision.mjs
echo "Synced logic.js -> backend/src/decision.mjs"
