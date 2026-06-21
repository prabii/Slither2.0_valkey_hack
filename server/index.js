'use strict';

require('dotenv').config();

const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const crypto   = require('crypto');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const { RoomManager } = require('./room-manager');
const { BreethClient } = require('./breeth');

const PORT    = parseInt(process.env.PORT || '3001', 10);
const TICK_MS = 1000 / 25; // 25 Hz

const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex');

// ─── Express ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use((_, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, perMessageDeflate: true });

// ─── Valkey ──────────────────────────────────────────────────────────────────

let valkey = null, valkeyPub = null, valkeySub = null;
const VALKEY_URL = process.env.VALKEY_URL;

if (VALKEY_URL) {
  const Redis = require('ioredis');
  const mkClient = () => new Redis(VALKEY_URL, {
    tls: VALKEY_URL.startsWith('rediss://') ? {} : undefined,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: (t) => t > 3 ? null : t * 500,
  });
  valkey    = mkClient();
  valkeyPub = mkClient();
  valkeySub = mkClient();

  valkey.on('error',    e => console.warn('[Valkey] main:', e.message));
  valkeyPub.on('error', e => console.warn('[Valkey] pub:', e.message));
  valkeySub.on('error', e => console.warn('[Valkey] sub:', e.message));

  valkeySub.subscribe('game:events', err => {
    if (err) console.warn('[Valkey] subscribe error:', err.message);
  });
  // Relay pub/sub kill events to the right room
  valkeySub.on('message', (_ch, raw) => {
    try {
      const event = JSON.parse(raw);
      if (event.roomCode) {
        const room = roomManager.get(event.roomCode);
        if (room) room.broadcastAll({ type: 'killfeed', data: event });
      }
    } catch (_) {}
  });
  console.log('[Valkey] connecting…');
} else {
  console.warn('[Valkey] VALKEY_URL not set — running without persistence');
}

// ─── PIN / user store ─────────────────────────────────────────────────────────
// Valkey hash:  game:users  →  { lowerName: hashedPin }
// In-memory fallback when Valkey unavailable
const localUsers = new Map();  // lowerName → hashedPin

async function getStoredPin(name) {
  const key = name.toLowerCase();
  if (valkey) {
    try { return await valkey.hget('game:users', key); } catch (_) {}
  }
  return localUsers.get(key) || null;
}

async function savePin(name, pin) {
  const key = name.toLowerCase();
  const h   = hashPin(pin);
  localUsers.set(key, h);
  if (valkey) {
    try { await valkey.hset('game:users', key, h); } catch (_) {}
  }
  return h;
}

// ─── Room manager ─────────────────────────────────────────────────────────────

const roomManager = new RoomManager();
const breeth      = new BreethClient(process.env.BREETH_API_KEY);

// clientId → roomCode (global lookup so we can clean up on disconnect)
const clientRoom = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeLeaderboard(snapshot) {
  return snapshot.snakes.slice().sort((a, b) => b.score - a.score).slice(0, 10)
    .map(s => ({ id: s.id, name: s.name, score: s.score }));
}

async function persistRoom(room, snapshot) {
  if (!valkey) return;
  try {
    const pipe = valkey.pipeline();
    for (const s of snapshot.snakes) {
      pipe.zadd(`game:${room.code}:leaderboard`, s.score, s.id);
      pipe.hset(`game:${room.code}:names`, s.id, s.name);
    }
    pipe.set(`game:${room.code}:world`, JSON.stringify(snapshot), 'EX', 5);
    await pipe.exec();

    const raw = await valkey.zrevrange(`game:${room.code}:leaderboard`, 0, 9, 'WITHSCORES');
    const lb  = [];
    for (let i = 0; i < raw.length; i += 2) {
      const id   = raw[i];
      const score = parseInt(raw[i + 1], 10);
      const name  = await valkey.hget(`game:${room.code}:names`, id);
      lb.push({ id, name: name || 'Unknown', score });
    }
    room.leaderboard = lb;
  } catch (err) {
    console.warn(`[Valkey] persist room ${room.code}:`, err.message);
  }
}

async function handleRoomDeath(room, event) {
  room.send(event.victimId, { type: 'death', data: event });

  if (valkeyPub) {
    valkeyPub.publish('game:events', JSON.stringify({ ...event, roomCode: room.code }))
      .catch(() => room.broadcastAll({ type: 'killfeed', data: event }));
  } else {
    room.broadcastAll({ type: 'killfeed', data: event });
  }

  const player = room.players.get(event.victimId);
  if (player) breeth.rememberDeath(player.name, event.length, event.killerName).catch(() => {});
}

// ─── Master game loop — ticks all active rooms ────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const room of roomManager.rooms.values()) {
    if (room.clients.size === 0) continue;

    const events   = room.game.tick();
    const snapshot = room.game.getSnapshot();

    for (const ev of events) {
      if (ev.type === 'death') handleRoomDeath(room, ev).catch(() => {});
    }

    if (now - room.lastPersist >= 2000) {
      room.lastPersist = now;
      if (valkey) persistRoom(room, snapshot).catch(() => {});
      else room.leaderboard = computeLeaderboard(snapshot);
    }

    room.broadcastAll({ type: 'snapshot', data: snapshot, leaderboard: room.leaderboard });
  }
}, TICK_MS);

// ─── WebSocket ───────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  const clientId = uuidv4();

  const send = (obj) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── check_name ──────────────────────────────────────────────────────────
    if (msg.type === 'check_name') {
      const name = String(msg.name || '').trim();
      if (!name) return;
      const stored = await getStoredPin(name);
      send({ type: 'name_status', isNew: !stored });
      return;
    }

    // ── check_room ──────────────────────────────────────────────────────────
    if (msg.type === 'check_room') {
      const room = roomManager.get(msg.roomCode);
      send({ type: 'room_info', exists: !!room, passwordRequired: room ? !!room.password : false });
      return;
    }

    // ── create_room ──────────────────────────────────────────────────────────
    if (msg.type === 'create_room') {
      const name     = String(msg.name || '').trim().slice(0, 20) || 'Anonymous';
      const pin      = String(msg.pin  || '').trim();
      const roomPass = String(msg.roomPassword || '').trim() || null;

      if (!pin || pin.length < 4) { send({ type: 'error', code: 'pin_required', message: 'PIN must be 4 digits.' }); return; }

      // Authenticate / register PIN
      const stored = await getStoredPin(name);
      if (stored) {
        if (stored !== hashPin(pin)) { send({ type: 'error', code: 'wrong_pin', message: 'Wrong PIN for this name.' }); return; }
      } else {
        await savePin(name, pin);
      }

      let room;
      try { room = roomManager.create(roomPass); }
      catch (err) { send({ type: 'error', code: 'server_full', message: err.message }); return; }

      room.addClient(clientId, ws);
      room.players.set(clientId, { name });
      room.game.addSnake(clientId, name);
      clientRoom.set(clientId, room.code);

      let greeting = null;
      try { greeting = await breeth.recallPlayer(name); } catch (_) {}
      if (valkey) valkey.hset('game:users:display', name.toLowerCase(), name).catch(() => {});

      send({ type: 'room_created', roomCode: room.code, id: clientId, greeting, passwordRequired: !!roomPass });
      return;
    }

    // ── join_room ────────────────────────────────────────────────────────────
    if (msg.type === 'join_room') {
      const roomCode = String(msg.roomCode || '').toUpperCase().trim();
      const name     = String(msg.name || '').trim().slice(0, 20) || 'Anonymous';
      const pin      = String(msg.pin  || '').trim();
      const password = String(msg.password || '').trim();

      if (!pin || pin.length < 4) { send({ type: 'error', code: 'pin_required', message: 'PIN must be 4 digits.' }); return; }

      const room = roomManager.get(roomCode);
      if (!room) { send({ type: 'error', code: 'room_not_found', message: `Room "${roomCode}" does not exist.` }); return; }

      if (room.password && password !== room.password) {
        send({ type: 'error', code: 'wrong_password', message: 'Wrong room password.' }); return;
      }

      // Authenticate / register PIN
      const stored = await getStoredPin(name);
      if (stored) {
        if (stored !== hashPin(pin)) { send({ type: 'error', code: 'wrong_pin', message: 'Wrong PIN for this name.' }); return; }
      } else {
        await savePin(name, pin);
      }

      room.addClient(clientId, ws);
      room.players.set(clientId, { name });
      room.game.addSnake(clientId, name);
      clientRoom.set(clientId, room.code);

      let greeting = null;
      try { greeting = await breeth.recallPlayer(name); } catch (_) {}
      if (valkey) valkey.hset('game:users:display', name.toLowerCase(), name).catch(() => {});

      send({ type: 'joined', id: clientId, roomCode: room.code, greeting });
      return;
    }

    // ── input ────────────────────────────────────────────────────────────────
    if (msg.type === 'input') {
      const room = roomManager.get(clientRoom.get(clientId));
      if (room) room.game.setInput(clientId, { dir: msg.dir || 0, boost: !!msg.boost });
      return;
    }

    // ── respawn ──────────────────────────────────────────────────────────────
    if (msg.type === 'respawn') {
      const room = roomManager.get(clientRoom.get(clientId));
      if (room) {
        const player = room.players.get(clientId);
        if (player) {
          room.game.addSnake(clientId, player.name);
          send({ type: 'respawned', id: clientId });
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    const code = clientRoom.get(clientId);
    if (code) {
      const room = roomManager.get(code);
      if (room) room.removeClient(clientId, (c) => roomManager.delete(c));
      clientRoom.delete(clientId);
    }
  });

  ws.on('error', () => ws.close());
});

// ─── REST ─────────────────────────────────────────────────────────────────────

app.get('/api/rooms', (_req, res) => res.json(roomManager.list()));

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  rooms: roomManager.rooms.size,
  totalPlayers: [...roomManager.rooms.values()].reduce((n, r) => n + r.clients.size, 0),
  valkey: !!valkey,
  breeth: breeth.enabled,
}));

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`[Server] ws://localhost:${PORT}`);
  console.log(`[Valkey] ${VALKEY_URL ? 'connected' : 'disabled'}`);
  console.log(`[Breeth] ${breeth.enabled ? 'enabled' : 'fallback'}`);
});
