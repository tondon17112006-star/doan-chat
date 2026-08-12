import { createAdapter } from "@socket.io/redis-adapter";
import { redisClient } from "./redis.js";

let pubClient = null;
let subClient = null;

export async function configureSocketAdapter(io) {
  const redis = redisClient();
  if (!redis) {
    console.info("● Socket.IO: single-server adapter");
    return false;
  }
  try {
    pubClient = redis.duplicate({ lazyConnect: true });
    subClient = redis.duplicate({ lazyConnect: true });
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.info("● Socket.IO: Redis adapter enabled");
    return true;
  } catch (error) {
    pubClient?.disconnect();
    subClient?.disconnect();
    pubClient = null;
    subClient = null;
    console.warn(`● Socket.IO Redis adapter unavailable: ${error.message}`);
    return false;
  }
}

export async function closeSocketAdapter() {
  await Promise.all([pubClient?.quit().catch(() => pubClient?.disconnect()), subClient?.quit().catch(() => subClient?.disconnect())]);
  pubClient = null;
  subClient = null;
}
