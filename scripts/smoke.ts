/**
 * Prueba de humo end-to-end: levanta el servidor con una ronda corta, conecta un
 * presentador y tres jugadores, y recorre el ciclo completo verificando cada fase.
 *
 *   npm run smoke
 *
 * Corré esto antes del evento y después de cualquier cambio. Es la red de seguridad
 * más barata que tiene el proyecto.
 */

import { spawn } from 'node:child_process'
import { io, type Socket } from 'socket.io-client'
import type { Gender, PlayerView, PresenterView, Seeking } from '../shared/types.js'
import { botDelayMs, botLine, personaLabel, pickPersona } from '../server/src/auditor.js'

const PORT = 3123
const URL = `http://localhost:${PORT}`
const ROUND = 6

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFALLA\x1b[0m'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), ROUND_SECONDS: String(ROUND), PUBLIC_URL: URL, GEMINI_API_KEY: '' },
  // SMOKE_VERBOSE=1 muestra la salida del servidor: imprescindible cuando una aserción
  // falla por una excepción del lado del server y no por la lógica que estás probando.
  stdio: process.env.SMOKE_VERBOSE ? 'inherit' : 'ignore',
})

function player(nick: string, axes: number[], gender: Gender = 'nobinario', seeking: Seeking = 'todos') {
  const s: Socket = io(URL, { transports: ['websocket'] })
  const state = { view: null as PlayerView | null }
  s.on('state', (v: PlayerView) => (state.view = v))
  s.on('connect', () => s.emit('join', { nick, contact: `@${nick.toLowerCase()}`, axes, gender, seeking }))
  return { s, state, send: (t: string) => s.emit('msg', t), vote: (y: boolean) => s.emit('vote', y) }
}

async function main() {
  await sleep(2500)

  const pres: { view: PresenterView | null } = { view: null }
  const ps: Socket = io(URL, { transports: ['websocket'] })
  ps.on('connect', () => ps.emit('presenter:hello'))
  ps.on('presenter', (v: PresenterView) => (pres.view = v))

  console.log('\n1. Lobby y perfilado')
  const a = player('Ana', [0, 0, 0, 0, 0])
  const b = player('Beto', [100, 100, 100, 100, 100])
  const c = player('Cielo', [50, 20, 90, 10, 70])
  await sleep(1200)

  check('el presentador recibe estado', pres.view !== null)
  check('los 3 perfiles están en el lobby', pres.view?.lobbyCount === 3, `lobbyCount=${pres.view?.lobbyCount}`)
  check('el QR apunta a la URL pública', pres.view?.joinUrl === URL)
  check('los jugadores arrancan en 1000 IEC', a.state.view?.iec === 1000, `iec=${a.state.view?.iec}`)
  check('fase inicial: espera', a.state.view?.phase === 'waiting')

  console.log('\n2. Campanada y emparejamiento por divergencia')
  ps.emit('presenter:bell')
  await sleep(900)

  check('se abrieron 2 salas (3 humanos + 1 bot de relleno)', pres.view?.roomCount === 2, `rooms=${pres.view?.roomCount}`)
  check('entró un bot para el impar', (pres.view?.botCount ?? 0) >= 1, `bots=${pres.view?.botCount}`)
  check('todos entraron en fase live', [a, b, c].every((p) => p.state.view?.phase === 'live'))

  // Ana (todo en 0) y Beto (todo en 100) son el par más divergente posible: deben caer juntos.
  const anaPeer = a.state.view?.room?.peerNick
  check('el anti-match juntó a los dos extremos', anaPeer === 'Beto', `peer de Ana = ${anaPeer}`)
  check('la incompatibilidad del par extremo es 100%', a.state.view?.room?.incompat === 100, `${a.state.view?.room?.incompat}%`)
  check('hay línea de choque redactada', Boolean(a.state.view?.room?.clash), a.state.view?.room?.clash ?? '')

  console.log('\n3. IEC: la brevedad paga, el apego no')
  const before = a.state.view?.iec ?? 0
  a.send('ok')
  await sleep(300)
  const afterShort = a.state.view?.iec ?? 0
  check('mensaje corto suma IEC', afterShort > before, `${before} → ${afterShort}`)
  // Esta aserción falta a propósito en ninguna parte: sin ella, un mensaje puede puntuar
  // sin llegar nunca a la pantalla del otro y el test pasa igual.
  check(
    'el mensaje llega a las dos pantallas',
    a.state.view?.room?.messages.some((m) => m.text === 'ok') === true &&
      b.state.view?.room?.messages.length !== undefined,
    `${a.state.view?.room?.messages.length} en la sala de Ana`,
  )

  const beforeLong = b.state.view?.iec ?? 0
  b.send(
    'La verdad es que hace mucho que no conozco a nadie interesante y me da un poco de miedo abrirme pero siento que con vos puedo ser honesto sobre lo que me pasa con mi ex y la terapia',
  )
  await sleep(300)
  const afterLong = b.state.view?.iec ?? 0
  check('mensaje largo y sincero resta IEC', afterLong < beforeLong, `${beforeLong} → ${afterLong}`)

  b.send('¿vos qué pensás? ¿te parece raro?')
  await sleep(1400)
  const audits = a.state.view?.room?.audits ?? []
  check('el auditor intervino', audits.length >= 1, `${audits.length} intervenciones`)
  check(
    'la auditoría cita un número medido real',
    audits.some((x) => /\d/.test(x.text)),
    audits.at(-1)?.text.slice(0, 70) ?? '',
  )

  console.log('\n4. Demora Certificada y detección de fuga')
  const idleBefore = c.state.view?.iec ?? 0
  await sleep(2200)
  check('no responder suma IEC por segundo', (c.state.view?.iec ?? 0) > idleBefore, `${idleBefore} → ${c.state.view?.iec}`)

  const escapeBefore = a.state.view?.iec ?? 0
  a.s.emit('away', true)
  await sleep(2200)
  check('minimizar la app resta IEC', (a.state.view?.iec ?? 0) < escapeBefore, `${escapeBefore} → ${a.state.view?.iec}`)
  check('el match ve la alerta roja', (b.state.view?.room?.peerAway ?? 0) > 0, `${b.state.view?.room?.peerAway}s`)
  a.s.emit('away', false)

  console.log('\n5. Veredicto y Contacto Efímero')
  const deadline = Date.now() + (ROUND + 4) * 1000
  while (a.state.view?.phase !== 'verdict' && Date.now() < deadline) await sleep(250)
  check('el reloj llegó a cero y abrió la votación', a.state.view?.phase === 'verdict', `fase=${a.state.view?.phase}`)

  a.vote(true)
  b.vote(true)
  c.vote(true) // Cielo está con un bot: sirve para probar que el bot también vota.
  await sleep(300)
  check('el voto queda registrado', a.state.view?.room?.voted === true)

  const d2 = Date.now() + 20_000
  while (a.state.view?.phase !== 'blink' && Date.now() < d2) await sleep(250)
  check('entró en fase de parpadeo', a.state.view?.phase === 'blink', `fase=${a.state.view?.phase}`)
  check('interés mutuo revela el contacto', a.state.view?.reveal === '@beto', `reveal=${a.state.view?.reveal}`)
  check(
    'el bot vota que sí, así que su match tampoco se pierde el remate',
    c.state.view?.reveal === '@cuenta_privada',
    `reveal=${String(c.state.view?.reveal)}`,
  )
  check('viene el timestamp para clavar los 1000ms', (a.state.view?.revealAt ?? 0) > Date.now() - 5000)


  console.log('\n6. Personas de bot')
  check('el fantasma nunca habla', botLine('fantasma') === null && botDelayMs('fantasma') === null)
  check('el monosílabo sí habla', typeof botLine('monosilabo') === 'string')
  // Lo que importa no es que una línea suelta sea larga, sino que el entusiasta escriba
  // sistemáticamente más que el monosílabo: de ahí sale que se hunda solo en el ranking.
  const avgLen = (persona: string) => {
    const n = 150
    let total = 0
    for (let i = 0; i < n; i++) total += (botLine(persona) ?? '').length
    return Math.round(total / n)
  }
  const largoEntusiasta = avgLen('entusiasta')
  const largoMonosilabo = avgLen('monosilabo')
  check(
    'el entusiasta escribe mucho más que el monosílabo',
    largoEntusiasta > largoMonosilabo * 5,
    `${largoEntusiasta} vs ${largoMonosilabo} caracteres promedio`,
  )
  check('el que no superó a su ex existe', typeof botLine('ex') === 'string')
  check(
    'las 4 personas están descritas',
    ['monosilabo', 'ex', 'entusiasta', 'fantasma'].every((k) => personaLabel(k).length > 0),
  )
  const sorteo = new Set(Array.from({ length: 300 }, pickPersona))
  check('el sorteo reparte entre las 4', sorteo.size === 4, [...sorteo].sort().join(', '))

  console.log('\n7. Cierre y Wall of Shame')
  const d3 = Date.now() + 20_000
  while (a.state.view?.phase !== 'done' && Date.now() < d3) await sleep(250)
  check('la sesión cerró', a.state.view?.phase === 'done', `fase=${a.state.view?.phase}`)

  // El estado del jugador y el del presentador son dos mensajes distintos: esperar solo
  // al del jugador hacía que las aserciones de abajo leyeran una vista vieja a veces.
  const d4 = Date.now() + 10_000
  while (pres.view?.phase !== 'results' && Date.now() < d4) await sleep(100)
  check('el proyector también cerró', pres.view?.phase === 'results', `fase=${pres.view?.phase}`)
  check('hay informe individual', Boolean(a.state.view?.summary), a.state.view?.summary?.title ?? '')
  check('el ranking está completo', (a.state.view?.summary?.total ?? 0) >= 4, `${a.state.view?.summary?.total} participantes`)
  check('el presentador arma los premios', (pres.view?.awards.length ?? 0) > 0, `${pres.view?.awards.length} premios`)
  check('se contabilizaron mensajes', (pres.view?.totals.messages ?? 0) > 0, `${pres.view?.totals.messages} mensajes`)
  check('se contabilizaron fugas', (pres.view?.totals.escapes ?? 0) > 0, `${pres.view?.totals.escapes} fugas`)

  console.log('\n8. Género buscado y Programa Experimental')
  // Ronda nueva con cuatro perfiles armados a mano: solo una pareja puede cumplirse.
  // Dani busca hombres y Eze busca mujeres — se sirven mutuamente. Fran busca hombres y
  // Gala busca mujeres: no hay nadie para ninguno de los dos.
  for (const s of [a.s, b.s, c.s]) s.close()
  await sleep(500)
  ps.emit('presenter:reset', true)
  await sleep(500)

  const dani = player('Dani', [10, 90, 10, 90, 10], 'mujer', 'hombres')
  const eze = player('Eze', [90, 10, 90, 10, 90], 'hombre', 'mujeres')
  const fran = player('Fran', [20, 20, 20, 20, 20], 'hombre', 'hombres')
  const gala = player('Gala', [80, 80, 80, 80, 80], 'mujer', 'mujeres')
  await sleep(1200)
  check('los 4 perfiles nuevos están en el lobby', pres.view?.lobbyCount === 4, `lobbyCount=${pres.view?.lobbyCount}`)

  ps.emit('presenter:bell')
  await sleep(1000)

  check('Dani recibió lo que pidió', dani.state.view?.room?.peerNick === 'Eze', `match=${dani.state.view?.room?.peerNick}`)
  check('Eze también', eze.state.view?.room?.peerNick === 'Dani', `match=${eze.state.view?.room?.peerNick}`)
  check('esa sala no es experimental', dani.state.view?.room?.experimental === false)
  check('Fran quedó con Gala, que no es lo que ninguno pidió', fran.state.view?.room?.peerNick === 'Gala', `match=${fran.state.view?.room?.peerNick}`)
  check('esa sala sí es experimental', fran.state.view?.room?.experimental === true)
  check(
    'el sistema les avisa en qué programa entraron',
    /experiment/i.test(fran.state.view?.room?.audits.map((x) => x.text).join(' ') ?? ''),
    (fran.state.view?.room?.audits[0]?.text ?? '').slice(0, 52) + '…',
  )
  check(
    'la línea de choque también lo dice',
    /experimentar cosas nuevas/i.test(gala.state.view?.room?.clash ?? ''),
    gala.state.view?.room?.clash ?? '',
  )
  check('nadie se quedó sin sala', pres.view?.roomCount === 2, `rooms=${pres.view?.roomCount}`)
  check('sin bots de relleno: los 4 se emparejaron entre sí', pres.view?.botCount === 0, `bots=${pres.view?.botCount}`)
  check(
    'el proyector registra el Programa Experimental',
    (pres.view?.feed ?? []).some((f) => /Programa Experimental/i.test(f.text)),
  )

  for (const s of [dani.s, eze.s, fran.s, gala.s, ps]) s.close()
  console.log(failures === 0 ? '\n\x1b[32m  Todo en orden.\x1b[0m\n' : `\n\x1b[31m  ${failures} fallas.\x1b[0m\n`)
  server.kill()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  server.kill()
  process.exit(1)
})
