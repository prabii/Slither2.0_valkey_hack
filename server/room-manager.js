'use strict';

const { GameEngine } = require('./game');
const WebSocket = require('ws');

const ROOM_CLEANUP_MS = 30_000; // delete room 30s after last player leaves
const MAX_ROOMS = 50;

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1 confusion
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Room ────────────────────────────────────────────────────────────────────

class Room {
  constructor(code, roomPassword) {
    this.code        = code;
    this.password    = roomPassword || null;
    this.game        = new GameEngine();
    this.clients     = new Map();  // clientId → ws
    this.players     = new Map();  // clientId → { name }
    this.leaderboard = [];
    this.lastPersist = 0;
    this.createdAt   = Date.now();
    this._cleanupTimer = null;
  }

  addClient(clientId, ws) {
    this.clients.set(clientId, ws);
    clearTimeout(this._cleanupTimer);
    this._cleanupTimer = null;
  }

  removeClient(clientId, onEmpty) {
    this.clients.delete(clientId);
    this.players.delete(clientId);
    this.game.removeSnake(clientId);
    if (this.clients.size === 0) {
      this._cleanupTimer = setTimeout(() => onEmpty(this.code), ROOM_CLEANUP_MS);
    }
  }

  send(clientId, obj) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  broadcastAll(obj) {
    const msg = JSON.stringify(obj);
    for (const ws of this.clients.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }
}

// ─── RoomManager ─────────────────────────────────────────────────────────────

class RoomManager {
  constructor() {
    this.rooms = new Map(); // code → Room
  }

  create(roomPassword) {
    if (this.rooms.size >= MAX_ROOMS) throw new Error('Server is full — too many rooms');
    let code, tries = 0;
    do {
      code = genCode();
      if (++tries > 200) throw new Error('Cannot generate unique room code');
    } while (this.rooms.has(code));

    const room = new Room(code, roomPassword);
    this.rooms.set(code, room);
    console.log(`[Room] ${code} created. Active: ${this.rooms.size}`);
    return room;
  }

  get(code) {
    return this.rooms.get((code || '').toUpperCase().trim()) || null;
  }

  delete(code) {
    this.rooms.delete(code);
    console.log(`[Room] ${code} deleted (empty). Active: ${this.rooms.size}`);
  }

  list() {
    return Array.from(this.rooms.values()).map(r => ({
      code: r.code,
      players: r.clients.size,
      passwordRequired: !!r.password,
      createdAt: r.createdAt,
    }));
  }
}

module.exports = { RoomManager };
