import { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas.jsx';
import HUD from './components/HUD.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import DeathScreen from './components/DeathScreen.jsx';

// Auto-detect WS URL so one build works behind any tunnel
const WS_URL = import.meta.env.VITE_WS_URL ||
  (typeof window !== 'undefined'
    ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host
    : 'ws://localhost:3001');

export default function App() {
  const wsRef = useRef(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase]           = useState('lobby'); // lobby | playing | dead
  const [playerId, setPlayerId]     = useState(null);
  const [roomCode, setRoomCode]     = useState(null);
  const [greeting, setGreeting]     = useState(null);
  const [lobbyError, setLobbyError] = useState(null);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [createdCode, setCreatedCode]   = useState(null); // shown after room creation
  const [snapshot, setSnapshot]     = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [killfeed, setKillfeed]     = useState([]);
  const [deathInfo, setDeathInfo]   = useState(null);

  // Pending callbacks for async WS responses (check_room)
  const pendingRef = useRef({});

  // Keep refs in sync for use inside closures
  const playerIdRef = useRef(null);
  const phaseRef    = useRef('lobby');
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── WebSocket lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    let ws;
    let reconnectTimer;

    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => console.log('[WS] connected');

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        // ── Lobby responses ──
        if (msg.type === 'name_status') {
          pendingRef.current.nameStatus?.(msg);
          return;
        }
        if (msg.type === 'room_info') {
          pendingRef.current.roomInfo?.(msg);
          return;
        }

        // ── Room created ──
        if (msg.type === 'room_created') {
          setLobbyLoading(false);
          setCreatedCode(msg.roomCode);
          // Short delay so player sees the code before game starts
          setTimeout(() => {
            setPlayerId(msg.id);
            playerIdRef.current = msg.id;
            setRoomCode(msg.roomCode);
            setGreeting(msg.greeting);
            setLobbyError(null);
            setPhase('playing');
            phaseRef.current = 'playing';
          }, 2000);
          return;
        }

        // ── Joined existing room ──
        if (msg.type === 'joined') {
          setLobbyLoading(false);
          setPlayerId(msg.id);
          playerIdRef.current = msg.id;
          setRoomCode(msg.roomCode);
          setGreeting(msg.greeting);
          setLobbyError(null);
          setCreatedCode(null);
          setPhase('playing');
          phaseRef.current = 'playing';
          return;
        }

        // ── Error ──
        if (msg.type === 'error') {
          setLobbyLoading(false);
          setLobbyError(msg.message || 'Something went wrong.');
          return;
        }

        // ── In-game messages ──
        if (msg.type === 'snapshot') {
          setSnapshot(msg.data);
          if (msg.leaderboard?.length > 0) setLeaderboard(msg.leaderboard);
          return;
        }
        if (msg.type === 'death') {
          setDeathInfo(msg.data);
          setPhase('dead');
          phaseRef.current = 'dead';
          return;
        }
        if (msg.type === 'respawned') {
          setDeathInfo(null);
          setPhase('playing');
          phaseRef.current = 'playing';
          return;
        }
        if (msg.type === 'killfeed') {
          setKillfeed(prev => [{ ...msg.data, key: Date.now() + Math.random() }, ...prev].slice(0, 6));
          return;
        }
      };

      ws.onclose = () => {
        console.log('[WS] disconnected — reconnecting…');
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, []);

  // ── WS send helper ─────────────────────────────────────────────────────────

  const wsSend = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  // ── Lobby actions ──────────────────────────────────────────────────────────

  const handleCreate = useCallback((name, pin, roomPassword) => {
    setLobbyError(null);
    setLobbyLoading(true);
    wsSend({ type: 'create_room', name, pin, roomPassword });
  }, [wsSend]);

  const handleJoin = useCallback((roomCode, name, pin, password) => {
    setLobbyError(null);
    setLobbyLoading(true);
    wsSend({ type: 'join_room', roomCode, name, pin, password });
  }, [wsSend]);

  const handleCheckRoom = useCallback((code) => {
    return new Promise((resolve) => {
      pendingRef.current.roomInfo = resolve;
      wsSend({ type: 'check_room', roomCode: code });
      // Timeout fallback
      setTimeout(() => {
        if (pendingRef.current.roomInfo === resolve) {
          pendingRef.current.roomInfo = null;
          resolve({ exists: false, passwordRequired: false });
        }
      }, 3000);
    });
  }, [wsSend]);

  // ── In-game actions ────────────────────────────────────────────────────────

  const handleInput = useCallback((dir, boost) => {
    wsSend({ type: 'input', dir, boost });
  }, [wsSend]);

  const handleRespawn = useCallback(() => {
    wsSend({ type: 'respawn' });
  }, [wsSend]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {phase === 'lobby' && (
        <LobbyScreen
          onCreate={handleCreate}
          onJoin={handleJoin}
          onCheckRoom={handleCheckRoom}
          error={lobbyError}
          loading={lobbyLoading}
          createdCode={createdCode}
        />
      )}

      {(phase === 'playing' || phase === 'dead') && (
        <>
          <GameCanvas
            snapshot={snapshot}
            playerId={playerId}
            onInput={handleInput}
            active={phase === 'playing'}
          />
          <HUD
            leaderboard={leaderboard}
            killfeed={killfeed}
            snapshot={snapshot}
            playerId={playerId}
            roomCode={roomCode}
            greeting={greeting}
            onGreetingDismiss={() => setGreeting(null)}
          />
          {phase === 'dead' && (
            <DeathScreen info={deathInfo} onRespawn={handleRespawn} />
          )}
        </>
      )}
    </div>
  );
}
