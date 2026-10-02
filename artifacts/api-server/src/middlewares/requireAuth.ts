import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
};

export default requireAuth;