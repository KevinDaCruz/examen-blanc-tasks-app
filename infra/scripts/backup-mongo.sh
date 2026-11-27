#!/usr/bin/env bash
# Sauvegarde quotidienne de MongoDB (à planifier via cron, utilisateur deploy) :
#   0 3 * * * /opt/tasks-app/infra/scripts/backup-mongo.sh prod >> /opt/tasks-app/backups/backup.log 2>&1
# Restauration :
#   docker exec -i tasks-prod-mongo-1 sh -c 'mongorestore --archive --gzip --drop -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD"' < fichier.archive.gz
set -euo pipefail
ENV_NAME="${1:-prod}"
KEEP_DAYS="${KEEP_DAYS:-7}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)/backups"
mkdir -p "$DIR"
FILE="$DIR/mongo-${ENV_NAME}-$(date +%Y%m%d-%H%M%S).archive.gz"
docker exec "tasks-${ENV_NAME}-mongo-1" sh -c \
  'mongodump --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' >"$FILE"
find "$DIR" -name "mongo-${ENV_NAME}-*.archive.gz" -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
