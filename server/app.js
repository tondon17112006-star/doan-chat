// File: server/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { swaggerDocument } from "./config/swagger.js";
import { apiRouter } from "./routes/index.js";
import * as miscController from "./controllers/miscController.js";
import { errorHandler, notFound } from "./middlewares/error.js";
import { originGuard } from "./middlewares/security.js";

export const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: env.isProduction ? undefined : false,
  }),
);
app.use(cors({ origin: env.clientUrl, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());
app.use(originGuard);
app.use(morgan(env.isProduction ? "combined" : "dev"));
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: env.isProduction ? 100 : 1_000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.get("/uploads/:filename", miscController.servePublicDemoUpload);
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, { customSiteTitle: "Lumina API" }));
app.use("/api", apiRouter);
app.use(notFound);
app.use(errorHandler);
