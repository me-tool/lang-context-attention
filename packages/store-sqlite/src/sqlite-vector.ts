import type Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import type { VectorSearchProvider, SearchResult } from '@lang-context/core'

export class SqliteVectorSearch implements VectorSearchProvider {
  constructor(
    private db: Database.Database,
    private dimensions: number,
  ) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error(`dimensions must be a positive integer, got: ${dimensions}`)
    }

    sqliteVec.load(db)

    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_root_questions USING vec0(
      root_question_id TEXT PRIMARY KEY,
      summary TEXT,
      embedding float[${dimensions}]
    )`)
  }

  async upsert(
    rootQuestionId: string,
    text: string,
    embedding: number[],
  ): Promise<void> {
    // sqlite-vec doesn't support ON CONFLICT, so delete first
    this.db
      .prepare('DELETE FROM vec_root_questions WHERE root_question_id = ?')
      .run(rootQuestionId)

    this.db
      .prepare(
        'INSERT INTO vec_root_questions (root_question_id, summary, embedding) VALUES (?, ?, ?)',
      )
      .run(rootQuestionId, text, new Float32Array(embedding))
  }

  async search(embedding: number[], topK: number): Promise<SearchResult[]> {
    const rows = this.db
      .prepare(
        `SELECT root_question_id, summary, distance
         FROM vec_root_questions
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT ?`,
      )
      .all(new Float32Array(embedding), topK) as any[]

    return rows.map((row) => ({
      id: row.root_question_id,
      summary: row.summary,
      score: 1 / (1 + row.distance), // L2 distance → similarity score (0,1]
    }))
  }

  async delete(rootQuestionId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM vec_root_questions WHERE root_question_id = ?')
      .run(rootQuestionId)
  }
}
