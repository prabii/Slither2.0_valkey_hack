import { useState, useEffect, useCallback } from 'react';

const card = {
  position: 'relative',
  background: 'rgba(10,15,30,0.95)',
  border: '1px solid rgba(100,200,255,0.2)',
  borderRadius: 18,
  padding: '40px 48px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 0 60px rgba(0,100,255,0.1)',
  width: 380,
};

const inputBase = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10, padding: '11px 14px',
  color: '#fff', fontSize: 15,
  outline: 'none', width: '100%',
};

const btn = (active, accent = '#1a6bff') => ({
  background: active ? `linear-gradient(135deg, ${accent}, #00d4aa)` : 'rgba(255,255,255,0.08)',
  border: 'none', borderRadius: 10,
  padding: '12px', color: '#fff',
  fontSize: 15, fontWeight: 700,
  cursor: active ? 'pointer' : 'not-allowed',
  width: '100%', transition: 'opacity 0.2s',
});

function Input({ label, ...props }) {
  return (
    <div style={{ width: '100%' }}>
      {label && <div style={{ fontSize: 11, color: '#667', marginBottom: 5, letterSpacing: 1 }}>{label}</div>}
      <input style={inputBase} {...props} />
    </div>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'rgba(255,50,50,0.12)', border: '1px solid rgba(255,80,80,0.3)',
      borderRadius: 8, padding: '10px 14px',
      color: '#ff8888', fontSize: 13, width: '100%', textAlign: 'center',
    }}>{msg}</div>
  );
}

// ─── Tab: Create Room ─────────────────────────────────────────────────────────

function CreateTab({ onCreateRoom, error, loading, createdCode, onCopyCode }) {
  const [name, setName]         = useState('');
  const [pin, setPin]           = useState('');
  const [roomPass, setRoomPass] = useState('');
  const [nameStatus, setNameStatus] = useState(null); // null | 'new' | 'returning'

  const checkName = useCallback(async (n) => {
    if (!n.trim() || n.trim().length < 2) { setNameStatus(null); return; }
    const HTTP = window.location.origin;
    // We'll piggy-back on the WS flow via a prop instead
    // (parent passes checkNameFn)
  }, []);

  const ready = name.trim().length >= 2 && pin.length === 4;

  const submit = (e) => {
    e.preventDefault();
    if (ready && !loading) onCreateRoom(name.trim(), pin, roomPass.trim() || null);
  };

  if (createdCode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%' }}>
        <div style={{ fontSize: 13, color: '#88aacc' }}>Room created! Share this code:</div>
        <div style={{
          fontSize: 52, fontWeight: 900, letterSpacing: 8,
          background: 'linear-gradient(135deg, #44aaff, #88ffcc)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          {createdCode}
        </div>
        <button
          onClick={onCopyCode}
          style={{ ...btn(true, '#44aaff'), width: 'auto', padding: '8px 24px', fontSize: 13 }}
        >
          Copy Code
        </button>
        <div style={{ color: '#445', fontSize: 12, textAlign: 'center' }}>
          Joining now… get ready!
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <ErrorBox msg={error} />

      <Input
        label="YOUR NAME"
        maxLength={20}
        placeholder="e.g. ViperKing"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />

      <Input
        label="4-DIGIT PIN (your account password)"
        type="password"
        maxLength={4}
        placeholder="••••"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        style={{ ...inputBase, letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
      />

      <Input
        label="ROOM PASSWORD (optional)"
        type="password"
        maxLength={30}
        placeholder="Leave blank for public room"
        value={roomPass}
        onChange={e => setRoomPass(e.target.value)}
      />

      <div style={{ fontSize: 11, color: '#556', marginTop: -4 }}>
        PIN is used to protect your name across sessions. Pick one and remember it.
      </div>

      <button type="submit" disabled={!ready || loading} style={btn(ready && !loading, '#1a6bff')}>
        {loading ? 'Creating…' : 'CREATE ROOM'}
      </button>
    </form>
  );
}

// ─── Tab: Join Room ───────────────────────────────────────────────────────────

function JoinTab({ onJoinRoom, onCheckRoom, error, loading }) {
  const [code, setCode]     = useState('');
  const [name, setName]     = useState('');
  const [pin, setPin]       = useState('');
  const [roomPass, setRoomPass] = useState('');
  const [roomInfo, setRoomInfo] = useState(null); // { exists, passwordRequired }
  const [checking, setChecking] = useState(false);

  // Auto-check room when 4 chars entered
  useEffect(() => {
    if (code.length === 4) {
      setChecking(true);
      onCheckRoom(code).then(info => {
        setRoomInfo(info);
        setChecking(false);
      });
    } else {
      setRoomInfo(null);
    }
  }, [code]);

  const ready = code.length === 4 && name.trim().length >= 2 && pin.length === 4
    && roomInfo?.exists
    && (!roomInfo?.passwordRequired || roomPass.length > 0);

  const submit = (e) => {
    e.preventDefault();
    if (ready && !loading) onJoinRoom(code, name.trim(), pin, roomPass.trim() || '');
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <ErrorBox msg={error} />

      {/* Room code */}
      <div style={{ width: '100%' }}>
        <div style={{ fontSize: 11, color: '#667', marginBottom: 5, letterSpacing: 1 }}>ROOM CODE</div>
        <input
          maxLength={4}
          placeholder="XXXX"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
          style={{ ...inputBase, letterSpacing: 8, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
          autoFocus
        />
        {code.length === 4 && (
          <div style={{ fontSize: 11, marginTop: 5, color: roomInfo ? (roomInfo.exists ? '#88ff88' : '#ff6666') : '#888' }}>
            {checking ? 'Checking…' : roomInfo?.exists
              ? (roomInfo.passwordRequired ? '🔒 Room exists — password required' : '✅ Room found — join below')
              : '❌ Room not found'}
          </div>
        )}
      </div>

      <Input
        label="YOUR NAME"
        maxLength={20}
        placeholder="e.g. ViperKing"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      <Input
        label="YOUR PIN"
        type="password"
        maxLength={4}
        placeholder="••••"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        style={{ ...inputBase, letterSpacing: 6, textAlign: 'center', fontSize: 20 }}
      />

      {roomInfo?.passwordRequired && (
        <Input
          label="ROOM PASSWORD"
          type="password"
          maxLength={30}
          placeholder="Enter room password"
          value={roomPass}
          onChange={e => setRoomPass(e.target.value)}
          style={{ ...inputBase, borderColor: 'rgba(255,200,100,0.35)' }}
        />
      )}

      <button type="submit" disabled={!ready || loading} style={btn(ready && !loading, '#7733ff')}>
        {loading ? 'Joining…' : 'JOIN ROOM'}
      </button>
    </form>
  );
}

// ─── Lobby root ───────────────────────────────────────────────────────────────

export default function LobbyScreen({ onCreate, onJoin, onCheckRoom, error, loading, createdCode }) {
  const [tab, setTab] = useState('create'); // 'create' | 'join'

  const handleCopyCode = () => {
    navigator.clipboard.writeText(createdCode).catch(() => {});
  };

  const tabStyle = (t) => ({
    flex: 1, padding: '10px', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
    background: tab === t ? 'rgba(100,200,255,0.15)' : 'transparent',
    color: tab === t ? '#88ddff' : '#556',
    borderBottom: tab === t ? '2px solid #44aaff' : '2px solid transparent',
  });

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, #0d1b2a 0%, #0a0a14 100%)',
      zIndex: 100,
    }}>
      {/* Grid bg */}
      <svg style={{ position: 'absolute', inset: 0, opacity: 0.04 }} width="100%" height="100%">
        <defs>
          <pattern id="g" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="white" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>

      <div style={card}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 38, fontWeight: 900, letterSpacing: -1,
            background: 'linear-gradient(135deg, #44aaff, #88ffcc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            SLITHER QUEST
          </div>
          <div style={{ color: '#445', fontSize: 12, marginTop: 4 }}>
            Eat &bull; Grow &bull; Outlast
          </div>
        </div>

        {/* Tabs */}
        {!createdCode && (
          <div style={{ display: 'flex', width: '100%', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4 }}>
            <button style={tabStyle('create')} onClick={() => setTab('create')}>CREATE ROOM</button>
            <button style={tabStyle('join')} onClick={() => setTab('join')}>JOIN ROOM</button>
          </div>
        )}

        {/* Tab content */}
        {(tab === 'create' || createdCode) && (
          <CreateTab
            onCreateRoom={onCreate}
            error={tab === 'create' ? error : null}
            loading={loading && tab === 'create'}
            createdCode={createdCode}
            onCopyCode={handleCopyCode}
          />
        )}
        {tab === 'join' && !createdCode && (
          <JoinTab
            onJoinRoom={onJoin}
            onCheckRoom={onCheckRoom}
            error={error}
            loading={loading}
          />
        )}

        {/* Tips */}
        {!createdCode && (
          <div style={{ color: '#334', fontSize: 11, textAlign: 'center', lineHeight: 2 }}>
            Steer: mouse or WASD / arrows &nbsp;·&nbsp; Boost: hold click or space
          </div>
        )}
      </div>
    </div>
  );
}
