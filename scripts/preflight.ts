/**
 * Verificación del deploy. Corrélo contra la URL real antes del evento.
 *
 *   npm run preflight https://blink.onrender.com
 *
 * Chequea lo que de verdad rompe una demo en vivo:
 *   · si el servicio estaba dormido y cuánto tardó en despertar (Render free)
 *   · si PUBLIC_URL coincide con el dominio real  ← el error más común, deja el QR muerto
 *   · si el build del cliente está publicado
 *   · si la ronda dura lo que tiene que durar
 *   · si /presenter está protegido
 *   · si el ciclo del juego responde de verdad, no solo el healthcheck
 */

import { io, type Socket } from 'socket.io-client'
import type { PlayerView } from '../shared/types.js'

const raw = process.argv[2]
if (!raw) {
  console.error('\nUso: npm run preflight <url>')
  console.error('Ej:  npm run preflight https://blink.onrender.com\n')
  process.exit(1)
}
const URL = raw.replace(/\/$/, '')

let failures = 0
let warnings = 0
const ok = (label: string, detail = '') => console.log(`  \x1b[32mOK  \x1b[0m ${label}${detail ? ` — ${detail}` : ''}`)
const fail = (label: string, fix: string) => {
  console.log(`  \x1b[31mFALLA\x1b[0m ${label}`)
  console.log(`        → ${fix}`)
  failures++
}
const warn = (label: string, detail: string) => {
  console.log(`  \x1b[33mAVISO\x1b[0m ${label} — ${detail}`)
  warnings++
}

interface Health {
  ok: boolean
  publicUrl: string
  round: number
  presenterProtected: boolean
  clientBuild: boolean
  uptimeSec: number
  llm: { enabled: boolean; model: string; rpm: number }
}

async function main() {
  console.log(`\nVerificando ${URL}\n`)

  // 1 ─ Despertar
  console.log('1. Disponibilidad')
  const t0 = Date.now()
  let health: Health
  try {
    const res = await fetch(`${URL}/health`, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok) {
      fail(`/health devolvió HTTP ${res.status}`, 'Revisá los logs del servicio en Render.')
      process.exit(1)
    }
    health = (await res.json()) as Health
  } catch (err) {
    fail('no se pudo alcanzar /health', `¿La URL es correcta y el servicio está desplegado? (${String(err)})`)
    process.exit(1)
  }
  const wakeMs = Date.now() - t0

  if (wakeMs > 15_000) {
    warn('el servicio estaba dormido', `tardó ${(wakeMs / 1000).toFixed(0)}s en despertar`)
    console.log('        → Es el comportamiento normal de Render free. Abrí /presenter al llegar')
    console.log('          al venue y no se vuelve a dormir mientras esa pestaña siga abierta.')
  } else {
    ok('el servicio está despierto', `respondió en ${wakeMs} ms`)
  }
  ok('uptime del proceso', `${health.uptimeSec}s`)

  // 2 ─ Configuración
  console.log('\n2. Configuración')
  if (health.publicUrl === URL) {
    ok('PUBLIC_URL coincide con el dominio real', health.publicUrl)
  } else {
    fail(
      `PUBLIC_URL es "${health.publicUrl}" pero el dominio real es "${URL}"`,
      `El QR del proyector va a apuntar a ningún lado. Poné PUBLIC_URL=${URL} en Render → Environment.`,
    )
  }

  if (health.clientBuild) ok('el build del cliente está publicado')
  else fail('no hay build del cliente', 'El buildCommand tiene que incluir `npm run build`.')

  if (health.round === 90) ok('duración de la ronda', '90s')
  else warn('la ronda no dura 90s', `ROUND_SECONDS=${health.round}. Para el evento se quiere 90.`)

  if (health.presenterProtected) ok('/presenter está protegido con clave')
  else warn('/presenter está abierto', 'Definí PRESENTER_KEY o cualquiera dispara la campanada.')

  ok('modo del auditor', health.llm.enabled ? `${health.llm.model} @ ${health.llm.rpm} RPM` : 'banco local (sin red)')

  // 3 ─ El cliente se sirve de verdad
  console.log('\n3. Páginas')
  for (const [path, label] of [
    ['/', 'la app del jugador carga'],
    ['/presenter', 'el proyector carga'],
  ] as const) {
    const res = await fetch(`${URL}${path}`, { signal: AbortSignal.timeout(30_000) })
    const html = await res.text()
    if (res.ok && html.includes('<div id="root">')) ok(label)
    else fail(`${label} — HTTP ${res.status}`, 'El servidor no está sirviendo el index.html del build.')
  }

  // 4 ─ El juego responde (no alcanza con que el healthcheck diga que sí)
  console.log('\n4. Ciclo del juego')
  const state = await new Promise<PlayerView | null>((resolve) => {
    const s: Socket = io(URL, { transports: ['websocket'], timeout: 20_000 })
    const done = setTimeout(() => {
      s.close()
      resolve(null)
    }, 20_000)
    s.on('connect', () => s.emit('join', { nick: 'Preflight', contact: '@preflight', axes: [50, 50, 50, 50, 50] }))
    s.on('state', (v: PlayerView) => {
      clearTimeout(done)
      s.close()
      resolve(v)
    })
    s.on('connect_error', () => {
      clearTimeout(done)
      s.close()
      resolve(null)
    })
  })

  if (!state) {
    fail('el WebSocket no respondió', 'Revisá que el host no esté bloqueando conexiones persistentes.')
  } else {
    ok('el WebSocket conecta y el servidor responde', `fase "${state.phase}", IEC ${state.iec}`)
    if (state.phase !== 'waiting') {
      warn('hay una sesión en curso', `fase "${state.phase}" — reiniciala desde /presenter antes del evento`)
    }
  }

  // Resumen
  console.log('')
  if (failures > 0) {
    console.log(`\x1b[31m  ${failures} falla(s)${warnings ? ` y ${warnings} aviso(s)` : ''}. Resolvelas antes del evento.\x1b[0m\n`)
    process.exit(1)
  }
  if (warnings > 0) {
    console.log(`\x1b[33m  Sin fallas, ${warnings} aviso(s) para revisar.\x1b[0m\n`)
  } else {
    console.log('\x1b[32m  Todo listo.\x1b[0m\n')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
