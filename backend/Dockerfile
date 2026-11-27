# ---- Image de production du backend ----
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=5000 \
    LOG_DIR=/app/logs

WORKDIR /app

# Dépendances de production uniquement (cache Docker optimisé).
# Correctifs de sécurité de l'OS, dépendances de production uniquement, puis suppression
# de npm/corepack (inutiles à l'exécution, ils embarquent leurs propres dépendances vulnérables).
COPY package.json package-lock.json ./
RUN apk upgrade --no-cache \
  && npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.npm

COPY --chown=node:node . .
RUN mkdir -p /app/logs && chown node:node /app/logs

# Exécution sans privilèges root.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
