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

Uploaded files are stored under `server/uploads` in local development. Configure
an object-storage adapter before using the project in a multi-instance production
deployment.

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
- `MONGODB_URI` (required in production), `REDIS_URL` (required for multi-instance
  Socket.IO and recommended for production session/realtime coordination)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`,
  `REFRESH_TOKEN_TTL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` when the AI integration is enabled
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
