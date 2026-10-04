#!/bin/sh
# Backup diario do banco. Rodar na VPS, na pasta do docker-compose.yml.
# Cron sugerido: 0 3 * * * cd /opt/superapp && ./db/vps/backup.sh >> backups/backup.log 2>&1
set -e

KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"

docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/superapp-'"$STAMP"'.dump"'
find ./backups -name 'superapp-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Iseconds) backup ok: superapp-$STAMP.dump"
