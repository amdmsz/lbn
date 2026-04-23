# Async Lead Import Queue

This document describes the runtime and deployment requirements for the BullMQ-based async import pipeline used by:

- `/lead-imports`
- `/lead-imports?mode=customer_continuation`

## Architecture

- Web app:
  - validates the upload
  - creates the import batch
  - stores the source file under `runtime/imports/lead-imports`
  - enqueues the batch into BullMQ
- Redis:
  - stores BullMQ queue state
- Worker:
  - consumes queued batches
  - parses files in the background
  - processes rows in small chunks and short transactions
  - updates batch progress, stage, heartbeat, and final report

## Required environment variables

Add these to the shared production env file:

```bash
REDIS_URL=redis://127.0.0.1:6379
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_JOB_ATTEMPTS=3
```

Current local deployment example:

```bash
REDIS_URL=redis://172.31.186.171:6379
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_JOB_ATTEMPTS=3
```

Defaults are intentionally conservative:

- concurrency defaults to `1`
- chunk size defaults to `20`
- job attempts default to `3`

## Required runtime directory

The async pipeline stores uploaded source files under:

```text
runtime/imports/lead-imports
```

Recommended bootstrap:

```bash
sudo mkdir -p /srv/jiuzhuang-crm/current/runtime/imports/lead-imports
sudo chown -R crm:crm /srv/jiuzhuang-crm/current/runtime
```

## systemd services

The repository includes two service templates:

- Web app:
  - `deploy/systemd/jiuzhuang-crm.service`
- Async import worker:
  - `deploy/systemd/jiuzhuang-crm-import-worker.service`

Install the worker service:

```bash
sudo cp deploy/systemd/jiuzhuang-crm-import-worker.service /etc/systemd/system/jiuzhuang-crm-import-worker.service
sudo systemctl daemon-reload
sudo systemctl enable jiuzhuang-crm-import-worker
sudo systemctl start jiuzhuang-crm-import-worker
sudo systemctl status jiuzhuang-crm-import-worker --no-pager
```

The worker uses:

```bash
npm run worker:lead-imports
```

Recommended runtime check:

```bash
npm run check:lead-import-runtime
```

To fail loudly when no worker is currently online:

```bash
REQUIRE_LEAD_IMPORT_WORKER=1 npm run check:lead-import-runtime
```

## Redis

You can use:

- a local `redis.service`
- or any external Redis reachable from `REDIS_URL`

For the current local deployment, Redis is configured through:

```bash
redis://172.31.186.171:6379
```

If Redis is unavailable, the web app can no longer enqueue new import batches.

## Single-host deploy updates

`scripts/deploy-update.sh` now:

- ensures `runtime/imports/lead-imports` exists
- applies ownership to the runtime directory when `APP_USER` and `APP_GROUP` are provided
- restarts the web app service
- restarts the worker service when `WORKER_SERVICE_NAME` exists on the host

Default worker service name:

```bash
jiuzhuang-crm-import-worker
```

Override it if needed:

```bash
WORKER_SERVICE_NAME=your-worker-service-name
```

## Current server rollout checklist

The commands below assume:

- app root: `/srv/jiuzhuang-crm/current`
- app user/group: `crm:crm`
- env file: `/srv/jiuzhuang-crm/current/.env`
- Redis: `172.31.186.171:6379`
- no Redis password is enabled

If your server paths or user/group differ, replace the variables before running.

### 1. Update env

Run from the app root:

```bash
cd /srv/jiuzhuang-crm/current

grep -q '^REDIS_URL=' .env \
  && sed -i 's#^REDIS_URL=.*#REDIS_URL="redis://172.31.186.171:6379"#' .env \
  || echo 'REDIS_URL="redis://172.31.186.171:6379"' >> .env

grep -q '^LEAD_IMPORT_WORKER_CONCURRENCY=' .env \
  && sed -i 's#^LEAD_IMPORT_WORKER_CONCURRENCY=.*#LEAD_IMPORT_WORKER_CONCURRENCY="1"#' .env \
  || echo 'LEAD_IMPORT_WORKER_CONCURRENCY="1"' >> .env

grep -q '^LEAD_IMPORT_CHUNK_SIZE=' .env \
  && sed -i 's#^LEAD_IMPORT_CHUNK_SIZE=.*#LEAD_IMPORT_CHUNK_SIZE="20"#' .env \
  || echo 'LEAD_IMPORT_CHUNK_SIZE="20"' >> .env

grep -q '^LEAD_IMPORT_JOB_ATTEMPTS=' .env \
  && sed -i 's#^LEAD_IMPORT_JOB_ATTEMPTS=.*#LEAD_IMPORT_JOB_ATTEMPTS="3"#' .env \
  || echo 'LEAD_IMPORT_JOB_ATTEMPTS="3"' >> .env
```

### 2. Verify Redis connectivity

```bash
redis-cli -h 172.31.186.171 -p 6379 ping
```

Expected result:

```text
PONG
```

### 3. Prepare runtime directory

```bash
sudo mkdir -p /srv/jiuzhuang-crm/current/runtime/imports/lead-imports
sudo chown -R crm:crm /srv/jiuzhuang-crm/current/runtime
```

### 4. Install or refresh systemd services

```bash
cd /srv/jiuzhuang-crm/current

APP_ROOT=/srv/jiuzhuang-crm/current
APP_USER=crm
APP_GROUP=crm
ENV_FILE=/srv/jiuzhuang-crm/current/.env

sudo sed \
  -e "s#__APP_ROOT__#${APP_ROOT}#g" \
  -e "s#__APP_USER__#${APP_USER}#g" \
  -e "s#__APP_GROUP__#${APP_GROUP}#g" \
  -e "s#__ENV_FILE__#${ENV_FILE}#g" \
  deploy/systemd/jiuzhuang-crm.service \
  | sudo tee /etc/systemd/system/jiuzhuang-crm.service >/dev/null

sudo sed \
  -e "s#__APP_ROOT__#${APP_ROOT}#g" \
  -e "s#__APP_USER__#${APP_USER}#g" \
  -e "s#__APP_GROUP__#${APP_GROUP}#g" \
  -e "s#__ENV_FILE__#${ENV_FILE}#g" \
  deploy/systemd/jiuzhuang-crm-import-worker.service \
  | sudo tee /etc/systemd/system/jiuzhuang-crm-import-worker.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable jiuzhuang-crm
sudo systemctl enable jiuzhuang-crm-import-worker
```

### 5. Deploy code, run migration, build, and restart

```bash
cd /srv/jiuzhuang-crm/current

APP_USER=crm \
APP_GROUP=crm \
ENV_FILE=/srv/jiuzhuang-crm/current/.env \
RUN_MIGRATE_DEPLOY=1 \
bash scripts/deploy-update.sh
```

This script will:

- pull the latest code
- ensure `runtime/imports/lead-imports` exists
- run `npm ci`
- run `npm run prisma:predeploy:check`
- run `npm run prisma:deploy:safe -- --skip-generate`
- run `npx prisma generate`
- run `npm run build`
- restart `jiuzhuang-crm`
- restart `jiuzhuang-crm-import-worker` if it is installed

### 6. Check service status and logs

```bash
sudo systemctl status jiuzhuang-crm --no-pager
sudo systemctl status jiuzhuang-crm-import-worker --no-pager
sudo journalctl -u jiuzhuang-crm-import-worker -n 100 --no-pager
```

Then run the runtime check from the app root:

```bash
cd /srv/jiuzhuang-crm/current
REQUIRE_LEAD_IMPORT_WORKER=1 npm run check:lead-import-runtime
```

### 7. Final business verification

- Upload a small file in `/lead-imports`
- Confirm the batch first enters `QUEUED`
- Confirm it then moves to `IMPORTING`
- Confirm the worker is updating progress in the import center and batch detail page
- Confirm the batch finishes as `COMPLETED` or exposes a clear `FAILED` reason

## Validation checklist

After deployment:

- confirm Redis connectivity
- run `npm run check:lead-import-runtime`
- confirm the web app can create a `QUEUED` batch
- confirm the worker moves the batch to `IMPORTING`
- confirm progress appears in both the import center and the batch detail page
- confirm completed batches move to `COMPLETED`
- confirm failed batches expose `errorMessage` in the detail page
