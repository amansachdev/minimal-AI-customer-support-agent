const requiredInProduction = ["JWT_SECRET", "MONGODB_URI", "GEMINI_API_KEY"];

export function loadConfig() {
  const missing = process.env.NODE_ENV === "production"
    ? requiredInProduction.filter((name) => !process.env[name])
    : [];

  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "local-development-only-change-me-32-chars";
  }

  return {
    port: Number(process.env.PORT || 3000),
    mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/support-agent",
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === "1",
    nodeEnv: process.env.NODE_ENV || "development",
  };
}
