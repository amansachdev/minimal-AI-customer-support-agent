import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();

try {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  const app = createApp(config);
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Support agent API listening on ${config.port} (${config.nodeEnv}).`);
  });
} catch (error) {
  console.error("Could not start the API:", error.message);
  process.exit(1);
}
