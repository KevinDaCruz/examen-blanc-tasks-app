# ---- Image de production du backend ----
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=5000 \
    LOG_DIR=/app/logs

WORKDIR /app

# Dépendances de production uniquement (cache Docker optimisé).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p /app/logs && chown node:node /app/logs

# Exécution sans privilèges root.
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
