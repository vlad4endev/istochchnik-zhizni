#!/bin/sh
# Именованный том для загрузок: по умолчанию /app/uploads. Задайте UPLOADS_DIR — тогда том монтируйте туда.
# Процесс API — app (uid 1001); каталог должен быть доступен на запись.
if [ "$(id -u)" = "0" ]; then
  UPLOADS_ROOT="${UPLOADS_DIR:-/app/uploads}"
  mkdir -p "$UPLOADS_ROOT/avatars"
  if ! chown -R app:app "$UPLOADS_ROOT" 2>/dev/null; then
    echo "[entrypoint] warning: chown $UPLOADS_ROOT failed (NFS/special FS?); uploads may break for user app"
  fi
  SECRETS_ROOT="${SECRETS_DIR:-/app/secrets}"
  if [ -d "$SECRETS_ROOT" ]; then
    if ! chown -R app:app "$SECRETS_ROOT" 2>/dev/null; then
      echo "[entrypoint] warning: chown $SECRETS_ROOT failed; Firebase key may be unreadable for user app"
    fi
  fi
  exec su-exec app "$@"
fi
exec "$@"
