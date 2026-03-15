import type {
  Session,
  RootQuestion,
  Message,
  QuestionLink,
  RoutingDecision,
  SearchResult,
  JudgeContext,
  JudgeResult,
  ChatMessage,
} from './types.js'

// --- Search Providers ---

export interface VectorSearchProvider {
  upsert(rootQuestionId: string, text: string, embedding: number[]): Promise<void>
  search(embedding: number[], topK: number): Promise<SearchResult[]>
  delete(rootQuestionId: string): Promise<void>
}

export interface KeywordSearchProvider {
  upsert(rootQuestionId: string, text: string): Promise<void>
  search(query: string, topK: number): Promise<SearchResult[]>
  delete(rootQuestionId: string): Promise<void>
}

// --- LLM Providers ---

export interface ChatProvider {
  chat(messages: ChatMessage[]): Promise<string>
  streamChat(messages: ChatMessage[]): AsyncIterable<string>
}

export interface JudgeProvider {
  judge(context: JudgeContext): Promise<JudgeResult>
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  readonly dimensions: number
}

// --- Storage Provider ---

export interface StoreProvider {
  // Session
  createSession(session: Session): Promise<void>
  getSession(id: string): Promise<Session | null>
  updateSession(id: string, updates: Partial<Session>): Promise<void>

  // RootQuestion
  createRootQuestion(rootQuestion: RootQuestion): Promise<void>
  getRootQuestion(id: string): Promise<RootQuestion | null>
  getRootQuestionsBySession(sessionId: string): Promise<RootQuestion[]>
  updateRootQuestion(id: string, updates: Partial<RootQuestion>): Promise<void>

  // Message
  createMessage(message: Message): Promise<void>
  getMessagesByRootQuestion(rootQuestionId: string): Promise<Message[]>
  getMessagesBySession(sessionId: string): Promise<Message[]>
  reassignMessage(messageId: string, newRootQuestionId: string): Promise<void>

  // RoutingDecision
  createRoutingDecision(decision: RoutingDecision): Promise<void>
  getRoutingDecisionByMessage(messageId: string): Promise<RoutingDecision | null>

  // QuestionLink
  createLink(link: QuestionLink): Promise<void>
  getLinksByRootQuestion(rootQuestionId: string): Promise<QuestionLink[]>
  deleteLink(id: string): Promise<void>
}
