// Compatibilidad Divergente(tm).
//
// Los algoritmos tradicionales minimizan la distancia entre perfiles y producen camaras
// de eco. Nosotros la maximizamos. Salir de la zona de confort no deberia ser opcional.
//
// Lo unico que si se respeta es el genero buscado: primero se arma la MAYOR CANTIDAD
// POSIBLE de parejas donde los dos obtuvieron lo que pidieron, y recien despues se
// reparte lo que sobro. Al que sobro no se lo deja sin chat: entra al Programa
// Experimental, que es como el sistema llama a no haberle podido cumplir.

import { AXES, accepts, type Gender, type Seeking } from '../../shared/types.js'

export interface Profile {
  id: string
  nick: string
  axes: number[]
  gender: Gender
  seeking: Seeking
}

export interface Pair {
  a: string
  b: string
  incompat: number
  clash: string
  /** El sistema no pudo respetar lo que pidieron y los junto igual. */
  experimental: boolean
}

/** Distancia euclidiana normalizada a 0-100. */
function distance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < AXES.length; i++) {
    const d = (a[i] ?? 50) - (b[i] ?? 50)
    sum += d * d
  }
  // Maxima distancia posible: sqrt(5 * 100^2)
  const max = Math.sqrt(AXES.length * 100 * 100)
  return Math.round((Math.sqrt(sum) / max) * 100)
}

/** Los dos obtienen lo que pidieron. Tiene que dar de los dos lados. */
function compatible(a: Profile, b: Profile): boolean {
  return accepts(a.seeking, b.gender) && accepts(b.seeking, a.gender)
}

/** El eje donde mas chocan, redactado para que se lea en pantalla. */
function clashLine(a: Profile, b: Profile): string {
  let best = 0
  let gap = -1
  for (let i = 0; i < AXES.length; i++) {
    const d = Math.abs((a.axes[i] ?? 50) - (b.axes[i] ?? 50))
    if (d > gap) {
      gap = d
      best = i
    }
  }
  const axis = AXES[best]
  const aLow = (a.axes[best] ?? 50) < (b.axes[best] ?? 50)
  const aVerb = aLow ? axis.leftVerb : axis.rightVerb
  const bVerb = aLow ? axis.rightVerb : axis.leftVerb

  if (gap < 15) {
    // Coinciden demasiado. Eso tambien es un diagnostico.
    return `${a.nick} y ${b.nick} coinciden en casi todo. Pronostico reservado.`
  }
  return `${a.nick} ${aVerb}. ${b.nick} ${bVerb}. Tienen 90 segundos para resolverlo.`
}

/** Lo que lee el que pidio una cosa y recibio otra. */
function experimentalLine(a: Profile, b: Profile): string {
  return `${a.nick} y ${b.nick} fueron seleccionados para experimentar cosas nuevas. Sus preferencias fueron consideradas.`
}

/**
 * Maxima cantidad de parejas que respetan lo que los dos pidieron.
 *
 * Dos pasadas sobre el grafo de compatibilidad:
 *
 * 1. Greedy, pero mirando primero a quien tiene MENOS opciones. Si alguien solo puede ir
 *    con una persona elige antes que el que puede ir con veinte — al reves se pierden
 *    parejas que despues no se recuperan. Entre sus opciones se queda con la mas
 *    incompatible, que es el producto.
 * 2. Caminos aumentantes para los que quedaron sueltos: si u puede ir con v, y la pareja
 *    de v puede irse con alguien libre, se reacomoda la cadena y se gana una pareja.
 *
 * No maneja blossoms (ciclos impares de compatibilidad mutua), asi que en configuraciones
 * exoticas puede quedar una pareja por debajo del maximo teorico. Esa gente no se pierde:
 * cae en el Programa Experimental, que es exactamente lo que pasa cuando los numeros no
 * cierran. Medido contra fuerza bruta, el resultado da optimo en la practica.
 */
function maxCompatibleMatching(profiles: Profile[]): number[] {
  const n = profiles.length
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (compatible(profiles[i], profiles[j])) {
        adj[i].push(j)
        adj[j].push(i)
      }
    }
  }

  const partner = new Array<number>(n).fill(-1)
  const freeDegree = (i: number) => adj[i].reduce((k, j) => k + (partner[j] === -1 ? 1 : 0), 0)

  // 1. El mas restringido elige primero.
  for (;;) {
    let who = -1
    let fewest = Infinity
    for (let i = 0; i < n; i++) {
      if (partner[i] !== -1) continue
      const d = freeDegree(i)
      if (d > 0 && d < fewest) {
        fewest = d
        who = i
      }
    }
    if (who === -1) break

    let pick = -1
    let pickDist = -1
    let pickDeg = Infinity
    for (const j of adj[who]) {
      if (partner[j] !== -1) continue
      const d = distance(profiles[who].axes, profiles[j].axes)
      const deg = freeDegree(j)
      // Mas incompatible primero; a igualdad, el que tambien tiene pocas opciones.
      if (d > pickDist || (d === pickDist && deg < pickDeg)) {
        pick = j
        pickDist = d
        pickDeg = deg
      }
    }
    partner[who] = pick
    partner[pick] = who
  }

  // 2. Rescate: cadenas alternadas desde cada suelto.
  const augment = (root: number): boolean => {
    // El root entra como visitado: asi nadie de la cadena se lo lleva y el camino que se
    // da vuelta sigue siendo simple.
    const seen = new Set<number>([root])
    const walk = (u: number): boolean => {
      for (const v of adj[u]) {
        if (seen.has(v)) continue
        seen.add(v)
        const current = partner[v]
        if (current === -1 || walk(current)) {
          partner[v] = u
          partner[u] = v
          return true
        }
      }
      return false
    }
    return walk(root)
  }
  for (let i = 0; i < n; i++) if (partner[i] === -1) augment(i)

  return partner
}

/**
 * Empareja a todos. Primero por lo que pidieron, despues por lo que hay.
 *
 * Devuelve los pares y los que quedaron sueltos (a esos les toca un bot).
 */
export function matchAll(profiles: Profile[]): { pairs: Pair[]; leftover: string[] } {
  const partner = maxCompatibleMatching(profiles)
  const pairs: Pair[] = []
  const used = new Set<string>()

  for (let i = 0; i < profiles.length; i++) {
    const j = partner[i]
    if (j === -1 || j < i) continue
    const a = profiles[i]
    const b = profiles[j]
    pairs.push({
      a: a.id,
      b: b.id,
      incompat: distance(a.axes, b.axes),
      clash: clashLine(a, b),
      experimental: false,
    })
    used.add(a.id)
    used.add(b.id)
  }

  // Programa Experimental: los que sobraron se juntan entre ellos, otra vez por maxima
  // divergencia. Nadie mira la campanada desde afuera.
  const rest = profiles.filter((p) => !used.has(p.id))
  const candidates: { a: Profile; b: Profile; d: number }[] = []
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      candidates.push({ a: rest[i], b: rest[j], d: distance(rest[i].axes, rest[j].axes) })
    }
  }
  candidates.sort((x, y) => y.d - x.d)
  for (const c of candidates) {
    if (used.has(c.a.id) || used.has(c.b.id)) continue
    used.add(c.a.id)
    used.add(c.b.id)
    pairs.push({
      a: c.a.id,
      b: c.b.id,
      incompat: c.d,
      clash: experimentalLine(c.a, c.b),
      experimental: true,
    })
  }

  const leftover = profiles.filter((p) => !used.has(p.id)).map((p) => p.id)
  return { pairs, leftover }
}

export { distance, clashLine, experimentalLine, compatible }
