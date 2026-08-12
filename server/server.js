import http from "node:http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { closeRedis, connectRedis } from "./config/redis.js";
import { closeSocketAdapter, configureSocketAdapter } from "./config/socketAdapter.js";
import { initializeDataService } from "./services/dataService.js";
import { registerSocketHandlers } from "./sockets/index.js";

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.clientUrl, credentials: true, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

app.set("io", io);
registerSocketHandlers(io);

await connectDatabase();
await initializeDataService();
await connectRedis();
await configureSocketAdapter(io);

server.listen(env.port, () => {
  console.info(`● Lumina API: http://localhost:${env.port}`);
  console.info(`● API docs: http://localhost:${env.port}/api/docs`);
});

async function shutdown(signal) {
  console.info(`\n● ${signal}: shutting down`);
  io.close();
  server.close(async () => {
    await closeSocketAdapter();
    await closeRedis();
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
