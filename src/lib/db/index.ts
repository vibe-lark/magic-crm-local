import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "@/lib/config";
import { schema } from "./schema";
import { seed } from "./seed";

declare global {
  // eslint-disable-next-line no-var
  var __crmDatabase: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__crmDatabase) return globalThis.__crmDatabase;
  const filename = databasePath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(schema);
  seed(db);
  globalThis.__crmDatabase = db;
  return db;
}

export function resetDb(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM oauth_access_tokens;
    DELETE FROM oauth_refresh_tokens;
    DELETE FROM oauth_codes;
    DELETE FROM oauth_requests;
    DELETE FROM oauth_clients;
    DELETE FROM activities;
    DELETE FROM contacts;
    DELETE FROM customers;
    DELETE FROM users;
  `);
  seed(db);
}
