export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sales')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('线索', '意向', '客户', '停用')),
  industry TEXT,
  source TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  notes TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  last_follow_up_at TEXT,
  next_follow_up_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  email TEXT,
  wechat TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  contact_id TEXT REFERENCES contacts(id),
  subject TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('电话', '会议', '邮件', '拜访', '其他')),
  content TEXT,
  occurred_at TEXT NOT NULL,
  next_follow_up_at TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  archived INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id, archived);
CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id, archived);
CREATE INDEX IF NOT EXISTS idx_activities_customer ON activities(customer_id, archived);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_requests (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  redirect_uri TEXT NOT NULL,
  client_state TEXT,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`;
