// Índice de Eficiencia Comunicacional.
//
// Premia la brevedad y la demora. Penaliza el apego, la curiosidad y el entusiasmo.
// La heurística corre idéntica en cliente y servidor: el cliente la usa para mover la
// barra mientras tipeás (latencia 0), el servidor la recalcula al recibir el mensaje
// y su numero es el que vale.

export const IEC_START = 1000

/** Frases que delatan a alguien que se está involucrando emocionalmente. */
const SINCERITY = /\b(siento|sinceramente|honestamente|la verdad|me pasa que|me da miedo|mi ex|terapia|ansiedad|vulnerab|te juro|en serio te|me encanta|hace mucho que|siempre quise|nunca le dije)/i

/** Rango unicode de emoji, aproximado pero suficiente. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/gu

export interface IecBreakdown {
  total: number
  length: number
  questions: number
  emojis: number
  sincerity: number
  /** Etiqueta para la UI: qué tan mal vas. */
  level: 'elite' | 'ok' | 'warn' | 'danger'
  label: string
}

/**
 * Puntúa un mensaje. No incluye el bono por demora: ese se acredita por tick
 * mientras la respuesta está pendiente (ver game.ts), así el jugador lo ve subir
 * en vivo en vez de recibirlo de golpe al enviar.
 */
export function scoreMessage(text: string): IecBreakdown {
  const t = text.trim()
  const len = t.length

  // 3 caracteres -> +28. 60 -> 0. 180 -> -60 (piso).
  const length = Math.max(-60, Math.round(30 - len * 0.5))
  const questions = -8 * (t.match(/\?/g)?.length ?? 0)
  const emojis = -5 * (t.match(EMOJI)?.length ?? 0)
  const sincerity = SINCERITY.test(t) ? -25 : 0

  const total = length + questions + emojis + sincerity

  let level: IecBreakdown['level']
  let label: string
  if (len === 0) {
    level = 'ok'
    label = ''
  } else if (len <= 15 && total > 0) {
    level = 'elite'
    label = 'Comunicacion de alto valor'
  } else if (len <= 60) {
    level = 'ok'
    label = 'Aceptable'
  } else if (len <= 140) {
    level = 'warn'
    label = 'Considerá si esto es necesario'
  } else {
    level = 'danger'
    label = 'ALERTA DE APEGO'
  }

  if (sincerity !== 0 && level !== 'danger') {
    level = 'danger'
    label = 'VULNERABILIDAD DETECTADA'
  }

  return { total, length, questions, emojis, sincerity, level, label }
}

/** IEC por segundo mientras el otro espera tu respuesta. Cuidar tu tiempo es cuidar el suyo. */
export const DELAY_IEC_PER_SEC = 2
/** Tope: a partir de aca ya demostraste todo lo que tenias que demostrar. */
export const DELAY_CAP_SEC = 90
/** Castigo por segundo fuera de la pestaña. Minimizar la app es abandonar a un ser humano. */
export const ESCAPE_IEC_PER_SEC = -15

export function countEmojis(text: string): number {
  return text.match(EMOJI)?.length ?? 0
}

export function countQuestions(text: string): number {
  return text.match(/\?/g)?.length ?? 0
}

export function isSincere(text: string): boolean {
  return SINCERITY.test(text)
}
