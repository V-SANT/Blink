import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PlayerView } from '../../../shared/types'
import { scoreMessage } from '../../../shared/iec'
import { playAlarm, playPenalty, playReward, playTick } from '../sound'
import { useKeyboardInset } from '../useKeyboard'

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Debajo de esta distancia del final consideramos que estás mirando lo último. */
const NEAR_BOTTOM = 120
/** Alto máximo del composer: ~4 líneas, como WhatsApp. Después scrollea adentro. */
const COMPOSER_MAX = 108

export function Room({ view, onSend }: { view: PlayerView; onSend: (t: string) => void }) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const room = view.room

  // Si te tocó entrar sin sala (llegaste tarde a la ronda) esta pantalla no dibuja nada:
  // tampoco hay que tomarle el scroll al documento.
  const kb = useKeyboardInset(!!room)

  // Misma heurística que el servidor, corriendo local: la barra se mueve mientras tipeás,
  // sin esperar la red. Ese movimiento en vivo es el chiste.
  const projected = useMemo(() => scoreMessage(draft), [draft])

  const timeline = useMemo(() => {
    if (!room) return []
    return [
      ...room.messages.map((m) => ({ kind: 'msg' as const, ts: m.ts, data: m })),
      ...room.audits.map((a) => ({ kind: 'audit' as const, ts: a.ts, data: a })),
    ].sort((x, y) => x.ts - y.ts)
  }, [room])

  // ¿Está mirando el final? Mientras sea true lo mantenemos pegado abajo. Si subió a
  // releer algo, no le movemos la vista de abajo del dedo: se lo avisamos con la píldora.
  const pinned = useRef(true)
  const [unread, setUnread] = useState(0)
  /** Ventana en la que los eventos de scroll son nuestros y no del dedo del usuario. */
  const quiet = useRef(0)

  const stick = useCallback((smooth = false) => {
    const el = listRef.current
    if (!el) return
    // Con la pestaña oculta no hay frames: una animación suave nunca arranca y la lista
    // queda a mitad de camino. Ahí, y en saltos largos, va instantáneo.
    const soft =
      smooth &&
      document.visibilityState === 'visible' &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 600
    pinned.current = true
    quiet.current = performance.now() + (soft ? 500 : 80)
    el.scrollTo({ top: el.scrollHeight, behavior: soft ? 'smooth' : 'auto' })
  }, [])

  const onScroll = useCallback(() => {
    const el = listRef.current
    // Sin esta guarda, el scroll que dispara la animación se lee como "se fue a leer
    // más arriba" y aparece la píldora sola en el medio de una conversación normal.
    if (!el || performance.now() < quiet.current) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    if (pinned.current) setUnread(0)
  }, [])

  // Mensajes nuevos: al final si estabas al final, contador si no. La primera vez salta
  // sin animación — nadie tiene que ver la conversación desplazarse al entrar.
  const seen = useRef(0)
  useLayoutEffect(() => {
    const n = timeline.length
    if (n === seen.current) return
    const added = n - seen.current
    const first = seen.current === 0
    seen.current = n
    if (pinned.current) stick(!first)
    else setUnread((u) => u + added)
  }, [timeline.length, stick])

  // El momento del bug: al abrir el teclado la lista se achica. Si estabas al final te
  // dejamos al final, con el último mensaje justo arriba del teclado.
  useLayoutEffect(() => {
    if (pinned.current) stick(false)
  }, [kb, stick])

  // El composer crece con el texto (1 → 4 líneas) y la conversación se corre con él.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    ta.style.height = `${Math.min(ta.scrollHeight, COMPOSER_MAX)}px`
    if (pinned.current) stick(false)
  }, [draft, stick])

  // Tick del reloj en los últimos 10 segundos, más urgente en los últimos 5.
  const lastTick = useRef(0)
  useEffect(() => {
    const r = room?.remaining ?? 0
    if (r > 0 && r <= 10 && r !== lastTick.current) {
      lastTick.current = r
      playTick(r <= 5)
    }
  }, [room?.remaining])

  // Alarma cuando el otro se va. Suena una sola vez por fuga, no en cada tick.
  const wasAway = useRef(false)
  useEffect(() => {
    const away = (room?.peerAway ?? 0) > 0
    if (away && !wasAway.current) playAlarm()
    wasAway.current = away
  }, [room?.peerAway])

  // Buzzer (o premio) cuando llega una auditoría nueva que te apunta a vos.
  const lastAudit = useRef<string | null>(null)
  useEffect(() => {
    const a = room?.audits.at(-1)
    if (!a || a.id === lastAudit.current) return
    if (lastAudit.current !== null && a.target === view.id) {
      if (a.delta < 0) playPenalty()
      else if (a.delta > 0) playReward()
    }
    lastAudit.current = a.id
  }, [room?.audits, view.id])

  if (!room) return null

  const submit = () => {
    const t = draft.trim()
    if (!t) return
    onSend(t)
    setDraft('')
    pinned.current = true
    setUnread(0)
    // Enviar no cierra el teclado, como en cualquier chat que la gente ya sabe usar.
    taRef.current?.focus()
  }

  // Ancho de la barra: cuánto "margen" te queda antes de que el mensaje sea un problema.
  const fill = Math.max(4, Math.min(100, 100 - (draft.length / 180) * 100))

  return (
    <div className={`room${kb > 0 ? ' kb' : ''}`}>
      {room.peerAway > 0 && (
        <div className="escape">
          <h2>TU MATCH MINIMIZÓ LA APLICACIÓN</h2>
          <div className="count">{mmss(room.peerAway)}</div>
          <p>Se lo estamos descontando del puntaje. No es tu culpa.</p>
        </div>
      )}

      <div className="room-head">
        <div className="room-meta">
          <div>
            <div className="peer">{room.peerNick}</div>
            <div className="incompat">INCOMPATIBILIDAD {room.incompat}%</div>
            {room.experimental && <div className="exp-tag">PROGRAMA EXPERIMENTAL</div>}
          </div>
          <div className={`clock ${room.remaining <= 15 ? 'urgent' : ''}`}>{mmss(room.remaining)}</div>
        </div>
        <div className="clash">{room.clash}</div>

        <div className="iec-bar">
          <div className="iec-top">
            <span>IEC {view.iec}</span>
            <span className={projected.total >= 0 ? 'lv-elite' : 'lv-danger'} style={{ fontFamily: 'var(--mono)' }}>
              {draft.length > 0 ? `${projected.total >= 0 ? '+' : ''}${projected.total}` : ''}
            </span>
          </div>
          <div className="iec-track">
            <div className={`iec-fill lv-${projected.level}`} style={{ width: `${fill}%` }} />
          </div>
          {projected.label && <div className={`iec-label lv-${projected.level}`}>{projected.label}</div>}
        </div>
      </div>

      <div className="thread">
        <div
          className="msgs"
          ref={listRef}
          onScroll={onScroll}
          // El dedo siempre gana: tocar la lista cancela la guarda de scroll propio.
          onTouchStart={() => (quiet.current = 0)}
        >
          {timeline.map((item, i) => {
            if (item.kind !== 'msg') {
              return (
                <div key={item.data.id} className="audit">
                  <div className="audit-head">AUDITOR BLINK</div>
                  {item.data.text}
                  {item.data.delta !== 0 && (
                    <div className={`audit-delta ${item.data.delta > 0 ? 'good' : ''}`}>
                      {item.data.target === view.id ? 'Vos: ' : `${room.peerNick}: `}
                      {item.data.delta > 0 ? '+' : ''}
                      {item.data.delta} IEC
                    </div>
                  )}
                </div>
              )
            }
            // Mensajes seguidos del mismo lado se agrupan: juntos y con la punta solo
            // en el último, como en cualquier chat.
            const prev = timeline[i - 1]
            const next = timeline[i + 1]
            const mine = item.data.from === view.id
            const cont = prev?.kind === 'msg' && prev.data.from === item.data.from
            const tail = !(next?.kind === 'msg' && next.data.from === item.data.from)
            return (
              <div
                key={item.data.id}
                className={`bubble ${mine ? 'me' : 'them'}${cont ? ' cont' : ''}${tail ? ' tail' : ''}`}
              >
                {item.data.text}
                {mine && item.data.delta !== 0 && (
                  <div className="bubble-delta">
                    {item.data.delta > 0 ? '+' : ''}
                    {item.data.delta} IEC
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {unread > 0 && (
          <button
            className="jump"
            onClick={() => {
              setUnread(0)
              pinned.current = true
              stick(true)
            }}
          >
            ↓ {unread} nuevo{unread > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {room.owedFor > 3 && (
        <div className="owed">
          Llevás {room.owedFor}s sin responder. <strong>+{Math.min(room.owedFor, 90) * 2} IEC.</strong> Seguí así.
        </div>
      )}

      <div className="composer">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => {
            if (pinned.current) stick(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Sé breve."
          maxLength={500}
          enterKeyHint="send"
        />
        <button
          className="send"
          // Sin esto el tap roba el foco del textarea y el teclado hace el parpadeo feo.
          onPointerDown={(e) => e.preventDefault()}
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Enviar"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
