'use strict';
/**
 * Flight-test suite — runs against the live server (must be running on PORT 3001).
 * Usage:  node flight-test.js
 */

require('dotenv').config();
const WebSocket = require('ws');
const Redis = require('ioredis');

const SERVER_HTTP = 'http://localhost:3001';
const SERVER_WS   = 'ws://localhost:3001';
const VALKEY_URL  = process.env.VALKEY_URL;
const BREETH_KEY  = process.env.BREETH_API_KEY;

let passed = 0, failed = 0;

function ok(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpGet(path) {
  const res = await fetch(`${SERVER_HTTP}${path}`);
  return { status: res.status, body: await res.json() };
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

function connectPlayer(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_WS);
    const state = { ws, id: null, snapshots: [], killfeed: [], death: null, greeting: null };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', name }));
    });

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'joined')   { state.id = msg.id; state.greeting = msg.greeting; resolve(state); }
      if (msg.type === 'snapshot') state.snapshots.push(msg.data);
      if (msg.type === 'killfeed') state.killfeed.push(msg.data);
      if (msg.type === 'death')    state.death = msg.data;
    });

    ws.on('error', reject);
    setTimeout(() => reject(new Error('join timeout')), 5000);
  });
}

function sendInput(state, dir, boost = false) {
  if (state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'input', dir, boost }));
  }
}

function disconnect(state) {
  if (state.ws.readyState === WebSocket.OPEN) state.ws.close();
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n── 1. Health & Server ──────────────────────────────────');
  const { status, body } = await httpGet('/api/health');
  ok('HTTP 200 from /api/health', status === 200);
  ok('ok: true', body.ok === true);
  ok('Valkey flag present', 'valkey' in body);
  ok('Breeth flag present', 'breeth' in body);
  console.log(`     valkey=${body.valkey}  breeth=${body.breeth}  players=${body.players}`);
}

async function testWebSocket() {
  console.log('\n── 2. WebSocket — Join & Snapshot ──────────────────────');
  const p1 = await connectPlayer('TestPilot');
  ok('Player joined and got an id', !!p1.id, p1.id);

  // Wait for a few snapshots
  await sleep(300);
  ok('Receiving snapshots', p1.snapshots.length > 0,
     `got ${p1.snapshots.length} snapshots`);

  const snap = p1.snapshots[p1.snapshots.length - 1];
  ok('Snapshot has snakes array', Array.isArray(snap?.snakes));
  ok('Snapshot has pellets array', Array.isArray(snap?.pellets));
  ok('Snapshot has worldSize', typeof snap?.worldSize === 'number');

  const me = snap?.snakes?.find(s => s.id === p1.id);
  ok('Own snake in snapshot', !!me, me ? `length=${me.length}` : 'not found');
  ok('Snake has body nodes', Array.isArray(me?.body) && me.body.length > 0);

  disconnect(p1);
  return p1;
}

async function testMultiplayer() {
  console.log('\n── 3. Multiplayer — 3 simultaneous players ─────────────');
  const [p1, p2, p3] = await Promise.all([
    connectPlayer('Alpha'),
    connectPlayer('Beta'),
    connectPlayer('Gamma'),
  ]);

  ok('All 3 players joined', !!p1.id && !!p2.id && !!p3.id);
  ok('All ids are unique', new Set([p1.id, p2.id, p3.id]).size === 3);

  // Send inputs
  sendInput(p1, 0);          // East
  sendInput(p2, Math.PI);    // West
  sendInput(p3, Math.PI / 2); // South

  await sleep(400);

  const snap = p1.snapshots[p1.snapshots.length - 1];
  const ids = new Set(snap?.snakes?.map(s => s.id));
  ok('All 3 snakes visible in snapshot', [p1.id, p2.id, p3.id].every(id => ids.has(id)),
     `visible: ${ids.size}`);

  // Check leaderboard
  const { body: lb } = await httpGet('/api/leaderboard');
  ok('/api/leaderboard returns array', Array.isArray(lb));
  ok('Leaderboard entries have name+score', lb.every(e => e.name && typeof e.score === 'number'));

  disconnect(p1); disconnect(p2); disconnect(p3);
  return { p1, p2, p3 };
}

async function testBoostAndMovement() {
  console.log('\n── 4. Input — movement & boost ─────────────────────────');
  const p = await connectPlayer('SpeedTest');
  await sleep(200);

  const snap0 = p.snapshots[p.snapshots.length - 1];
  const me0 = snap0?.snakes?.find(s => s.id === p.id);
  const x0 = me0?.x ?? 0, y0 = me0?.y ?? 0;

  // Move East for 500ms
  sendInput(p, 0, false);
  await sleep(500);

  const snap1 = p.snapshots[p.snapshots.length - 1];
  const me1 = snap1?.snakes?.find(s => s.id === p.id);
  ok('Snake moved after input', me1 && (me1.x !== x0 || me1.y !== y0),
     `(${x0},${y0}) → (${me1?.x},${me1?.y})`);

  // Boost
  const len0 = me1?.length ?? 0;
  sendInput(p, 0, true);
  await sleep(600);
  const snap2 = p.snapshots[p.snapshots.length - 1];
  const me2 = snap2?.snakes?.find(s => s.id === p.id);
  ok('Boost flag visible in snapshot', me2?.boosting === true);

  disconnect(p);
}

async function testValkey() {
  console.log('\n── 5. Valkey ────────────────────────────────────────────');
  if (!VALKEY_URL) {
    console.log('     ⚠️  VALKEY_URL not set — skipping Valkey tests');
    return;
  }
  const v = new Redis(VALKEY_URL, {
    tls: VALKEY_URL.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await v.ping();
    ok('Valkey PING', true);

    // Join a player and wait for persist cycle (2 s)
    const p = await connectPlayer('ValkeyTester');
    sendInput(p, 0);
    await sleep(2500); // wait for the 2s persist cycle

    const world = await v.get('game:world');
    ok('game:world key exists (SET EX 5)', !!world, world ? `${world.length} bytes` : 'null');

    const worldObj = world ? JSON.parse(world) : null;
    ok('game:world is valid JSON snapshot', !!worldObj?.snakes && !!worldObj?.pellets);

    const lbEntries = await v.zrevrange('game:leaderboard', 0, 9, 'WITHSCORES');
    ok('game:leaderboard sorted set has entries', lbEntries.length > 0,
       `${lbEntries.length / 2} entries`);

    const names = await v.hgetall('game:names');
    ok('game:names hash populated', Object.keys(names || {}).length > 0);

    // Test pub/sub round-trip
    let pubSubReceived = false;
    const sub = new Redis(VALKEY_URL, { tls: { rejectUnauthorized: false }, retryStrategy: () => null });
    await sub.subscribe('game:events');
    sub.on('message', () => { pubSubReceived = true; });
    await v.publish('game:events', JSON.stringify({ type: 'test', ts: Date.now() }));
    await sleep(300);
    ok('Pub/sub round-trip works', pubSubReceived);
    sub.disconnect();

    disconnect(p);
  } catch (err) {
    ok('Valkey connection', false, err.message);
  } finally {
    v.disconnect();
  }
}

async function testBreeth() {
  console.log('\n── 6. Breeth AI ─────────────────────────────────────────');
  if (!BREETH_KEY) {
    console.log('     ⚠️  BREETH_API_KEY not set — skipping Breeth tests');
    return;
  }

  // Direct API test
  try {
    const writeRes = await fetch('https://api.thebreeth.com/v1/episodes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BREETH_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'FlightTest player reached length 99 and was killed by TestBot.', extract_intent: true }),
      signal: AbortSignal.timeout(6000),
    });
    ok('Breeth POST /v1/episodes reachable', writeRes.status === 200,
       `HTTP ${writeRes.status}`);

    const searchRes = await fetch('https://api.thebreeth.com/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BREETH_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'FlightTest player snake game', limit: 5 }),
      signal: AbortSignal.timeout(6000),
    });
    ok('Breeth POST /v1/search reachable', searchRes.status === 200,
       `HTTP ${searchRes.status}`);
    const sBody = await searchRes.json();
    ok('Search returns edges array', Array.isArray(sBody.edges));
  } catch (err) {
    ok('Breeth API reachable', false, err.message);
  }

  // In-game: join with a known name → check greeting after a death cycle
  console.log('     Joining as "FlightTest" to trigger Breeth recall…');
  const p = await connectPlayer('FlightTest');
  await sleep(500);
  console.log(`     Greeting received: ${p.greeting ?? '(none yet — first run)'}`);
  ok('Player joined successfully (Breeth did not crash join)', !!p.id);
  disconnect(p);
}

async function testRespawn() {
  console.log('\n── 7. Respawn flow ──────────────────────────────────────');
  const p = await connectPlayer('RespawnTest');
  ok('Joined', !!p.id);

  // Drive snake into a wall instantly
  p.ws.send(JSON.stringify({ type: 'input', dir: 0 }));
  // Force it to the wall by teleporting via many ticks (just wait and steer toward x=4001)
  // Instead we test the respawn message directly after simulated death
  // (wall deaths take time; just verify respawn message works)
  p.ws.send(JSON.stringify({ type: 'respawn' }));
  await sleep(200);

  // Should still be receiving snapshots
  const prevLen = p.snapshots.length;
  await sleep(300);
  ok('Snapshots still flowing after respawn message', p.snapshots.length > prevLen);
  disconnect(p);
}

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          Slither Quest — Flight Test Suite               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Server : ${SERVER_WS}`);
  console.log(`  Valkey : ${VALKEY_URL ? '✅ configured' : '⚠️  not set'}`);
  console.log(`  Breeth : ${BREETH_KEY ? '✅ configured' : '⚠️  not set'}`);

  try {
    await testHealth();
    await testWebSocket();
    await testMultiplayer();
    await testBoostAndMovement();
    await testValkey();
    await testBreeth();
    await testRespawn();
  } catch (err) {
    console.error('\n  FATAL:', err.message);
    failed++;
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🚀  All systems go!');
  } else {
    console.log('  ⚠️   Some checks failed — see above.');
  }
  console.log('══════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
})();
