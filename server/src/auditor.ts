// Auditoría de Apego.
//
// Separación deliberada: los NÚMEROS son deterministas y los calcula la heurística;
// solo la PROSA puede venir de un modelo. El IEC nunca lo decide un LLM — se mide.
//
// Eso es lo que hace que la auditoría se sienta reactiva sin depender de nadie:
// "Detectamos 3 signos de pregunta en 47 segundos" es verdad literal, medida en runtime.
// El diagnóstico clínico que va después sale de un banco curado a mano.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { countEmojis, countQuestions, isSincere, type IecBreakdown } from '../../shared/iec.js'
import { generate, geminiEnabled } from './gemini.js'

const here = dirname(fileURLToPath(import.meta.url))

interface Persona {
  label: string
  /** Rango [min, max] de segundos antes de responder. [0,0] = no responde nunca. */
  delaySec: [number, number]
  lines: string[]
}

interface Bank {
  openers: string[]
  /** Para las parejas que el sistema no pudo respetar. Ver matcher.ts. */
  experimental: string[]
  diagnoses: string[]
  praise: string[]
  auditTemplates: string[]
  titles: Record<string, { name: string; detail: string }>
  units: Record<string, string>
  personas: Record<string, Persona>
}

export const bank: Bank = JSON.parse(readFileSync(join(here, 'bank.json'), 'utf8'))

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

export interface AuditResult {
  text: string
  delta: number
}

/**
 * Decide si un mensaje merece auditoría y con qué cargos. Devuelve null si el mensaje
 * es intrascendente — no toda frase merece una intervención, y auditar todo mata el chiste.
 */
export function judge(text: string, breakdown: IecBreakdown, secondsElapsed: number) {
  const chars = text.trim().length
  const questions = countQuestions(text)
  const emojis = countEmojis(text)

  if (isSincere(text)) {
    return { unit: 'sincerity' as const, n: 1, delta: -40, positive: false }
  }
  if (chars > 140) {
    return { unit: 'chars' as const, n: chars, delta: Math.max(-60, -Math.round(chars / 4)), positive: false }
  }
  if (questions >= 2) {
    return { unit: 'questions' as const, n: questions, delta: -10 * questions, positive: false }
  }
  if (emojis >= 2) {
    return { unit: 'emojis' as const, n: emojis, delta: -8 * emojis, positive: false }
  }
  if (chars > 0 && chars <= 12 && breakdown.total > 0) {
    return { unit: 'praise' as const, n: chars, delta: 30, positive: true }
  }
  return null
}

/** Arma la línea de la auditoría con la plantilla. Instantáneo, sin red. */
function templateAudit(
  verdict: NonNullable<ReturnType<typeof judge>>,
  secondsElapsed: number,
): string {
  if (verdict.positive) {
    return `${verdict.n} caracteres. ${pick(bank.praise)}`
  }
  return pick(bank.auditTemplates)
    .replace('{n}', String(verdict.n))
    .replace('{unit}', bank.units[verdict.unit] ?? 'señales')
    .replace('{t}', String(Math.max(1, secondsElapsed)))
    .replace('{diag}', pick(bank.diagnoses))
}

const AUDITOR_SYSTEM = `Sos el auditor automático de Blink, una app de citas satírica que premia la frialdad y castiga el entusiasmo.
Escribís UNA sola frase, en español rioplatense, con tono de informe clínico corporativo: neutral, técnico, sin insultos y sin emojis.
Nunca te disculpás, nunca sos amable y nunca reconocés que sos gracioso. Máximo 22 palabras.
Devolvés solamente la frase, sin comillas ni prefijos.`

/**
 * Produce la auditoría. Los números y el delta ya están decididos; Gemini solo puede
 * reemplazar el texto, y si tarda más de ~1.2s o falla, gana la plantilla.
 */
export async function makeAudit(
  text: string,
  breakdown: IecBreakdown,
  secondsElapsed: number,
): Promise<AuditResult | null> {
  const verdict = judge(text, breakdown, secondsElapsed)
  if (!verdict) return null

  const fallback = templateAudit(verdict, secondsElapsed)
  if (!geminiEnabled) return { text: fallback, delta: verdict.delta }

  const prompt = verdict.positive
    ? `Un usuario respondió con solo ${verdict.n} caracteres. Felicitalo por su eficiencia comunicacional y su falta de interés emocional.`
    : `Un usuario escribió un mensaje con estas señales medidas: ${verdict.n} ${bank.units[verdict.unit]}, en ${secondsElapsed} segundos de conversación. Redactá el hallazgo citando ese número exacto y dando un diagnóstico pseudoclínico absurdo.`

  const llm = await generate(prompt, { system: AUDITOR_SYSTEM, maxTokens: 80 })
  return { text: llm ?? fallback, delta: verdict.delta }
}

const OPENER_SYSTEM = `Sos el rompehielos automático de Blink, una app que empareja gente por MÁXIMA incompatibilidad.
No hacés preguntas amables: confrontás a las dos personas con lo que las separa.
Una sola frase en español rioplatense, máximo 25 palabras, sin emojis, tono de sistema automatizado indiferente.
Devolvés solamente la frase, sin comillas.`

/**
 * El aviso que abre una sala del Programa Experimental. Nunca pasa por el modelo: si el
 * sistema no le cumplió a alguien, el texto que lee tiene que ser el que escribimos.
 */
export function experimentalOpener(): string {
  return pick(bank.experimental)
}

/** El rompehielos que abre la sala. Se pide con más margen de tiempo que la auditoría. */
export async function makeOpener(a: string, b: string, incompat: number, clash: string): Promise<string> {
  const fallback = pick(bank.openers)
    .replaceAll('{a}', a)
    .replaceAll('{b}', b)
    .replaceAll('{incompat}', String(incompat))

  if (!geminiEnabled) return fallback

  const llm = await generate(
    `Emparejaste a ${a} con ${b}. Incompatibilidad: ${incompat}%. El choque principal es: "${clash}". Confrontalos con eso y recordales que tienen 90 segundos.`,
    { system: OPENER_SYSTEM, maxTokens: 90, timeoutMs: 2500 },
  )
  return llm ?? fallback
}

// Personas de bot. La distribución está elegida para el escenario, no por realismo:
// el "fantasma" no responde nunca y por eso termina arriba del ranking, que es el mejor
// chiste que produce el IEC; el "entusiasta" se hunde solo y llena el feed de auditorías.
const PERSONA_WEIGHTS: [string, number][] = [
  ['monosilabo', 40],
  ['ex', 25],
  ['entusiasta', 25],
  ['fantasma', 10],
]

export function pickPersona(): string {
  const total = PERSONA_WEIGHTS.reduce((n, [, w]) => n + w, 0)
  let r = Math.random() * total
  for (const [name, w] of PERSONA_WEIGHTS) {
    r -= w
    if (r <= 0) return name
  }
  return 'monosilabo'
}

export function personaLabel(persona: string): string {
  return bank.personas[persona]?.label ?? ''
}

/** Devuelve null si esta persona no habla (el fantasma). */
export function botLine(persona: string): string | null {
  const p = bank.personas[persona]
  if (!p || p.lines.length === 0) return null
  return pick(p.lines)
}

/** Milisegundos hasta la respuesta, o null si no va a responder. */
export function botDelayMs(persona: string): number | null {
  const p = bank.personas[persona]
  if (!p || p.lines.length === 0) return null
  const [lo, hi] = p.delaySec
  return (lo + Math.random() * Math.max(0, hi - lo)) * 1000
}
