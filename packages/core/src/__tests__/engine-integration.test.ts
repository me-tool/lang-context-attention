import { describe, it, expect, beforeEach } from 'vitest'
import { Engine, createEngine } from '../engine.js'
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
} from '../types.js'

// --- In-memory providers for testing ---

function createMemoryStore(): StoreProvider {
  const sessions = new Map<string, Session>()
  const rootQuestions = new Map<string, RootQuestion>()
  const messages = new Map<string, Message>()
  const routingDecisions = new Map<string, RoutingDecision>()
  const links = new Map<string, QuestionLink>()

  return {
    async createSession(s) { sessions.set(s.id, s) },
    async getSession(id) { return sessions.get(id) ?? null },
    async updateSession(id, u) { const s = sessions.get(id); if (s) sessions.set(id, { ...s, ...u } as Session) },
    async createRootQuestion(rq) { rootQuestions.set(rq.id, rq) },
    async getRootQuestion(id) { return rootQuestions.get(id) ?? null },
    async getRootQuestionsBySession(sid) { return [...rootQuestions.values()].filter(rq => rq.sessionId === sid) },
    async updateRootQuestion(id, u) { const rq = rootQuestions.get(id); if (rq) rootQuestions.set(id, { ...rq, ...u } as RootQuestion) },
    async createMessage(m) { messages.set(m.id, m) },
    async getMessagesByRootQuestion(rqId) { return [...messages.values()].filter(m => m.rootQuestionId === rqId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) },
    async getMessagesBySession(sid) { return [...messages.values()].filter(m => m.sessionId === sid).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) },
    async reassignMessage(mid, newRqId) { const m = messages.get(mid); if (m) messages.set(mid, { ...m, rootQuestionId: newRqId }) },
    async createRoutingDecision(d) { routingDecisions.set(d.id, d) },
    async getRoutingDecisionByMessage(mid) { return [...routingDecisions.values()].find(d => d.messageId === mid) ?? null },
    async createLink(l) { links.set(l.id, l) },
    async getLinksByRootQuestion(rqId) { return [...links.values()].filter(l => l.sourceId === rqId || l.targetId === rqId) },
    async deleteLink(id) { links.delete(id) },
  }
}

// Deterministic embedding: hash text into fixed-size vector
function hashEmbed(text: string, dims: number): number[] {
  const vec = new Array(dims).fill(0)
  const t = text.toLowerCase()
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    vec[(c * 31 + i * 7) % dims] += (c - 96) / 26
    if (i < t.length - 1) {
      const n = t.charCodeAt(i + 1)
      vec[(c * n + i * 13) % dims] += 0.5
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map(v => v / norm)
}

const DIMS = 32

function createTestVectorSearch(): VectorSearchProvider {
  const data = new Map<string, { text: string; embedding: number[] }>()
  return {
    async upsert(id, text, emb) { data.set(id, { text, embedding: emb }) },
    async search(emb, topK) {
      const results: SearchResult[] = []
      for (const [id, val] of data.entries()) {
        // Cosine similarity
        let dot = 0, normA = 0, normB = 0
        for (let i = 0; i < emb.length; i++) {
          dot += emb[i] * val.embedding[i]
          normA += emb[i] * emb[i]
          normB += val.embedding[i] * val.embedding[i]
        }
        const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
        results.push({ id, score: sim, summary: val.text })
      }
      return results.sort((a, b) => b.score - a.score).slice(0, topK)
    },
    async delete(id) { data.delete(id) },
  }
}

function createTestKeywordSearch(): KeywordSearchProvider {
  const data = new Map<string, string>()
  return {
    async upsert(id, text) { data.set(id, text) },
    async search(query, topK) {
      const results: SearchResult[] = []
      const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
      for (const [id, text] of data.entries()) {
        const textLower = text.toLowerCase()
        const matches = queryWords.filter(w => textLower.includes(w)).length
        if (matches > 0) {
          results.push({ id, score: matches, summary: text })
        }
      }
      return results.sort((a, b) => b.score - a.score).slice(0, topK)
    },
    async delete(id) { data.delete(id) },
  }
}

// Judge that uses substring overlap to decide routing
// Uses word stems (first 4 chars) for fuzzy matching: "deploying" matches "deploy"
const testJudge: JudgeProvider = {
  async judge(ctx: JudgeContext): Promise<JudgeResult> {
    if (ctx.candidates.length === 0) {
      return { targetId: null, reasoning: 'No candidates', isNew: true, suggestedLinks: [] }
    }

    const clean = (w: string) => w.replace(/[^a-z0-9]/g, '')
    const stem = (w: string) => clean(w).slice(0, 4)
    const userStems = new Set(
      ctx.userMessage.toLowerCase().split(/\s+/).map(stem).filter(s => s.length > 2)
    )

    let bestId = ctx.candidates[0].id
    let bestOverlap = 0

    for (const c of ctx.candidates) {
      const cStems = new Set(
        c.summary.toLowerCase().split(/\s+/).map(stem).filter(s => s.length > 2)
      )
      const overlap = [...userStems].filter(s => cStems.has(s)).length
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestId = c.id
      }
    }

    if (bestOverlap > 0) {
      return { targetId: bestId, reasoning: `Matched with ${bestOverlap} stems`, isNew: false, suggestedLinks: [] }
    }

    return { targetId: null, reasoning: 'No keyword overlap with any candidate', isNew: true, suggestedLinks: [] }
  },
}

const testChat: ChatProvider = {
  async chat(msgs) { return `Summary: ${msgs[msgs.length - 1]?.content?.slice(0, 30)}` },
  async *streamChat(msgs) {
    yield `Response to: ${msgs[msgs.length - 1]?.content?.slice(0, 50)}`
  },
}

const testEmbedding: EmbeddingProvider = {
  dimensions: DIMS,
  async embed(text) { return hashEmbed(text, DIMS) },
}

describe('Engine Integration Tests - Multi-round Conversation', () => {
  let engine: Engine

  beforeEach(() => {
    engine = createEngine({
      store: createMemoryStore(),
      vectorSearch: createTestVectorSearch(),
      keywordSearch: createTestKeywordSearch(),
      chat: testChat,
      judge: testJudge,
      embedding: testEmbedding,
    })
  })

  it('cold start: first message creates a new root question', async () => {
    const session = await engine.createSession('You are helpful.', 'Test')

    const result = await engine.processMessage(session.id, 'How do I deploy to AWS?')

    // Should create a new root question
    expect(result.routingDecision.llmJudgment.isNew).toBe(true)
    expect(result.routingDecision.candidates).toHaveLength(0)

    // Should have one root question
    const rqs = await engine.getRootQuestions(session.id)
    expect(rqs).toHaveLength(1)
    expect(rqs[0].summary).toBe('How do I deploy to AWS?')

    // Consume stream
    let response = ''
    for await (const chunk of result.stream) { response += chunk }
    expect(response).toBeTruthy()

    // Should have 2 messages (user + assistant)
    const msgs = await engine.getMessages(rqs[0].id)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[1].role).toBe('assistant')
  })

  it('routes follow-up question to same root question', async () => {
    const session = await engine.createSession('You are helpful.')

    // First message
    const r1 = await engine.processMessage(session.id, 'How do I deploy to AWS?')
    for await (const _ of r1.stream) {} // consume

    // Follow-up about same topic
    const r2 = await engine.processMessage(session.id, 'What about deploying to AWS with Docker?')
    for await (const _ of r2.stream) {} // consume

    // Should route to same root question (keyword overlap: "deploy", "AWS")
    expect(r2.rootQuestionId).toBe(r1.rootQuestionId)
    expect(r2.routingDecision.llmJudgment.isNew).toBe(false)

    // Should have 4 messages under same root question
    const msgs = await engine.getMessages(r1.rootQuestionId)
    expect(msgs).toHaveLength(4) // 2 user + 2 assistant
  })

  it('creates new root question for unrelated topic', async () => {
    const session = await engine.createSession('You are helpful.')

    // First topic: AWS deployment
    const r1 = await engine.processMessage(session.id, 'How do I deploy to AWS?')
    for await (const _ of r1.stream) {}

    // Completely different topic: cooking
    const r2 = await engine.processMessage(session.id, 'What is the best recipe for chocolate cake?')
    for await (const _ of r2.stream) {}

    // Should create a new root question
    expect(r2.rootQuestionId).not.toBe(r1.rootQuestionId)
    expect(r2.routingDecision.llmJudgment.isNew).toBe(true)

    // Should have 2 root questions
    const rqs = await engine.getRootQuestions(session.id)
    expect(rqs).toHaveLength(2)
  })

  it('handles 5-round interleaved conversation across 2 topics', async () => {
    const session = await engine.createSession('You are helpful.')

    // Round 1: Topic A - AWS
    const r1 = await engine.processMessage(session.id, 'How do I deploy to AWS?')
    for await (const _ of r1.stream) {}
    const topicA = r1.rootQuestionId

    // Round 2: Topic B - cooking
    const r2 = await engine.processMessage(session.id, 'What is the best recipe for chocolate cake?')
    for await (const _ of r2.stream) {}
    const topicB = r2.rootQuestionId
    expect(topicB).not.toBe(topicA)

    // Round 3: Back to Topic A
    const r3 = await engine.processMessage(session.id, 'How do I configure AWS load balancer?')
    for await (const _ of r3.stream) {}
    expect(r3.rootQuestionId).toBe(topicA)

    // Round 4: Back to Topic B
    const r4 = await engine.processMessage(session.id, 'How long should I bake the chocolate cake?')
    for await (const _ of r4.stream) {}
    expect(r4.rootQuestionId).toBe(topicB)

    // Round 5: Topic A again
    const r5 = await engine.processMessage(session.id, 'What AWS region should I deploy to?')
    for await (const _ of r5.stream) {}
    expect(r5.rootQuestionId).toBe(topicA)

    // Verify message distribution
    const msgsA = await engine.getMessages(topicA)
    const msgsB = await engine.getMessages(topicB)
    expect(msgsA).toHaveLength(6) // 3 user + 3 assistant
    expect(msgsB).toHaveLength(4) // 2 user + 2 assistant

    // Verify timeline has all messages
    const timeline = await engine.getTimeline(session.id)
    expect(timeline).toHaveLength(10) // 5 user + 5 assistant
  })

  it('routing decision has valid timing and context info', async () => {
    const session = await engine.createSession('You are helpful.')

    const r1 = await engine.processMessage(session.id, 'Hello world')
    for await (const _ of r1.stream) {}

    const r2 = await engine.processMessage(session.id, 'Hello world again')
    for await (const _ of r2.stream) {}

    const decision = await engine.getRoutingDecision(r2.routingDecision.messageId)
    expect(decision).not.toBeNull()
    expect(decision!.timing.totalMs).toBeGreaterThanOrEqual(0)
    expect(decision!.assembledContext.estimatedTokens).toBeGreaterThan(0)
    expect(decision!.assembledContext.messageIds.length).toBeGreaterThanOrEqual(0)
  })

  it('reassignMessage moves message to different root question', async () => {
    const session = await engine.createSession('You are helpful.')

    const r1 = await engine.processMessage(session.id, 'Deploy to AWS')
    for await (const _ of r1.stream) {}

    const r2 = await engine.processMessage(session.id, 'Recipe for cake')
    for await (const _ of r2.stream) {}

    // Get user message from topic B
    const msgsB = await engine.getMessages(r2.rootQuestionId)
    const userMsgB = msgsB.find(m => m.role === 'user')!

    // Reassign to topic A
    await engine.reassignMessage(userMsgB.id, r1.rootQuestionId)

    // Verify reassignment
    const msgsAAfter = await engine.getMessages(r1.rootQuestionId)
    expect(msgsAAfter.some(m => m.id === userMsgB.id)).toBe(true)
  })

  it('linkQuestions and unlinkQuestions work correctly', async () => {
    const session = await engine.createSession('You are helpful.')

    const r1 = await engine.processMessage(session.id, 'Deploy to AWS')
    for await (const _ of r1.stream) {}

    const r2 = await engine.processMessage(session.id, 'Recipe for cake')
    for await (const _ of r2.stream) {}

    // Link the two questions
    const link = await engine.linkQuestions(r1.rootQuestionId, r2.rootQuestionId)
    expect(link.sourceId).toBe(r1.rootQuestionId)
    expect(link.targetId).toBe(r2.rootQuestionId)

    // Unlink
    await engine.unlinkQuestions(link.id)
    // No error thrown = success
  })

  it('rejects empty messages', async () => {
    const session = await engine.createSession('You are helpful.')

    await expect(engine.processMessage(session.id, '')).rejects.toThrow('Message cannot be empty')
    await expect(engine.processMessage(session.id, '   ')).rejects.toThrow('Message cannot be empty')
  })

  it('rejects invalid session ID', async () => {
    await expect(engine.processMessage('nonexistent', 'hello')).rejects.toThrow('Session not found')
  })
})
