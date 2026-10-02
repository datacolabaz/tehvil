import { defineRailway, github, preserve, project, service } from "railway/iac";

// Own only these two app services; do not manage/delete unrelated resources.
export const partial = "tehvil-services";

export default defineRailway(ctx => {
  const staging = ctx.isEnvironment("staging");
  if (!staging && !ctx.isEnvironment("production")) {
    throw new Error("Link the production or staging Railway environment before planning this configuration.");
  }
  const branch = staging ? "develop" : "main";
  const suffix = staging ? "-staging" : "";
  const backend = service(`tehvil-api${suffix}`, {
    source: github("datacolabaz/tehvil", { branch, rootDirectory: "/" }),
    build: "pnpm run typecheck:libs && pnpm --filter @workspace/api-server run build",
    start: "pnpm --filter @workspace/api-server run start",
    healthcheck: "/api/healthz",
    healthcheckTimeout: 90,
    env: {
      NODE_ENV: "production",
      RAILPACK_INSTALL_COMMAND: "pnpm install --frozen-lockfile --prod=false",
      CLERK_AUTH_MODE: "external",
      OBJECT_STORAGE_PROVIDER: "s3",
      DATABASE_URL: preserve(),
      PUBLIC_APP_URL: preserve(),
      CLERK_PUBLISHABLE_KEY: preserve(),
      CLERK_SECRET_KEY: preserve(),
      R2_ENDPOINT: preserve(),
      R2_BUCKET_NAME: preserve(),
      R2_ACCESS_KEY_ID: preserve(),
      R2_SECRET_ACCESS_KEY: preserve(),
      R2_REGION: "auto",
      BUCKET_FORCE_PATH_STYLE: "true",
    },
  });
  const frontend = service(`tehvil-web${suffix}`, {
    source: github("datacolabaz/tehvil", { branch, rootDirectory: "/" }),
    build: "pnpm run typecheck:libs && PORT=5000 BASE_PATH=/ pnpm --filter @workspace/tehvil run build",
    start: "pnpm --filter @workspace/tehvil run start",
    healthcheck: "/healthz",
    healthcheckTimeout: 90,
    env: {
      NODE_ENV: "production",
      RAILPACK_INSTALL_COMMAND: "pnpm install --frozen-lockfile --prod=false",
      BACKEND_URL: preserve(),
      PUBLIC_APP_URL: preserve(),
      VITE_CLERK_PUBLISHABLE_KEY: preserve(),
    },
  });
  return project(ctx.projectName || "tehvil", { resources: [backend, frontend] });
});