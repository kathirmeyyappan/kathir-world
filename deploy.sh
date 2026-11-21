#!/usr/bin/env bash
# Deploys kathir world to Modal: the lobby and Room app (`./deploy.sh room`), and the bots app with
# the bots' map of the world, which ships in its image (`./deploy.sh bots`); with no argument, the
# one and then the other. The two apps deploy independently. Run from anywhere with the Modal CLI
# logged in.
set -euo pipefail
cd "$(dirname "$0")"

what=${1:-all}
case "$what" in
  all | room | bots) ;;
  *)
    echo "usage: ./deploy.sh [room|bots]" >&2
    exit 2
    ;;
esac

if [ "$what" != bots ]; then
  MODAL_SYNC_ENTRYPOINT=1 modal deploy -m infra.app
fi

if [ "$what" != room ]; then
  # Builds only the maps not already built from this world by this sim code.
  npm run bot-map
  modal deploy modal-bots/app.py
fi
