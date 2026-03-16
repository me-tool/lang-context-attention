import type Database from 'better-sqlite3'
import type {
  StoreProvider,
  Session,
  RootQuestion,
  Message,
  QuestionLink,
  RoutingDecision,
} from '@llm-context/core'

export class SqliteStore implements StoreProvider {
  constructor(private db: Database.Database) {}

  // --- Session ---

  async createSession(session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (id, title, system_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.title,
        session.systemPrompt,
        session.createdAt.toISOString(),
        session.updatedAt.toISOString(),
      )
  }

  async getSession(id: string): Promise<Session | null> {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as any
    if (!row) return null
    return this.toSession(row)
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.title !== undefined) {
      fields.push('title = ?')
      values.push(updates.title)
    }
    if (updates.systemPrompt !== undefined) {
      fields.push('system_prompt = ?')
      values.push(updates.systemPrompt)
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?')
      values.push(updates.updatedAt.toISOString())
    }

    if (fields.length === 0) return

    values.push(id)
    this.db
      .prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values)
  }

  // --- RootQuestion ---

  async createRootQuestion(rq: RootQuestion): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO root_questions (id, session_id, summary, message_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rq.id,
        rq.sessionId,
        rq.summary,
        rq.messageCount,
        rq.createdAt.toISOString(),
        rq.updatedAt.toISOString(),
      )
  }

  async getRootQuestion(id: string): Promise<RootQuestion | null> {
    const row = this.db
      .prepare('SELECT * FROM root_questions WHERE id = ?')
      .get(id) as any
    if (!row) return null
    return this.toRootQuestion(row)
  }

  async getRootQuestionsBySession(sessionId: string): Promise<RootQuestion[]> {
    const rows = this.db
      .prepare('SELECT * FROM root_questions WHERE session_id = ?')
      .all(sessionId) as any[]
    return rows.map((r) => this.toRootQuestion(r))
  }

  async updateRootQuestion(
    id: string,
    updates: Partial<RootQuestion>,
  ): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.summary !== undefined) {
      fields.push('summary = ?')
      values.push(updates.summary)
    }
    if (updates.messageCount !== undefined) {
      fields.push('message_count = ?')
      values.push(updates.messageCount)
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?')
      values.push(updates.updatedAt.toISOString())
    }

    if (fields.length === 0) return

    values.push(id)
    this.db
      .prepare(`UPDATE root_questions SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values)
  }

  // --- Message ---

  async createMessage(message: Message): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, root_question_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.sessionId,
        message.rootQuestionId,
        message.role,
        message.content,
        message.createdAt.toISOString(),
      )
  }

  async getMessagesByRootQuestion(rootQuestionId: string): Promise<Message[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM messages WHERE root_question_id = ? ORDER BY created_at',
      )
      .all(rootQuestionId) as any[]
    return rows.map((r) => this.toMessage(r))
  }

  async getMessagesBySession(sessionId: string): Promise<Message[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at',
      )
      .all(sessionId) as any[]
    return rows.map((r) => this.toMessage(r))
  }

  async reassignMessage(
    messageId: string,
    newRootQuestionId: string,
  ): Promise<void> {
    this.db
      .prepare('UPDATE messages SET root_question_id = ? WHERE id = ?')
      .run(newRootQuestionId, messageId)
  }

  // --- RoutingDecision ---

  async createRoutingDecision(decision: RoutingDecision): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO routing_decisions (id, message_id, final_target, suggested_links, candidates, llm_judgment, assembled_context, timing, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        decision.id,
        decision.messageId,
        decision.finalTarget,
        JSON.stringify(decision.suggestedLinks),
        JSON.stringify(decision.candidates),
        JSON.stringify(decision.llmJudgment),
        JSON.stringify(decision.assembledContext),
        JSON.stringify(decision.timing),
        decision.createdAt.toISOString(),
      )
  }

  async getRoutingDecisionByMessage(
    messageId: string,
  ): Promise<RoutingDecision | null> {
    const row = this.db
      .prepare('SELECT * FROM routing_decisions WHERE message_id = ?')
      .get(messageId) as any
    if (!row) return null
    return this.toRoutingDecision(row)
  }

  // --- QuestionLink ---

  async createLink(link: QuestionLink): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO question_links (id, source_id, target_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        link.id,
        link.sourceId,
        link.targetId,
        link.createdBy,
        link.createdAt.toISOString(),
      )
  }

  async getLinksByRootQuestion(
    rootQuestionId: string,
  ): Promise<QuestionLink[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM question_links WHERE source_id = ? OR target_id = ?',
      )
      .all(rootQuestionId, rootQuestionId) as any[]
    return rows.map((r) => this.toQuestionLink(r))
  }

  async deleteLink(id: string): Promise<void> {
    this.db.prepare('DELETE FROM question_links WHERE id = ?').run(id)
  }

  // --- Row mappers ---

  private toSession(row: any): Session {
    return {
      id: row.id,
      title: row.title,
      systemPrompt: row.system_prompt,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private toRootQuestion(row: any): RootQuestion {
    return {
      id: row.id,
      sessionId: row.session_id,
      summary: row.summary,
      messageCount: row.message_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  private toMessage(row: any): Message {
    return {
      id: row.id,
      sessionId: row.session_id,
      rootQuestionId: row.root_question_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at),
    }
  }

  private toRoutingDecision(row: any): RoutingDecision {
    return {
      id: row.id,
      messageId: row.message_id,
      finalTarget: row.final_target,
      suggestedLinks: JSON.parse(row.suggested_links),
      candidates: JSON.parse(row.candidates),
      llmJudgment: JSON.parse(row.llm_judgment),
      assembledContext: JSON.parse(row.assembled_context),
      timing: JSON.parse(row.timing),
      createdAt: new Date(row.created_at),
    }
  }

  private toQuestionLink(row: any): QuestionLink {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    }
  }
}
