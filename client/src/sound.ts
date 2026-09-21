/**
 * Sonido y vibración, sintetizados con Web Audio — cero archivos, cero descargas.
 *
 * El momento más importante de la presentación es la campanada: ochenta teléfonos
 * sonando y vibrando en el mismo instante. Ese sonido en la sala es lo que hace que
 * el público entienda la mecánica sin que se la expliquen.
 *
 * Los navegadores no dejan sonar hasta que hay un gesto del usuario, así que el
 * AudioContext se inicializa cuando el jugador toca "Entrar" y cuando el presentador
 * toca cualquier botón. Si algo falla, todo es no-op: el sonido nunca puede romper la demo.
 */

let ctx: AudioContext | null = null
let muted = false

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  } catch {
    ctx = null
  }
}

export function setMuted(v: boolean) {
  muted = v
}
export function isMuted() {
  return muted
}

function tone(opts: {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  delay?: number
  /** Frecuencia final, para barridos. */
  sweepTo?: number
}) {
  if (!ctx || muted) return
  const { freq, duration, type = 'sine', gain = 0.2, delay = 0, sweepTo } = opts
  const t0 = ctx.currentTime + delay

  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration)

  // Ataque corto y caída exponencial: suena a instrumento y no a pitido de error.
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(amp).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* iOS Safari no lo soporta; el sonido cubre el momento igual */
  }
}

/** La campanada. Armónicos de campana + vibración larga. Esto es el momento. */
export function playBell() {
  initAudio()
  // Relaciones de una campana real: fundamental, quinta, octava, y un armónico alto.
  tone({ freq: 523.25, duration: 2.6, gain: 0.26 })
  tone({ freq: 784.0, duration: 2.2, gain: 0.14, delay: 0.005 })
  tone({ freq: 1046.5, duration: 1.8, gain: 0.1, delay: 0.01 })
  tone({ freq: 1568.0, duration: 0.9, gain: 0.05, delay: 0.015 })
  vibrate([400, 120, 400])
}

/** Tick del reloj en los últimos segundos. Seco y corto. */
export function playTick(urgent = false) {
  tone({ freq: urgent ? 1400 : 1000, duration: 0.05, type: 'square', gain: urgent ? 0.1 : 0.05 })
  if (urgent) vibrate(25)
}

/** Penalización de IEC: barrido descendente. */
export function playPenalty() {
  tone({ freq: 320, sweepTo: 90, duration: 0.42, type: 'sawtooth', gain: 0.16 })
  vibrate([90, 60, 90])
}

/** Premio de IEC: dos notas ascendentes. */
export function playReward() {
  tone({ freq: 660, duration: 0.11, gain: 0.12 })
  tone({ freq: 990, duration: 0.16, gain: 0.12, delay: 0.1 })
}

/** Cuenta regresiva del Contacto Efímero: 3 · 2 · 1. */
export function playCountdown() {
  tone({ freq: 440, duration: 0.14, type: 'triangle', gain: 0.18 })
  vibrate(60)
}

/** El parpadeo. Un golpe seco y nada más: el silencio después es parte del chiste. */
export function playReveal() {
  tone({ freq: 1800, duration: 0.09, type: 'triangle', gain: 0.22 })
  tone({ freq: 2400, duration: 0.06, gain: 0.1, delay: 0.01 })
  vibrate(180)
}

/** Alerta de fuga: tu match se fue. Insistente a propósito. */
export function playAlarm() {
  for (let i = 0; i < 3; i++) {
    tone({ freq: 880, duration: 0.12, type: 'square', gain: 0.13, delay: i * 0.22 })
    tone({ freq: 660, duration: 0.12, type: 'square', gain: 0.13, delay: i * 0.22 + 0.11 })
  }
  vibrate([120, 80, 120, 80, 120])
}
