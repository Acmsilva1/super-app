#!/bin/sh
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v fixed_user_id="$FIXED_USER_ID" \
  -v fixed_user_email="$FIXED_USER_EMAIL" \
  -v authenticator_password="$AUTHENTICATOR_PASSWORD" \
  -f /sql/01-bootstrap.sql
