import { describe, it, expect } from 'vitest'
import { assembleContext } from '../context.js'
import type { Message } from '../types.js'

function makeMessage(id: string, role: 'user' | 'assistant', content: string, minutesAgo: number): Message {
  return {
    id,
    sessionId: 's1',
    rootQuestionId: 'q1',
    role,
    content,
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
  }
}

describe('assembleContext', () => {
  it('includes system prompt, main messages, and user message in correct order', () => {
    const mainMessages = [
      makeMessage('m1', 'user', 'Hello', 10),
      makeMessage('m2', 'assistant', 'Hi there', 9),
    ]

    const result = assembleContext({
      systemPrompt: 'You are helpful.',
      mainMessages,
      linkedMessages: [],
      userMessage: 'How are you?',
      maxContextTokens: 10000,
    })

    expect(result.messages).toHaveLength(4)
    expect(result.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' })
    expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello' })
    expect(result.messages[2]).toEqual({ role: 'assistant', content: 'Hi there' })
    expect(result.messages[3]).toEqual({ role: 'user', content: 'How are you?' })
  })

  it('places linked messages before main messages', () => {
    const mainMessages = [makeMessage('m1', 'user', 'Main topic msg', 5)]
    const linkedMessages = [
      makeMessage('l1', 'user', 'Linked topic msg', 15),
    ]
    linkedMessages[0].rootQuestionId = 'q2'

    const result = assembleContext({
      systemPrompt: 'System',
      mainMessages,
      linkedMessages,
      userMessage: 'Current',
      maxContextTokens: 10000,
    })

    expect(result.messages[1].content).toBe('Linked topic msg')
    expect(result.messages[2].content).toBe('Main topic msg')
    expect(result.messageIds).toContain('l1')
    expect(result.messageIds).toContain('m1')
  })

  it('truncates oldest linked messages first when over budget', () => {
    const mainMessages = [
      makeMessage('m1', 'user', 'A'.repeat(100), 5),
    ]
    const linkedMessages = [
      makeMessage('l1', 'user', 'B'.repeat(100), 15),
      makeMessage('l2', 'user', 'C'.repeat(100), 10),
    ]

    // Budget: system(10 chars=3 tokens) + user(10 chars=3 tokens) + main(100 chars=25 tokens) + some linked
    // Total budget = 60 tokens → fixed ~6 + main 25 = 31, leaving ~29 for linked
    // Each linked = 25 tokens, so only 1 fits
    const result = assembleContext({
      systemPrompt: 'System msg',
      mainMessages,
      linkedMessages,
      userMessage: 'Current q',
      maxContextTokens: 60,
    })

    // Should keep main message and newest linked message
    expect(result.messageIds).toContain('m1')
    expect(result.messageIds).toContain('l2') // newer linked
    expect(result.messageIds).not.toContain('l1') // older linked, truncated
  })

  it('never truncates system prompt or current user message', () => {
    const longSystemPrompt = 'X'.repeat(200)
    const longUserMessage = 'Y'.repeat(200)

    const result = assembleContext({
      systemPrompt: longSystemPrompt,
      mainMessages: [],
      linkedMessages: [],
      userMessage: longUserMessage,
      maxContextTokens: 50, // Way under budget
    })

    expect(result.messages[0].content).toBe(longSystemPrompt)
    expect(result.messages[result.messages.length - 1].content).toBe(longUserMessage)
  })

  it('returns correct token estimate', () => {
    const result = assembleContext({
      systemPrompt: 'ABCD', // 1 token
      mainMessages: [],
      linkedMessages: [],
      userMessage: 'EFGHIJKL', // 2 tokens
      maxContextTokens: 10000,
    })

    expect(result.estimatedTokens).toBe(3) // 1 + 2
  })
})
