import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrateSchema, schema } from "../src/lib/db/schema";
import { seed } from "../src/lib/db/seed";

const filename = path.resolve(process.env.DATABASE_PATH || "./data/crm.sqlite");
fs.mkdirSync(path.dirname(filename), { recursive: true });
if (process.argv.includes("--reset") && fs.existsSync(filename)) fs.rmSync(filename);
const db = new Database(filename, { timeout: 30_000 });
db.pragma("busy_timeout = 30000");
db.exec(schema);
migrateSchema(db);
seed(db);
db.close();
console.log(`CRM database ready: ${filename}`);
