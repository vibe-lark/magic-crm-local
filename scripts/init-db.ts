import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { schema } from "../src/lib/db/schema";
import { seed } from "../src/lib/db/seed";

const filename = path.resolve(process.env.DATABASE_PATH || "./data/crm.sqlite");
fs.mkdirSync(path.dirname(filename), { recursive: true });
if (process.argv.includes("--reset") && fs.existsSync(filename)) fs.rmSync(filename);
const db = new Database(filename);
db.exec(schema);
seed(db);
db.close();
console.log(`CRM database ready: ${filename}`);
