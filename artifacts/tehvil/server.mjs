import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1) throw new Error("PORT is required");
if (!process.env.BACKEND_URL) throw new Error("BACKEND_URL is required");
const backend = new URL(process.env.BACKEND_URL);
if (!["http:", "https:"].includes(backend.protocol) || backend.username || backend.password) {
  throw new Error("BACKEND_URL must be an HTTP(S) URL without credentials");
}
const publicOrigin = process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).origin : undefined;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist/public");
const app = express();
app.disable("x-powered-by");
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
// Browser traffic stays same-origin, preserving Clerk session cookies while
// the frontend and API remain independently deployed Railway services.
app.use("/api", createProxyMiddleware({
  target: backend.origin,
  changeOrigin: true,
  pathRewrite: (_path, req) => req.originalUrl,
  proxyTimeout: 120_000,
  on: {
    proxyReq(proxyReq, req) {
      const origin = publicOrigin ? new URL(publicOrigin) : null;
      proxyReq.setHeader("x-forwarded-host", origin?.host || req.headers.host || "");
      proxyReq.setHeader("x-forwarded-proto", origin?.protocol.replace(":", "") || (req.socket.encrypted ? "https" : "http"));
    },
    error(_error, _req, res) {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "The backend service is unavailable. Please try again." }));
    },
  },
}));
app.use(express.static(root, {
  index: false,
  setHeaders(res, file) {
    res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  },
}));
app.get("/{*path}", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(root, "index.html"));
});
app.listen(port, "0.0.0.0", () => console.log(`Frontend listening on ${port}`));