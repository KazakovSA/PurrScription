#!/bin/sh
set -e

mkdir -p /data/media /data/exports /data/media/avatars
chown -R appuser:appuser /data

if [ "$(id -u)" = "0" ]; then
  exec su -s /bin/sh appuser -c 'exec "$@"' sh "$@"
fi

exec "$@"
