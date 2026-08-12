// File: server/middlewares/validate.js
import { validationResult } from "express-validator";
import { AppError } from "../utils/AppError.js";

export function validate(request, _response, next) {
  const result = validationResult(request);
  if (!result.isEmpty()) {
    const details = result.array().map(({ type, msg, path, location }) => ({ type, msg, path, location }));
    return next(new AppError("Please check the highlighted fields.", 422, details));
  }
  next();
}
