// File: server/middlewares/security.js
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function originGuard(request, _response, next) {
  if (safeMethods.has(request.method) || !env.isProduction) return next();
  const origin = request.get("origin");
  if (!origin || origin === env.clientUrl) return next();
  next(new AppError("Request origin was rejected.", 403));
}
