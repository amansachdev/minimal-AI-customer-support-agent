import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import chatRoutes from "./routes/chat.js";
import { requireAuth } from "./middleware/auth.js";

export function createApp(config) {
  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(express.json({ limit: "16kb" }));
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRoutes(config));
  app.use("/api/chat", chatRoutes({
    auth: requireAuth(config.jwtSecret),
    geminiApiKey: config.geminiApiKey,
    geminiModel: config.geminiModel,
  }));

  app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
  app.use((error, _req, res, _next) => {
    if (error?.message === "Origin is not allowed by CORS.") {
      return res.status(403).json({ error: "This origin is not allowed." });
    }
    console.error(error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const message = status >= 500 && status !== 502 && status !== 503
      ? "Something went wrong. Please try again."
      : error.message;
    return res.status(status).json({ error: message });
  });

  return app;
}
