function urls(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

const stunUrls = urls(process.env.STUN_URLS || process.env.STUN_URL);
const turnUrls = urls(process.env.TURN_URLS || process.env.TURN_URL);

export const webrtcConfig = {
  callTimeoutMs: Math.min(Math.max(Number(process.env.CALL_TIMEOUT_MS) || 30_000, 10_000), 120_000),
};

export function getIceServers() {
  const servers = [{ urls: stunUrls.length ? stunUrls : ["stun:stun.l.google.com:19302"] }];
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD;
  if (turnUrls.length && username && credential) servers.push({ urls: turnUrls, username, credential });
  return servers;
}
