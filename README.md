# Slither Quest — Multiplayer Snake Game

A Slither.io-style multiplayer game built with React + Canvas, Node.js + WebSocket, Valkey (Redis), and Breeth AI for player memory.

## Architecture

```
Browser ──input {dir, boost}──► Node.js game loop (25 Hz)
         ◄──snapshot (world)──
                │
                ├── Valkey (ioredis): leaderboard, pub/sub, world snapshot
                └── Breeth AI: per-player memory (join greeting / death log)
```

- **Server-authoritative**: client sends only mouse direction + boost flag; server owns all positions, growth, and collision.
- **25 ticks/sec** game loop; Valkey updated ~2×/sec to avoid remote round-trip costs.
- **Pub/sub killfeed**: deaths published to `game:events`, subscriber relays to all WebSocket clients.

## Run Steps

### 1. Server

```bash
cd server
npm install
cp .env.example .env      # edit VALKEY_URL and optionally BREETH_API_KEY
npm run dev
```

### 2. Client

```bash
cd client
npm install
# Optional: edit .env if server is not on localhost:3001
npm run dev
```

Open **http://localhost:5173** in your browser.

## Environment Variables

### server/.env

| Variable | Description |
|---|---|
| `PORT` | WebSocket/HTTP port (default `3001`) |
| `VALKEY_URL` | `rediss://user:pass@host:port` — Aiven or local Redis |
| `BREETH_API_KEY` | `ck_live_…` — optional; game runs with in-memory fallback |

### client/.env

| Variable | Description |
|---|---|
| `VITE_WS_URL` | WebSocket URL (default `ws://localhost:3001`) |

## Valkey Data Model

| Key | Type | Usage |
|---|---|---|
| `game:leaderboard` | Sorted Set | `ZADD score playerId`, read with `ZREVRANGE 0 9 WITHSCORES` |
| `game:names` | Hash | `HSET playerId name` |
| `game:world` | String | JSON snapshot, `EX 5` TTL |
| `game:events` | Pub/Sub | join / death events |

## Breeth AI

On **join**: `POST /v1/search` with player name → personalized greeting showing best length and last killer.
On **death**: `POST /v1/episodes` stores the run narrative for future recall.
Falls back to in-memory store automatically when `BREETH_API_KEY` is not set.

## Controls

| Action | Control |
|---|---|
| Steer | Mouse movement |
| Boost | Hold left-click or Space |
| Respawn | Click RESPAWN button (3 s cooldown) |

## Game Mechanics

- World is **4000×4000** with a grid background; camera follows your snake head.
- Eating pellets grows your snake and increases score.
- Boosting increases speed but burns length and drops pellets.
- Colliding **head-first into another snake's body** kills you.
- Hitting the **world border** kills you.
- Dead snakes explode into pellets.
