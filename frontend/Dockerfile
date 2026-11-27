# ---- Étape 1 : build de l'application React (Vite) ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optionnel : URL d'API si elle est sur un autre domaine (par défaut "/api", même origine).
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Étape 2 : service des fichiers statiques par nginx (non-root, port 8080) ----
# Image officielle, branche stable (mineur pair), plus correctifs de sécurité Alpine.
# (L'image nginxinc/nginx-unprivileged avait un retard de version et des CVE critiques
# signalées par Trivy.) On applique ici les mêmes réglages pour tourner sans root.
FROM nginx:1.30-alpine
RUN apk upgrade --no-cache \
  && sed -i -e '/^user /d' -e 's|^pid .*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
  && rm -f /etc/nginx/conf.d/default.conf \
  && chown -R nginx:nginx /var/cache/nginx /etc/nginx/conf.d
# Le template est rendu au démarrage (envsubst) avec BACKEND_UPSTREAM.
ENV BACKEND_UPSTREAM=backend:5000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
