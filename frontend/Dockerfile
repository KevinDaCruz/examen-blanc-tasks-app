# ---- Étape 1 : build de l'application React (Vite) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optionnel : URL d'API si elle est sur un autre domaine (par défaut "/api", même origine).
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Étape 2 : service des fichiers statiques par nginx (non-root, port 8080) ----
FROM nginxinc/nginx-unprivileged:1.29-alpine
# Le template est rendu au démarrage (envsubst) avec BACKEND_UPSTREAM.
ENV BACKEND_UPSTREAM=backend:5000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
