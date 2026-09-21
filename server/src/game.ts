// El motor. Un solo proceso es la autoridad del reloj, del emparejamiento y del IEC.
// Todo el estado vive en memoria y muere con el evento — eso es coherente con el producto.

import type { Server } from 'socket.io'
import {
  AXES,
  BLINK_COUNTDOWN_SECONDS,
  GENDERS,
  REVEAL_MS,
  SEEKINGS,
  VERDICT_SECONDS,
  type Audit,
  type FeedEvent,
  type Gender,
  type JoinPayload,
  type Msg,
  type PlayerView,
  type PresenterView,
  type RoomView,
  type Seeking,
  type Summary,
} from '../../shared/types.js'
import { matchAll, type Profile } from './matcher.js'
import {
  DELAY_CAP_SEC,
  DELAY_IEC_PER_SEC,
  ESCAPE_IEC_PER_SEC,
  IEC_START,
  scoreMessage,
} from '../../shared/iec.js'
import {
  bank,
  botDelayMs,
  botLine,
  experimentalOpener,
  makeAudit,
  makeOpener,
  pickPersona,
} from './auditor.js'

let seq = 0
const uid = (p: string) => `${p}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`

interface Player {
  id: string
  nick: string
  contact: string
  axes: number[]
  gender: Gender
  seeking: Seeking
  iec: number
  roomId: string | null
  isBot: boolean
  /** Solo bots: qué arquetipo le tocó. Ver PERSONA_WEIGHTS en auditor.ts. */
  persona: string | null
  connected: boolean
  away: boolean
  awaySince: number | null
  stats: { sent: number; chars: number; longestMsg: number; awaySec: number; maxIdle: number }
}

interface Room {
  id: string
  members: [string, string]
  incompat: number
  clash: string
  /** No se pudo respetar lo que pidieron: Programa Experimental. */
  experimental: boolean
  messages: Msg[]
  audits: Audit[]
  /** Cuándo empezó a deber respuesta cada uno. null = no debe nada. */
  owedSince: Record<string, number | null>
  msgsSinceAudit: number
  votes: Record<string, boolean | undefined>
  startedAt: number
}

type GamePhase = PresenterView['phase']

export class Game {
  private players = new Map<string, Player>()
  private rooms = new Map<string, Room>()
  private feed: FeedEvent[] = []
  private timers = new Set<NodeJS.Timeout>()

  private phase: GamePhase = 'lobby'
  private phaseEndsAt = 0
  private revealAt = 0
  private totals = { messages: 0, chars: 0, audits: 0, escapes: 0 }

  constructor(
    private io: Server,
    private opts: { roundSeconds: number; joinUrl: string },
  ) {}

  // ---------------------------------------------------------------- ciclo de vida

  /** La campanada. Todos son emparejados en el mismo instante. */
  bell() {
    if (this.phase !== 'lobby') return
    // Se empareja a todo el que esté libre, bots de relleno incluidos.
    const waiting = [...this.players.values()].filter((p) => p.connected && !p.roomId)
    if (waiting.filter((p) => !p.isBot).length === 0) return

    const { pairs, leftover } = matchAll(waiting.map((p) => this.profileOf(p)))

    for (const pair of pairs) {
      this.openRoom(pair.a, pair.b, pair.incompat, pair.clash, pair.experimental)
    }

    // Nadie se queda sin match: al impar le toca un bot, y el bot nace con el género que
    // esa persona pidió. El sistema nunca admite que no tenía a nadie.
    for (const orphan of leftover) {
      const p = this.players.get(orphan)!
      const bot = this.spawnBot(p)
      const { pairs: bp } = matchAll([this.profileOf(p), this.profileOf(bot)])
      const pr = bp[0]
      this.openRoom(
        p.id,
        bot.id,
        pr?.incompat ?? 88,
        pr?.clash ?? `${p.nick} vino a conocer gente. ${bot.nick} no.`,
        pr?.experimental ?? false,
      )
    }

    this.phase = 'live'
    this.phaseEndsAt = Date.now() + this.opts.roundSeconds * 1000
    const experimental = pairs.filter((p) => p.experimental).length
    if (experimental > 0) {
      this.pushFeed(
        experimental === 1
          ? '1 pareja entró al Programa Experimental.'
          : `${experimental} parejas entraron al Programa Experimental.`,
        'bad',
      )
    }
    this.pushFeed(`Campanada. ${this.rooms.size} parejas iniciaron sus 90 segundos.`, 'neutral')
    this.pushAll()
  }

  /** Vuelve todo a cero para una segunda ronda. Los jugadores conservan su IEC. */
  reset(hard = false) {
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    this.rooms.clear()
    this.phase = 'lobby'
    this.phaseEndsAt = 0
    this.revealAt = 0

    for (const [id, p] of this.players) {
      if (p.isBot) {
        this.players.delete(id)
        continue
      }
      p.roomId = null
      p.away = false
      p.awaySince = null
      if (hard) {
        p.iec = IEC_START
        p.stats = { sent: 0, chars: 0, longestMsg: 0, awaySec: 0, maxIdle: 0 }
      }
    }
    if (hard) {
      this.feed = []
      this.totals = { messages: 0, chars: 0, audits: 0, escapes: 0 }
    }
    this.pushFeed(hard ? 'Sesión reiniciada.' : 'Nueva ronda disponible.', 'neutral')
    this.pushAll()
  }

  /** Lo que el matcher necesita saber de alguien. */
  private profileOf(p: Player): Profile {
    return { id: p.id, nick: p.nick, axes: p.axes, gender: p.gender, seeking: p.seeking }
  }

  private openRoom(aId: string, bId: string, incompat: number, clash: string, experimental = false) {
    const a = this.players.get(aId)
    const b = this.players.get(bId)
    if (!a || !b) return

    const room: Room = {
      id: uid('r'),
      members: [aId, bId],
      incompat,
      clash,
      experimental,
      messages: [],
      audits: [],
      // Tras el rompehielos los dos deben respuesta: el contador de demora corre desde el segundo 1.
      owedSince: { [aId]: Date.now(), [bId]: Date.now() },
      msgsSinceAudit: 0,
      votes: {},
      startedAt: Date.now(),
    }
    this.rooms.set(room.id, room)
    a.roomId = room.id
    b.roomId = room.id

    if (experimental) {
      // Acá no interviene ningún modelo: si el sistema no cumplió con lo que pidieron,
      // el aviso tiene que decir exactamente lo que dice y llegar de una.
      room.audits.push({ id: uid('a'), target: '*', text: experimentalOpener(), delta: 0, ts: Date.now() })
    } else {
      // El rompehielos puede tardar (si Gemini está activo): la sala ya funciona sin él.
      void makeOpener(a.nick, b.nick, incompat, clash).then((text) => {
        if (!this.rooms.has(room.id)) return
        room.audits.push({ id: uid('a'), target: '*', text, delta: 0, ts: Date.now() })
        this.pushRoom(room)
      })
    }

    if (b.isBot) this.scheduleBot(room.id, bId)
  }

  // ---------------------------------------------------------------- jugadores

  join(id: string, payload: JoinPayload) {
    const nick = (payload.nick || '').trim().slice(0, 18) || 'Anónimo'
    const contact = (payload.contact || '').trim().slice(0, 40) || 'no dejó contacto'
    const axes = AXES.map((_, i) => clamp(Number(payload.axes?.[i] ?? 50), 0, 100))
    // El cliente no deja entrar sin elegir las dos cosas. Esto es para payloads rotos:
    // ante la duda, lo más permisivo, que es lo que más parejas correctas produce.
    const gender: Gender = GENDERS.some((g) => g.id === payload.gender) ? payload.gender : 'nobinario'
    const seeking: Seeking = SEEKINGS.some((s) => s.id === payload.seeking) ? payload.seeking : 'todos'

    this.players.set(id, {
      id,
      nick,
      contact,
      axes,
      gender,
      seeking,
      iec: IEC_START,
      roomId: null,
      isBot: false,
      persona: null,
      connected: true,
      away: false,
      awaySince: null,
      stats: { sent: 0, chars: 0, longestMsg: 0, awaySec: 0, maxIdle: 0 },
    })
    this.pushFeed(`${nick} completó el perfilado.`, 'neutral')
    this.pushAll()
  }

  leave(id: string) {
    const p = this.players.get(id)
    if (!p) return
    p.connected = false
    // Desconectarse a mitad de la hora es la forma más pura de abandono.
    if (p.roomId && this.phase === 'live') {
      p.away = true
      p.awaySince ??= Date.now()
      this.pushFeed(`${p.nick} abandonó la conversación. El sistema lo registra.`, 'bad')
    } else {
      this.players.delete(id)
    }
    this.pushAll()
  }

  setAway(id: string, away: boolean) {
    const p = this.players.get(id)
    if (!p || p.away === away) return
    p.away = away
    if (away) {
      p.awaySince = Date.now()
      this.totals.escapes++
      this.pushFeed(`${p.nick} minimizó la aplicación.`, 'bad')
    } else {
      const sec = p.awaySince ? Math.round((Date.now() - p.awaySince) / 1000) : 0
      p.awaySince = null
      if (sec >= 3) this.pushFeed(`${p.nick} volvió después de ${sec}s.`, 'neutral')
    }
    this.pushRoomOf(p)
  }

  message(id: string, raw: string) {
    const p = this.players.get(id)
    if (!p || !p.roomId || this.phase !== 'live') return
    const room = this.rooms.get(p.roomId)
    if (!room) return

    const text = raw.trim().slice(0, 500)
    if (!text) return

    const breakdown = scoreMessage(text)
    p.iec = Math.max(0, p.iec + breakdown.total)
    p.stats.sent++
    p.stats.chars += text.length
    p.stats.longestMsg = Math.max(p.stats.longestMsg, text.length)
    this.totals.messages++
    this.totals.chars += text.length

    const msg: Msg = { id: uid('m'), from: id, nick: p.nick, text, ts: Date.now(), delta: breakdown.total }
    room.messages.push(msg)

    // Dejás de deber, y el otro pasa a deber.
    const peerId = this.peerOf(room, id)
    const owed = room.owedSince[id]
    if (owed) {
      const idle = Math.round((Date.now() - owed) / 1000)
      p.stats.maxIdle = Math.max(p.stats.maxIdle, idle)
    }
    room.owedSince[id] = null
    room.owedSince[peerId] = Date.now()

    if (breakdown.level === 'danger') {
      this.pushFeed(`${p.nick} escribió ${text.length} caracteres. ${breakdown.label}.`, 'bad')
    } else if (breakdown.level === 'elite') {
      this.pushFeed(`${p.nick}: ${text.length} caracteres. Comunicación de alto valor.`, 'good')
    }

    room.msgsSinceAudit++
    this.pushRoom(room)

    // Auditoría cada 3 mensajes. Auditar todo mata el chiste.
    if (room.msgsSinceAudit >= 3) {
      room.msgsSinceAudit = 0
      const elapsed = Math.max(1, Math.round((Date.now() - room.startedAt) / 1000))
      void makeAudit(text, breakdown, elapsed).then((audit) => {
        if (!audit || !this.rooms.has(room.id)) return
        p.iec = Math.max(0, p.iec + audit.delta)
        room.audits.push({ id: uid('a'), target: id, text: audit.text, delta: audit.delta, ts: Date.now() })
        this.totals.audits++
        this.pushFeed(
          `Auditoría sobre ${p.nick}: ${audit.delta > 0 ? '+' : ''}${audit.delta} IEC.`,
          audit.delta > 0 ? 'good' : 'bad',
        )
        this.pushRoom(room)
      })
    }

    const peer = this.players.get(peerId)
    if (peer?.isBot) this.scheduleBot(room.id, peerId)
  }

  vote(id: string, yes: boolean) {
    const p = this.players.get(id)
    if (!p?.roomId || this.phase !== 'verdict') return
    const room = this.rooms.get(p.roomId)
    if (!room) return
    room.votes[id] = yes
    this.pushRoom(room)
  }

  // ---------------------------------------------------------------- bots

  /**
   * Bot de relleno. Si se le dice a quién va a acompañar, nace con un género que cumple
   * lo que esa persona pidió: el sistema prefiere fabricar el match exacto antes que
   * admitir que no tenía a nadie. Buscan a todos, porque un bot no tiene criterio.
   */
  private spawnBot(forWhom?: Player): Player {
    const names = ['Cami', 'Nico', 'Flor', 'Tomi', 'Juli', 'Agus', 'Sol', 'Fede', 'Mica', 'Lauti']
    const bot: Player = {
      id: uid('bot'),
      nick: `${names[Math.floor(Math.random() * names.length)]}`,
      contact: '@cuenta_privada',
      axes: AXES.map(() => Math.round(Math.random() * 100)),
      gender: genderFor(forWhom?.seeking),
      seeking: 'todos',
      iec: IEC_START,
      roomId: null,
      isBot: true,
      persona: pickPersona(),
      connected: true,
      away: false,
      awaySince: null,
      stats: { sent: 0, chars: 0, longestMsg: 0, awaySec: 0, maxIdle: 0 },
    }
    this.players.set(bot.id, bot)
    return bot
  }

  /** Cada persona de bot tiene su propio ritmo. El fantasma no se agenda nunca. */
  private scheduleBot(roomId: string, botId: string) {
    const persona = this.players.get(botId)?.persona ?? 'monosilabo'
    const delay = botDelayMs(persona)
    if (delay === null) return

    const t = setTimeout(() => {
      this.timers.delete(t)
      const room = this.rooms.get(roomId)
      const bot = this.players.get(botId)
      if (!room || !bot || this.phase !== 'live') return

      const text = botLine(persona)
      if (text === null) return
      const breakdown = scoreMessage(text)
      bot.iec = Math.max(0, bot.iec + breakdown.total)
      bot.stats.sent++
      bot.stats.chars += text.length
      this.totals.messages++
      this.totals.chars += text.length

      room.messages.push({ id: uid('m'), from: botId, nick: bot.nick, text, ts: Date.now(), delta: breakdown.total })
      room.owedSince[botId] = null
      room.owedSince[this.peerOf(room, botId)] = Date.now()
      this.pushRoom(room)
    }, delay)
    this.timers.add(t)
  }

  // ---------------------------------------------------------------- tick

  tick() {
    const now = Date.now()

    if (this.phase === 'live') {
      for (const room of this.rooms.values()) {
        for (const pid of room.members) {
          const p = this.players.get(pid)
          if (!p) continue

          // Demora Certificada: cada segundo que no respondés suma.
          const owed = room.owedSince[pid]
          if (owed && (now - owed) / 1000 <= DELAY_CAP_SEC) {
            p.iec += DELAY_IEC_PER_SEC
          }
          // Fuga: cada segundo fuera de la pestaña cuesta.
          if (p.away) {
            p.iec = Math.max(0, p.iec + ESCAPE_IEC_PER_SEC)
            p.stats.awaySec++
          }
        }
      }
      if (now >= this.phaseEndsAt) {
        this.phase = 'verdict'
        this.phaseEndsAt = now + VERDICT_SECONDS * 1000
        // Los bots siempre dicen que sí. Así, quien cayó con un bot igual llega al
        // Contacto Efímero — que es el remate de la presentación y nadie se lo puede perder.
        for (const room of this.rooms.values()) {
          for (const pid of room.members) {
            if (this.players.get(pid)?.isBot) room.votes[pid] = true
          }
        }
        this.pushFeed('Tiempo cumplido. Ventana de interés abierta.', 'neutral')
      }
    } else if (this.phase === 'verdict' && now >= this.phaseEndsAt) {
      this.phase = 'blink'
      this.revealAt = now + BLINK_COUNTDOWN_SECONDS * 1000
      this.phaseEndsAt = this.revealAt + REVEAL_MS + 3000
      this.pushFeed('Contacto Efímero en curso.', 'neutral')
    } else if (this.phase === 'blink' && now >= this.phaseEndsAt) {
      this.phase = 'results'
      this.pushFeed('Sesión cerrada. Gracias por su tiempo.', 'neutral')
    }

    this.pushAll()
  }

  // ---------------------------------------------------------------- vistas

  private peerOf(room: Room, id: string): string {
    return room.members[0] === id ? room.members[1] : room.members[0]
  }

  private remaining(): number {
    if (this.phase === 'lobby' || this.phase === 'results') return 0
    return Math.max(0, Math.ceil((this.phaseEndsAt - Date.now()) / 1000))
  }

  private roomView(room: Room, me: string): RoomView {
    const peerId = this.peerOf(room, me)
    const peer = this.players.get(peerId)
    const now = Date.now()
    const owed = room.owedSince[me]
    const mutual = room.votes[room.members[0]] === true && room.votes[room.members[1]] === true

    return {
      id: room.id,
      peerNick: peer?.nick ?? '—',
      incompat: room.incompat,
      clash: room.clash,
      experimental: room.experimental,
      messages: room.messages.slice(-60),
      audits: room.audits.slice(-8),
      remaining: this.remaining(),
      peerAway: peer?.away && peer.awaySince ? Math.round((now - peer.awaySince) / 1000) : 0,
      owedFor: owed ? Math.round((now - owed) / 1000) : 0,
      voted: room.votes[me] !== undefined,
      mutual: this.phase === 'blink' || this.phase === 'results' ? mutual : undefined,
    }
  }

  private playerView(p: Player): PlayerView {
    const room = p.roomId ? this.rooms.get(p.roomId) : null
    const phase =
      this.phase === 'lobby' ? 'waiting'
      : this.phase === 'results' ? 'done'
      : (this.phase as PlayerView['phase'])

    const view: PlayerView = {
      id: p.id,
      nick: p.nick,
      phase,
      iec: Math.round(p.iec),
      lobbyCount: [...this.players.values()].filter((x) => !x.isBot && x.connected).length,
      room: room ? this.roomView(room, p.id) : undefined,
    }

    if (this.phase === 'blink' && room) {
      const mutual = room.votes[room.members[0]] === true && room.votes[room.members[1]] === true
      const peer = this.players.get(this.peerOf(room, p.id))
      view.reveal = mutual && peer ? peer.contact : null
      // El cliente usa este timestamp para el parpadeo de 1000ms exactos:
      // el tick del servidor es de 1s y no tiene la resolución necesaria.
      view.revealAt = this.revealAt
    }

    if (this.phase === 'results') view.summary = this.summaryFor(p)
    return view
  }

  private summaryFor(p: Player): Summary {
    const ranked = this.ranked()
    const rank = ranked.findIndex((x) => x.id === p.id) + 1
    const room = p.roomId ? this.rooms.get(p.roomId) : null
    const mutual = room ? room.votes[room.members[0]] === true && room.votes[room.members[1]] === true : false

    let title = 'Usuario estándar'
    if (p.stats.sent === 0) title = bank.titles.ghost.name
    else if (rank === 1) title = bank.titles.top.name
    else if (rank === ranked.length && ranked.length > 2) title = bank.titles.bottom.name
    else if (p.stats.longestMsg > 140) title = bank.titles.novelist.name
    else if (p.stats.awaySec > 10) title = bank.titles.escapist.name
    else if (p.stats.maxIdle > 40) title = bank.titles.silent.name

    return {
      iec: Math.round(p.iec),
      rank: rank || ranked.length,
      total: ranked.length,
      sent: p.stats.sent,
      chars: p.stats.chars,
      title,
      mutual,
    }
  }

  private ranked(): Player[] {
    return [...this.players.values()].filter((p) => p.connected || p.roomId).sort((a, b) => b.iec - a.iec)
  }

  private awards() {
    const all = this.ranked()
    if (all.length === 0) return []
    const out: PresenterView['awards'] = []
    const by = <K extends keyof Player['stats']>(k: K) =>
      [...all].sort((a, b) => (b.stats[k] as number) - (a.stats[k] as number))[0]

    const top = all[0]
    if (top) out.push({ title: bank.titles.top.name, nick: top.nick, detail: `${Math.round(top.iec)} IEC` })

    const worst = all[all.length - 1]
    if (worst && all.length > 2 && worst.id !== top?.id)
      out.push({ title: bank.titles.bottom.name, nick: worst.nick, detail: `${Math.round(worst.iec)} IEC` })

    const novelist = by('longestMsg')
    if ((novelist?.stats.longestMsg ?? 0) > 80)
      out.push({ title: bank.titles.novelist.name, nick: novelist.nick, detail: `${novelist.stats.longestMsg} caracteres en un mensaje` })

    const fugitive = by('awaySec')
    if ((fugitive?.stats.awaySec ?? 0) > 3)
      out.push({ title: bank.titles.escapist.name, nick: fugitive.nick, detail: `${fugitive.stats.awaySec}s fuera de la app` })

    const silent = by('maxIdle')
    if ((silent?.stats.maxIdle ?? 0) > 20)
      out.push({ title: bank.titles.silent.name, nick: silent.nick, detail: `${silent.stats.maxIdle}s sin responder` })

    const ghost = all.find((p) => p.stats.sent === 0 && !p.isBot)
    if (ghost) out.push({ title: bank.titles.ghost.name, nick: ghost.nick, detail: 'Cero mensajes enviados' })

    return out
  }

  presenterView(): PresenterView {
    const humans = [...this.players.values()].filter((p) => !p.isBot)
    const bots = [...this.players.values()].filter((p) => p.isBot)
    return {
      phase: this.phase,
      joinUrl: this.opts.joinUrl,
      lobbyCount: humans.filter((p) => p.connected).length,
      roomCount: this.rooms.size,
      humanCount: humans.length,
      botCount: bots.length,
      remaining: this.remaining(),
      leaderboard: this.ranked().slice(0, 12).map((p) => ({ nick: p.nick, iec: Math.round(p.iec), isBot: p.isBot })),
      // Todo lo que retenemos: el panel scrollea, así que recortar acá era recortar
      // historia que el presentador sí puede querer mirar.
      feed: this.feed.slice(0, 40),
      awards: this.phase === 'results' ? this.awards() : [],
      totals: { ...this.totals },
    }
  }

  // ---------------------------------------------------------------- emisión

  private pushFeed(text: string, tone: FeedEvent['tone']) {
    this.feed.unshift({ id: uid('f'), text, tone, ts: Date.now() })
    this.feed = this.feed.slice(0, 40)
  }

  private pushPlayer(p: Player) {
    if (p.isBot || !p.connected) return
    this.io.to(p.id).emit('state', this.playerView(p))
  }

  private pushRoom(room: Room) {
    for (const id of room.members) {
      const p = this.players.get(id)
      if (p) this.pushPlayer(p)
    }
  }

  private pushRoomOf(p: Player) {
    const room = p.roomId ? this.rooms.get(p.roomId) : null
    if (room) this.pushRoom(room)
    else this.pushPlayer(p)
  }

  pushAll() {
    for (const p of this.players.values()) this.pushPlayer(p)
    this.io.to('presenter').emit('presenter', this.presenterView())
  }

  /** Para el modo simulación: mete N bots humanoides en el lobby. */
  seedBots(n: number) {
    for (let i = 0; i < n; i++) this.spawnBot()
    this.pushFeed(`${n} perfiles adicionales ingresaron al sistema.`, 'neutral')
    this.pushAll()
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 50
}

/**
 * Género para un bot. Con una búsqueda concreta devuelve exactamente lo que se pidió;
 * sin ella sortea. La proporción no es un dato demográfico: está elegida para que una
 * tanda de bots alcance a cubrir las tres búsquedas posibles.
 */
function genderFor(seeking?: Seeking): Gender {
  if (seeking === 'mujeres') return 'mujer'
  if (seeking === 'hombres') return 'hombre'
  const r = Math.random()
  return r < 0.45 ? 'mujer' : r < 0.9 ? 'hombre' : 'nobinario'
}
