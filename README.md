# Lumina Chat

Lumina is a full-stack realtime chat experience inspired by Apple Messages, with
one-to-one and group chats, reactions, attachments, stories, calls, friends,
notifications, search, an AI assistant, account settings and an admin overview.

## Quick start

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:5000` and Swagger
documentation is available at `http://localhost:5000/api/docs`.

The application uses a complete in-memory demo dataset if `MONGODB_URI` is empty,
so it works immediately. Log in with `alex@lumina.chat` / `Password123!`, or choose
the demo button. Copy `.env.example` to `.env` and set `MONGODB_URI` for persistent
MongoDB storage.

The browser client cannot provide login, messages or realtime updates by itself:
run `npm run dev` from the repository root so both the Vite client and Express /
Socket.IO API start together. MongoDB and Redis are optional for local demo mode.
Never commit `.env`; if it has previously been pushed, remove it from Git history
and rotate every secret it contained.

If another local project already uses ports `5000` or `5173`, keep it untouched
and run Lumina on isolated ports in PowerShell instead:

```powershell
$env:PORT="5001"
$env:CLIENT_URL="http://localhost:5174"
$env:VITE_PORT="5174"
$env:VITE_API_URL="http://localhost:5001/api"
$env:VITE_SOCKET_URL="http://localhost:5001"
npm run dev
```

Open `http://localhost:5174`. Close that terminal when finished; those temporary
environment values apply only to that terminal session.

## MongoDB data layer

MongoDB uses typed Mongoose models and is never seeded when the API starts. On a
new disposable development database, run the migration before explicitly seeding:

```bash
npm run migrate:mongo -w server
npm run seed:mongo -w server
```

`seed:mongo` refuses a non-empty database unless `--replace` is passed, and it
refuses production by default. The API keeps the in-memory seed only when MongoDB
is not configured, so `npm test` does not require a database.

### Migrating the previous ObjectId schema

If an earlier version of the project used collections such as `users`,
`conversations` and `messages`, first run a non-mutating report:

```bash
npm run migrate:legacy-mongo -w server
```

Review the source/target counts and warnings, make a MongoDB backup, then apply
only to the reported database name:

```bash
npm run migrate:legacy-mongo -w server -- --apply --confirm=chat_app
```

The migration creates `lumina_*` documents with the original IDs and never
deletes or overwrites legacy collections. Legacy refresh tokens and devices are
not migrated, so every user must sign in again and receives a revocable session
from the current authentication system.

Mongo integration tests are opt-in to prevent accidental data deletion. CI should
provide an isolated MongoDB service/database whose name contains `test` or `ci`:

```bash
MONGODB_URI_TEST=mongodb://127.0.0.1:27017/lumina_ci npm run test:mongo -w server
```

## Scripts

- `npm run dev` — run the Vite client and API together.
- `npm run server` — run only the API.
- `npm run build` — build the production client.
- `npm test` — run server and client tests.
- `docker compose up --build` — run web, API, MongoDB and Redis containers.
- `npm run cleanup:uploads -w server -- --grace-hours=24 --limit=100` — remove
  upload records and local files that are no longer referenced.

Uploaded files use a storage-provider abstraction. `local` is the default and
stores files under `server/uploads` unless `LOCAL_UPLOAD_DIR` points to a
persistent volume. API URLs stay behind `/api/uploads/:filename`, so private
attachments, avatars and stories always pass through authorization before a file
is returned. The legacy `/uploads/:filename` route only serves records explicitly
marked as public demo uploads.

The interfaces for `s3`, `r2` and `cloudinary` are reserved for production
adapters, but this repository does not include their SDKs or credentials yet. Do
not set `STORAGE_PROVIDER` to a cloud value until an adapter is implemented and
tested. A malware scan should be integrated after MIME/magic-byte validation and
before `registerUploads` records metadata; reject or quarantine the file there
without returning a usable URL. This project intentionally does not simulate
virus scanning.

## Development checks

Before opening a pull request, use the same checks as CI:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm test
npm run build
```

The GitHub Actions workflow runs `npm ci --no-audit`, the explicit production
dependency audit, tests and the client build on Node.js 20 for every push and
pull request. It uses no repository secrets and can also be started manually.

## Production health and logging

- `GET /api/health` is a liveness check. It only confirms that the API process
  can answer HTTP and does not depend on MongoDB or Redis.
- `GET /api/ready` is a readiness check. It pings MongoDB and Redis, with a
  bounded timeout, whenever their URLs are configured. It returns HTTP `503`
  until every configured dependency is available. Dependencies omitted in local
  demo mode are reported as `not_configured` and do not fail readiness.

Use `/api/health` for process restarts and `/api/ready` before routing traffic to
an instance. HTTP requests and handled errors are written as one-line JSON with
a request ID, method, path without query parameters, status and duration. Request
bodies, cookies and authorization headers are never logged. Sensitive field names
and credential-like values are redacted before structured records are written.

## Production deployment

1. Provision MongoDB with authentication, backups and network access limited to
   the API. Provision Redis when running more than one Socket.IO instance or when
   persistent distributed sessions/presence are required.
2. Put all secrets in the hosting platform's secret manager. Do not bake them
   into images, Compose files, client variables or GitHub Actions.
3. Run `npm ci --omit=dev` for the API, run `npm ci && npm run build -w client`
   for the web client, and serve `client/dist` through HTTPS.
4. Run `npm run migrate:mongo -w server` as a controlled release job before
   starting the new API version. Do not run the demo seed in production.
5. Start the API with `NODE_ENV=production npm start`. Configure the proxy for
   WebSocket upgrades, forward only trusted proxy headers, and route traffic only
   after `/api/ready` returns `200`.
6. Persist and back up `server/uploads` when local uploads are used. Local files
   require shared storage or sticky ownership in a multi-instance deployment.
7. Verify login, refresh, message delivery, attachments and WebRTC calls after
   deployment. TURN is required for reliable calls across restrictive networks.

The provided Compose file is suitable as a deployment starting point: it now
requires JWT secrets from the environment instead of embedding example values.
Use a managed secret source and production-grade MongoDB/Redis outside a single
host for a resilient deployment.

### Environment variables

Server variables:

- `NODE_ENV`, `PORT`, `CLIENT_URL`
- `MONGODB_URI` (required in production), `MONGODB_DNS_SERVERS` (optional
  comma-separated Atlas SRV DNS fallback), `REDIS_URL` (required for multi-instance
  Socket.IO and recommended for production session/realtime coordination)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`,
  `REFRESH_TOKEN_TTL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` when the AI integration is enabled
- `STORAGE_PROVIDER` (`local` by default), `LOCAL_UPLOAD_DIR` for local upload
  volumes, and future cloud-provider configuration such as `S3_BUCKET`,
  `S3_REGION`, `S3_ENDPOINT`, `R2_BUCKET`, `R2_ENDPOINT`,
  `CLOUDINARY_CLOUD_NAME`. Store cloud access keys only in the secret manager
  once the adapter is implemented; do not add them to `.env.example` or client
  variables.
- `STUN_URL` or `STUN_URLS`; `TURN_URL` or `TURN_URLS`, `TURN_USERNAME`, and
  `TURN_CREDENTIAL` (or `TURN_PASSWORD`) for WebRTC
- `CALL_TIMEOUT_MS` for the server-managed ring timeout

Client build variables:

- `VITE_API_URL`
- `VITE_SOCKET_URL`

`FORCE_MEMORY_DB` is only for local/test fallback and must not be enabled in
production. `MONGODB_URI_TEST` is only for an isolated integration-test database.
Never place server secrets in a `VITE_*` variable because those values are public
inside the browser bundle.

### Calling and future group calls

Lumina currently supports one-to-one WebRTC calls only. The server rejects group
conversations for `call:start`, and the client intentionally hides group-call
controls instead of presenting a non-working experience. A production group-call
implementation needs an SFU plus server-owned room membership and should add
authenticated `call:join`, `call:leave`, `call:participant-joined`,
`call:participant-left`, and per-participant negotiation events. Persist a call
room and participant state separately from the per-user call history, then let
the SFU issue short-lived TURN credentials. Do not put TURN credentials in client
source, `.env.example`, or any `VITE_*` value.

## MongoDB backup and restore

Run backups from a trusted machine with MongoDB Database Tools installed. Supply
connection strings through the process environment or secret manager so they do
not appear in shell history:

```bash
mongodump --uri="$MONGODB_URI" --archive="lumina-backup.archive" --gzip
mongorestore --uri="$RESTORE_MONGODB_URI" --archive="lumina-backup.archive" --gzip
```

Encrypt backup archives, restrict access, keep copies in a separate region/account
and test restores regularly. Restore into an isolated database first, verify
document counts, indexes, users, conversations, messages and attachments, then
schedule the production cutover. Add `--drop` only during an approved full restore:
it deletes each target collection before restoring it.

Before database migrations or a release with schema changes, create a fresh
backup and record the application version, migration version and backup checksum.
MongoDB backups do not include files under `server/uploads`; back up that volume
separately and keep it consistent with the Upload records.

## Secret rotation procedure

1. Inventory MongoDB, Redis, SMTP, AI, TURN and JWT credentials and identify all
   API instances and deployment jobs that consume them.
2. Create a new provider credential with the same minimum permissions. Store it
   in the secret manager; never print it in logs or paste it into the repository.
3. Deploy consumers with the new provider credential, verify `/api/ready` and the
   related feature, then revoke the old credential.
4. Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` during a controlled window.
   Changing them invalidates existing access and refresh tokens, so users must
   sign in again. Deploy all API instances together to avoid mixed token signing.
5. Revoke existing refresh sessions if compromise is suspected, restart affected
   workers, verify authentication and monitor structured error rates.
6. Record only the rotation time, owner and credential identifier in the runbook;
   never record the secret value. Repeat rotation on a regular schedule and
   immediately after any suspected exposure.
