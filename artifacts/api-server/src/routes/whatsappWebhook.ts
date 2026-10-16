import express, { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { handleWebhook, verifySignature } from "../lib/realtorWhatsapp";

/**
 * Meta WhatsApp Cloud API webhook. Mounted before the JSON parser because the
 * signature (X-Hub-Signature-256) is computed over the raw request body.
 */
const router: IRouter = Router();

router.get("/", (req, res) => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === token) {
    res.type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
    return;
  }
  res.sendStatus(403);
});

router.post("/", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!verifySignature(raw, req.get("x-hub-signature-256"))) { res.sendStatus(401); return; }
  // Acknowledge at once; Meta retries slow webhooks.
  res.sendStatus(200);
  let payload: unknown;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return; }
  handleWebhook(payload as Parameters<typeof handleWebhook>[0]).catch((err: unknown) => logger.error({ err }, "realtor.whatsapp_webhook_failed"));
});

export default router;
