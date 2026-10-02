import { defineRailway, github, preserve, project, service } from "railway/iac";

// Own only these two app services; do not manage/delete unrelated resources.
export const partial = "tehvil-services";

export default defineRailway(() => {
  const backend = service("backend", {
    source: github("datacolabaz/tehvil", { branch: "backend", rootDirectory: "/" }),
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
      BUCKET_ENDPOINT: preserve(),
      BUCKET_NAME: preserve(),
      BUCKET_ACCESS_KEY_ID: preserve(),
      BUCKET_SECRET_ACCESS_KEY: preserve(),
      BUCKET_REGION: preserve(),
      BUCKET_FORCE_PATH_STYLE: preserve(),
    },
  });
  const frontend = service("frontend", {
    source: github("datacolabaz/tehvil", { branch: "frontend", rootDirectory: "/" }),
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
  return project("tehvil", { resources: [backend, frontend] });
});