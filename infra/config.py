from pathlib import Path

APP_NAME = "kathir-world"
# The launcher (GitHub Pages): the player's home, where a join the lobby refuses is sent back to and
# the room page sends them to pick a room, unless the join came from the room host or a local dev page.
LAUNCHER_URL = "https://world.kathirm.com"
REPO = Path(__file__).resolve().parent.parent

ROOM_PORT = 8000
# A session ends this long after its last request. Node closes a room 30 s after the last person
# leaves, so anything longer just keeps the container alive for nothing.
SESSION_IDLE_TIMEOUT = 60
# Seconds a session start may wait for a Room container to boot (FPRS queues session starts).
SESSION_QUEUE_TIMEOUT = 120
# No container is kept warm. The launcher pings the lobby on load, which starts a throwaway
# session so a Room container boots before Join is clicked, then lingers this long with no sessions.
ROOM_SCALEDOWN_WINDOW = 300
WARMUP_SESSION_IDLE_TIMEOUT = 5
# The lobby's list of public rooms: how long one answer serves every home page, and how long a new
# room has to boot and seat its creator before saying nothing means it has closed.
ROOMS_CACHE_SECONDS = 10
ROOM_BOOT_SECONDS = 120
MAX_SESSIONS_PER_CONTAINER = 64
TARGET_SESSIONS_PER_CONTAINER = 3

# The bots app (modal-bots/) and, per worker a bot runs on (BotWorker in
# packages/shared/src/sim/bots.ts), the function the room's sidecar spawns for chat commands.
BOTS_APP_NAME = "kathir-world-bots"
BOTS_FUNCTIONS = {"dumb": "run_dumb_bot", "combat": "run_combat_bot"}
BOT_SIDECAR_PORT = 8001
