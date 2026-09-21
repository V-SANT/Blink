import type { PlayerView } from '../../../shared/types'

export function Done({ view }: { view: PlayerView }) {
  const s = view.summary
  if (!s) return null

  return (
    <div className="app">
      <div className="brand">
        <h1>Blink</h1>
        <span>INFORME DE SESIÓN</span>
      </div>

      <div className="title-badge">
        <div className="t">{s.title}</div>
        <div className="d">
          Puesto {s.rank} de {s.total}
        </div>
      </div>

      <div className="card">
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-n">{s.iec}</div>
            <div className="stat-k">IEC final</div>
          </div>
          <div className="stat">
            <div className="stat-n">{s.sent}</div>
            <div className="stat-k">mensajes</div>
          </div>
          <div className="stat">
            <div className="stat-n">{s.chars}</div>
            <div className="stat-k">caracteres</div>
          </div>
          <div className="stat">
            <div className="stat-n">{s.mutual ? 'Sí' : 'No'}</div>
            <div className="stat-k">interés mutuo</div>
          </div>
        </div>

        <p className="lede" style={{ marginBottom: 0, fontSize: 13.5 }}>
          {s.sent === 0
            ? 'No enviaste un solo mensaje. Es el comportamiento óptimo dentro de nuestro sistema de puntaje. Felicitaciones.'
            : s.chars / Math.max(1, s.sent) > 60
              ? 'Tu promedio de caracteres por mensaje está por encima de lo recomendable. Trabajá en eso.'
              : 'Mantuviste un perfil comunicacional eficiente. El sistema lo valora.'}
        </p>
      </div>

      <div className="card" style={{ background: '#1e1c2b', color: '#c9c5dd' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.14em', color: '#57c9ae', fontWeight: 700, marginBottom: 9 }}>
          BLINK PREMIUM · $4.99/MES
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0, color: '#a8a3c0' }}>
          Tu ghosting es instantáneo. Reservá tu lugar para la próxima sesión.
        </p>
      </div>

      <p className="fineprint">
        No guardamos esta conversación.
        <br />
        No guardamos nada, en realidad.
      </p>
    </div>
  )
}
