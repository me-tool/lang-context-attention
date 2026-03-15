import type DatabaseType from 'better-sqlite3'

// Use createRequire to bypass webpack bundling for native modules
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as new (path: string) => DatabaseType.Database

export function createDatabase(path: string = ':memory:'): DatabaseType.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS root_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      root_question_id TEXT NOT NULL REFERENCES root_questions(id),
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS routing_decisions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id),
      final_target TEXT NOT NULL,
      suggested_links TEXT NOT NULL DEFAULT '[]',
      candidates TEXT NOT NULL DEFAULT '[]',
      llm_judgment TEXT NOT NULL DEFAULT '{}',
      assembled_context TEXT NOT NULL DEFAULT '{}',
      timing TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS question_links (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES root_questions(id),
      target_id TEXT NOT NULL REFERENCES root_questions(id),
      created_by TEXT NOT NULL CHECK(created_by IN ('user', 'system')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rq_session ON root_questions(session_id);
    CREATE INDEX IF NOT EXISTS idx_msg_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_msg_rq ON messages(root_question_id);
    CREATE INDEX IF NOT EXISTS idx_rd_message ON routing_decisions(message_id);
    CREATE INDEX IF NOT EXISTS idx_ql_source ON question_links(source_id);
    CREATE INDEX IF NOT EXISTS idx_ql_target ON question_links(target_id);
  `)

  return db
}
