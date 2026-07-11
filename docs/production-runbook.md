# Production runbook

## Deploy

1. Copy `.env.production.example` to `.env.production` and replace every placeholder with a random secret.
2. Set `PUBLIC_ORIGIN` to the final HTTPS origin.
3. Run `docker compose --env-file .env.production -f docker-compose.prod.yml build`.
4. Run `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`.
5. Verify `/health`, `/ready`, `/metrics`, login, media streaming and WebSocket presence.

Only the web container publishes a host port. PostgreSQL, Redis and API stay on the internal Docker network.

## TLS

Terminate TLS in the hosting load balancer or place Caddy/Traefik in front of port 80. Redirect HTTP to HTTPS and keep `PUBLIC_ORIGIN` synchronized with the public hostname.

## Backup and restore

The `backup` service writes a compressed PostgreSQL dump every 24 hours and removes dumps older than 14 days. Copy the `backups` directory and the `app_data` Docker volume to independent storage.

Restore into an empty database:

```sh
pg_restore --clean --if-exists -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" /backups/<file>.dump
```

After restoring, run `alembic upgrade head`, verify media files and execute a Gecko export smoke test.

## Monitoring

- `/health`: process and dependency overview.
- `/ready`: load-balancer readiness.
- `/metrics`: Prometheus-compatible request counters.
- Every HTTP response contains `X-Request-ID`; application logs contain the same request identifier.

Alert on sustained 5xx responses, unavailable PostgreSQL/Redis, disk usage above 80%, failed backups and repeated WebSocket reconnects.

## Maintenance

Run `purrscription-cleanup` in the API container after database/file maintenance to remove orphaned media and exports. Always take a backup first.
