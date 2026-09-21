import { useState } from 'react'

/**
 * Blink Premium.
 *
 * Aparece justo después de que el contacto desaparece, que es el único momento en que
 * el usuario haría cualquier cosa por recuperarlo. El botón de pagar no lleva a ningún
 * lado: el remate es "Función no disponible en tu país".
 *
 * No hay pasarela de pago, no se piden datos y no se pide nada al usuario. Es una
 * pantalla de utilería.
 */

const PERKS = [
  ['Contacto Efímero Extendido', '1.4 segundos en lugar de 1.0'],
  ['Ghosting Instantáneo', 'Dejá de responder sin penalización de IEC'],
  ['Inmunidad Dominical', 'Tu puntaje no baja los domingos'],
  ['Segunda Oportunidad', 'Volvé a ver el contacto que perdiste'],
]

export function Premium({ onSkip }: { onSkip: () => void }) {
  const [blocked, setBlocked] = useState(false)

  if (blocked) {
    return (
      <div className="premium">
        <div className="premium-card">
          <div className="premium-error">Función no disponible en tu país.</div>
          <p className="premium-note">
            Estamos trabajando para llevar Blink Premium a tu región. No hay fecha estimada.
          </p>
          <button className="btn ghost" onClick={onSkip}>
            Entendido
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="premium">
      <div className="premium-card">
        <div className="premium-kicker">¿No llegaste a leerlo?</div>
        <div className="premium-brand">BLINK PREMIUM</div>
        <div className="premium-price">
          $4.99<span>/mes</span>
        </div>

        <ul className="premium-perks">
          {PERKS.map(([name, detail]) => (
            <li key={name}>
              <strong>{name}</strong>
              <span>{detail}</span>
            </li>
          ))}
        </ul>

        <button className="btn mint" onClick={() => setBlocked(true)}>
          Recuperar el contacto por $4.99
        </button>
        <button className="premium-skip" onClick={onSkip}>
          No, prefiero vivir con la duda
        </button>

        <p className="premium-fine">
          Suscripción de renovación automática. La cancelación se procesa durante tu próxima sesión
          asignada, a la cual deberás asistir.
        </p>
      </div>
    </div>
  )
}
