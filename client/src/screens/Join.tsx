import { useState } from 'react'
import { AXES, GENDERS, SEEKINGS, type Gender, type JoinPayload, type Seeking } from '../../../shared/types'
import { Terms } from './Terms'
import { initAudio, playReward } from '../sound'

export function Join({
  connected,
  waking,
  onJoin,
}: {
  connected: boolean
  /** Varios segundos sin conectar: casi siempre Render despertando el servicio. */
  waking: boolean
  onJoin: (p: JoinPayload) => void
}) {
  const [nick, setNick] = useState('')
  const [contact, setContact] = useState('')
  const [axes, setAxes] = useState<number[]>(() => AXES.map(() => 50))
  // Sin default: que lo elijan. La app pide la preferencia como cualquier otra, y el
  // chiste solo funciona si la eligieron ellos.
  const [gender, setGender] = useState<Gender | null>(null)
  const [seeking, setSeeking] = useState<Seeking | null>(null)
  const [terms, setTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const ready =
    nick.trim().length >= 2 &&
    contact.trim().length >= 3 &&
    gender !== null &&
    seeking !== null &&
    terms &&
    connected

  return (
    <div className="app">
      <div className="brand">
        <h1>Blink</h1>
        <span>PERFILADO DE VULNERABILIDAD</span>
      </div>

      {waking && !connected && (
        <div className="waking">
          <span className="waking-dot" />
          <div>
            <strong>Despertando el sistema.</strong> Puede tardar hasta un minuto.
            <br />
            No recargues: recargar no acelera nada, solo te hace sentir que estás haciendo algo.
          </div>
        </div>
      )}

      <div className="card">
        <p className="lede">
          No pedimos fotos ni biografía. <strong>No hay nada que optimizar.</strong> Solo cinco preguntas, y
          ninguna es sobre vos.
        </p>

        <div className="field-group">
          <label htmlFor="nick">¿Cómo te dicen?</label>
          <input
            id="nick"
            className="field"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="Tu nombre"
            maxLength={18}
            autoComplete="off"
          />
        </div>

        <div className="field-group">
          <label htmlFor="contact">Tu contacto</label>
          <input
            id="contact"
            className="field"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="@tuinstagram"
            maxLength={40}
            autoComplete="off"
          />
          <p className="hint">
            Se muestra a tu match al terminar los 90 segundos, si hay interés mutuo. Durante un
            segundo.
          </p>
        </div>

        <div className="field-group">
          <label>Sos</label>
          <div className="seg">
            {GENDERS.map((g) => (
              <button
                key={g.id}
                className={`seg-btn ${gender === g.id ? 'on' : ''}`}
                onClick={() => setGender(g.id)}
                aria-pressed={gender === g.id}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Buscás</label>
          <div className="seg">
            {SEEKINGS.map((s) => (
              <button
                key={s.id}
                className={`seg-btn ${seeking === s.id ? 'on' : ''}`}
                onClick={() => setSeeking(s.id)}
                aria-pressed={seeking === s.id}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="hint">
            Blink respeta tu preferencia siempre que la cantidad lo permita. Cuando no, se te
            asigna igual y se te informa.
          </p>
        </div>
      </div>

      <div className="card">
        {AXES.map((axis, i) => (
          <div className="axis" key={axis.id}>
            <div className="axis-ends">
              <span>{axis.left}</span>
              <span>{axis.right}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={axes[i]}
              aria-label={`${axis.left} contra ${axis.right}`}
              onChange={(e) => {
                const next = [...axes]
                next[i] = Number(e.target.value)
                setAxes(next)
              }}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <button
          className={`terms-row ${terms ? 'done' : ''}`}
          onClick={() => {
            // El AudioContext necesita un gesto del usuario: este es el primero que hay.
            initAudio()
            if (!terms) setShowTerms(true)
          }}
        >
          <span className="terms-box">{terms ? '✓' : ''}</span>
          <span className="terms-text">
            {terms ? (
              <>
                <strong>Términos aceptados.</strong> Leímos los 11 artículos en tu nombre.
              </>
            ) : (
              <>
                Acepto los <strong>Términos y Condiciones</strong>, que incluyen no poder salir de
                la aplicación durante mis 90 segundos asignados.
              </>
            )}
          </span>
        </button>

        <button
          className="btn"
          disabled={!ready}
          onClick={() => {
            initAudio()
            onJoin({
              nick: nick.trim(),
              contact: contact.trim(),
              axes,
              gender: gender ?? 'nobinario',
              seeking: seeking ?? 'todos',
            })
          }}
        >
          {connected ? 'Entrar a la sala de espera' : 'Conectando…'}
        </button>
      </div>

      {showTerms && (
        <Terms
          onAccept={() => {
            setTerms(true)
            setShowTerms(false)
            playReward()
          }}
          onCancel={() => setShowTerms(false)}
        />
      )}

      <p className="fineprint">
        Blink · Conexiones que duran lo que tienen que durar
        <br />
        Al continuar aceptás no perder el tiempo.
      </p>
    </div>
  )
}
