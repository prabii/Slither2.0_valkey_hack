'use strict';

const BASE_URL = 'https://api.thebreeth.com/v1';

// ─── In-memory fallback store ────────────────────────────────────────────────

const memoryStore = new Map(); // playerName -> { bestLength, lastKiller, runCount }

function getLocal(name) {
  return memoryStore.get(name) || null;
}

function saveLocal(name, data) {
  memoryStore.set(name, { ...(memoryStore.get(name) || {}), ...data });
}

// ─── Breeth REST helpers ─────────────────────────────────────────────────────

async function breethPost(path, body, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Breeth ${path} → HTTP ${res.status}`);
  return res.json();
}

// ─── Public API ──────────────────────────────────────────────────────────────

class BreethClient {
  constructor(apiKey) {
    this.apiKey = apiKey || null;
    this.enabled = !!apiKey;
  }

  /**
   * Called on join. Returns greeting text (may be null).
   */
  async recallPlayer(name) {
    // Always update local memory first for fallback
    const local = getLocal(name);

    if (!this.enabled) {
      return local ? this._buildGreeting(name, local) : null;
    }

    try {
      const result = await breethPost(
        '/search',
        { query: `snake game player "${name}" history best length killer`, limit: 5 },
        this.apiKey,
      );

      const edges = result.edges || [];
      if (edges.length === 0) return null;

      // Parse out useful facts from edges
      let bestLength = null;
      let lastKiller = null;
      for (const edge of edges) {
        const fact = (edge.fact || '').toLowerCase();
        const m = fact.match(/length[^0-9]*(\d+)/);
        if (m) bestLength = Math.max(bestLength || 0, parseInt(m[1], 10));
        const k = fact.match(/killed by ([^,.]+)/i);
        if (k) lastKiller = k[1].trim();
      }

      // Merge with local
      const merged = {
        bestLength: bestLength || (local && local.bestLength),
        lastKiller: lastKiller || (local && local.lastKiller),
        runCount: local ? local.runCount : 0,
      };
      saveLocal(name, merged);
      return this._buildGreeting(name, merged);
    } catch (err) {
      console.warn(`[Breeth] recallPlayer failed (${err.message}), using local fallback`);
      return local ? this._buildGreeting(name, local) : null;
    }
  }

  /**
   * Called on death. Stores the run in Breeth.
   */
  async rememberDeath(name, length, killerName) {
    // Update local
    const prev = getLocal(name) || {};
    const updated = {
      bestLength: Math.max(prev.bestLength || 0, length),
      lastKiller: killerName || prev.lastKiller || null,
      runCount: (prev.runCount || 0) + 1,
    };
    saveLocal(name, updated);

    if (!this.enabled) return;

    const killerPart = killerName ? ` and was killed by ${killerName}` : ' and hit a wall';
    const content =
      `Snake game: player "${name}" completed a run reaching length ${length}${killerPart}. ` +
      `This is run #${updated.runCount}. Best length so far: ${updated.bestLength}.`;

    try {
      await breethPost('/episodes', { content, extract_intent: true }, this.apiKey);
    } catch (err) {
      console.warn(`[Breeth] rememberDeath failed (${err.message})`);
    }
  }

  _buildGreeting(name, data) {
    if (!data) return null;
    const parts = [];
    if (data.runCount > 1) parts.push(`Run #${data.runCount + 1} for ${name}!`);
    if (data.bestLength) parts.push(`Your best was length ${data.bestLength}.`);
    if (data.lastKiller) parts.push(`Last time you were eaten by ${data.lastKiller}.`);
    return parts.length > 0 ? parts.join(' ') : null;
  }
}

module.exports = { BreethClient };
