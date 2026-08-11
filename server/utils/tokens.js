import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signAccessToken = (userId) =>
  jwt.sign({ type: "access" }, env.accessSecret, { subject: String(userId), expiresIn: env.accessTtl });

export const signRefreshToken = (userId, sessionId) =>
  jwt.sign({ type: "refresh", sid: sessionId }, env.refreshSecret, {
    subject: String(userId),
    expiresIn: env.refreshTtl,
  });

export const verifyAccessToken = (token) => {
  const payload = jwt.verify(token, env.accessSecret);
  if (payload.type !== "access") throw new Error("Invalid token type");
  return payload;
};

export const verifyRefreshToken = (token) => {
  const payload = jwt.verify(token, env.refreshSecret);
  if (payload.type !== "refresh") throw new Error("Invalid token type");
  return payload;
};
