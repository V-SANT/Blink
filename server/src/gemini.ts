// Cliente de Gemini dimensionado para el free tier, sin SDK (solo fetch).
//
// El free tier de Gemini 3 Flash ronda los 10 req/min y ~1.500 req/dia. La demo en vivo
// puede pedir ~100 req/min en pico, asi que este cliente NUNCA es el camino principal:
// es un adorno opcional sobre el banco pre-generado.
//
// Tres defensas, en orden:
//   1. Token bucket por debajo del limite publicado (default 8 RPM).
//   2. Tope diario propio, por si el evento se alarga.
//   3. Timeout agresivo (1.2s). Si no contesta a tiempo, el chiste sale del banco.
//
// Si getGemini() devuelve null en cualquier punto, el llamador usa la plantilla.
// La app funciona entera sin GEMINI_API_KEY: ese es el modo por defecto.

const API = 'https://generativelanguage.googleapis.com/v1beta'

const KEY = process.env.GEMINI_API_KEY?.trim()
const MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash'
const RPM = Number(process.env.GEMINI_RPM ?? 8)
const DAILY_CAP = Number(process.env.GEMINI_DAILY_CAP ?? 1200)
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 1200)

export const geminiEnabled = Boolean(KEY)

let tokens = RPM
let lastRefill = Date.now()
let usedToday = 0
let dayStamp = new Date().toISOString().slice(0, 10)

const stats = { ok: 0, throttled: 0, failed: 0, timedOut: 0 }

function takeToken(): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== dayStamp) {
    dayStamp = today
    usedToday = 0
  }
  if (usedToday >= DAILY_CAP) return false

  // Token bucket: se rellena de forma continua hasta RPM.
  const now = Date.now()
  const refill = ((now - lastRefill) / 60_000) * RPM
  if (refill > 0) {
    tokens = Math.min(RPM, tokens + refill)
    lastRefill = now
  }
  if (tokens < 1) return false

  tokens -= 1
  usedToday += 1
  return true
}

export interface GenerateOpts {
  /** Instruccion de sistema. Se manda como system_instruction, no como turno de usuario. */
  system?: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  /** Saltea el rate limiter. Solo para generacion offline del banco, nunca en vivo. */
  offline?: boolean
}

/**
 * Devuelve el texto generado, o null ante cualquier problema (sin key, sin cupo,
 * timeout, error HTTP, respuesta vacia, bloqueo por safety). El llamador nunca
 * deberia tratar el null como un error: es el camino normal.
 */
export async function generate(prompt: string, opts: GenerateOpts = {}): Promise<string | null> {
  if (!KEY) return null
  if (!opts.offline && !takeToken()) {
    stats.throttled++
    return null
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? (opts.offline ? 30_000 : TIMEOUT_MS))

  try {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 120,
        temperature: opts.temperature ?? 1.1,
      },
    }
    if (opts.system) {
      body.system_instruction = { parts: [{ text: opts.system }] }
    }

    const res = await fetch(`${API}/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      stats.failed++
      if (process.env.LLM_DEBUG) {
        console.warn(`[gemini] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      }
      return null
    }

    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
    if (!text) {
      stats.failed++
      return null
    }
    stats.ok++
    return text
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') stats.timedOut++
    else stats.failed++
    if (process.env.LLM_DEBUG) console.warn('[gemini]', err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Lista los modelos que tu key puede usar. Sirve para verificar el ID exacto. */
export async function listModels(): Promise<string[]> {
  if (!KEY) throw new Error('Falta GEMINI_API_KEY')
  const res = await fetch(`${API}/models`, { headers: { 'x-goog-api-key': KEY } })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[]
  }
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter(Boolean)
}

export function geminiStats() {
  return { ...stats, enabled: geminiEnabled, model: MODEL, usedToday, dailyCap: DAILY_CAP, rpm: RPM }
}
