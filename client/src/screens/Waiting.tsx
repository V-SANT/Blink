import type { PlayerView } from '../../../shared/types'

export function Waiting({ view }: { view: PlayerView }) {
  return (
    <div className="app">
      <div className="brand">
        <h1>Blink</h1>
        <span>SALA DE ESPERA</span>
      </div>

      <div className="card" style={{ textAlign: 'center', paddingTop: 34, paddingBottom: 34 }}>
        <div className="waiting-n">{view.lobbyCount ?? 1}</div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 8 }}>
          perfiles en el sistema
        </p>
        <p className="lede" style={{ marginTop: 22, marginBottom: 0 }}>
          <span className="pulse" />
          Esperando la campanada.
        </p>
      </div>

      <div className="card">
        <p className="lede" style={{ marginBottom: 12 }}>
          Cuando suene la campanada vas a ser emparejado con <strong>una sola persona</strong>,
          elegida por máxima divergencia de perfil. Tenés <strong>90 segundos</strong>.
        </p>
        <p className="lede" style={{ marginBottom: 0, fontSize: 13.5 }}>
          Recordá que el Índice de Eficiencia Comunicacional premia la brevedad. Los mensajes largos
          se interpretan como disponibilidad emocional.
        </p>
      </div>

      <div className="card" style={{ background: '#1e1c2b', color: '#c9c5dd' }}>
        <div style={{ fontSize: 9.5, letterSpacing: '0.14em', color: '#57c9ae', fontWeight: 700, marginBottom: 8 }}>
          TU IEC ACTUAL
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em' }}>
          {view.iec}
        </div>
      </div>

      <p className="fineprint">No cierres esta pantalla. No vas a recibir notificaciones.</p>
    </div>
  )
}
