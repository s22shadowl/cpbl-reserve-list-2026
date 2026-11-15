import { env } from "cloudflare:workers";
import schema from "../schema.sql?raw";

// D1 exec() only takes one statement per line, so run each statement separately.
const statements = schema
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const s of statements) await env.DB.prepare(s).run();
