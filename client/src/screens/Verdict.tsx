import type { PlayerView } from '../../../shared/types'

export function Verdict({ view, onVote }: { view: PlayerView; onVote: (yes: boolean) => void }) {
  const room = view.room
  if (!room) return null

  return (
    <div className="app">
      <div className="brand">
        <h1>Blink</h1>
        <span>HORA FINALIZADA</span>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="waiting-n">{room.remaining}</div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 6 }}>
          segundos para decidir
        </p>
      </div>

      {room.voted ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="lede" style={{ marginBottom: 0 }}>
            Respuesta registrada.
            <br />
            <strong>Esperando a {room.peerNick}.</strong>
          </p>
        </div>
      ) : (
        <div className="card">
          <p className="lede">
            ¿Querés que {room.peerNick} vea tu contacto?
          </p>
          <p className="hint" style={{ marginBottom: 18 }}>
            Si los dos dicen que sí, el contacto se muestra durante un segundo. No se guarda, no se
            copia y no se vuelve a mostrar.
          </p>
          <div className="btn-row">
            <button className="btn row ghost" onClick={() => onVote(false)}>
              No
            </button>
            <button className="btn row mint" onClick={() => onVote(true)}>
              Sí
            </button>
          </div>
        </div>
      )}

      <p className="fineprint">
        Tu decisión no afecta tu IEC.
        <br />
        La de la otra persona, tampoco. Eso es lo triste.
      </p>
    </div>
  )
}
