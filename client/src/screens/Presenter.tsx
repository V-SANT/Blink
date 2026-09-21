import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { usePresenter } from '../useBlink'
import { initAudio, playBell, playTick } from '../sound'

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function Presenter() {
  const key = new URLSearchParams(location.search).get('key')
  const { view, denied, waking, bell, reset, addBots } = usePresenter(key)
  const [qr, setQr] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (!view?.joinUrl) return
    void QRCode.toDataURL(view.joinUrl, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then(setQr)
  }, [view?.joinUrl])

  // La campanada: 3 · 2 · 1 en el proyector, y recién ahí se emparejan todos a la vez.
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      bell()
      playBell()
      const t = setTimeout(() => setCountdown(null), 900)
      return () => clearTimeout(t)
    }
    playTick(true)
    const t = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, bell])

  // Tick del reloj proyectado en los últimos 10 segundos.
  const lastTick = useRef(0)
  useEffect(() => {
    const r = view?.remaining ?? 0
    if (view?.phase === 'live' && r > 0 && r <= 10 && r !== lastTick.current) {
      lastTick.current = r
      playTick(r <= 5)
    }
  }, [view?.remaining, view?.phase])

  if (denied) {
    return (
      <div className="presenter" style={{ placeContent: 'center', textAlign: 'center' }}>
        <h2>Acceso denegado</h2>
        <p style={{ color: '#6f6a90' }}>Falta el parámetro ?key= correcto.</p>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="presenter" style={{ placeContent: 'center', textAlign: 'center' }}>
        <h2>{waking ? 'Despertando el servicio…' : 'Conectando al sistema…'}</h2>
        {waking && (
          <p style={{ color: '#6f6a90', fontSize: 15, maxWidth: 460, margin: '10px auto 0', lineHeight: 1.6 }}>
            En el plan free de Render el arranque en frío tarda alrededor de un minuto. Una vez
            que conecta, esta pantalla lo mantiene despierto sola mientras siga abierta.
          </p>
        )}
      </div>
    )
  }

  const lobby = view.phase === 'lobby'
  const results = view.phase === 'results'

  return (
    <div className="presenter">
      {countdown !== null && (
        <div className="bell-overlay">
          <div className="bell-n">{countdown === 0 ? '🔔' : countdown}</div>
        </div>
      )}

      <div className="p-top">
        <div>
          {lobby ? (
            <>
              <div className="p-clock">{view.lobbyCount}</div>
              <div className="p-label">perfiles en el sistema</div>
            </>
          ) : (
            <>
              <div className={`p-clock ${view.remaining <= 15 && view.remaining > 0 ? 'urgent' : ''}`}>
                {mmss(view.remaining)}
              </div>
              <div className="p-label">
                {view.phase === 'live' && `${view.roomCount} parejas en curso`}
                {view.phase === 'verdict' && 'ventana de interés'}
                {view.phase === 'blink' && 'contacto efímero'}
                {view.phase === 'results' && 'sesión cerrada'}
              </div>
            </>
          )}

          <div className="p-stats">
            <div>
              <div className="p-stat-n">{view.totals.messages}</div>
              <div className="p-stat-k">mensajes</div>
            </div>
            <div>
              <div className="p-stat-n">{view.totals.audits}</div>
              <div className="p-stat-k">auditorías</div>
            </div>
            <div>
              <div className="p-stat-n">{view.totals.escapes}</div>
              <div className="p-stat-k">fugas</div>
            </div>
          </div>
        </div>

        {lobby && (
          <div style={{ textAlign: 'center' }}>
            <div className="p-qr">{qr ? <img src={qr} alt="Código QR para entrar a Blink" /> : null}</div>
            <div className="p-url">{view.joinUrl.replace(/^https?:\/\//, '')}</div>
          </div>
        )}
      </div>

      {results && view.awards.length > 0 && (
        <div>
          <h2>Wall of Shame</h2>
          <div className="awards">
            {view.awards.map((a) => (
              <div className="award" key={a.title}>
                <div className="a-t">{a.title}</div>
                <div className="a-n">{a.nick}</div>
                <div className="a-d">{a.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-cols">
        <div className="p-panel">
          <h2>Índice de Eficiencia Comunicacional</h2>
          <div className="lb-list">
            {view.leaderboard.map((r, i) => (
              <div className="lb-row" key={`${r.nick}-${i}`}>
                <span className="lb-pos">{String(i + 1).padStart(2, '0')}</span>
                <span className="lb-nick">
                  {r.nick}
                  {r.isBot && <span className="bot">BOT</span>}
                </span>
                <span className="lb-iec">{r.iec}</span>
              </div>
            ))}
            {view.leaderboard.length === 0 && (
              <p style={{ color: '#55516f', fontSize: 18 }}>Sin datos. Nadie se ha comprometido todavía.</p>
            )}
          </div>
        </div>

        <div className="p-panel">
          <h2>Registro de eventos</h2>
          <div className="feed">
            {view.feed.map((f) => (
              <div className={`feed-item ${f.tone}`} key={f.id}>
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-controls">
        <button
          className="p-btn primary"
          disabled={!lobby || view.lobbyCount === 0 || countdown !== null}
          onClick={() => {
            initAudio()
            setCountdown(3)
          }}
        >
          🔔 CAMPANADA
        </button>
        <button className="p-btn" onClick={() => { initAudio(); addBots(6) }}>
          + 6 perfiles
        </button>
        <button className="p-btn" onClick={() => reset(false)}>
          Nueva ronda
        </button>
        <button className="p-btn" onClick={() => reset(true)}>
          Reiniciar todo
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#3f3c56', fontFamily: 'var(--mono)' }}>
          {view.humanCount} humanos · {view.botCount} bots
        </span>
      </div>
    </div>
  )
}
