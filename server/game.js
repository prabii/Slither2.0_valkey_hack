'use strict';

const WORLD_SIZE = 4000;
const BASE_SPEED = 3;
const BOOST_SPEED = 5;
const SEGMENT_SPACING = 8;      // pixels between sampled body nodes
const HEAD_RADIUS = 10;
const SEGMENT_RADIUS = 8;
const PELLET_RADIUS = 5;
const MIN_LENGTH = 5;
const INITIAL_LENGTH = 20;
const MAX_PELLETS = 400;
const BOOST_DRAIN = 0.05;       // length lost per tick while boosting
const MAX_TURN_RATE = 0.08;     // radians per tick

let _nextPelletId = 1;

class GameEngine {
  constructor() {
    this.snakes = new Map();   // id -> snake
    this.pellets = new Map();  // id -> pellet
    this.tickCount = 0;

    for (let i = 0; i < MAX_PELLETS; i++) this._spawnPellet();
  }

  // ─── Pellets ────────────────────────────────────────────────────────────────

  _spawnPellet(x, y) {
    const id = _nextPelletId++;
    const pellet = {
      id,
      x: x !== undefined
        ? Math.max(10, Math.min(WORLD_SIZE - 10, x + (Math.random() - 0.5) * 40))
        : 10 + Math.random() * (WORLD_SIZE - 20),
      y: y !== undefined
        ? Math.max(10, Math.min(WORLD_SIZE - 10, y + (Math.random() - 0.5) * 40))
        : 10 + Math.random() * (WORLD_SIZE - 20),
      hue: Math.floor(Math.random() * 360),
    };
    this.pellets.set(id, pellet);
    return pellet;
  }

  // ─── Snakes ─────────────────────────────────────────────────────────────────

  addSnake(id, name) {
    const x = 300 + Math.random() * (WORLD_SIZE - 600);
    const y = 300 + Math.random() * (WORLD_SIZE - 600);
    const dir = Math.random() * Math.PI * 2;

    // Pre-fill path so body is visible immediately
    const path = [];
    const pathLen = (INITIAL_LENGTH + 5) * SEGMENT_SPACING;
    for (let i = 0; i < pathLen; i++) {
      path.push({ x: x - Math.cos(dir) * i, y: y - Math.sin(dir) * i });
    }

    const snake = {
      id, name,
      x, y, dir,
      path,
      length: INITIAL_LENGTH,
      score: 0,
      boosting: false,
      alive: true,
      color: `hsl(${Math.floor(Math.random() * 360)},80%,55%)`,
      input: { dir, boost: false },
    };

    this.snakes.set(id, snake);
    return snake;
  }

  removeSnake(id) {
    this.snakes.delete(id);
  }

  setInput(id, input) {
    const s = this.snakes.get(id);
    if (s && s.alive) s.input = input;
  }

  // ─── Body nodes ─────────────────────────────────────────────────────────────

  _getBodyNodes(snake) {
    const nodes = [];
    const count = Math.ceil(snake.length);
    for (let i = 0; i < count; i++) {
      const idx = i * SEGMENT_SPACING;
      if (idx < snake.path.length) nodes.push(snake.path[idx]);
    }
    return nodes;
  }

  // ─── Kill ───────────────────────────────────────────────────────────────────

  _killSnake(id, killerId, events) {
    const s = this.snakes.get(id);
    if (!s || !s.alive) return;
    s.alive = false;

    // Drop pellets along body
    const body = this._getBodyNodes(s);
    const step = Math.max(1, Math.floor(body.length / 40));
    for (let i = 0; i < body.length; i += step) {
      if (this.pellets.size < MAX_PELLETS * 2) this._spawnPellet(body[i].x, body[i].y);
    }

    const killer = killerId ? this.snakes.get(killerId) : null;
    events.push({
      type: 'death',
      victimId: id,
      victimName: s.name,
      killerId: killerId || null,
      killerName: killer ? killer.name : null,
      length: Math.floor(s.length),
      timestamp: Date.now(),
    });
  }

  // ─── Game tick ──────────────────────────────────────────────────────────────

  tick() {
    this.tickCount++;
    const events = [];
    const alive = [];

    // Move all snakes
    for (const [id, s] of this.snakes) {
      if (!s.alive) continue;
      alive.push(s);

      // Smooth turn
      let diff = s.input.dir - s.dir;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.dir += Math.max(-MAX_TURN_RATE, Math.min(MAX_TURN_RATE, diff));

      // Speed & boost
      const canBoost = s.input.boost && s.length > MIN_LENGTH + 1;
      s.boosting = canBoost;
      const speed = canBoost ? BOOST_SPEED : BASE_SPEED;

      s.x += Math.cos(s.dir) * speed;
      s.y += Math.sin(s.dir) * speed;
      s.path.unshift({ x: s.x, y: s.y });

      if (canBoost) {
        const prevFloor = Math.floor(s.length);
        s.length -= BOOST_DRAIN;
        if (Math.floor(s.length) < prevFloor) this._spawnPellet(s.x, s.y);
        if (s.length < MIN_LENGTH) s.length = MIN_LENGTH;
      }

      // Trim path to needed length
      const maxLen = Math.ceil(s.length) * SEGMENT_SPACING + SEGMENT_SPACING + 1;
      if (s.path.length > maxLen) s.path.length = maxLen;

      // Wall death
      if (s.x < 0 || s.x > WORLD_SIZE || s.y < 0 || s.y > WORLD_SIZE) {
        this._killSnake(id, null, events);
      }
    }

    // Pellet collisions
    for (const s of alive) {
      if (!s.alive) continue;
      for (const [pid, p] of this.pellets) {
        const dx = s.x - p.x, dy = s.y - p.y;
        if (dx * dx + dy * dy < (HEAD_RADIUS + PELLET_RADIUS) ** 2) {
          s.length += 1;
          s.score += 1;
          this.pellets.delete(pid);
          this._spawnPellet();
        }
      }
    }

    // Snake vs snake
    for (const s of alive) {
      if (!s.alive) continue;
      for (const other of alive) {
        if (!other.alive || s.id === other.id) continue;
        const body = this._getBodyNodes(other);
        for (let i = 0; i < body.length; i++) {
          const node = body[i];
          const dx = s.x - node.x, dy = s.y - node.y;
          // Head-to-head uses doubled radius; body uses combined radii
          const r = i === 0 ? HEAD_RADIUS * 1.8 : HEAD_RADIUS + SEGMENT_RADIUS;
          if (dx * dx + dy * dy < r * r) {
            this._killSnake(s.id, i === 0 ? null : other.id, events);
            break;
          }
        }
      }
    }

    // Replenish pellets
    while (this.pellets.size < MAX_PELLETS) this._spawnPellet();

    return events;
  }

  // ─── Snapshot ───────────────────────────────────────────────────────────────

  getSnapshot() {
    const snakes = [];
    for (const s of this.snakes.values()) {
      if (!s.alive) continue;
      snakes.push({
        id: s.id,
        name: s.name,
        x: Math.round(s.x),
        y: Math.round(s.y),
        dir: +s.dir.toFixed(3),
        length: Math.floor(s.length),
        score: s.score,
        boosting: s.boosting,
        color: s.color,
        // Compact body: array of [x, y] pairs
        body: this._getBodyNodes(s).map(p => [Math.round(p.x), Math.round(p.y)]),
      });
    }

    // Compact pellets: [id, x, y, hue]
    const pellets = [];
    for (const p of this.pellets.values()) {
      pellets.push([p.id, Math.round(p.x), Math.round(p.y), p.hue]);
    }

    return { t: this.tickCount, snakes, pellets, worldSize: WORLD_SIZE };
  }
}

module.exports = { GameEngine, WORLD_SIZE };
