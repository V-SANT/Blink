// Fastify sirve el estático y Socket.IO vive en el mismo proceso y el mismo puerto:
// un solo deploy, una sola URL, sin CORS.

import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { Server } from 'socket.io'
import { DEFAULT_ROUND_SECONDS, type JoinPayload } from '../../shared/types.js'
import { Game } from './game.js'
import { geminiStats } from './gemini.js'

// Node >=20.12 carga .env sin dependencias.
try { process.loadEnvFile('.env') } catch { /* no hay .env: los defaults alcanzan */ }

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS ?? DEFAULT_ROUND_SECONDS)
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://${lanAddress()}:${PORT}`).replace(/\/$/, '')
/** Si se define, /presenter exige ?key=... Evita que alguien del público abra el panel. */
const PRESENTER_KEY = process.env.PRESENTER_KEY?.trim()

const app = Fastify({ logger: false })
const httpServer = createServer()

const clientDist = join(root, 'dist', 'client')
const hasBuild = existsSync(join(clientDist, 'index.html'))

if (hasBuild) {
  await app.register(fastifyStatic, { root: clientDist })
  // SPA: cualquier ruta desconocida devuelve el index y el cliente decide qué pantalla es.
  app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'))
} else {
  app.get('/', async (_req, reply) =>
    reply.type('text/html').send(
      '<h1>Blink</h1><p>No hay build del cliente. En desarrollo abrí <a href="http://localhost:5173">localhost:5173</a>, o corré <code>npm run build</code>.</p>',
    ),
  )
}

// Devuelve la configuración efectiva para que `npm run preflight` pueda detectar solo
// el error más común del deploy: PUBLIC_URL que no coincide con el dominio real, que
// deja el QR apuntando a ningún lado. No expone la clave del presentador, solo si existe.
app.get('/health', async () => ({
  ok: true,
  publicUrl: PUBLIC_URL,
  round: ROUND_SECONDS,
  presenterProtected: Boolean(PRESENTER_KEY),
  clientBuild: hasBuild,
  uptimeSec: Math.round(process.uptime()),
  llm: geminiStats(),
}))

await app.ready()
httpServer.on('request', app.routing.bind(app))

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  // El público llega por 4G y wifi de venue: conviene ser tolerante con la latencia.
  pingTimeout: 25_000,
  // OJO antes de subir este valor: en Socket.IO v4 el servidor manda el ping y el cliente
  // responde con un pong, así que esto genera tráfico ENTRANTE cada 10s. De eso depende que
  // Render free no duerma el servicio durante el evento (se duerme a los 15 min sin tráfico,
  // y los mensajes de WebSocket cuentan). Ver DEPLOY.md → Alternativas.
  pingInterval: 10_000,
})

const game = new Game(io, { roundSeconds: ROUND_SECONDS, joinUrl: PUBLIC_URL })

io.on('connection', (socket) => {
  socket.on('join', (payload: JoinPayload) => game.join(socket.id, payload))
  socket.on('msg', (text: string) => game.message(socket.id, String(text ?? '')))
  socket.on('vote', (yes: boolean) => game.vote(socket.id, Boolean(yes)))
  socket.on('away', (away: boolean) => game.setAway(socket.id, Boolean(away)))

  socket.on('presenter:hello', (key?: string) => {
    if (PRESENTER_KEY && key !== PRESENTER_KEY) {
      socket.emit('presenter:denied')
      return
    }
    void socket.join('presenter')
    socket.emit('presenter', game.presenterView())
  })

  // Los controles del presentador solo responden a un socket que ya está en la sala.
  const isPresenter = () => socket.rooms.has('presenter')
  socket.on('presenter:bell', () => isPresenter() && game.bell())
  socket.on('presenter:reset', (hard: boolean) => isPresenter() && game.reset(Boolean(hard)))
  socket.on('presenter:bots', (n: number) => isPresenter() && game.seedBots(clamp(Number(n) || 4, 1, 40)))

  socket.on('disconnect', () => game.leave(socket.id))
})

setInterval(() => game.tick(), 1000)

httpServer.listen(PORT, HOST, () => {
  const llm = geminiStats()
  console.log(`\n  BLINK  ·  ${PUBLIC_URL}`)
  console.log(`  presentador: ${PUBLIC_URL}/presenter${PRESENTER_KEY ? '?key=***' : ''}`)
  console.log(`  ronda: ${ROUND_SECONDS}s  ·  build del cliente: ${hasBuild ? 'sí' : 'NO (usá vite en :5173)'}`)
  console.log(`  LLM: ${llm.enabled ? `${llm.model} @ ${llm.rpm} RPM` : 'desactivado (solo banco local)'}\n`)
})

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * IP de la red local, para que el QR sirva desde un celular sin configurar nada.
 * Salta los adaptadores virtuales (Hyper-V, WSL, Docker, VMware): sus direcciones
 * responden desde esta máquina pero no desde el teléfono, y el QR quedaría muerto.
 */
function lanAddress(): string {
  const virtual = /^(vEthernet|WSL|Docker|VMware|VirtualBox|Loopback|Hyper-V|br-|veth|tun|tap)/i
  const preferred = /^(Wi-?Fi|wlan|en0|eth0|Ethernet)/i
  const found: { name: string; address: string }[] = []

  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (virtual.test(name)) continue
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) found.push({ name, address: a.address })
    }
  }
  return (found.find((f) => preferred.test(f.name)) ?? found[0])?.address ?? 'localhost'
}
