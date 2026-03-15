import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase } from '../db.js'
import { SqliteKeywordSearch } from '../sqlite-keyword.js'
import type Database from 'better-sqlite3'

// Helper to check if sqlite-vec is available
let vecAvailable = true
try {
  const testDb = createDatabase(':memory:')
  const sqliteVec = await import('sqlite-vec')
  sqliteVec.load(testDb)
  testDb.close()
} catch {
  vecAvailable = false
}

describe('SqliteKeywordSearch', () => {
  let db: Database.Database
  let search: SqliteKeywordSearch

  beforeEach(() => {
    db = createDatabase(':memory:')
    search = new SqliteKeywordSearch(db)
  })

  it('should upsert and search', async () => {
    await search.upsert('rq1', 'TypeScript is a typed superset of JavaScript')
    await search.upsert('rq2', 'Python is a dynamic programming language')

    const results = await search.search('TypeScript', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('rq1')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('should update on re-upsert', async () => {
    await search.upsert('rq1', 'old content about cats')
    await search.upsert('rq1', 'new content about TypeScript')

    const catResults = await search.search('cats', 5)
    expect(catResults).toHaveLength(0)

    const tsResults = await search.search('TypeScript', 5)
    expect(tsResults).toHaveLength(1)
    expect(tsResults[0].id).toBe('rq1')
  })

  it('should delete', async () => {
    await search.upsert('rq1', 'TypeScript programming')
    await search.delete('rq1')

    const results = await search.search('TypeScript', 5)
    expect(results).toHaveLength(0)
  })

  it('should respect topK limit', async () => {
    await search.upsert('rq1', 'JavaScript framework React')
    await search.upsert('rq2', 'JavaScript framework Vue')
    await search.upsert('rq3', 'JavaScript framework Angular')

    const results = await search.search('JavaScript', 2)
    expect(results).toHaveLength(2)
  })
})

describe('SqliteVectorSearch', () => {
  const DIMS = 4

  function randomEmbedding(): number[] {
    return Array.from({ length: DIMS }, () => Math.random())
  }

  // Conditionally run based on sqlite-vec availability
  const describeVec = vecAvailable ? describe : describe.skip

  describeVec('with sqlite-vec', () => {
    let db: Database.Database
    let search: any

    beforeEach(async () => {
      db = createDatabase(':memory:')
      const { SqliteVectorSearch } = await import('../sqlite-vector.js')
      search = new SqliteVectorSearch(db, DIMS)
    })

    it('should upsert and search', async () => {
      const emb1 = [1, 0, 0, 0]
      const emb2 = [0, 1, 0, 0]

      await search.upsert('rq1', 'TypeScript question', emb1)
      await search.upsert('rq2', 'Python question', emb2)

      // Search with embedding close to emb1
      const results = await search.search([0.9, 0.1, 0, 0], 5)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('rq1')
    })

    it('should update on re-upsert', async () => {
      const emb1 = [1, 0, 0, 0]
      const emb2 = [0, 1, 0, 0]

      await search.upsert('rq1', 'original', emb1)
      await search.upsert('rq1', 'updated', emb2)

      // Search near emb2 should find rq1 with updated embedding
      const results = await search.search([0, 0.9, 0.1, 0], 5)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('rq1')
      expect(results[0].summary).toBe('updated')
    })

    it('should delete', async () => {
      await search.upsert('rq1', 'test', [1, 0, 0, 0])
      await search.delete('rq1')

      const results = await search.search([1, 0, 0, 0], 5)
      expect(results).toHaveLength(0)
    })

    it('should respect topK limit', async () => {
      await search.upsert('rq1', 'A', randomEmbedding())
      await search.upsert('rq2', 'B', randomEmbedding())
      await search.upsert('rq3', 'C', randomEmbedding())

      const results = await search.search(randomEmbedding(), 2)
      expect(results).toHaveLength(2)
    })
  })
})
