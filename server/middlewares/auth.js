// File: server/middlewares/auth.js
import { verifyAccessToken } from "../utils/tokens.js";
import { findUserById } from "../services/dataService.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { publicUser } from "../utils/helpers.js";

export const authenticate = asyncHandler(async (request, _response, next) => {
  const authorization = request.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) throw new AppError("Please sign in to continue.", 401);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError("Your session has expired. Please sign in again.", 401);
  }
  const user = await findUserById(payload.sub);
  if (!user) throw new AppError("Account not found.", 401);
  request.user = publicUser(user);
  next();
});

export function authorize(...roles) {
  return (request, _response, next) => {
    if (!roles.includes(request.user?.role)) return next(new AppError("You do not have permission to do this.", 403));
    next();
  };
}
