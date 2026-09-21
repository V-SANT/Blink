import { useEffect, useRef } from 'react'
import type { PlayerView } from '../../../shared/types'
import { REVEAL_MS } from '../../../shared/types'
import { useNow } from '../useBlink'
import { playCountdown, playReveal } from '../sound'

/**
 * Contacto Efímero de Alta Conversión™.
 *
 * El timing vive acá y no en el servidor a propósito: el tick del servidor es de 1s y
 * no tiene resolución para clavar 1000ms. El servidor manda `revealAt` y el cliente
 * hace el resto. Si parpadeás, lo perdiste — el nombre del proyecto es esta pantalla.
 *
 * Cuando el contacto desaparece se avisa hacia arriba con `onRevealEnded`: el upsell de
 * Premium lo monta el componente padre, porque esta pantalla la desmonta el servidor
 * pocos segundos después y el upsell no llegaría a verse.
 */
export function Blink({ view, onRevealEnded }: { view: PlayerView; onRevealEnded: () => void }) {
  const now = useNow(40)
  const revealAt = view.revealAt ?? 0
  const mutual = Boolean(view.reveal)

  const untilReveal = revealAt - now
  const sinceReveal = now - revealAt
  const showing = mutual && untilReveal <= 0 && sinceReveal < REVEAL_MS
  const gone = mutual && sinceReveal >= REVEAL_MS

  // Un sonido por cada número de la cuenta, y uno seco en el parpadeo.
  const lastBeep = useRef(0)
  const revealed = useRef(false)
  useEffect(() => {
    if (!mutual) return
    if (untilReveal > 0) {
      const n = Math.ceil(untilReveal / 1000)
      if (n !== lastBeep.current) {
        lastBeep.current = n
        playCountdown()
      }
    } else if (!revealed.current) {
      revealed.current = true
      playReveal()
    }
  }, [mutual, untilReveal])

  const notified = useRef(false)
  useEffect(() => {
    if (gone && !notified.current) {
      notified.current = true
      onRevealEnded()
    }
  }, [gone, onRevealEnded])

  if (!mutual) {
    return (
      <div className="blink-stage">
        <div className="blink-gone">
          <strong>No hubo interés mutuo.</strong>
          El sistema no informa de qué lado faltó. Consideramos que esa información no te
          beneficiaría.
        </div>
      </div>
    )
  }

  if (untilReveal > 0) {
    return (
      <div className="blink-stage">
        <div className="blink-cue">preparate</div>
        <div className="blink-count">{Math.ceil(untilReveal / 1000)}</div>
      </div>
    )
  }

  if (showing) {
    return (
      <div
        className="blink-stage"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="blink-contact">{view.reveal}</div>
      </div>
    )
  }

  return (
    <div className="blink-stage">
      <div className="blink-gone">
        <strong>Se fue.</strong>
        Un segundo es tiempo más que suficiente para leer un contacto. Si no llegaste, el problema
        no es el producto.
        <br />
        <br />
        Tenés otra oportunidad en la próxima sesión.
      </div>
    </div>
  )
}
