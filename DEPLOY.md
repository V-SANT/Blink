# BLINK — Manual de deploy

Destino: **Render, plan free.** Costo: **$0.**
Tiempo estimado la primera vez: **15 minutos**.

---

## 🔗 Los enlaces

Todo el proyecto usa estos placeholders. **Reemplazalos por los reales y completá la columna
de la derecha a medida que avanzás.**

| # | Qué | Placeholder | El real (completá acá) |
|---|---|---|---|
| 1 | **App (jugadores)** — lo que codifica el QR | `https://blink.onrender.com` | `_______________________` |
| 2 | **Proyector** | `https://blink.onrender.com/presenter?key=campanada-2026` | `_______________________` |
| 3 | **Dominio propio** (opcional) | `https://blink.lat` | `_______________________` |
| 4 | **Repo de GitHub** | `https://github.com/TU-USUARIO/blink` | `_______________________` |
| 5 | **Health check** | `https://blink.onrender.com/health` | `_______________________` |
| 6 | **Clave del presentador** | `campanada-2026` | `_______________________` |

> Buscá la palabra `REEMPLAZAR` en `.env.production.example`: cuando no quede ninguna,
> terminaste. Y **cambiá `campanada-2026`** — si alguien del público adivina la clave, puede
> disparar la campanada desde la tercera fila.

---

## ⚠️ Las tres reglas que no se negocian

**1. `PUBLIC_URL` tiene que estar definida en producción.**
En local el servidor detecta tu IP solo. En un contenedor, esa detección devuelve una IP
interna y **el QR apunta a un lugar que no existe**. Si el QR no funciona, no hay demo.
`npm run preflight` detecta esto solo (ver Paso 5).

**2. Abrí `/presenter` apenas llegás al venue.**
El plan free duerme el servicio a los 15 minutos sin tráfico y tarda ~1 minuto en despertar.
Pero **los mensajes de WebSocket cuentan como tráfico**, y Socket.IO está configurado con
`pingInterval: 10_000`: el cliente manda un pong cada 10 segundos. Con la pestaña del
proyector abierta, el servicio no se duerme nunca. Sin keep-alive externo, sin cron.

**3. Una sola instancia.**
El estado vive en memoria; dos instancias serían dos partidas separadas que no se ven entre
sí. En el plan free Render **no te deja escalar**, así que esto viene garantizado por la
plataforma. Si algún día pasás a un plan pago, no lo toques.

---

## Paso 1 — Subir el código a GitHub

```bash
cd blink
git init
git add .
git commit -m "Blink: MVP para SideQuest"
```

Creá el repo (puede ser privado) y empujá:

```bash
gh repo create blink --private --source=. --push
```

Si no tenés `gh`, creá el repo desde github.com y después:

```bash
git remote add origin https://github.com/TU-USUARIO/blink.git && git branch -M main && git push -u origin main
```

> `.gitignore` ya excluye `.env`, `node_modules/` y `dist/`. **Nunca commitees `.env`** — si
> alguna vez ponés una API key ahí, queda en el historial del repo para siempre.

---

## Paso 2 — Crear el servicio en Render

El repo incluye `render.yaml`, así que Render se configura solo.

1. Entrá a [render.com](https://render.com) y logueate con GitHub.
2. **New → Blueprint**.
3. Elegí el repo `blink` → **Connect**.
4. Render lee `render.yaml` y te muestra el servicio con todo precargado: runtime Node,
   plan free, región Virginia, build `npm ci && npm run build`, start `npm start`,
   healthcheck en `/health`.
5. Te va a pedir las dos variables marcadas como `sync: false`:
   - **`PUBLIC_URL`** → dejala en blanco por ahora. La completás en el Paso 3, cuando ya
     sepas qué URL te asignó Render.
   - **`PRESENTER_KEY`** → poné tu clave (no uses `campanada-2026`).
6. **Apply**. El primer deploy tarda ~3 minutos.

<details>
<summary>Si preferís configurarlo a mano (sin Blueprint)</summary>

**New → Web Service** → conectá el repo, y cargá:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

Y las variables del Paso 3.
</details>

---

## Paso 3 — La URL y las variables

Cuando termine el deploy, Render te muestra la URL arriba de todo: algo como
`https://blink.onrender.com`.

Andá a **Environment** y completá:

```
PUBLIC_URL=https://blink.onrender.com     ← la URL exacta que te dio Render
ROUND_SECONDS=90
PRESENTER_KEY=tu-clave-secreta
```

**No definas `PORT`**: Render la inyecta y el servidor ya la lee.
**No definas `NODE_ENV=production`**: no hace falta, y en un host que saltee
`devDependencies` rompería el build de Vite. (Por eso todo lo necesario para compilar está
en `dependencies` — ver el comentario en `package.json`.)

Guardá; Render redeploya solo.

> **Este es el paso que más se olvida.** Si `PUBLIC_URL` no coincide exactamente con el
> dominio real, el QR del proyector lleva a ningún lado y no te enterás hasta que estás
> arriba del escenario con ochenta teléfonos apuntando a la pantalla.

---

## Paso 4 — Dominio propio (opcional, ~$15/año)

El QR codifica cualquier URL sin problema, así que el dominio **no es para el QR**: es para
la persona que no puede escanear y tiene que tipear. Siempre hay una, y suele estar en la
primera fila.

Render soporta dominios propios **también en el plan free**, con certificado TLS automático.

1. Comprá el dominio (Namecheap, Porkbun, Cloudflare). `.lat` ~$12, `.app` ~$15, `.wtf` ~$28.
2. Render → tu servicio → **Settings → Custom Domains → Add Custom Domain**.
3. Render te da un registro CNAME. Cargalo en el panel de tu registrador.
4. Esperá la propagación. El certificado HTTPS se emite solo.
5. **Actualizá `PUBLIC_URL` al dominio nuevo.**

> Hacelo **antes del 26/09**, no la semana del evento. La propagación de DNS es la clase de
> cosa que tarda 5 minutos o 26 horas sin razón aparente.

---

## Paso 5 — Verificación automática

```bash
npm run preflight https://blink.onrender.com
```

Chequea lo que de verdad rompe una demo en vivo:

- si el servicio estaba dormido y **cuánto tardó en despertar**
- si **`PUBLIC_URL` coincide** con el dominio real ← el error que deja el QR muerto
- si el build del cliente está publicado
- si la ronda dura 90s
- si `/presenter` está protegido
- si las dos páginas cargan
- **si el ciclo del juego responde de verdad** — conecta un WebSocket real y se une a una
  partida, que es más de lo que prueba un healthcheck

Sale con código 1 si hay fallas, así que sirve en CI. Ejemplo de una corrida con problemas:

```
2. Configuración
  FALLA PUBLIC_URL es "https://blink.lat" pero el dominio real es "https://blink.onrender.com"
        → El QR del proyector va a apuntar a ningún lado. Poné PUBLIC_URL=https://...
  AVISO la ronda no dura 90s — ROUND_SECONDS=45. Para el evento se quiere 90.
```

Y localmente, antes de cada push:

```bash
npm run typecheck && npm run smoke
```

---

## Paso 6 — Verificación a mano (10 minutos, hacela completa)

- [ ] `npm run preflight <url>` sale **Todo listo**
- [ ] La app carga en el celular **con datos móviles, no con wifi** — así probás que sale a
      internet de verdad y no por tu red local
- [ ] El QR del proyector escanea bien **desde 3 metros** (probalo en serio, no de cerca)
- [ ] `/presenter` sin `?key=` muestra "Acceso denegado"
- [ ] `/presenter?key=tu-clave` entra
- [ ] Dos celulares distintos → campanada → se ven los mensajes entre sí
- [ ] Suenan la campanada y la vibración
- [ ] Llegaste hasta el Contacto Efímero y viste el contacto aparecer y desaparecer
- [ ] **Dejaste `/presenter` abierto 20 minutos y el servicio siguió despierto** (esta es la
      prueba de que la regla #2 funciona en tu caso)

---

## 🎬 Runbook del 01/10

**Tres días antes**
- [ ] Deploy final hecho y `preflight` en verde. **Después de esto no se toca el código.**
- [ ] `ROUND_SECONDS=90` confirmado
- [ ] Video de respaldo grabado y en el escritorio de la laptop

**El día, dos horas antes**
- [ ] `npm run preflight <url>` desde tu casa
- [ ] Revisá las **horas de instancia** del mes en Render (750 por workspace). Si venís
      corto, no dejes el servicio despierto de gusto.

**Al llegar al venue — lo primero de todo**
- [ ] **Abrí `/presenter?key=...` y dejalo abierto.** Si estaba dormido, tarda ~1 minuto.
      A partir de ahí no se duerme más mientras esa pestaña siga viva.
- [ ] Probá el proyector: resolución, que el QR se lea, que el texto se vea desde el fondo
- [ ] Subí el volumen de la laptop (la campanada en la sala importa)
- [ ] Laptop enchufada. Notificaciones silenciadas. **No cierres la tapa** — si la laptop se
      suspende, se corta el socket y a los 15 minutos el servicio se duerme.

**Cinco minutos antes**
- [ ] `/presenter` en lobby, contador en 0
- [ ] Tocá **+ 6 perfiles** y después **Reiniciar todo** — eso desbloquea el audio del
      navegador (que necesita un gesto del usuario) y deja el contador limpio
- [ ] Celular propio conectado como jugador de prueba

**Durante**
1. Mostrás el QR. El contador sube.
2. **🔔 CAMPANADA** → cuenta 3·2·1 → todos emparejados a la vez.
3. 90 segundos. Narrás el feed, no los chats.
4. Ventana de interés (15s) → Contacto Efímero → Wall of Shame.
5. Otra ronda: **Nueva ronda** (conserva el IEC) o **Reiniciar todo** (borra).

**Si algo se rompe**
> *"Como toda relación moderna, esto también me abandonó. Grabé una cuando funcionaba."*
> → ponés el video. El fallo pasa a ser parte del bit.

---

## Troubleshooting

| Síntoma | Causa casi segura | Solución |
|---|---|---|
| El QR no lleva a ningún lado | `PUBLIC_URL` mal o sin definir | Poné la URL exacta y redeploy. `preflight` lo detecta. |
| La primera carga tarda ~1 min | El servicio estaba dormido | Normal en free. Abrí `/presenter` al llegar y no vuelve a pasar. |
| Se durmió en medio del evento | Se cerró la pestaña del proyector o la laptop se suspendió | Mantené `/presenter` abierto y la tapa abierta. |
| "Servicio suspendido hasta el mes que viene" | Agotaste las 750 horas del workspace | Son compartidas entre todos los servicios free. Borrá los que no uses. |
| El build falla en `vite: not found` | El host saltea `devDependencies` | Ya está resuelto: todo lo del build está en `dependencies`. No lo muevas. |
| Se desconectan cada pocos segundos | Wifi del venue saturado | Socket.IO reconecta solo y cae a long-polling. La UI avisa "Despertando el sistema". |
| No suena nada | El navegador bloquea audio sin gesto previo | Tocá cualquier botón del proyector antes de empezar. |
| El presentador entra sin clave | `PRESENTER_KEY` no está definida | Definila en Environment. |
| Todo anda pero el estado se borró solo | El contenedor se reinició | Es esperable: el estado vive en memoria. Reiniciá la ronda. |

**Logs**: Render → tu servicio → **Logs**. En el plan free no hay shell, así que los logs son
todo lo que tenés para diagnosticar en vivo.

---

## Límites del plan free (lo que importa saber)

| | |
|---|---|
| RAM / CPU | 512 MB, CPU fraccional — a Blink le sobra |
| Instancias | **1, no escalable** — justo lo que Blink necesita |
| Sueño | a los 15 min sin tráfico HTTP **ni mensajes de WebSocket** |
| Despertar | ~1 minuto |
| Horas | 750/mes **por workspace**, compartidas entre servicios |
| Shell | no disponible |
| Dominio propio | sí, con TLS automático |

750 horas son 31 días completos, así que aunque lo dejaras despierto todo el mes entrarías
justo. Pero no hay razón para dejarlo despierto: se despierta solo cuando lo necesitás.

---

## Alternativas

**Railway** — `railway.json` está en el repo. Trial de $5 sin tarjeta (alcanza de sobra para
el evento), después $5/mes. Sin cold start y con shell para debug. Es el plan B si Render te
da problemas: New Project → Deploy from GitHub repo → definís `PUBLIC_URL`. **Ojo:** ahí sí
podés escalar por accidente, y `railway.json` fija `numReplicas: 1` justamente para evitarlo.

**Fly.io** — **ya no tiene free tier** (eliminado en octubre de 2024; el trial son 2 horas de
VM o 7 días). Como opción paga son ~$2–5/mes con el `Dockerfile` del repo.

**Docker en cualquier VPS** — el `Dockerfile` es multi-stage y expone el 3000:

```bash
docker build -t blink . && docker run -p 3000:3000 -e PUBLIC_URL=https://blink.lat blink
```

> El camino verificado de punta a punta es Render. El `Dockerfile` sigue el patrón estándar
> pero **no fue construido en este entorno**, así que si vas por ahí, probalo con tiempo.

**Vercel / Netlify — no sirven.** Son serverless: no hay proceso vivo que sostenga el reloj
ni las conexiones WebSocket. Blink es un servidor de juego, no un sitio.

---

## Rollback

Render → tu servicio → **Events** → buscá el deploy que funcionaba → **Rollback**.
Tarda ~2 minutos.

Si Render entero se cae el 01/10 (no sería la primera vez que un PaaS elige el peor momento),
el plan B es local:

```bash
npm run build && npm start
```

El servidor detecta tu IP de red local solo y la imprime al arrancar. Todos en la wifi del
venue apuntan ahí. **Anotá tu IP local en un papel antes de salir de casa**, y si el wifi del
venue no deja, compartí datos desde el celular y usá esa red.
