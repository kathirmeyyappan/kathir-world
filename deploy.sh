#!/usr/bin/env bash
# Deploys kathir world to Modal: the lobby and Room app, the bots' map of the world (which ships in
# the bots image), and the bots app. Run from anywhere with the Modal CLI logged in.
set -euo pipefail
cd "$(dirname "$0")"

MODAL_SYNC_ENTRYPOINT=1 modal deploy -m infra.app
# Builds only the stages of the map not already built from this world by this sim code.
npm run bot-map
modal deploy modal-bots/app.py
