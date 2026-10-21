import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import whatsappWebhookRouter from "./routes/whatsappWebhook";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Secret tokens in paths (share, invitation, verification links) never reach the logs.
          url: req.url?.split("?")[0]?.replace(/(\/shared-(?:passports|estimates)\/|\/passport-confirm\/(?:contractor|owner)\/|\/public\/home-shares\/|\/invitations\/|\/photo-invites\/|\/protocol-invites\/|\/rental-invites\/|\/verify\/)[^/]+/, "$1[redacted]"),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
if (process.env.CLERK_AUTH_MODE !== "external") app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: process.env.PUBLIC_APP_URL || true }));
// Raw body for signature verification; must run before the JSON parser.
app.use("/api/whatsapp/webhook", whatsappWebhookRouter);
// Estimate saves send the whole project document.
app.use("/api/smeta", express.json({ limit: "2mb" }));
app.use("/api/construction-estimates", express.json({ limit: "1mb" }));
app.use("/api/repair-estimates", express.json({ limit: "1mb" }));
app.use("/api/prices/import", express.json({ limit: "1mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: process.env.CLERK_AUTH_MODE === "external" ? process.env.CLERK_PUBLISHABLE_KEY : publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
    authorizedParties: process.env.PUBLIC_APP_URL ? [process.env.PUBLIC_APP_URL] : undefined,
  })),
);

app.use("/api", router);
const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  req.log.error({ err: error }, "Request failed");
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Göndərilən məlumat çox böyükdür" });
    return;
  }
  const code = error?.code ?? error?.cause?.code;
  if (code === "23505") {
    res.status(409).json({ error: "This record already exists. Refresh and try again." });
    return;
  }
  res.status(500).json({ error: "The request could not be completed. Please try again." });
};
app.use(errorHandler);

export default app;
