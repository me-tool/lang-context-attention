import type Database from 'better-sqlite3'
import type { KeywordSearchProvider, SearchResult } from '@llm-context/core'

export class SqliteKeywordSearch implements KeywordSearchProvider {
  constructor(private db: Database.Database) {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_root_questions USING fts5(
      root_question_id,
      summary
    )`)
  }

  async upsert(rootQuestionId: string, text: string): Promise<void> {
    // FTS5 contentless tables: delete then insert
    this.db
      .prepare(
        'DELETE FROM fts_root_questions WHERE root_question_id = ?',
      )
      .run(rootQuestionId)

    this.db
      .prepare(
        'INSERT INTO fts_root_questions (root_question_id, summary) VALUES (?, ?)',
      )
      .run(rootQuestionId, text)
  }

  async search(query: string, topK: number): Promise<SearchResult[]> {
    // Escape FTS5 special characters by quoting each token
    const safeQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => '"' + token.replace(/"/g, '""') + '"')
      .join(' ')

    if (!safeQuery) return []

    const rows = this.db
      .prepare(
        `SELECT root_question_id, summary, rank
         FROM fts_root_questions
         WHERE fts_root_questions MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(safeQuery, topK) as any[]

    return rows.map((row) => ({
      id: row.root_question_id,
      summary: row.summary,
      score: -row.rank,
    }))
  }

  async delete(rootQuestionId: string): Promise<void> {
    this.db
      .prepare(
        'DELETE FROM fts_root_questions WHERE root_question_id = ?',
      )
      .run(rootQuestionId)
  }
}
