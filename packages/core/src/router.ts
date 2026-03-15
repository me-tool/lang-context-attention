import type {
  VectorSearchProvider,
  KeywordSearchProvider,
} from './interfaces.js'
import type { RoutingCandidate, SearchResult } from './types.js'

export interface RouteInput {
  embedding: number[]
  userMessage: string
  topK: number
  rrfK: number
  vectorSearch: VectorSearchProvider
  keywordSearch: KeywordSearchProvider
}

export async function route(input: RouteInput): Promise<RoutingCandidate[]> {
  const { embedding, userMessage, topK, rrfK, vectorSearch, keywordSearch } = input

  // Parallel retrieval
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch.search(embedding, topK),
    keywordSearch.search(userMessage, topK),
  ])

  return fuseScores(vectorResults, keywordResults, topK, rrfK)
}

export function fuseScores(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  topK: number,
  rrfK: number
): RoutingCandidate[] {
  // Build rank maps (rank starts at 1)
  const vectorRanks = new Map<string, { rank: number; score: number; summary: string }>()
  vectorResults.forEach((r, i) => vectorRanks.set(r.id, { rank: i + 1, score: r.score, summary: r.summary }))

  const keywordRanks = new Map<string, { rank: number; score: number; summary: string }>()
  keywordResults.forEach((r, i) => keywordRanks.set(r.id, { rank: i + 1, score: r.score, summary: r.summary }))

  // Collect all unique document IDs
  const allIds = new Set([...vectorRanks.keys(), ...keywordRanks.keys()])

  const candidates: RoutingCandidate[] = []

  for (const id of allIds) {
    const vectorRank = vectorRanks.get(id)?.rank ?? topK + 1
    const keywordRank = keywordRanks.get(id)?.rank ?? topK + 1
    const vectorScore = vectorRanks.get(id)?.score ?? 0
    const bm25Score = keywordRanks.get(id)?.score ?? 0

    const fusedScore = 1 / (rrfK + vectorRank) + 1 / (rrfK + keywordRank)

    candidates.push({
      rootQuestionId: id,
      vectorScore,
      bm25Score,
      fusedScore,
    })
  }

  // Sort by fused score descending
  candidates.sort((a, b) => b.fusedScore - a.fusedScore)

  return candidates
}
