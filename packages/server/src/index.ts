// Room server. One process hosts many rooms; a WebSocket is routed to a room by the session id
// that Modal's proxy stamps on the upgrade request, or by ?room= when running bare (local dev).
import { createServer, type IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  FREEPLAY,
  Room,
  hashSeed,
  isGameModeId,
  placementFromQuery,
  type ClientLink,
  type GameModeId,
  type ServerMessage,
} from '@world/shared';
import { createBotSpawner } from './bots';
import { createStaticHandler } from './static';

const PORT = Number(process.env.PORT ?? 8787);
const SESSION_HEADER = 'x-modal-server-session-id';
const EMPTY_ROOM_GRACE_MS = 30_000;
const GLOBAL_ROOM = 'global';
const SIM_LATENCY_MS = Number(process.env.SIM_LATENCY_MS ?? 0);
const SIM_JITTER_MS = Number(process.env.SIM_JITTER_MS ?? 0);
const STATIC_DIR = process.env.STATIC_DIR;

const rooms = new Map<string, Room>();
// The rooms that ended themselves (their master left), by key, and why. Nobody is seated in one
// again: behind Modal a room is its session, which idles out with nobody in it, and a join that
// reaches it meanwhile is told why it ended rather than made a new room under it.
const ended = new Map<string, string>();
const spawnBot = createBotSpawner(log) ?? undefined;
const emptyTimers = new Map<string, NodeJS.Timeout>();

function log(msg: string): void {
  console.log(`${new Date().toISOString()} ${msg}`);
}

// The room under `key`, made in `mode` if this is the join that makes it.
function roomFor(key: string, mode: GameModeId): Room {
  const pending = emptyTimers.get(key);
  if (pending) {
    clearTimeout(pending);
    emptyTimers.delete(key);
  }
  let room = rooms.get(key);
  if (!room) {
    // Seeded by the key (the Modal session id in production): the same session always gets the
    // same cube layout and spawns, even if Node rebuilt the room after an empty spell.
    ended.delete(key);
    room = new Room(key, {
      mode,
      seed: hashSeed(key),
      log,
      spawnBot,
      onEnd: (reason) => {
        rooms.delete(key);
        ended.set(key, reason);
        log(`room ${key} ended: ${reason}`);
      },
      onEmpty: () => {
        emptyTimers.set(
          key,
          setTimeout(() => {
            rooms.get(key)?.stop();
            rooms.delete(key);
            emptyTimers.delete(key);
            log(`room ${key} closed`);
          }, EMPTY_ROOM_GRACE_MS),
        );
      },
    });
    room.start();
    rooms.set(key, room);
    log(`room ${key} opened`);
  }
  return room;
}

function roomKey(req: IncomingMessage, url: URL): string {
  const session = req.headers[SESSION_HEADER];
  if (typeof session === 'string' && session) return session;
  return url.searchParams.get('room') || 'local';
}

// The game a join says its room is in (?game=): what the room's creator picked, which the lobby
// keeps with the room and hands every join, so whichever makes the Room makes it in that mode. A
// bare server takes the creator's own word. The global room is freeplay whatever is said.
function gameOf(url: URL): GameModeId {
  const game = url.searchParams.get('game');
  return isGameModeId(game) && url.searchParams.get('room') !== GLOBAL_ROOM ? game : FREEPLAY;
}

// Whether a join came through the lobby, which has checked it against the room's session and says
// what it knows of the room. A bare server (local dev) has no lobby and works those out itself.
function lobbied(req: IncomingMessage): boolean {
  return !!req.headers[SESSION_HEADER];
}

// Why a join is turned away, or null: its room ended itself, or its mode (?mode=create or join;
// none is either) doesn't fit. Behind Modal the lobby has already checked the mode against the
// room's session; a bare server keeps rooms by code, so it checks here. The global room is always
// there to join, whether or not anyone is in it, and so never anyone's to create. Any other room is
// there while it's in `rooms`, its empty spell included, as a session is, and one that ended is
// gone: its code can be created again.
function refusal(req: IncomingMessage, url: URL, key: string): string | null {
  const mode = url.searchParams.get('mode');
  const over = ended.get(key);
  if (lobbied(req)) return over ?? null;
  const exists = key === GLOBAL_ROOM || rooms.has(key);
  if (mode === 'create' && exists) return `room ${key} already exists`;
  if (mode === 'join' && !exists) return over ?? `room ${key} doesn't exist`;
  return mode === 'create' ? null : (over ?? null);
}

// Whether a join made its room: the lobby's word (?made=1, on the join whose request started the
// room's session), or on a bare server a create, which is only let in to a room that wasn't there.
function made(req: IncomingMessage, url: URL): boolean {
  return lobbied(req) ? url.searchParams.get('made') === '1' : url.searchParams.get('mode') === 'create';
}

function linkFor(ws: WebSocket): ClientLink {
  const raw = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const close = (reason: string) => ws.close(1000, reason);
  if (SIM_LATENCY_MS <= 0 && SIM_JITTER_MS <= 0) return { send: raw, close };
  return {
    send: (msg) => setTimeout(() => raw(msg), SIM_LATENCY_MS + Math.random() * SIM_JITTER_MS),
    close,
  };
}

const serveStatic = STATIC_DIR
  ? createStaticHandler(STATIC_DIR, { 'world-lobby': process.env.LOBBY_URL, 'world-home': process.env.HOME_URL })
  : null;

const http = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (serveStatic) {
    serveStatic(req, res);
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true });

http.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const key = roomKey(req, url);
  wss.handleUpgrade(req, socket, head, (ws) => {
    const refused = refusal(req, url, key);
    if (refused) {
      ws.close(1008, refused);
      return;
    }
    const room = roomFor(key, gameOf(url));
    // ?bot=1 is the bot framework declaring itself; the browser client never sends it. A bot may
    // also say where it stands (?x=&y=&z=); anyone may say how they look (?avatar= or ?color=).
    const id = room.join(url.searchParams.get('name') ?? '', linkFor(ws), {
      bot: url.searchParams.get('bot') === '1',
      room: url.searchParams.get('room') ?? undefined,
      color: url.searchParams.get('color') ?? undefined,
      made: made(req, url),
      ...placementFromQuery((key) => url.searchParams.get(key)),
    });
    if (!id) {
      ws.close(1008, 'join refused'); // the room already sent the reason
      return;
    }
    let alive = true;
    ws.on('pong', () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15_000);
    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      room.receive(id, parsed);
    });
    ws.on('close', () => {
      clearInterval(heartbeat);
      room.leave(id);
    });
    ws.on('error', (err) => log(`socket error for ${id}: ${err.message}`));
  });
});

http.listen(PORT, '0.0.0.0', () => {
  log(
    `room server listening on :${PORT}` +
      (STATIC_DIR ? ` serving ${STATIC_DIR}` : '') +
      (SIM_LATENCY_MS ? ` (simulated latency ${SIM_LATENCY_MS}+${SIM_JITTER_MS}ms)` : ''),
  );
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    for (const room of rooms.values()) room.stop();
    wss.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
