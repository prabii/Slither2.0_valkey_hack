import { useEffect, useRef, useState } from 'react';

const hudStyle = {
  position: 'absolute',
  top: 0, left: 0,
  width: '100%', height: '100%',
  pointerEvents: 'none',
  userSelect: 'none',
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

function Leaderboard({ leaderboard, playerId }) {
  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '10px 14px',
      minWidth: 180,
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#aaa', marginBottom: 8 }}>
        LEADERBOARD
      </div>
      {leaderboard.length === 0 && (
        <div style={{ color: '#666', fontSize: 13 }}>No players yet</div>
      )}
      {leaderboard.map((entry, i) => (
        <div key={entry.id || i} style={{
          display: 'flex', justifyContent: 'space-between', gap: 12,
          fontSize: 13, marginBottom: 4,
          color: entry.id === playerId ? '#ffe566' : '#ddd',
          fontWeight: entry.id === playerId ? 700 : 400,
        }}>
          <span style={{ color: i < 3 ? ['#ffd700','#c0c0c0','#cd7f32'][i] : '#777' }}>
            #{i + 1}
          </span>
          <span style={{ flex: 1 }}>{entry.name}</span>
          <span style={{ color: '#88ff88' }}>{entry.score}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Kill feed ────────────────────────────────────────────────────────────────

function Killfeed({ entries }) {
  return (
    <div style={{
      position: 'absolute', bottom: 170, left: 16,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {entries.map(e => (
        <div key={e.key} style={{
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '5px 10px',
          fontSize: 12, color: '#ddd',
          backdropFilter: 'blur(4px)',
        }}>
          {e.killerName
            ? <><span style={{ color: '#ff7777' }}>{e.killerName}</span> ate <span style={{ color: '#77aaff' }}>{e.victimName}</span> (len {e.length})</>
            : <><span style={{ color: '#77aaff' }}>{e.victimName}</span> hit the wall (len {e.length})</>}
        </div>
      ))}
    </div>
  );
}

// ─── Score bar ───────────────────────────────────────────────────────────────

function ScoreBar({ snapshot, playerId }) {
  const me = snapshot?.snakes?.find(s => s.id === playerId);
  if (!me) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 20, padding: '6px 20px',
      fontSize: 14, display: 'flex', gap: 24,
      backdropFilter: 'blur(6px)',
    }}>
      <span>Length: <strong style={{ color: '#88ff88' }}>{me.length}</strong></span>
      <span>Score: <strong style={{ color: '#ffe566' }}>{me.score}</strong></span>
      {me.boosting && <span style={{ color: '#ff8855' }}>BOOST</span>}
    </div>
  );
}

// ─── Greeting banner ─────────────────────────────────────────────────────────

function Greeting({ text, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); onDismiss(); }, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  if (!visible || !text) return null;

  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,20,40,0.85)',
      border: '1px solid rgba(100,200,255,0.3)',
      borderRadius: 10, padding: '10px 20px',
      fontSize: 14, color: '#aaddff', textAlign: 'center',
      maxWidth: 360,
      backdropFilter: 'blur(8px)',
      animation: 'fadeIn 0.3s ease',
    }}>
      {text}
    </div>
  );
}

// ─── Controls hint ────────────────────────────────────────────────────────────

function Controls() {
  return (
    <div style={{
      position: 'absolute', bottom: 16, right: 16,
      color: '#444', fontSize: 11, textAlign: 'right', lineHeight: 1.8,
    }}>
      Steer: mouse or WASD / arrow keys &nbsp;|&nbsp; Boost: hold click / space
    </div>
  );
}

// ─── HUD root ─────────────────────────────────────────────────────────────────

function RoomBadge({ roomCode }) {
  if (!roomCode) return null;
  const copy = () => navigator.clipboard.writeText(roomCode).catch(() => {});
  return (
    <div
      onClick={copy}
      title="Click to copy room code"
      style={{
        position: 'absolute', top: 16, left: 16,
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(100,200,255,0.2)',
        borderRadius: 10, padding: '6px 14px',
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
      }}
    >
      <span style={{ fontSize: 10, color: '#667', letterSpacing: 1 }}>ROOM </span>
      <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: 4, color: '#88ddff' }}>{roomCode}</span>
    </div>
  );
}

export default function HUD({ leaderboard, killfeed, snapshot, playerId, roomCode, greeting, onGreetingDismiss }) {
  return (
    <div style={hudStyle}>
      <RoomBadge roomCode={roomCode} />
      <Leaderboard leaderboard={leaderboard} playerId={playerId} />
      <Killfeed entries={killfeed} />
      <ScoreBar snapshot={snapshot} playerId={playerId} />
      {greeting && <Greeting text={greeting} onDismiss={onGreetingDismiss} />}
      <Controls />
    </div>
  );
}
