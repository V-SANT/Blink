# Alternativa portable a Nixpacks. Railway no lo necesita (detecta Node solo), pero
# sirve para Fly.io, Render, un VPS, o para reproducir el build exacto en local.
#
#   docker build -t blink .
#   docker run -p 3000:3000 -e PUBLIC_URL=https://blink.lat blink

FROM node:22-alpine AS build
WORKDIR /app

# Copiar los manifiestos primero: la capa de dependencias se cachea entre builds.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Imagen final ────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# tsx corre el servidor TypeScript directo: no hay paso de compilación del backend.
# Por eso se instalan todas las dependencias, no solo las de producción.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared

EXPOSE 3000

# Blink no tiene estado persistente: si el proceso muere, la sesión se pierde.
# Eso es intencional, pero el healthcheck permite que el host lo reponga rápido.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["npm", "start"]
