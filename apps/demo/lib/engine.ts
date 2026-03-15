import { Engine, createEngine } from '@lang-context/core'
import type {
  StoreProvider,
  VectorSearchProvider,
  KeywordSearchProvider,
  ChatProvider,
  JudgeProvider,
  EmbeddingProvider,
  Session,
  RootQuestion,
  Message,
  QuestionLink,
  RoutingDecision,
  SearchResult,
  JudgeContext,
  JudgeResult,
  ChatMessage,
} from '@lang-context/core'

// --- Mock Providers (used until real packages are ready) ---

function createMockStore(): StoreProvider {
  const sessions = new Map<string, Session>()
  const rootQuestions = new Map<string, RootQuestion>()
  const messages = new Map<string, Message>()
  const routingDecisions = new Map<string, RoutingDecision>()
  const links = new Map<string, QuestionLink>()

  return {
    async createSession(session) {
      sessions.set(session.id, session)
    },
    async getSession(id) {
      return sessions.get(id) ?? null
    },
    async updateSession(id, updates) {
      const s = sessions.get(id)
      if (s) sessions.set(id, { ...s, ...updates } as Session)
    },
    async createRootQuestion(rq) {
      rootQuestions.set(rq.id, rq)
    },
    async getRootQuestion(id) {
      return rootQuestions.get(id) ?? null
    },
    async getRootQuestionsBySession(sessionId) {
      return [...rootQuestions.values()].filter((rq) => rq.sessionId === sessionId)
    },
    async updateRootQuestion(id, updates) {
      const rq = rootQuestions.get(id)
      if (rq) rootQuestions.set(id, { ...rq, ...updates } as RootQuestion)
    },
    async createMessage(message) {
      messages.set(message.id, message)
    },
    async getMessagesByRootQuestion(rootQuestionId) {
      return [...messages.values()].filter((m) => m.rootQuestionId === rootQuestionId)
    },
    async getMessagesBySession(sessionId) {
      return [...messages.values()].filter((m) => m.sessionId === sessionId)
    },
    async reassignMessage(messageId, newRootQuestionId) {
      const m = messages.get(messageId)
      if (m) messages.set(messageId, { ...m, rootQuestionId: newRootQuestionId })
    },
    async createRoutingDecision(decision) {
      routingDecisions.set(decision.id, decision)
    },
    async getRoutingDecisionByMessage(messageId) {
      return [...routingDecisions.values()].find((d) => d.messageId === messageId) ?? null
    },
    async createLink(link) {
      links.set(link.id, link)
    },
    async getLinksByRootQuestion(rootQuestionId) {
      return [...links.values()].filter(
        (l) => l.sourceId === rootQuestionId || l.targetId === rootQuestionId
      )
    },
    async deleteLink(id) {
      links.delete(id)
    },
  }
}

function createMockVectorSearch(): VectorSearchProvider {
  const data = new Map<string, { text: string; embedding: number[] }>()

  return {
    async upsert(rootQuestionId: string, text: string, embedding: number[]) {
      data.set(rootQuestionId, { text, embedding })
    },
    async search(_embedding: number[], topK: number): Promise<SearchResult[]> {
      const results: SearchResult[] = []
      for (const [id, val] of data.entries()) {
        results.push({ id, score: Math.random() * 0.5 + 0.5, summary: val.text })
      }
      return results.sort((a, b) => b.score - a.score).slice(0, topK)
    },
    async delete(rootQuestionId: string) {
      data.delete(rootQuestionId)
    },
  }
}

function createMockKeywordSearch(): KeywordSearchProvider {
  const data = new Map<string, string>()

  return {
    async upsert(rootQuestionId: string, text: string) {
      data.set(rootQuestionId, text)
    },
    async search(query: string, topK: number): Promise<SearchResult[]> {
      const results: SearchResult[] = []
      for (const [id, text] of data.entries()) {
        const words = query.toLowerCase().split(/\s+/)
        const matches = words.filter((w) => text.toLowerCase().includes(w)).length
        if (matches > 0) {
          results.push({ id, score: matches / words.length, summary: text })
        }
      }
      return results.sort((a, b) => b.score - a.score).slice(0, topK)
    },
    async delete(rootQuestionId: string) {
      data.delete(rootQuestionId)
    },
  }
}

const mockChat: ChatProvider = {
  async chat(messages: ChatMessage[]): Promise<string> {
    return `[Mock response to: ${messages[messages.length - 1]?.content?.slice(0, 50)}...]`
  },
  async *streamChat(_messages: ChatMessage[]): AsyncIterable<string> {
    const response =
      'This is a mock response. The engine is running with mock providers. Your message was received and routed successfully.'
    const words = response.split(' ')
    for (const word of words) {
      yield word + ' '
      await new Promise((r) => setTimeout(r, 50))
    }
  },
}

const mockJudge: JudgeProvider = {
  async judge(context: JudgeContext): Promise<JudgeResult> {
    if (context.candidates.length === 0) {
      return { targetId: null, reasoning: 'No candidates', isNew: true, suggestedLinks: [] }
    }
    const best = context.candidates[0]
    return {
      targetId: best.id,
      reasoning: `Mock: Routed to "${best.summary}" (score: ${best.fusedScore.toFixed(3)})`,
      isNew: false,
      suggestedLinks: [],
    }
  },
}

const mockEmbedding: EmbeddingProvider = {
  dimensions: 384,
  async embed(_text: string): Promise<number[]> {
    return Array.from({ length: 384 }, () => Math.random() * 2 - 1)
  },
}

// --- Engine Singleton ---

let engine: Engine | null = null

// Link suggestion queue for the API to consume
export const linkSuggestionQueue: Array<{
  sourceId: string
  targetId: string
  sourceSummary: string
  targetSummary: string
}> = []

export function getEngine(): Engine {
  if (!engine) {
    // TODO: Replace mock providers with real implementations when packages are ready
    // import { createSqliteStore } from '@lang-context/store-sqlite'
    // import { createAiSdkProvider } from '@lang-context/provider-ai-sdk'

    engine = createEngine({
      store: createMockStore(),
      vectorSearch: createMockVectorSearch(),
      keywordSearch: createMockKeywordSearch(),
      chat: mockChat,
      judge: mockJudge,
      embedding: mockEmbedding,
      onLinkSuggestion: (suggestion) => {
        linkSuggestionQueue.push(suggestion)
      },
    })
  }
  return engine
}
