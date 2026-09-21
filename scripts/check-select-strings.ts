/**
 * PostgREST select strings are data, not code.
 *
 * Whatever sits between the backticks of a `*_SELECT` template literal is
 * posted verbatim as the API's `select=` parameter — a comma-separated list
 * of columns and embeds. A JavaScript comment in there is not stripped by
 * anything: it is sent, parsed as column names, and every query using that
 * string comes back 400.
 *
 * That shipped once. A comment added beside a new embed in TASK_SELECT took
 * out the Tasklist and the Dashboard, and neither TypeScript nor the build
 * can see it, because the string is perfectly valid JavaScript. This is the
 * check that can.
 *
 * Run: npx tsx scripts/check-select-strings.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/lib/data";

/** A `NAME_SELECT = \`…\`` assignment, and anything interpolated into one. */
const SELECT_LITERAL = /(?:const\s+\w*SELECT\w*\s*=\s*|\.select\(\s*)`([^`]*)`/g;

const problems: string[] = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".ts"))) {
  const path = join(DIR, file);
  const source = readFileSync(path, "utf8");

  for (const match of source.matchAll(SELECT_LITERAL)) {
    const body = match[1] ?? "";
    const line = source.slice(0, match.index).split("\n").length;

    if (body.includes("/*") || body.includes("*/")) {
      problems.push(`${path}:${line} — block comment inside a select string`);
    }
    /*
      `//` would also be sent, though it is rarer here. Checked against the
      line rather than the whole body so a URL in a default value — which
      has no business in a select string anyway — cannot produce a false
      positive on some future edit.
    */
    for (const [i, raw] of body.split("\n").entries()) {
      if (/(^|\s)\/\//.test(raw)) {
        problems.push(`${path}:${line + i} — line comment inside a select string`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error("PostgREST select strings must contain only columns and embeds:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nMove the note above the string, where it is code rather than data.");
  process.exit(1);
}

console.log("select strings clean");
