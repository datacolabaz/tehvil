// Applies lib/db/sql/schema.sql without drizzle-kit introspection.
// Use this when `drizzle-kit push` misreads an existing database (for example PostgreSQL 18,
// where drizzle-kit 0.31 proposes dropping composite primary keys). Never drops anything.
import { readFileSync } from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const sql = readFileSync(new URL("../sql/schema.sql", import.meta.url), "utf8");
const statements = sql.split("--> statement").map((s) => s.replace(/^--.*$/gm, "").trim()).filter(Boolean);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
await client.connect();
const failed = [];
for (const statement of statements) {
  try { await client.query(statement); }
  catch (err) { failed.push({ statement: statement.split("\n")[0].slice(0, 120), error: err.message }); }
}
const { rows } = await client.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
await client.end();
console.log(`Applied ${statements.length - failed.length}/${statements.length} statements. Public tables: ${rows[0].n}.`);
if (failed.length) {
  for (const f of failed) console.error(`✗ ${f.statement}\n  ${f.error}`);
  process.exit(1);
}
console.log("✓ Schema is up to date.");
