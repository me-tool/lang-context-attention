import { nanoid } from 'nanoid'
import { route } from './router.js'
import { assembleContext } from './context.js'
import type {
  Session,
  RootQuestion,
  Message,
  QuestionLink,
  RoutingDecision,
  RoutingCandidate,
  JudgeResult,
  EngineConfig,
  ResolvedEngineConfig,
  ProcessMessageResult,
  ChatMessage,
} from './types.js'
import { DEFAULT_CONFIG } from './types.js'

const SUMMARY_PROMPT_TEMPLATE = `Summarize the main topic of this conversation thread in one concise sentence (max 50 words).
Focus on the core question or task being discussed, not individual messages.

## Recent Messages
{{messages}}

Respond with only the summary sentence, no additional text.`

function resolveConfig(config: EngineConfig): ResolvedEngineConfig {
  return {
    ...config,
    topK: config.topK ?? DEFAULT_CONFIG.topK,
    minFusedScoreForJudge: config.minFusedScoreForJudge ?? DEFAULT_CONFIG.minFusedScoreForJudge,
    rrfK: config.rrfK ?? DEFAULT_CONFIG.rrfK,
    maxContextTokens: config.maxContextTokens ?? DEFAULT_CONFIG.maxContextTokens,
    summaryUpdateInterval: config.summaryUpdateInterval ?? DEFAULT_CONFIG.summaryUpdateInterval,
    summaryContextSize: config.summaryContextSize ?? DEFAULT_CONFIG.summaryContextSize,
  }
}

export class Engine {
  private config: ResolvedEngineConfig

  constructor(config: EngineConfig) {
    this.config = resolveConfig(config)
  }

  async createSession(systemPrompt: string, title?: string): Promise<Session> {
    const now = new Date()
    const session: Session = {
      id: nanoid(),
      title: title ?? 'New Session',
      systemPrompt,
      createdAt: now,
      updatedAt: now,
    }
    await this.config.store.createSession(session)
    return session
  }

  async processMessage(sessionId: string, userMessage: string): Promise<ProcessMessageResult> {
    if (!userMessage.trim()) throw new Error('Message cannot be empty')

    const session = await this.config.store.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const existingQuestions = await this.config.store.getRootQuestionsBySession(sessionId)
    const totalStart = performance.now()

    // Cold start: no root questions exist
    if (existingQuestions.length === 0) {
      return this.handleColdStart(session, userMessage, totalStart)
    }

    // Steady state: route to existing or new root question
    return this.handleSteadyState(session, existingQuestions, userMessage, totalStart)
  }

  private async handleColdStart(
    session: Session,
    userMessage: string,
    totalStart: number
  ): Promise<ProcessMessageResult> {
    const now = new Date()

    // Create first root question
    const rootQuestion: RootQuestion = {
      id: nanoid(),
      sessionId: session.id,
      summary: userMessage,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.config.store.createRootQuestion(rootQuestion)

    // Index it
    const embedding = await this.config.embedding.embed(userMessage)
    await Promise.all([
      this.config.vectorSearch.upsert(rootQuestion.id, userMessage, embedding),
      this.config.keywordSearch.upsert(rootQuestion.id, userMessage),
    ])

    // Create user message
    const userMsg: Message = {
      id: nanoid(),
      sessionId: session.id,
      rootQuestionId: rootQuestion.id,
      role: 'user',
      content: userMessage,
      createdAt: now,
    }
    await this.config.store.createMessage(userMsg)

    // Empty routing decision for cold start
    const coldJudgment: JudgeResult = {
      targetId: null,
      reasoning: 'First message in session — created new topic',
      isNew: true,
      suggestedLinks: [],
    }

    const routingDecision: RoutingDecision = {
      id: nanoid(),
      messageId: userMsg.id,
      candidates: [],
      llmJudgment: coldJudgment,
      finalTarget: rootQuestion.id,
      suggestedLinks: [],
      assembledContext: { messageIds: [], estimatedTokens: 0 },
      timing: { retrievalMs: 0, judgmentMs: 0, totalMs: 0 },
      createdAt: now,
    }

    // Assemble context (just system prompt + user message for cold start)
    const contextResult = assembleContext({
      systemPrompt: session.systemPrompt,
      mainMessages: [],
      linkedMessages: [],
      userMessage,
      maxContextTokens: this.config.maxContextTokens,
    })

    routingDecision.assembledContext = {
      messageIds: contextResult.messageIds,
      estimatedTokens: contextResult.estimatedTokens,
    }
    routingDecision.timing.totalMs = performance.now() - totalStart

    await this.config.store.createRoutingDecision(routingDecision)
    this.config.onRoutingComplete?.(routingDecision)

    // Stream response
    const stream = this.streamAndStore(
      contextResult.messages,
      session.id,
      rootQuestion.id,
      rootQuestion
    )

    return {
      stream,
      routingDecision,
      rootQuestionId: rootQuestion.id,
    }
  }

  private async handleSteadyState(
    session: Session,
    existingQuestions: RootQuestion[],
    userMessage: string,
    totalStart: number
  ): Promise<ProcessMessageResult> {
    const now = new Date()

    // Step 2: Embedding
    const embedding = await this.config.embedding.embed(userMessage)

    // Step 3: Hybrid retrieval
    const retrievalStart = performance.now()
    const candidates = await route({
      embedding,
      userMessage,
      topK: this.config.topK,
      rrfK: this.config.rrfK,
      vectorSearch: this.config.vectorSearch,
      keywordSearch: this.config.keywordSearch,
    })
    const retrievalMs = performance.now() - retrievalStart

    // Step 4: Check threshold
    const aboveThreshold = candidates.filter(
      (c) => c.fusedScore >= this.config.minFusedScoreForJudge
    )

    let targetRootQuestionId: string
    let judgment: JudgeResult
    let judgmentMs = 0

    if (aboveThreshold.length === 0) {
      // No viable candidates — create new root question
      const rq = await this.createNewRootQuestion(session.id, userMessage, embedding, now)
      targetRootQuestionId = rq.id
      judgment = {
        targetId: null,
        reasoning: 'No candidates above threshold — created new topic',
        isNew: true,
        suggestedLinks: [],
      }
    } else {
      // Step 5: LLM judgment
      const judgmentStart = performance.now()
      const judgeContext = {
        userMessage,
        candidates: aboveThreshold.map((c) => {
          const rq = existingQuestions.find((q) => q.id === c.rootQuestionId)
          return {
            id: c.rootQuestionId,
            summary: rq?.summary ?? '',
            fusedScore: c.fusedScore,
          }
        }),
      }

      judgment = await this.config.judge.judge(judgeContext)
      judgmentMs = performance.now() - judgmentStart

      if (judgment.isNew || judgment.targetId === null) {
        const rq = await this.createNewRootQuestion(session.id, userMessage, embedding, now)
        targetRootQuestionId = rq.id
        judgment.targetId = rq.id
      } else {
        targetRootQuestionId = judgment.targetId
      }
    }

    // Step 6: Link suggestions
    if (judgment.suggestedLinks.length > 0) {
      const targetRq = existingQuestions.find((q) => q.id === targetRootQuestionId)
      for (const linkedId of judgment.suggestedLinks) {
        const linkedRq = existingQuestions.find((q) => q.id === linkedId)
        this.config.onLinkSuggestion?.({
          sourceId: targetRootQuestionId,
          targetId: linkedId,
          sourceSummary: targetRq?.summary ?? '',
          targetSummary: linkedRq?.summary ?? '',
        })
      }
    }

    // Create user message
    const userMsg: Message = {
      id: nanoid(),
      sessionId: session.id,
      rootQuestionId: targetRootQuestionId,
      role: 'user',
      content: userMessage,
      createdAt: now,
    }
    await this.config.store.createMessage(userMsg)

    // Step 7: Context assembly
    const mainMessages = await this.config.store.getMessagesByRootQuestion(targetRootQuestionId)
    // Exclude the message we just created (it's the current user message)
    const historicalMessages = mainMessages.filter((m) => m.id !== userMsg.id)

    // Get linked question messages
    const links = await this.config.store.getLinksByRootQuestion(targetRootQuestionId)
    const linkedQuestionIds = links.map((l) =>
      l.sourceId === targetRootQuestionId ? l.targetId : l.sourceId
    )
    const linkedMessages: Message[] = []
    for (const linkedId of linkedQuestionIds) {
      const msgs = await this.config.store.getMessagesByRootQuestion(linkedId)
      linkedMessages.push(...msgs)
    }

    const contextResult = assembleContext({
      systemPrompt: session.systemPrompt,
      mainMessages: historicalMessages,
      linkedMessages,
      userMessage,
      maxContextTokens: this.config.maxContextTokens,
    })

    const totalMs = performance.now() - totalStart

    const routingDecision: RoutingDecision = {
      id: nanoid(),
      messageId: userMsg.id,
      candidates,
      llmJudgment: judgment,
      finalTarget: targetRootQuestionId,
      suggestedLinks: judgment.suggestedLinks,
      assembledContext: {
        messageIds: contextResult.messageIds,
        estimatedTokens: contextResult.estimatedTokens,
      },
      timing: { retrievalMs, judgmentMs, totalMs },
      createdAt: now,
    }

    await this.config.store.createRoutingDecision(routingDecision)
    this.config.onRoutingComplete?.(routingDecision)

    // Step 8: Stream response
    const targetRq = existingQuestions.find((q) => q.id === targetRootQuestionId) ??
      (await this.config.store.getRootQuestion(targetRootQuestionId))!

    const stream = this.streamAndStore(
      contextResult.messages,
      session.id,
      targetRootQuestionId,
      targetRq
    )

    return {
      stream,
      routingDecision,
      rootQuestionId: targetRootQuestionId,
    }
  }

  private async createNewRootQuestion(
    sessionId: string,
    summary: string,
    embedding: number[],
    now: Date
  ): Promise<RootQuestion> {
    const rq: RootQuestion = {
      id: nanoid(),
      sessionId,
      summary,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.config.store.createRootQuestion(rq)
    await Promise.all([
      this.config.vectorSearch.upsert(rq.id, summary, embedding),
      this.config.keywordSearch.upsert(rq.id, summary),
    ])
    return rq
  }

  private streamAndStore(
    contextMessages: ChatMessage[],
    sessionId: string,
    rootQuestionId: string,
    rootQuestion: RootQuestion
  ): AsyncIterable<string> {
    const config = this.config
    const updateSummary = this.updateSummary.bind(this)
    let fullResponse = ''

    // Use a wrapper that guarantees post-stream side effects run
    // even if the consumer breaks early
    const sourceStream = config.chat.streamChat(contextMessages)

    async function* wrappedStream(): AsyncIterable<string> {
      try {
        for await (const chunk of sourceStream) {
          fullResponse += chunk
          yield chunk
        }
      } finally {
        // Always store whatever was collected, even on early break
        if (fullResponse) {
          const assistantMsg: Message = {
            id: nanoid(),
            sessionId,
            rootQuestionId,
            role: 'assistant',
            content: fullResponse,
            createdAt: new Date(),
          }
          await config.store.createMessage(assistantMsg)

          // Atomically increment messageCount via getCurrentCount + 1
          const currentRq = await config.store.getRootQuestion(rootQuestionId)
          const newCount = (currentRq?.messageCount ?? rootQuestion.messageCount) + 1
          await config.store.updateRootQuestion(rootQuestionId, {
            messageCount: newCount,
            updatedAt: new Date(),
          })

          if (newCount % config.summaryUpdateInterval === 0) {
            await updateSummary(rootQuestionId)
          }
        }
      }
    }

    return wrappedStream()
  }

  private async updateSummary(rootQuestionId: string): Promise<void> {
    const messages = await this.config.store.getMessagesByRootQuestion(rootQuestionId)
    const recent = messages
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-this.config.summaryContextSize)

    const messagesText = recent
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n')

    const prompt = SUMMARY_PROMPT_TEMPLATE.replace('{{messages}}', messagesText)

    const newSummary = await this.config.chat.chat([
      { role: 'user', content: prompt },
    ])

    await this.config.store.updateRootQuestion(rootQuestionId, {
      summary: newSummary.trim(),
      updatedAt: new Date(),
    })

    // Re-index
    const embedding = await this.config.embedding.embed(newSummary.trim())
    await Promise.all([
      this.config.vectorSearch.upsert(rootQuestionId, newSummary.trim(), embedding),
      this.config.keywordSearch.upsert(rootQuestionId, newSummary.trim()),
    ])
  }

  // --- Manual Operations ---

  async reassignMessage(messageId: string, newRootQuestionId: string): Promise<void> {
    await this.config.store.reassignMessage(messageId, newRootQuestionId)
  }

  async linkQuestions(sourceId: string, targetId: string): Promise<QuestionLink> {
    const link: QuestionLink = {
      id: nanoid(),
      sourceId,
      targetId,
      createdBy: 'user',
      createdAt: new Date(),
    }
    await this.config.store.createLink(link)
    return link
  }

  async unlinkQuestions(linkId: string): Promise<void> {
    await this.config.store.deleteLink(linkId)
  }

  // --- Query Methods ---

  async getSession(sessionId: string): Promise<Session | null> {
    return this.config.store.getSession(sessionId)
  }

  async getRootQuestions(sessionId: string): Promise<RootQuestion[]> {
    return this.config.store.getRootQuestionsBySession(sessionId)
  }

  async getMessages(rootQuestionId: string): Promise<Message[]> {
    return this.config.store.getMessagesByRootQuestion(rootQuestionId)
  }

  async getTimeline(sessionId: string): Promise<Message[]> {
    const messages = await this.config.store.getMessagesBySession(sessionId)
    return messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async getRoutingDecision(messageId: string): Promise<RoutingDecision | null> {
    return this.config.store.getRoutingDecisionByMessage(messageId)
  }
}

export function createEngine(config: EngineConfig): Engine {
  return new Engine(config)
}
