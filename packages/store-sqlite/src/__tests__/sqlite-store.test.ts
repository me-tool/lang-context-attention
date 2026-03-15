import { describe, it, expect, beforeEach } from 'vitest'
import { createDatabase } from '../db.js'
import { SqliteStore } from '../sqlite-store.js'
import type Database from 'better-sqlite3'

describe('SqliteStore', () => {
  let db: Database.Database
  let store: SqliteStore

  beforeEach(() => {
    db = createDatabase(':memory:')
    store = new SqliteStore(db)
  })

  // --- Session ---

  describe('Session', () => {
    const session = {
      id: 's1',
      title: 'Test Session',
      systemPrompt: 'You are helpful.',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }

    it('should create and get a session', async () => {
      await store.createSession(session)
      const result = await store.getSession('s1')
      expect(result).toEqual(session)
    })

    it('should return null for non-existent session', async () => {
      const result = await store.getSession('nonexistent')
      expect(result).toBeNull()
    })

    it('should update a session', async () => {
      await store.createSession(session)
      const newDate = new Date('2024-06-01T00:00:00Z')
      await store.updateSession('s1', { title: 'Updated', updatedAt: newDate })
      const result = await store.getSession('s1')
      expect(result!.title).toBe('Updated')
      expect(result!.updatedAt).toEqual(newDate)
      expect(result!.systemPrompt).toBe('You are helpful.')
    })
  })

  // --- RootQuestion ---

  describe('RootQuestion', () => {
    const session = {
      id: 's1',
      title: 'Test',
      systemPrompt: 'prompt',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }

    const rq = {
      id: 'rq1',
      sessionId: 's1',
      summary: 'What is TypeScript?',
      messageCount: 0,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    }

    beforeEach(async () => {
      await store.createSession(session)
    })

    it('should create and get a root question', async () => {
      await store.createRootQuestion(rq)
      const result = await store.getRootQuestion('rq1')
      expect(result).toEqual(rq)
    })

    it('should return null for non-existent root question', async () => {
      const result = await store.getRootQuestion('nonexistent')
      expect(result).toBeNull()
    })

    it('should get root questions by session', async () => {
      await store.createRootQuestion(rq)
      await store.createRootQuestion({ ...rq, id: 'rq2', summary: 'Second' })
      const results = await store.getRootQuestionsBySession('s1')
      expect(results).toHaveLength(2)
    })

    it('should update a root question', async () => {
      await store.createRootQuestion(rq)
      await store.updateRootQuestion('rq1', {
        summary: 'Updated summary',
        messageCount: 5,
      })
      const result = await store.getRootQuestion('rq1')
      expect(result!.summary).toBe('Updated summary')
      expect(result!.messageCount).toBe(5)
    })
  })

  // --- Message ---

  describe('Message', () => {
    const now = new Date('2024-01-01T00:00:00Z')

    beforeEach(async () => {
      await store.createSession({
        id: 's1',
        title: 'Test',
        systemPrompt: 'prompt',
        createdAt: now,
        updatedAt: now,
      })
      await store.createRootQuestion({
        id: 'rq1',
        sessionId: 's1',
        summary: 'Q1',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      await store.createRootQuestion({
        id: 'rq2',
        sessionId: 's1',
        summary: 'Q2',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    })

    it('should create and get messages by root question', async () => {
      const msg = {
        id: 'm1',
        sessionId: 's1',
        rootQuestionId: 'rq1',
        role: 'user' as const,
        content: 'Hello',
        createdAt: now,
      }
      await store.createMessage(msg)
      const results = await store.getMessagesByRootQuestion('rq1')
      expect(results).toHaveLength(1)
      expect(results[0]).toEqual(msg)
    })

    it('should get messages by session', async () => {
      await store.createMessage({
        id: 'm1',
        sessionId: 's1',
        rootQuestionId: 'rq1',
        role: 'user',
        content: 'Hello',
        createdAt: now,
      })
      await store.createMessage({
        id: 'm2',
        sessionId: 's1',
        rootQuestionId: 'rq2',
        role: 'assistant',
        content: 'Hi',
        createdAt: new Date('2024-01-01T00:01:00Z'),
      })
      const results = await store.getMessagesBySession('s1')
      expect(results).toHaveLength(2)
    })

    it('should reassign a message', async () => {
      await store.createMessage({
        id: 'm1',
        sessionId: 's1',
        rootQuestionId: 'rq1',
        role: 'user',
        content: 'Hello',
        createdAt: now,
      })
      await store.reassignMessage('m1', 'rq2')
      const rq1Messages = await store.getMessagesByRootQuestion('rq1')
      const rq2Messages = await store.getMessagesByRootQuestion('rq2')
      expect(rq1Messages).toHaveLength(0)
      expect(rq2Messages).toHaveLength(1)
      expect(rq2Messages[0].rootQuestionId).toBe('rq2')
    })
  })

  // --- RoutingDecision ---

  describe('RoutingDecision', () => {
    const now = new Date('2024-01-01T00:00:00Z')

    beforeEach(async () => {
      await store.createSession({
        id: 's1',
        title: 'Test',
        systemPrompt: 'prompt',
        createdAt: now,
        updatedAt: now,
      })
      await store.createRootQuestion({
        id: 'rq1',
        sessionId: 's1',
        summary: 'Q1',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      await store.createMessage({
        id: 'm1',
        sessionId: 's1',
        rootQuestionId: 'rq1',
        role: 'user',
        content: 'Hello',
        createdAt: now,
      })
    })

    it('should create and get a routing decision', async () => {
      const decision = {
        id: 'rd1',
        messageId: 'm1',
        finalTarget: 'rq1',
        suggestedLinks: ['rq2'],
        candidates: [
          {
            rootQuestionId: 'rq1',
            vectorScore: 0.9,
            bm25Score: 0.8,
            fusedScore: 0.85,
          },
        ],
        llmJudgment: {
          targetId: 'rq1',
          reasoning: 'Best match',
          isNew: false,
          suggestedLinks: [],
        },
        assembledContext: { messageIds: ['m1'], estimatedTokens: 100 },
        timing: { retrievalMs: 10, judgmentMs: 20, totalMs: 30 },
        createdAt: now,
      }
      await store.createRoutingDecision(decision)
      const result = await store.getRoutingDecisionByMessage('m1')
      expect(result).toEqual(decision)
    })

    it('should return null for non-existent routing decision', async () => {
      const result = await store.getRoutingDecisionByMessage('nonexistent')
      expect(result).toBeNull()
    })
  })

  // --- QuestionLink ---

  describe('QuestionLink', () => {
    const now = new Date('2024-01-01T00:00:00Z')

    beforeEach(async () => {
      await store.createSession({
        id: 's1',
        title: 'Test',
        systemPrompt: 'prompt',
        createdAt: now,
        updatedAt: now,
      })
      await store.createRootQuestion({
        id: 'rq1',
        sessionId: 's1',
        summary: 'Q1',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      await store.createRootQuestion({
        id: 'rq2',
        sessionId: 's1',
        summary: 'Q2',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      })
    })

    it('should create and get links by root question', async () => {
      const link = {
        id: 'ql1',
        sourceId: 'rq1',
        targetId: 'rq2',
        createdBy: 'system' as const,
        createdAt: now,
      }
      await store.createLink(link)

      // Should find from source side
      const fromSource = await store.getLinksByRootQuestion('rq1')
      expect(fromSource).toHaveLength(1)
      expect(fromSource[0]).toEqual(link)

      // Should also find from target side
      const fromTarget = await store.getLinksByRootQuestion('rq2')
      expect(fromTarget).toHaveLength(1)
      expect(fromTarget[0]).toEqual(link)
    })

    it('should delete a link', async () => {
      await store.createLink({
        id: 'ql1',
        sourceId: 'rq1',
        targetId: 'rq2',
        createdBy: 'user',
        createdAt: now,
      })
      await store.deleteLink('ql1')
      const results = await store.getLinksByRootQuestion('rq1')
      expect(results).toHaveLength(0)
    })
  })
})
