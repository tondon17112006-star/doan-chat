import crypto from "node:crypto";

const sensitiveKey = /(authorization|cookie|password|passwd|token|otp|secret|credential|api[-_]?key|session)/i;

export function redactForLog(value, key = "", seen = new WeakSet()) {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (value === null || value === undefined || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, key, seen));
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactForLog(childValue, childKey, seen)]));
}

export function logInfo(event, fields = {}) {
  write("info", event, fields);
}

export function logWarning(event, fields = {}) {
  write("warn", event, fields);
}

export function logError(event, fields = {}) {
  write("error", event, fields);
}

export function structuredRequestLogger(request, response, next) {
  const startedAt = process.hrtime.bigint();
  request.id = crypto.randomUUID();
  response.setHeader("X-Request-Id", request.id);
  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logInfo("http_request", {
      requestId: request.id,
      method: request.method,
      path: safeRequestPath(request),
      statusCode: response.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      responseBytes: numericHeader(response.getHeader("content-length")),
      userId: request.user?.id || null,
    });
  });
  next();
}

export function requestErrorFields(error, request, statusCode) {
  return {
    requestId: request.id || null,
    method: request.method,
    path: safeRequestPath(request),
    statusCode,
    userId: request.user?.id || null,
    error: {
      name: error?.name || "Error",
      code: error?.code ? String(error.code).slice(0, 80) : null,
      message: redactText(error?.message || "Unexpected error"),
      ...(statusCode >= 500 && error?.stack ? { stack: safeStack(error.stack) } : {}),
    },
  };
}

function write(level, event, fields) {
  if (process.env.NODE_ENV === "test" && process.env.LOG_REQUESTS_IN_TEST !== "true") return;
  const entry = redactForLog({
    ...fields,
    timestamp: new Date().toISOString(),
    level,
    event,
  });
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function safeRequestPath(request) {
  return String(request.originalUrl || request.path || "/").split("?", 1)[0].slice(0, 500);
}

function numericHeader(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function redactText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/([?&](?:token|otp|password|secret|key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/((?:password|passwd|token|otp|secret|credential|api[-_]?key)["']?\s*[:=]\s*)["']?[^,\s}"']+/gi, "$1[REDACTED]")
    .replace(/:\/\/([^:/\s]+):([^@/\s]+)@/g, "://$1:[REDACTED]@")
    .replace(/\b\d{6}\b/g, "[REDACTED]")
    .slice(0, 2_000);
}

function safeStack(stack) {
  return String(stack).split("\n").slice(1, 7).map((line) => redactText(line.trim()));
}
