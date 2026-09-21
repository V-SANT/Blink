# BLINK

**Conexiones que duran lo que tienen que durar.**

Proyecto para SideQuest: Love.exe — 01/10/2026. Una app de citas satírica que premia la
frialdad, castiga el entusiasmo y muestra el contacto de tu match durante exactamente un
segundo.

No es una app real. Es una demo de teatro con soporte de software.

---

## Cómo probarlo

### Nivel 1 — Solo, en 90 segundos

```bash
npm install
npm run build && npm start
```

El arranque te imprime la URL. Abrí **dos ventanas del navegador**:

| Ventana | URL | Qué es |
|---|---|---|
| 1 | `http://localhost:3000/presenter` | El proyector |
| 2 | `http://localhost:3000` | Tu celular simulado |

Después:

1. En la **ventana 2**: completá nombre, contacto, aceptá los términos y entrá.
2. En la **ventana 1**: tocá **+ 6 perfiles** (mete bots) y después **🔔 CAMPANADA**.
3. Volvé a la ventana 2 y chateá. Mirá la barra de IEC mientras escribís.

Cosas para probar a propósito:

- Escribí **"ok"** → sube el IEC.
- Escribí un párrafo largo con la palabra *"siento"* o *"mi ex"* → mirá la barra ponerse roja.
- **No respondas 10 segundos** → aparece "Llevás 10s sin responder. +20 IEC. Seguí así."
- **Cambiá de pestaña** → en la ventana 2 no lo ves, pero el proyector registra la fuga y el
  otro lado recibiría la alerta roja a pantalla completa.
- Esperá a que el reloj llegue a cero, votá **Sí**, y mirá el Contacto Efímero.

Para no esperar 90 segundos mientras iterás, acortá la ronda:

```bash
ROUND_SECONDS=25 npm start
```

> **Tip para ver la alerta roja:** abrí una **tercera** ventana en modo incógnito, entrá como
> un segundo jugador, y hacé la campanada con ustedes dos. Cuando una de las dos ventanas
> pierde el foco, la otra se pone roja entera.

### Nivel 2 — Con tu celular

Mismo comando. El servidor detecta solo tu IP de red local y el QR del proyector ya apunta
ahí, así que **escanealo con la cámara del teléfono y entrás**.

Si no carga: el firewall de Windows suele bloquear el puerto la primera vez. Aceptá el
diálogo que aparece al arrancar, o abrilo a mano:

```bash
powershell -c "New-NetFirewallRule -DisplayName 'Blink' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow"
```

### Nivel 3 — Ensayo con gente (el que importa)

Todos en la misma wifi, escanean el QR. Con 8 personas ya ves todo lo que vas a ver el
01/10: la vibración simultánea, el leaderboard moviéndose y la reacción a la revelación de
1 segundo. **Este es el ensayo que no se puede saltear** — está agendado para el 26–27/09.

### Verificación automática

```bash
npm run smoke
```

Levanta el servidor, conecta un presentador y tres jugadores, y recorre el ciclo completo
con 49 aserciones — incluida una ronda extra que verifica el emparejamiento por género
buscado y el Programa Experimental. Corrélo después de cualquier cambio y antes del evento.

### Desarrollo con hot reload

```bash
npm run dev
```

Cliente en `:5173` (recarga al guardar), servidor en `:3000`. Para el celular en modo dev
usá `:5173` con tu IP — Vite también escucha en la red local.

---

## Qué hay adentro

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor (:3000) + Vite (:5173) con hot reload |
| `npm run build` | Compila el cliente a `dist/client` |
| `npm start` | Producción: Fastify sirve el estático y el socket en el mismo puerto |
| `npm run smoke` | **Test end-to-end del ciclo completo** (local). Corrélo antes del evento. |
| `npm run preflight <url>` | **Verifica el deploy real**: cold start, `PUBLIC_URL`, páginas y ciclo del juego. |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run models` | Lista los model IDs que tu API key de Gemini puede usar |
| `npm run bank` | Genera líneas nuevas con Gemini para revisar a mano |

Deploy: **[DEPLOY.md](DEPLOY.md)** · Config: `render.yaml`, `railway.json`, `Dockerfile`, `.env.production.example`

```
shared/          types.ts (contrato server↔client) · iec.ts (la heurística, corre en los dos)
server/src/      index.ts · game.ts (el motor) · matcher.ts · auditor.ts · gemini.ts · bank.json
client/src/      App.tsx · useBlink.ts · sound.ts · screens/ (Join, Terms, Waiting, Room,
                 Verdict, Blink, Premium, Done, Presenter)
scripts/         smoke.ts (local) · preflight.ts (deploy) · generate-bank.ts
```

**Todo el estado vive en memoria y muere con el proceso.** No hay base de datos ni auth, y
eso es a propósito: el estado dura diez minutos y perderlo al reiniciar es coherente con el
producto. `npm start` levanta una instancia y esa instancia es la autoridad del reloj, del
emparejamiento y del puntaje.

---

## Las mecánicas

**Compatibilidad Divergente™** (`matcher.ts`) — distancia euclidiana entre los 5 ejes del
perfil, emparejando por **máxima** distancia. Con menos de ~300 personas es instantáneo
(80 perfiles: 1ms).

El género buscado **sí** se respeta, y esa es la parte seria del algoritmo: primero arma la
mayor cantidad posible de parejas donde los dos obtuvieron lo que pidieron — greedy con el
más restringido eligiendo primero, y después un pase de caminos aumentantes que rescata al
que quedó suelto por mala suerte del orden. Contra fuerza bruta sobre 4.000 configuraciones
aleatorias da el óptimo exacto en el 99,9% de los casos, y cuando no, queda una pareja por
debajo.

**Programa Experimental** — lo que sobra no se queda sin chat. Si la cantidad no da (50
personas buscando mujeres y 24 mujeres en la sala), los que quedaron afuera se emparejan
entre sí por máxima divergencia y la app se los informa en la cara: *"Fueron seleccionados
para experimentar cosas nuevas. Sus preferencias fueron consideradas."* La sala lleva el
cartel **PROGRAMA EXPERIMENTAL** y el proyector cuenta cuántas hubo. Es el mejor chiste que
produce el pedido de preferencias, y lo produce solo cuando el público está desbalanceado —
que es siempre.

**Índice de Eficiencia Comunicacional** (`shared/iec.ts`) — arranca en 1000.

| Señal | Efecto |
|---|---|
| Mensaje corto | `+30 − largo × 0.5` (3 caracteres → +28) |
| Signo de pregunta | −8 cada uno |
| Emoji | −5 cada uno |
| Marcador de vulnerabilidad | −25 (regex de "siento", "mi ex", "terapia", …) |
| **No responder** | **+2 por segundo**, tope 90s |
| Minimizar la app | **−15 por segundo** |

La misma función corre en el cliente (barra en vivo mientras tipeás, 0ms) y en el servidor
(autoridad). El cliente nunca espera a la red para mover la barra: ese movimiento es el chiste.

**Auditoría de Apego** (`auditor.ts`) — cada 3 mensajes. **Los números son deterministas y
los mide la heurística; solo la prosa puede venir de un modelo.** El IEC nunca lo decide un
LLM. Por eso "Detectamos 3 signos de pregunta en 47 segundos" es verdad literal.

**Presencia Obligatoria™** — sin botón de salir, `popstate` neutralizado, `beforeunload`, y
`visibilitychange` que le avisa al otro con una alerta roja a pantalla completa.

**Contacto Efímero™** (`screens/Blink.tsx`) — el servidor manda `revealAt` y el cliente clava
los 1000ms. El timing vive en el cliente porque el tick del servidor es de 1s y no tiene la
resolución necesaria. Medido: 1018ms con muestreo de 25ms.

**Términos y Condiciones** (`screens/Terms.tsx`) — 11 artículos que pasan a velocidad
imposible mientras la app anuncia que los está "leyendo por vos". Dura 3,5s y tiene un
failsafe: `requestAnimationFrame` no corre con la pestaña oculta, así que si alguien bloquea
el teléfono justo ahí, un timeout garantiza que el botón de aceptar igual aparezca.

**Sonido y vibración** (`sound.ts`) — sintetizados con Web Audio, sin archivos ni descargas.
La campanada (armónicos de campana + `navigator.vibrate`) es el instante en que ochenta
teléfonos suenan a la vez, que es el mejor momento de la presentación. También hay tick del
reloj en los últimos 10s, buzzer de penalización, premio y alarma de fuga. El `AudioContext`
se inicializa con el primer gesto del usuario, como exigen los navegadores.

**Blink Premium** (`screens/Premium.tsx`) — aparece justo cuando el contacto desaparece, que
es el único instante en que alguien pagaría por recuperarlo. El botón lleva a *"Función no
disponible en tu país"*. Vive en `App.tsx` y no dentro de `Blink`, porque el servidor cierra
esa fase a los pocos segundos y lo desmontaría antes de que nadie lo lea. No hay pasarela de
pago ni se piden datos: es utilería.

**Personas de bot** (`bank.json` → `personas`) — cuatro arquetipos con ritmos y largos
distintos: *monosílabo*, *ex* (no superó nada), *entusiasta* (escribe párrafos, se hunde solo
y llena el feed de auditorías) y *fantasma*, que no responde nunca y por eso suele terminar
primero en el ranking. Ese último es el mejor chiste que produce el IEC, y lo produce solo.

---

## Configuración

Todo opcional. Sin `.env`, la app funciona completa. `cp .env.example .env` para tocar algo.

| Variable | Default | Para qué |
|---|---|---|
| `ROUND_SECONDS` | `90` | La "hora Blink" comprimida |
| `PUBLIC_URL` | tu IP de red local, detectada sola | Lo que se codifica en el QR. En Railway, ponelo a mano. |
| `PRESENTER_KEY` | — | Si se define, `/presenter?key=...` |
| `PORT` | `3000` | |

### Gemini (opcional)

**La app no necesita ningún modelo.** Por defecto el auditor usa plantillas rellenadas con
números medidos: 0ms, $0, sin red. Con `GEMINI_API_KEY`, Gemini redacta la prosa y el banco
queda como fallback.

```bash
npm run models        # verificá el model ID exacto para tu key
```

`gemini.ts` está dimensionado para el free tier con tres defensas: token bucket a 8 RPM (por
debajo del ~10 RPM publicado), tope diario propio, y timeout de 1.2s. **Si algo falla, gana
la plantilla y no se nota.**

> **Los free tiers no aguantan la demo en vivo.** Con 80 personas el pico es de ~107 RPM y
> ~67.000 tokens/minuto — entre 7× y 11× por encima de lo que dan Groq o Gemini gratis. Por eso
> el banco pre-generado es el camino principal y el LLM es un adorno. Para generar el banco
> offline (`npm run bank`, ~12 llamadas) cualquier free tier sobra.

`npm run bank` **no pisa `bank.json` a propósito**: escribe `bank.generated.json` para que
elijas a mano qué línea entra. La comedia curada por alguien que conoce al público le gana a
la generada; el script te da volumen, no criterio.

---

## Deploy

**Destino: Render, plan free. Costo $0.**
**→ Manual completo en [DEPLOY.md](DEPLOY.md)**: paso a paso, tabla de enlaces placeholder,
runbook del día del evento y troubleshooting.

El repo trae `render.yaml`, así que en Render es **New → Blueprint → elegís el repo → Apply**.
Después completás `PUBLIC_URL` con la URL que te asignó y verificás con:

```bash
npm run preflight https://blink.onrender.com
```

**Tres reglas que no se negocian:**

1. **`PUBLIC_URL` definida en producción.** En local se detecta sola; dentro del contenedor
   esa detección devuelve una IP interna y el QR apunta a la nada. `preflight` lo detecta.
2. **Abrí `/presenter` al llegar al venue.** El plan free duerme el servicio a los 15 min sin
   tráfico (~1 min para despertar), pero los mensajes de WebSocket cuentan como tráfico y
   Socket.IO pinguea cada 10s: con esa pestaña abierta no se duerme nunca.
3. **Una sola instancia.** El estado vive en memoria. En el plan free Render no te deja
   escalar, así que viene garantizado por la plataforma.

Alternativa: **Railway** (`railway.json` incluido) — trial de $5 sin tarjeta, sin cold start
y con shell para debug. **Vercel y Netlify no sirven**: son serverless, no hay proceso vivo
que sostenga el reloj ni los WebSockets. **Fly.io ya no tiene free tier.**

---

## Checklist para el 01/10

- [ ] `npm run smoke` pasa entero
- [ ] `PUBLIC_URL` apunta al dominio real y el QR lo escanea bien **desde lejos**
- [ ] `/presenter` probado en el proyector real, a 1920×1080
- [ ] `ROUND_SECONDS=90`
- [ ] Ensayo con 8+ celulares de verdad
- [ ] Video de respaldo grabado y en el escritorio
- [ ] Modo sin LLM verificado (sin `GEMINI_API_KEY` la app tiene que funcionar igual)

**En el escenario, el proyector muestra métricas, nunca el texto de los chats.** Es la forma
más rápida conocida de poner algo impresentable en una pantalla gigante frente a 200 personas.
El `/presenter` ya está construido así: leaderboard, feed de eventos y totales. Nunca mensajes.

---

## Nota para Windows

Matar el proceso del servidor con Ctrl+C en algunas terminales deja el puerto tomado. Si
`npm start` tira `EADDRINUSE`:

```bash
powershell -c "Get-NetTCPConnection -LocalPort 3000 -State Listen | Select -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }"
```
