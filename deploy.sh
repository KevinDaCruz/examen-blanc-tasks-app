#!/usr/bin/env bash
# =============================================================================
# Déploiement de l'application avec Docker Compose.
#
# Usage :
#   ./deploy.sh local                 # build des images en local + démarrage (http://localhost:8080)
#   ./deploy.sh preprod <tag>         # sur le serveur : pull de l'image <tag> + redémarrage
#   ./deploy.sh prod <tag>            # idem pour la production
#
# Appelé par la CI (GitHub Actions) via SSH, ou à la main sur le serveur.
# Étapes : vérifications -> réseau -> pull -> up --wait (healthchecks) ->
#          smoke test -> rollback automatique vers le tag précédent en cas d'échec.
# =============================================================================
set -euo pipefail

ENV_NAME="${1:-}"
TAG="${2:-latest}"
cd "$(dirname "$0")"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] ERREUR:\033[0m %s\n' "$*" >&2; exit 1; }

case "$ENV_NAME" in
  local | preprod | prod) ;;
  *) die "usage: $0 <local|preprod|prod> [tag]" ;;
esac

ENV_FILE=".env.${ENV_NAME}"
[ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable (copier .env.example et remplir les secrets)"
command -v docker >/dev/null || die "docker n'est pas installé"

# Base de données : MongoDB Atlas si MONGO_URI est renseigné, sinon conteneur MongoDB local.
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e "s/^['\"]//" -e "s/['\"]$//"; }
if [ -n "$(env_value MONGO_URI)" ]; then
  log "base de données : MongoDB externe (Atlas)"
  export COMPOSE_PROFILES=""
else
  for v in MONGO_ROOT_USER MONGO_ROOT_PASSWORD MONGO_APP_USER MONGO_APP_PASSWORD; do
    [ -n "$(env_value "$v")" ] || die "$v manquant dans $ENV_FILE (ou renseigner MONGO_URI pour Atlas)"
  done
  log "base de données : conteneur MongoDB (profil local-db)"
  export COMPOSE_PROFILES="local-db"
fi

PROJECT="tasks-${ENV_NAME}"
NETWORK="tasks-${ENV_NAME}-net"
STATE_FILE=".deployed-${ENV_NAME}"
COMPOSE=(docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml)

# Réseau partagé avec le reverse-proxy et la supervision.
docker network inspect "$NETWORK" >/dev/null 2>&1 || {
  log "création du réseau $NETWORK"
  docker network create "$NETWORK" >/dev/null
}

if [ "$ENV_NAME" = "local" ]; then
  COMPOSE+=(-f docker-compose.build.yml)
  log "build et démarrage local"
  "${COMPOSE[@]}" up -d --build --wait --wait-timeout 180
  log "OK -> http://localhost:$(grep -E '^APP_PORT=' "$ENV_FILE" | cut -d= -f2 || echo 8080)"
  exit 0
fi

PREVIOUS_TAG="$(cat "$STATE_FILE" 2>/dev/null || true)"
export IMAGE_TAG="$TAG" # prioritaire sur la valeur du fichier .env

log "environnement=$ENV_NAME tag=$TAG (précédent: ${PREVIOUS_TAG:-aucun})"
log "téléchargement des images"
"${COMPOSE[@]}" pull backend frontend

deploy_ok=true
log "démarrage (attente des healthchecks)"
"${COMPOSE[@]}" up -d --no-build --remove-orphans --wait --wait-timeout 180 || deploy_ok=false

if $deploy_ok; then
  # Smoke test : l'API répond-elle via nginx ?
  PORT="$(grep -E '^APP_PORT=' "$ENV_FILE" | cut -d= -f2)"
  if ! curl -fsS --retry 5 --retry-delay 3 "http://127.0.0.1:${PORT:-8080}/api/health" >/dev/null; then
    deploy_ok=false
  fi
fi

if ! $deploy_ok; then
  log "échec du déploiement, état des conteneurs :"
  "${COMPOSE[@]}" ps
  "${COMPOSE[@]}" logs --tail 50 backend || true
  if [ -n "$PREVIOUS_TAG" ]; then
    log "ROLLBACK vers $PREVIOUS_TAG"
    IMAGE_TAG="$PREVIOUS_TAG" "${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 180
  fi
  die "déploiement de $TAG annulé"
fi

echo "$TAG" >"$STATE_FILE"
echo "$(date -u +%FT%TZ) $ENV_NAME $TAG" >>deployments.log
docker image prune -f >/dev/null
log "déploiement $ENV_NAME:$TAG réussi"
