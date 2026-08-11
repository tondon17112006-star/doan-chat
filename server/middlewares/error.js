// File: server/middlewares/error.js
import multer from "multer";
import { unlink } from "node:fs/promises";
import { env } from "../config/env.js";

export function notFound(request, response) {
  response.status(404).json({ success: false, message: `Route ${request.method} ${request.originalUrl} was not found.` });
}

export async function errorHandler(error, request, response, _next) {
  if (request.originalUrl.startsWith("/api/uploads")) {
    await Promise.all((request.files || []).map((file) => unlink(file.path).catch(() => undefined)));
  }
  let statusCode = error.statusCode || 500;
  let message = error.message || "Something went wrong.";
  if (error instanceof multer.MulterError) {
    statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = error.code === "LIMIT_FILE_SIZE"
      ? "File is larger than 25 MB."
      : error.code === "LIMIT_FILE_COUNT"
        ? "No more than 10 files may be uploaded at once."
        : error.message;
  }
  if (error.code === 11000) {
    statusCode = 409;
    message = "This value is already in use.";
  }
  if (error.name === "ValidationError") {
    statusCode = 422;
    message = Object.values(error.errors).map((item) => item.message).join(", ");
  }
  if (!env.isProduction && statusCode >= 500) console.error(error);
  response.status(statusCode).json({
    success: false,
    message,
    ...(error.details ? { errors: error.details } : {}),
    ...(!env.isProduction && statusCode >= 500 ? { stack: error.stack } : {}),
  });
}
