/**
 * Apply Drizzle migrations via the Neon serverless driver.
 *
 * Usage:  npx tsx scripts/migrate.ts
 */
import { neon } from "@neondatabase/serverless";
import { readdir, readFile } from "fs/promises";
import { join, resolve } from "path";

function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i++) {
    const char = sqlText[i];
    const nextChar = sqlText[i + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      current += char;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        current += "*/";
        i++;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      current += "--";
      i++;
      continue;
    }
    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      current += "/*";
      i++;
      continue;
    }

    if (char === "$" && nextChar === "$") {
      inDollarQuote = !inDollarQuote;
      current += "$$";
      i++;
      continue;
    }

    if (!inDollarQuote && char === "'") {
      // Check for escaped quote ''
      if (char === "'" && nextChar === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (!inDollarQuote && !inSingleQuote && char === ";") {
      if (current.trim().length > 0) {
        statements.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌  DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = neon(url);
  const dir = resolve(process.cwd(), "drizzle");

  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`📂  Found ${files.length} migration file(s) in ./drizzle`);

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied = (await sql`
    SELECT name FROM _migrations ORDER BY name
  `) as unknown as { name: string }[];
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ✓  ${file} (already recorded, re-verifying statements)`);
    }

    const content = await readFile(join(dir, file), "utf-8");
    const stmts = splitSqlStatements(content);
    console.log(`  ↑  Applying ${file} (${stmts.length} statements)…`);

    for (let sIdx = 0; sIdx < stmts.length; sIdx++) {
      const stmt = stmts[sIdx];
      // Skip empty statements or pure comment lines
      const clean = stmt.replace(/--.*$/gm, "").trim();
      if (!clean) continue;

      try {
        await (sql as any).query(clean);
      } catch (err: any) {
        console.error(`  ✗  Statement ${sIdx + 1} failed in ${file}:`, clean.slice(0, 100));
        console.error("Error:", err);
        process.exit(1);
      }
    }

    if (!appliedSet.has(file)) {
      await sql`INSERT INTO _migrations (name) VALUES (${file}) ON CONFLICT DO NOTHING`;
    }
    console.log(`  ✓  ${file} fully applied`);
  }

  console.log("✅  All migrations applied");
}

main();
