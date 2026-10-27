// Regenerates sql/schema.sql from src/schema (drizzle-kit generate → idempotent SQL).
// Usage: pnpm --filter @workspace/db run build-schema-sql   (no database connection needed)
// The output only creates what is missing; it never drops or rewrites existing objects.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = mkdtempSync(path.join(tmpdir(), "tehvil-schema-"));
const config = path.join(out, "drizzle.config.ts");
writeFileSync(config, `import { defineConfig } from "drizzle-kit";
export default defineConfig({ schema: ${JSON.stringify(path.join(root, "src/schema/index.ts"))}, dialect: "postgresql", out: ${JSON.stringify(out)} });\n`);
try {
  execFileSync("npx", ["drizzle-kit", "generate", "--config", config, "--name", "init"], { cwd: root, stdio: "inherit" });
  const file = readdirSync(out).find((f) => f.endsWith(".sql"));
  const statements = readFileSync(path.join(out, file), "utf8").split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  const tables = [], columns = [], constraints = [], indexes = [];
  for (const st of statements) {
    if (st.startsWith("CREATE TABLE")) {
      tables.push(st.replace(/^CREATE TABLE "/, 'CREATE TABLE IF NOT EXISTS "'));
      const name = st.match(/^CREATE TABLE "([^"]+)"/)[1];
      const body = st.slice(st.indexOf("(") + 1, st.lastIndexOf(")"));
      for (const line of body.split(/,\n/).map((l) => l.trim())) {
        if (!line.startsWith('"')) continue;
        columns.push(`ALTER TABLE "${name}" ADD COLUMN IF NOT EXISTS ${line.replace(/ PRIMARY KEY/, "")};`);
      }
    } else if (st.startsWith("ALTER TABLE") && st.includes("ADD CONSTRAINT")) {
      constraints.push(`DO $$ BEGIN\n  ${st}\nEXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;\nEND $$;`);
    } else if (/^CREATE (UNIQUE )?INDEX/.test(st)) {
      indexes.push(st.replace(/^CREATE (UNIQUE )?INDEX "/, (_m, u) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS "`));
    } else {
      throw new Error(`Unhandled statement:\n${st}`);
    }
  }
  const header = [
    "-- Idempotent schema for Təhvil (generated from lib/db/src/schema with drizzle-kit generate).",
    "-- Safe to run repeatedly: creates missing tables, columns, indexes and foreign keys; never drops anything.",
    "-- Apply with: DATABASE_URL=... pnpm --filter @workspace/db run apply-schema",
    "-- Regenerate after schema changes with: pnpm --filter @workspace/db run build-schema-sql",
  ].join("\n");
  // Hand-written, idempotent changes drizzle's additive output cannot express (e.g. relaxing NOT NULL); never drops data.
  const manualPath = path.join(root, "sql/manual.sql");
  const manual = existsSync(manualPath) ? readFileSync(manualPath, "utf8").split(";").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean).map((s) => `${s};`) : [];
  writeFileSync(path.join(root, "sql/schema.sql"), `${header}\n${[...tables, ...columns, ...constraints, ...indexes, ...manual].join("\n--> statement\n")}\n`);
  console.log(`sql/schema.sql: ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} indexes`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
