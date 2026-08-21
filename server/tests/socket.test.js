import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { friendAction, getCalls, getNotifications, resetMemoryData, updateSettings } from "../services/dataService.js";
import { registerSocketHandlers } from "../sockets/index.js";
import { signAccessToken } from "../utils/tokens.js";

beforeEach(async () => {
  await resetMemoryData();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("conversation Socket.IO authorization", () => {
  it("only joins a conversation room when the socket user is a participant", async () => {
    const io = createIo();
    registerSocketHandlers(io);

    const outsider = createSocket("u-maya", io);
    await authenticateAndConnect(io, outsider);
    await outsider.handlers.get("conversation:join")("c-design");
    expect(outsider.join).not.toHaveBeenCalledWith("conversation:c-design");

    const member = createSocket("u-sofia", io);
    await authenticateAndConnect(io, member);
    await member.handlers.get("conversation:join")("c-design");
    expect(member.join).toHaveBeenCalledWith("conversation:c-design");
  });

  it("does not deliver direct call events to a blocked user", async () => {
    await friendAction("u-maya", "u-alex", "block");
    const callsBefore = (await getCalls("u-alex")).length;
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    await authenticateAndConnect(io, alex);

    await alex.handlers.get("call:start")({
      callId: "blocked-call-123",
      conversationId: "c-maya",
      participants: ["u-maya"],
      type: "voice",
    });

    expect(io.to).not.toHaveBeenCalledWith("u-maya");
    expect(await getCalls("u-alex")).toHaveLength(callsBefore);
  });

  it("keeps a user online while another tab remains connected", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const firstTab = createSocket("u-maya", io);
    const secondTab = createSocket("u-maya", io);
    await authenticateAndConnect(io, firstTab);
    await authenticateAndConnect(io, secondTab);

    expect(firstTab.broadcast.emit).toHaveBeenCalledWith("presence:update", expect.objectContaining({ userId: "u-maya", isOnline: true }));
    expect(secondTab.broadcast.emit).not.toHaveBeenCalledWith("presence:update", expect.anything());
  });

  it("does not mark a user offline when they reconnect during the grace period", async () => {
    vi.useFakeTimers();
    const io = createIo();
    registerSocketHandlers(io);
    const firstTab = createSocket("u-maya", io);
    await authenticateAndConnect(io, firstTab);
    io.removeSocket(firstTab);
    firstTab.handlers.get("disconnect")();
    await vi.advanceTimersByTimeAsync(500);

    const reconnectedTab = createSocket("u-maya", io);
    await authenticateAndConnect(io, reconnectedTab);
    await vi.advanceTimersByTimeAsync(500);

    expect(firstTab.broadcast.emit).not.toHaveBeenCalledWith("presence:update", expect.objectContaining({ userId: "u-maya", isOnline: false }));
  });

  it("records missed calls after the server-side ring timeout", async () => {
    vi.useFakeTimers();
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    const maya = createSocket("u-maya", io);
    await authenticateAndConnect(io, alex);
    await authenticateAndConnect(io, maya);

    await alex.handlers.get("call:start")({
      callId: "timeout-call-123",
      conversationId: "c-maya",
      participants: ["u-maya"],
      type: "voice",
    });
    await vi.advanceTimersByTimeAsync(30_000);

    expect((await getCalls("u-alex"))[0]).toMatchObject({ status: "missed", direction: "outgoing" });
    expect((await getCalls("u-maya"))[0]).toMatchObject({ status: "missed", direction: "incoming" });
    expect((await getCalls("u-alex"))[0].endedAt).toBeTruthy();
    expect((await getNotifications("u-maya")).filter((notification) => notification.type === "call")).toHaveLength(0);
    expect(io.emitted).toContainEqual(expect.objectContaining({ room: "u-alex", event: "call:timeout" }));
    expect(io.emitted).toContainEqual(expect.objectContaining({ room: "u-maya", event: "call:timeout" }));
  });

  it("creates a missed-call notification only when the recipient is offline", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    await authenticateAndConnect(io, alex);

    await alex.handlers.get("call:start")({
      callId: "offline-call-123",
      conversationId: "c-maya",
      participants: ["u-maya"],
      type: "video",
    });

    expect((await getCalls("u-maya"))[0]).toMatchObject({ status: "missed", direction: "incoming" });
    expect((await getNotifications("u-maya")).some((notification) => notification.type === "call" && notification.data?.callId === "offline-call-123")).toBe(true);
    expect(io.emitted).not.toContainEqual(expect.objectContaining({ room: "u-maya", event: "call:incoming" }));
  });

  it("does not create an offline call notification when calls are disabled", async () => {
    await updateSettings("u-maya", { notifications: { calls: false } });
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    await authenticateAndConnect(io, alex);

    await alex.handlers.get("call:start")({
      callId: "silent-offline-call-123",
      conversationId: "c-maya",
      participants: ["u-maya"],
      type: "voice",
    });

    expect((await getNotifications("u-maya")).some((notification) => notification.type === "call" && notification.data?.callId === "silent-offline-call-123")).toBe(false);
  });

  it("updates both call histories when an incoming call is rejected", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    const maya = createSocket("u-maya", io);
    await authenticateAndConnect(io, alex);
    await authenticateAndConnect(io, maya);
    await alex.handlers.get("call:start")({ callId: "reject-call-123", conversationId: "c-maya", participants: ["u-maya"], type: "voice" });
    await maya.handlers.get("call:reject")({ callId: "reject-call-123", callerId: "u-alex", conversationId: "c-maya" });

    expect((await getCalls("u-alex"))[0]).toMatchObject({ status: "ended", direction: "outgoing" });
    expect((await getCalls("u-maya"))[0]).toMatchObject({ status: "rejected", direction: "incoming" });
    expect((await getCalls("u-maya"))[0].endedAt).toBeTruthy();
  });

  it("ends an accepted call when a participant disconnects from all tabs", async () => {
    vi.useFakeTimers();
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    const maya = createSocket("u-maya", io);
    await authenticateAndConnect(io, alex);
    await authenticateAndConnect(io, maya);
    await alex.handlers.get("call:start")({ callId: "disconnect-call-123", conversationId: "c-maya", participants: ["u-maya"], type: "voice" });
    await maya.handlers.get("call:accept")({ callId: "disconnect-call-123", callerId: "u-alex", conversationId: "c-maya" });
    io.removeSocket(maya);
    maya.handlers.get("disconnect")();
    await vi.advanceTimersByTimeAsync(800);

    expect((await getCalls("u-alex"))[0]).toMatchObject({ status: "ended", direction: "outgoing" });
    expect((await getCalls("u-maya"))[0]).toMatchObject({ status: "ended", direction: "incoming" });
    expect(io.emitted).toContainEqual(expect.objectContaining({ room: "u-alex", event: "call:ended", payload: expect.objectContaining({ reason: "disconnect" }) }));
  });

  it("rejects group call starts until an SFU-based implementation exists", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    await authenticateAndConnect(io, alex);
    const callsBefore = (await getCalls("u-alex")).length;
    const acknowledge = vi.fn();
    await alex.handlers.get("call:start")({ callId: "group-call-123", conversationId: "c-design", participants: ["u-sofia"], type: "video" }, acknowledge);

    expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "Group calls are not available yet." }));
    expect(await getCalls("u-alex")).toHaveLength(callsBefore);
  });

  it("never exposes credential fields in a call signal", async () => {
    const io = createIo();
    registerSocketHandlers(io);
    const alex = createSocket("u-alex", io);
    const maya = createSocket("u-maya", io);
    await authenticateAndConnect(io, alex);
    await authenticateAndConnect(io, maya);

    await alex.handlers.get("call:start")({ callId: "safe-call-123", conversationId: "c-maya", participants: ["u-maya"], type: "voice" });

    const signal = io.emitted.find((item) => item.room === "u-maya" && item.event === "call:incoming");
    expect(signal.payload.caller.passwordHash).toBeUndefined();
  });
});

function createIo() {
  const rooms = new Map();
  const emitted = [];
  const io = {
    middleware: null,
    connectionHandler: null,
    emitted,
    use(handler) {
      this.middleware = handler;
    },
    on(event, handler) {
      if (event === "connection") this.connectionHandler = handler;
    },
    to: vi.fn((room) => ({ emit: (event, payload) => emitted.push({ room: String(room), event, payload }) })),
    in: vi.fn((room) => ({ fetchSockets: vi.fn(async () => [...(rooms.get(String(room)) || [])]) })),
    addToRoom(room, socket) {
      const values = rooms.get(String(room)) || new Set();
      values.add(socket);
      rooms.set(String(room), values);
    },
    removeSocket(socket) {
      for (const values of rooms.values()) values.delete(socket);
    },
  };
  return io;
}

function createSocket(userId, io) {
  const handlers = new Map();
  const socket = {
    handshake: { auth: { token: signAccessToken(userId) } },
    data: {},
    handlers,
    join: vi.fn((room) => io.addToRoom(room, socket)),
    leave: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    to: vi.fn(() => ({ emit: vi.fn() })),
    broadcast: { emit: vi.fn() },
  };
  return socket;
}

async function authenticateAndConnect(io, socket) {
  await new Promise((resolve, reject) => io.middleware(socket, (error) => (error ? reject(error) : resolve())));
  await io.connectionHandler(socket);
}
