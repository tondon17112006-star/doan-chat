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

## Scripts

- `npm run dev` — run the Vite client and API together.
- `npm run server` — run only the API.
- `npm run build` — build the production client.
- `npm test` — run server and client tests.
- `docker compose up --build` — run web, API, MongoDB and Redis containers.

Uploaded files are stored under `server/uploads` in local development. Configure
an object-storage adapter before using the project in a multi-instance production
deployment.
