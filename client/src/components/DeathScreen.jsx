import { useEffect, useState } from 'react';

export default function DeathScreen({ info, onRespawn }) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    setCountdown(3);
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [info]);

  const canRespawn = countdown === 0;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)',
      zIndex: 90,
      animation: 'fadeIn 0.4s ease',
    }}>
      <div style={{
        background: 'rgba(10,10,20,0.95)',
        border: '1px solid rgba(255,50,50,0.3)',
        borderRadius: 18, padding: '44px 56px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        backdropFilter: 'blur(20px)',
        minWidth: 320, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>☠️</div>

        <div style={{
          fontSize: 32, fontWeight: 900,
          color: '#ff4455',
        }}>
          YOU DIED
        </div>

        {info && (
          <div style={{ color: '#aaa', fontSize: 15, lineHeight: 1.7 }}>
            <div>Length reached: <strong style={{ color: '#88ff88' }}>{info.length}</strong></div>
            {info.killerName
              ? <div>Eaten by <strong style={{ color: '#ff7777' }}>{info.killerName}</strong></div>
              : <div style={{ color: '#ff7777' }}>Hit the wall</div>}
          </div>
        )}

        <button
          onClick={canRespawn ? onRespawn : undefined}
          style={{
            marginTop: 8,
            background: canRespawn
              ? 'linear-gradient(135deg, #1a6bff, #00d4aa)'
              : 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: 10,
            padding: '13px 36px',
            color: '#fff', fontSize: 16, fontWeight: 700,
            cursor: canRespawn ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s',
            minWidth: 200,
          }}
        >
          {canRespawn ? 'RESPAWN' : `Respawn in ${countdown}…`}
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
