import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import User from "../models/User.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function authRoutes({ jwtSecret, jwtExpiresIn }) {
  const router = Router();
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Try again in 15 minutes." },
  });

  function issueToken(user, res) {
    const token = jwt.sign({ email: user.email }, jwtSecret, {
      subject: user.id,
      expiresIn: jwtExpiresIn,
    });
    return res.json({ token, user: { id: user.id, email: user.email } });
  }

  router.post("/signup", authLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");

      if (!emailPattern.test(email) || email.length > 254) {
        return res.status(400).json({ error: "Enter a valid email address." });
      }
      if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
        return res.status(400).json({ error: "Password must be between 8 and 72 characters." });
      }

      const existing = await User.exists({ email });
      if (existing) return res.status(409).json({ error: "An account with this email already exists." });

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ email, passwordHash });
      return issueToken(user, res);
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
      return next(error);
    }
  });

  router.post("/login", authLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const user = await User.findOne({ email }).select("+passwordHash");
      const passwordMatches = user && await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) return res.status(401).json({ error: "Email or password is incorrect." });
      return issueToken(user, res);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/logout", (_req, res) => res.status(204).end());
  return router;
}
