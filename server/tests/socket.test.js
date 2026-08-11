import { beforeEach, describe, expect, it, vi } from "vitest";
import { friendAction, resetMemoryData } from "../services/dataService.js";
import { registerSocketHandlers } from "../sockets/index.js";
import { signAccessToken } from "../utils/tokens.js";

beforeEach(async () => {
  await resetMemoryData();
});

describe("conversation Socket.IO authorization", () => {
  it("only joins a conversation room when the socket user is a participant", async () => {
    const io = createIo();
    registerSocketHandlers(io);

    const outsider = createSocket("u-maya");
    await authenticateAndConnect(io, outsider);
    await outsider.handlers.get("conversation:join")("c-design");
    expect(outsider.join).not.toHaveBeenCalledWith("conversation:c-design");

    const member = createSocket("u-sofia");
    await authenticateAndConnect(io, member);
    await member.handlers.get("conversation:join")("c-design");
    expect(member.join).toHaveBeenCalledWith("conversation:c-design");
  });

  it("does not deliver direct call events to a blocked user", async () => {
    await friendAction("u-maya", "u-alex", "block");
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex");
    await authenticateAndConnect(io, alex);

    await alex.handlers.get("call:start")({
      conversationId: "c-maya",
      participants: ["u-maya"],
      type: "voice",
    });

    expect(io.to).not.toHaveBeenCalledWith("u-maya");
  });
});

function createIo() {
  const io = {
    middleware: null,
    connectionHandler: null,
    use(handler) {
      this.middleware = handler;
    },
    on(event, handler) {
      if (event === "connection") this.connectionHandler = handler;
    },
    to: vi.fn(() => ({ emit: vi.fn() })),
    in: vi.fn(() => ({ fetchSockets: vi.fn(async () => []) })),
  };
  return io;
}

function createSocket(userId) {
  const handlers = new Map();
  return {
    handshake: { auth: { token: signAccessToken(userId) } },
    data: {},
    handlers,
    join: vi.fn(),
    leave: vi.fn(),
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    to: vi.fn(() => ({ emit: vi.fn() })),
    broadcast: { emit: vi.fn() },
  };
}

async function authenticateAndConnect(io, socket) {
  await new Promise((resolve, reject) => io.middleware(socket, (error) => (error ? reject(error) : resolve())));
  await io.connectionHandler(socket);
}
