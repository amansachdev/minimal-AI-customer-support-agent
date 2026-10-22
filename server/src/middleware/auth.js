import jwt from "jsonwebtoken";

export function requireAuth(jwtSecret) {
  return (req, res, next) => {
    const [scheme, token] = (req.get("authorization") || "").split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      req.user = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
  };
}
