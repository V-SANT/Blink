import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { JoinPayload, PlayerView, PresenterView } from '../../shared/types'

/** Mismo origen en producción; en dev Vite hace proxy de /socket.io al :3000. */
function connect(): Socket {
  return io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 })
}

/**
 * true cuando llevamos varios segundos sin poder conectar.
 *
 * Pasa en dos situaciones reales el día del evento: el servicio de Render estaba dormido
 * y tarda ~1 minuto en despertar, o el wifi del venue está saturado. En los dos casos la
 * pantalla se vería colgada sin esto, y la gente recarga justo cuando no hay que recargar.
 */
function useWaking(connected: boolean, afterMs = 4000) {
  const [waking, setWaking] = useState(false)
  useEffect(() => {
    if (connected) {
      setWaking(false)
      return
    }
    const t = setTimeout(() => setWaking(true), afterMs)
    return () => clearTimeout(t)
  }, [connected, afterMs])
  return waking
}

export function usePlayer() {
  const [view, setView] = useState<PlayerView | null>(null)
  const [connected, setConnected] = useState(false)
  const socket = useRef<Socket | null>(null)
  const inRoom = useRef(false)

  useEffect(() => {
    const s = connect()
    socket.current = s
    s.on('connect', () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    s.on('state', (v: PlayerView) => {
      inRoom.current = v.phase === 'live'
      setView(v)
    })
    return () => {
      s.close()
    }
  }, [])

  // Detector de fuga. En iOS esto también salta al bloquear la pantalla o bajar el
  // centro de control: más falsos positivos, lo cual es objetivamente mejor para la demo.
  useEffect(() => {
    const report = (away: boolean) => {
      if (inRoom.current) socket.current?.emit('away', away)
    }
    const onVis = () => report(document.visibilityState === 'hidden')
    const onBlur = () => report(true)
    const onFocus = () => report(false)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Presencia Obligatoria: neutraliza el botón "atrás" mientras la hora corre.
  useEffect(() => {
    if (view?.phase !== 'live') return
    history.pushState(null, '', location.href)
    const trap = () => history.pushState(null, '', location.href)
    window.addEventListener('popstate', trap)

    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '¿Estás seguro de que querés abandonar a otro ser humano?'
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('popstate', trap)
      window.removeEventListener('beforeunload', warn)
    }
  }, [view?.phase])

  const join = useCallback((p: JoinPayload) => socket.current?.emit('join', p), [])
  const send = useCallback((text: string) => socket.current?.emit('msg', text), [])
  const vote = useCallback((yes: boolean) => socket.current?.emit('vote', yes), [])
  const waking = useWaking(connected)

  return { view, connected, waking, join, send, vote }
}

export function usePresenter(key: string | null) {
  const [view, setView] = useState<PresenterView | null>(null)
  const [denied, setDenied] = useState(false)
  const [connected, setConnected] = useState(false)
  const socket = useRef<Socket | null>(null)

  useEffect(() => {
    const s = connect()
    socket.current = s
    s.on('connect', () => {
      setConnected(true)
      s.emit('presenter:hello', key ?? undefined)
    })
    s.on('disconnect', () => setConnected(false))
    s.on('presenter', (v: PresenterView) => setView(v))
    s.on('presenter:denied', () => setDenied(true))
    return () => {
      s.close()
    }
  }, [key])

  // Mientras esta pantalla esté abierta, el pong de Socket.IO cada 10s cuenta como
  // tráfico entrante y Render free no duerme el servicio. Abrila al llegar al venue.
  const waking = useWaking(connected)

  return {
    view,
    denied,
    connected,
    waking,
    bell: () => socket.current?.emit('presenter:bell'),
    reset: (hard: boolean) => socket.current?.emit('presenter:reset', hard),
    addBots: (n: number) => socket.current?.emit('presenter:bots', n),
  }
}

/** Reloj local a 100ms. Sirve para animaciones que el tick de 1s del servidor no cubre. */
export function useNow(intervalMs = 100) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
