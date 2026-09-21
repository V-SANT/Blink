// Tipos compartidos entre server y client. Solo tipos: no emite nada en runtime.

export type Phase = 'join' | 'waiting' | 'live' | 'verdict' | 'blink' | 'done'

/** Los 5 ejes del Perfilado de Vulnerabilidad. El valor va de 0 a 100. */
export interface Axis {
  id: string
  left: string
  right: string
  /** Cómo se describe a alguien parado en el extremo izquierdo: "Sofía planifica todo." */
  leftVerb: string
  rightVerb: string
}

export const AXES: Axis[] = [
  { id: 'plan', left: 'Planifico todo', right: 'Improviso todo', leftVerb: 'planifica todo', rightVerb: 'improvisa todo' },
  { id: 'noise', left: 'Necesito silencio', right: 'Necesito ruido', leftVerb: 'necesita silencio', rightVerb: 'necesita ruido' },
  { id: 'irony', left: 'Hablo en ironía', right: 'Hablo en serio', leftVerb: 'habla en ironía', rightVerb: 'habla en serio' },
  { id: 'pets', left: 'Gato', right: 'Perro', leftVerb: 'es de gatos', rightVerb: 'es de perros' },
  { id: 'ex', left: 'Ya superé a mi ex', right: 'Definitivamente no', leftVerb: 'ya superó a su ex', rightVerb: 'no superó a su ex' },
]

/**
 * Género y búsqueda. Se piden como en cualquier app de citas — y el sistema los usa de
 * verdad: primero arma todas las parejas que respetan lo que cada uno pidió. Recién
 * cuando no da, junta a los que sobraron y lo llama Programa Experimental.
 */
export type Gender = 'mujer' | 'hombre' | 'nobinario'
export type Seeking = 'mujeres' | 'hombres' | 'todos'

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'mujer', label: 'Mujer' },
  { id: 'hombre', label: 'Hombre' },
  { id: 'nobinario', label: 'No binario' },
]

export const SEEKINGS: { id: Seeking; label: string }[] = [
  { id: 'mujeres', label: 'Mujeres' },
  { id: 'hombres', label: 'Hombres' },
  { id: 'todos', label: 'Todos' },
]

/** ¿Una búsqueda acepta a alguien de este género? */
export function accepts(seeking: Seeking, gender: Gender): boolean {
  if (seeking === 'todos') return true
  if (seeking === 'mujeres') return gender === 'mujer'
  return gender === 'hombre'
}

export interface Msg {
  id: string
  from: string
  nick: string
  text: string
  ts: number
  /** Cuanto IEC costo (o gano) este mensaje. */
  delta: number
}

export interface Audit {
  id: string
  /** A quien apunta la auditoria. */
  target: string
  text: string
  delta: number
  ts: number
}

/** Lo que el jugador ve de si mismo. El servidor manda esto entero en cada cambio. */
export interface PlayerView {
  id: string
  nick: string
  phase: Phase
  iec: number
  /** Sólo en fase live/verdict/blink. */
  room?: RoomView
  /** Cuántos jugadores hay esperando la campanada. */
  lobbyCount?: number
  /** El contacto del match, revelado durante 1000ms exactos. */
  reveal?: string | null
  /** Timestamp en el que arranca el parpadeo. El cliente lo usa para clavar los 1000ms. */
  revealAt?: number
  /** Resumen final. */
  summary?: Summary
}

export interface RoomView {
  id: string
  peerNick: string
  /** 0-100. Cuanto más alto, mejor "potencial de crecimiento personal". */
  incompat: number
  clash: string
  messages: Msg[]
  audits: Audit[]
  /** Segundos que quedan en la fase actual. */
  remaining: number
  /** El peer se fue de la pestaña. Segundos que lleva afuera. */
  peerAway: number
  /** Segundos que llevás sin responder un mensaje pendiente. 0 si no debés nada. */
  owedFor: number
  /** El sistema no pudo respetar lo que pidieron y los juntó igual. */
  experimental: boolean
  /** Ya votaste interés. */
  voted: boolean
  /** Resultado del voto, solo en fase blink/done. */
  mutual?: boolean
}

export interface Summary {
  iec: number
  rank: number
  total: number
  sent: number
  chars: number
  /** El título que se ganó en el Wall of Shame. */
  title: string
  mutual: boolean
}

export interface LeaderRow {
  nick: string
  iec: number
  isBot: boolean
}

export interface FeedEvent {
  id: string
  text: string
  tone: 'good' | 'bad' | 'neutral'
  ts: number
}

/** Lo que ve la pantalla del proyector. */
export interface PresenterView {
  phase: 'lobby' | 'live' | 'verdict' | 'blink' | 'results'
  joinUrl: string
  lobbyCount: number
  roomCount: number
  humanCount: number
  botCount: number
  remaining: number
  leaderboard: LeaderRow[]
  feed: FeedEvent[]
  awards: { title: string; nick: string; detail: string }[]
  /** Total de mensajes y caracteres de toda la sala. */
  totals: { messages: number; chars: number; audits: number; escapes: number }
}

export interface JoinPayload {
  nick: string
  contact: string
  axes: number[]
  gender: Gender
  seeking: Seeking
}

/** Duración de la "hora Blink", comprimida. Configurable por env en el server. */
export const DEFAULT_ROUND_SECONDS = 90
export const VERDICT_SECONDS = 15
export const BLINK_COUNTDOWN_SECONDS = 3
/** El parpadeo. Milisegundos exactos. No tocar: es el nombre del proyecto. */
export const REVEAL_MS = 1000
