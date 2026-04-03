#!/bin/sh
# Именованный том /app/uploads в Docker часто root:root; процесс API — app (uid 1001).
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads/avatars
  if ! chown -R app:app /app/uploads 2>/dev/null; then
    echo "[entrypoint] warning: chown /app/uploads failed (NFS/special FS?); uploads may break for user app"
  fi
  exec su-exec app "$@"
fi
exec "$@"
