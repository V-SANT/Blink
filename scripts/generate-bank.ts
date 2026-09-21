/**
 * Generación offline del banco con el free tier de Gemini.
 *
 * Deliberadamente NO escribe sobre server/src/bank.json. Escribe un archivo aparte para
 * que vos elijas a mano qué línea entra: la comedia curada por alguien que conoce al
 * público le gana a la generada, y este script existe para darte volumen, no criterio.
 *
 *   npm run models   → lista los model IDs que tu API key puede usar
 *   npm run bank     → genera bank.generated.json para revisar
 *
 * Son ~12 llamadas en total, muy por debajo de cualquier límite del free tier.
 * Si no tenés GEMINI_API_KEY, la app funciona igual con el banco curado que ya está.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
try { process.loadEnvFile('.env') } catch { /* sin .env */ }

const { generate, geminiEnabled, listModels } = await import('../server/src/gemini.js')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'server', 'src', 'bank.generated.json')

const VOICE = `Escribís para Blink, una app de citas SATÍRICA que premia la frialdad, la brevedad y el desinterés, y castiga el entusiasmo y la vulnerabilidad.
El tono es de producto corporativo de wellness: neutral, técnico, amable en la forma y cruel en el fondo. Nunca insultás. Nunca usás emojis. Nunca reconocés que sos gracioso.
Español rioplatense (vos, tenés, escribís). Frases cortas.`

async function batch(label: string, instruction: string, n: number): Promise<string[]> {
  const out = new Set<string>()
  // Varias llamadas chicas dan más variedad que una grande, y siguen siendo pocas requests.
  for (let i = 0; i < 3 && out.size < n; i++) {
    const text = await generate(
      `${instruction}\n\nDevolvé exactamente ${Math.ceil(n / 3)} opciones, una por línea, sin numerar, sin viñetas y sin comillas.`,
      { system: VOICE, maxTokens: 900, temperature: 1.3, offline: true },
    )
    if (!text) {
      console.warn(`  ! ${label}: la llamada ${i + 1} no devolvió nada`)
      continue
    }
    for (const line of text.split('\n')) {
      const clean = line.replace(/^\s*[-*\d.)\]]+\s*/, '').replace(/^["'“”]|["'“”]$/g, '').trim()
      if (clean.length > 8) out.add(clean)
    }
    process.stdout.write(`  · ${label}: ${out.size}\n`)
  }
  return [...out].slice(0, n)
}

async function main() {
  if (process.argv.includes('--list-models')) {
    const models = await listModels()
    console.log('\nModelos disponibles con tu key (usables en GEMINI_MODEL):\n')
    for (const m of models) console.log(`  ${m}`)
    console.log('\nPara el free tier conviene una variante Flash.\n')
    return
  }

  if (!geminiEnabled) {
    console.error('\nFalta GEMINI_API_KEY. Copiá .env.example a .env y cargá tu key.')
    console.error('Sin key la app funciona igual: usa el banco curado de server/src/bank.json.\n')
    process.exit(1)
  }

  console.log('\nGenerando banco…\n')

  const generated = {
    _comment: 'GENERADO AUTOMÁTICAMENTE — revisá línea por línea y copiá a mano solo lo bueno a bank.json.',
    openers: await batch(
      'openers',
      'Escribí rompehielos que un sistema automatizado le tira a DOS desconocidos recién emparejados por máxima INCOMPATIBILIDAD. No son preguntas amables: confrontan a las dos personas con lo que las separa y les recuerdan que tienen 90 segundos. Podés usar los placeholders {a} y {b} para los nombres y {incompat} para el porcentaje.',
      30,
    ),
    diagnoses: await batch(
      'diagnoses',
      'Escribí diagnósticos pseudoclínicos absurdos para alguien que se está involucrando emocionalmente demasiado rápido en un chat. Son sintagmas nominales cortos que completan la frase "Esto configura ___". Ejemplos del tono: "sobreinversión emocional temprana", "ruido paralingüístico". No son frases completas.',
      40,
    ),
    praise: await batch(
      'praise',
      'Escribí felicitaciones del sistema a un usuario que respondió con muy pocas palabras y sin mostrar interés. Elogian la eficiencia, la brevedad y la falta de apego como si fueran virtudes profesionales. Una frase cada una.',
      20,
    ),
    botLines: await batch(
      'botLines',
      'Escribí respuestas de chat de una persona desinteresada que contesta por compromiso: entre 1 y 4 palabras, en minúscula, sin puntuación final, español rioplatense casual. Ejemplos del registro: "jaja", "puede ser", "y sí", "ni idea".',
      40,
    ),
  }

  writeFileSync(OUT, JSON.stringify(generated, null, 2) + '\n', 'utf8')

  const current = JSON.parse(readFileSync(join(root, 'server', 'src', 'bank.json'), 'utf8'))
  console.log(`\nListo → ${OUT}`)
  console.log(`   generadas: ${Object.entries(generated).filter(([k]) => k !== '_comment').map(([k, v]) => `${k} ${(v as string[]).length}`).join(', ')}`)
  console.log(`   banco actual en uso: openers ${current.openers.length}, diagnoses ${current.diagnoses.length}`)
  console.log('\nRevisá el archivo y copiá A MANO solo las líneas que te hagan reír a vos.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
