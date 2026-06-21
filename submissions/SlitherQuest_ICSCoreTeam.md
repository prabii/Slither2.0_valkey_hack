# Slither Quest

---

## Attendee/Team Details

**Team Name:** ICS Core Team
**Name:** Prabhas Satti
**GitHub Username:** prabii
**LinkedIn Profile:** https://www.linkedin.com/in/prabii
**GitHub Project Repository:** https://github.com/prabii/slither-quest-game

---

## Problem Statement Selected

Custom — Real-time multiplayer game powered by Valkey and Breeth AI

---

## Project Description

Slither Quest is a real-time browser-based multiplayer snake game (Slither.io-style) built for the Build Beyond Limits 2.0 Hackathon, powered by **Valkey** and **Breeth AI**.

- **What it does:** Players control a growing snake on a shared 4000×4000 canvas. Eat pellets, grow longer, avoid other snakes. Boost burns your length but drops pellets for others. The last snake alive wins.
- **Who it's for:** Anyone who wants to play a real-time multiplayer game in the browser — no install needed.
- **Problem solved:** Demonstrates how Valkey (Redis-protocol) can serve as a low-latency distributed state store and pub/sub event bus, and how Breeth AI can give a stateless web game persistent, personalised memory across sessions.
- **How it helps:** Players get a personalised greeting on join ("Run #3 — best was length 45, last killed by Bob") and every death is stored so the AI recalls it next session.

---

## Approach

- **Server-authoritative 25Hz game loop**: browser sends only `{dir, boost}`, server owns all positions, growth, and collision. Prevents cheating, keeps all players in sync.
- **Multi-room system**: Each room has an isolated game world, a 4-char code (e.g. `XK92`), an optional password. Rooms auto-delete 30s after the last player leaves.
- **PIN-based login**: 4-digit PIN stored SHA-256 hashed in Valkey (`game:users` hash). First use = register, return use = verify. Tied to Breeth AI memory so history follows you.
- **Valkey**: Sorted-set leaderboard, player name hash, TTL world snapshot, pub/sub killfeed — all namespaced per room. Updated every 2s to avoid per-tick round trips to the remote Aiven instance.
- **Breeth AI**: On join → `POST /v1/search` recalls player history → personalised greeting. On death → `POST /v1/episodes` stores run for future recall. Full in-memory fallback if no key.

---

## Tech Stack and Tools Used

**Frontend:** React 18, Vite, HTML5 Canvas (no game engine)
**Backend:** Node.js, Express, `ws` WebSocket
**Database:** Valkey (Aiven cloud) via `ioredis` — sorted set, hash, pub/sub, TTL string
**AI Tools/API:** Breeth AI — `POST /v1/episodes` (write memory), `POST /v1/search` (recall memory)
**Cloud/Deployment:** Aiven (Valkey cloud), localtunnel / ngrok for public tunnel hosting
**Other Tools:** SHA-256 PIN hashing via Node.js built-in `crypto`

---

## Key Features

1. **Multi-room system** — create rooms with 4-char codes, optional password, isolated game worlds
2. **PIN-based login** — 4-digit PIN protects your name and ties to Breeth AI memory across sessions
3. **Server-authoritative 25Hz game loop** — all physics and collision run on the server
4. **Valkey leaderboard + killfeed** — sorted-set leaderboard per room, pub/sub kill events broadcast to room
5. **Breeth AI player memory** — personalised greeting on join; death stored as episode for future recall
6. **Boost mechanic** — burns snake length, drops pellets, creates strategic trade-offs
7. **WASD + arrow keys + mouse** — full keyboard steering with diagonal support
8. **Room code badge** — shown in-game HUD, click to copy and share with friends
9. **One-URL hosting** — Express serves built client; shareable via localtunnel/ngrok
10. **30/30 automated flight-test suite** — `node server/flight-test.js`

---

## What is Working?

- Full real-time multiplayer (tested with multiple simultaneous players)
- Multi-room: create room (get shareable 4-char code), join room (enter code + PIN)
- PIN auth: register on first use, verify on return — SHA-256 hashed and stored in Valkey
- Snake movement, growth, boost, death/respawn cycle
- Server-side collision detection (head vs body, wall boundary)
- Valkey: PING, per-room world snapshot (EX 5), leaderboard sorted set, names hash, pub/sub killfeed — all verified
- Breeth AI: episodes write and search recall — verified; in-game greeting banner shown on join
- HUD: leaderboard (top-right), room code badge (top-left), killfeed (bottom-left), score bar (bottom-center), mini-map (bottom-right)
- Death screen with 3-second cooldown and respawn
- Flight test: **30/30 passing**

---

## What is Still in Progress?

- Mobile touch controls
- Spectator mode using Valkey world snapshots
- Skin/colour customisation persisted via Breeth AI
- Persistent score history across server restarts
- Room browser (list all active rooms)

---

## Screenshots or Demo

**Deployed Link:** Run locally — see README in project repo
**Demo Video Link:** —
**Screenshots:** —

---

## Challenges Faced

- **Valkey remote latency:** Updating every tick caused lag. Fixed by batching writes every 2 seconds and caching leaderboard in memory between syncs.
- **Windows filesystem bug:** Upstream repo has `SECURITY.md ` (trailing space) — Windows cannot check it out. Resolved using `git commit-tree` to link branch histories without touching the working directory.
- **Multi-room game loop:** Moved from a single `setInterval` to a master loop that ticks all active rooms. Rooms with zero clients are skipped entirely.
- **Breeth cold-start:** First search on a new name returns no edges. Handled gracefully — no greeting shown on first run, no crash or fallback error.

---

## Learnings

- Valkey pub/sub requires a **separate ioredis connection** for the subscriber — using the same connection blocks the event loop.
- Breeth stores knowledge as a graph of entities and edges — framing memories as natural-language sentences lets the search extract structured facts automatically.
- Server-authoritative game loops are simpler than expected: one `setInterval`, broadcast the result, trust nothing from the client.
- `git commit-tree` can create merge commits without touching the working directory — very useful for cross-platform filename issues.

---

## Future Improvements

- Deploy to a cloud VM for persistent public access
- Breeth-powered seasonal events and win-streak messages
- Valkey streams instead of pub/sub for a persistent, replayable kill log
- Leaderboard history across server restarts (persist player scores permanently)

---

## Final Note

Built end-to-end as a working prototype — server, client, Valkey integration, Breeth AI memory, multi-room system, PIN-based login, and a 30-check automated flight test suite. Everything runs with two commands. Both Valkey and Breeth have graceful in-memory fallbacks so the game is always playable even without credentials.

```bash
cd client && npm install && npm run build
cd server && npm install && npm run dev
```
