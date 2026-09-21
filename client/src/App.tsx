import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayer } from './useBlink'
import { playBell } from './sound'
import { Join } from './screens/Join'
import { Waiting } from './screens/Waiting'
import { Room } from './screens/Room'
import { Verdict } from './screens/Verdict'
import { Blink } from './screens/Blink'
import { Done } from './screens/Done'
import { Premium } from './screens/Premium'
import { Presenter } from './screens/Presenter'

export function App() {
  // El proyector vive en /presenter. Todo lo demás es la app del jugador.
  if (location.pathname.replace(/\/$/, '') === '/presenter') {
    return <Presenter />
  }
  return <Player />
}

function Player() {
  const { view, connected, waking, join, send, vote } = usePlayer()
  const [joined, setJoined] = useState(false)
  // El upsell vive acá y no dentro de Blink: el servidor cierra la fase del parpadeo a
  // los pocos segundos y desmontaría la pantalla antes de que nadie lo lea. Acá sobrevive
  // al cambio de fase y solo lo cierra el usuario.
  const [premium, setPremium] = useState(false)

  // La campanada: ochenta teléfonos sonando y vibrando en el mismo instante.
  // Es el mejor momento de la presentación; se dispara en la transición a 'live'.
  const prevPhase = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (view?.phase === 'live' && prevPhase.current !== 'live') playBell()
    prevPhase.current = view?.phase
  }, [view?.phase])

  const onRevealEnded = useCallback(() => setPremium(true), [])

  if (!joined || !view) {
    return (
      <Join
        connected={connected}
        waking={waking}
        onJoin={(p) => {
          join(p)
          setJoined(true)
        }}
      />
    )
  }

  const screen = (() => {
    switch (view.phase) {
      case 'live':
        return <Room view={view} onSend={send} />
      case 'verdict':
        return <Verdict view={view} onVote={vote} />
      case 'blink':
        return <Blink view={view} onRevealEnded={onRevealEnded} />
      case 'done':
        return <Done view={view} />
      default:
        return <Waiting view={view} />
    }
  })()

  return (
    <>
      {screen}
      {premium && <Premium onSkip={() => setPremium(false)} />}
    </>
  )
}
