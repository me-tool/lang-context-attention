import { describe, it, expect } from 'vitest'
import { fuseScores } from '../router.js'
import type { SearchResult } from '../types.js'

describe('fuseScores', () => {
  const rrfK = 60
  const topK = 5

  it('fuses scores from two lists with overlapping results', () => {
    const vectorResults: SearchResult[] = [
      { id: 'q1', score: 0.95, summary: 'Topic 1' },
      { id: 'q2', score: 0.80, summary: 'Topic 2' },
    ]
    const keywordResults: SearchResult[] = [
      { id: 'q2', score: 12.5, summary: 'Topic 2' },
      { id: 'q3', score: 8.0, summary: 'Topic 3' },
    ]

    const result = fuseScores(vectorResults, keywordResults, topK, rrfK)

    expect(result).toHaveLength(3)

    // q2 appears in both lists: rank 2 in vector, rank 1 in keyword
    const q2 = result.find((c) => c.rootQuestionId === 'q2')!
    expect(q2.fusedScore).toBeCloseTo(1 / (60 + 2) + 1 / (60 + 1), 10)
    expect(q2.vectorScore).toBe(0.80)
    expect(q2.bm25Score).toBe(12.5)

    // q1 only in vector: rank 1 in vector, rank topK+1=6 in keyword
    const q1 = result.find((c) => c.rootQuestionId === 'q1')!
    expect(q1.fusedScore).toBeCloseTo(1 / (60 + 1) + 1 / (60 + 6), 10)
    expect(q1.bm25Score).toBe(0)

    // q3 only in keyword: rank topK+1=6 in vector, rank 2 in keyword
    const q3 = result.find((c) => c.rootQuestionId === 'q3')!
    expect(q3.fusedScore).toBeCloseTo(1 / (60 + 6) + 1 / (60 + 2), 10)
    expect(q3.vectorScore).toBe(0)

    // q2 should be ranked highest (appears in both)
    expect(result[0].rootQuestionId).toBe('q2')
  })

  it('returns empty array when both lists are empty', () => {
    const result = fuseScores([], [], topK, rrfK)
    expect(result).toEqual([])
  })

  it('handles single list results', () => {
    const vectorResults: SearchResult[] = [
      { id: 'q1', score: 0.9, summary: 'Topic 1' },
    ]

    const result = fuseScores(vectorResults, [], topK, rrfK)
    expect(result).toHaveLength(1)
    expect(result[0].rootQuestionId).toBe('q1')
    expect(result[0].fusedScore).toBeCloseTo(1 / (60 + 1) + 1 / (60 + 6), 10)
  })

  it('sorts results by fused score descending', () => {
    const vectorResults: SearchResult[] = [
      { id: 'q1', score: 0.5, summary: 'Topic 1' },
      { id: 'q2', score: 0.9, summary: 'Topic 2' },
      { id: 'q3', score: 0.7, summary: 'Topic 3' },
    ]
    const keywordResults: SearchResult[] = [
      { id: 'q3', score: 10, summary: 'Topic 3' },
      { id: 'q1', score: 8, summary: 'Topic 1' },
    ]

    const result = fuseScores(vectorResults, keywordResults, topK, rrfK)

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].fusedScore).toBeGreaterThanOrEqual(result[i].fusedScore)
    }
  })
})
