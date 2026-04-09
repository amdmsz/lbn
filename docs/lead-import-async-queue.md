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

## Redis

You can use:

- a local `redis.service`
- or any external Redis reachable from `REDIS_URL`

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

## Validation checklist

After deployment:

- confirm Redis connectivity
- confirm the web app can create a `QUEUED` batch
- confirm the worker moves the batch to `IMPORTING`
- confirm progress appears in both the import center and the batch detail page
- confirm completed batches move to `COMPLETED`
- confirm failed batches expose `errorMessage` in the detail page
