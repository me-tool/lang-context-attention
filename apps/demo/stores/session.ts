import { create } from 'zustand'
import type { Session, RootQuestion, Message } from '@lang-context/core'

interface LinkSuggestion {
  sourceId: string
  targetId: string
  sourceSummary: string
  targetSummary: string
}

interface SessionState {
  session: Session | null
  rootQuestions: RootQuestion[]
  messages: Message[]
  isStreaming: boolean
  linkSuggestions: LinkSuggestion[]

  createSession: (systemPrompt: string, title?: string) => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  sendMessage: (message: string) => Promise<void>
  reassignMessage: (messageId: string, newRootQuestionId: string) => Promise<void>
  linkQuestions: (sourceId: string, targetId: string) => Promise<void>
  dismissLinkSuggestion: (index: number) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  rootQuestions: [],
  messages: [],
  isStreaming: false,
  linkSuggestions: [],

  createSession: async (systemPrompt: string, title?: string) => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, title }),
    })
    if (!res.ok) throw new Error('Failed to create session')
    const session = await res.json()
    set({ session, rootQuestions: [], messages: [] })
  },

  loadSession: async (sessionId: string) => {
    const [sessionRes, questionsRes, messagesRes] = await Promise.all([
      fetch(`/api/sessions/${sessionId}`),
      fetch(`/api/sessions/${sessionId}/questions`),
      fetch(`/api/sessions/${sessionId}/messages`),
    ])

    if (!sessionRes.ok) throw new Error('Failed to load session')

    const session = await sessionRes.json()
    const rootQuestions = questionsRes.ok ? await questionsRes.json() : []
    const messages = messagesRes.ok ? await messagesRes.json() : []

    set({ session, rootQuestions, messages })
  },

  sendMessage: async (message: string) => {
    const { session } = get()
    if (!session) throw new Error('No active session')

    set({ isStreaming: true })

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, message }),
      })

      if (!res.ok) throw new Error('Failed to send message')

      const rootQuestionId = res.headers.get('X-Root-Question-Id') ?? ''
      const userMessageId = res.headers.get('X-User-Message-Id') ?? ''
      const linkSuggestionsRaw = res.headers.get('X-Link-Suggestions')

      // Add user message with server-generated ID
      const userMsg: Message = {
        id: userMessageId,
        sessionId: session.id,
        rootQuestionId,
        role: 'user',
        content: message,
        createdAt: new Date(),
      }
      set((s) => ({ messages: [...s.messages, userMsg] }))

      // Stream assistant response with temporary local ID
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let assistantContent = ''
      const tempAssistantId = '__streaming__'

      const assistantMsg: Message = {
        id: tempAssistantId,
        sessionId: session.id,
        rootQuestionId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      }
      set((s) => ({ messages: [...s.messages, assistantMsg] }))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantContent += decoder.decode(value, { stream: true })
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === tempAssistantId ? { ...m, content: assistantContent } : m
          ),
        }))
      }

      // After streaming completes, refresh messages from server to get real IDs
      const [messagesRes, questionsRes] = await Promise.all([
        fetch(`/api/sessions/${session.id}/messages`),
        fetch(`/api/sessions/${session.id}/questions`),
      ])

      if (messagesRes.ok) {
        const serverMessages = await messagesRes.json()
        set({ messages: serverMessages })
      }

      if (questionsRes.ok) {
        const rootQuestions = await questionsRes.json()
        set({ rootQuestions })
      }

      // Parse link suggestions from header
      if (linkSuggestionsRaw) {
        try {
          const suggestions = JSON.parse(linkSuggestionsRaw)
          if (Array.isArray(suggestions) && suggestions.length > 0) {
            set((s) => ({
              linkSuggestions: [...s.linkSuggestions, ...suggestions],
            }))
          }
        } catch {
          // ignore parse errors
        }
      }
    } finally {
      set({ isStreaming: false })
    }
  },

  reassignMessage: async (messageId: string, newRootQuestionId: string) => {
    const res = await fetch(`/api/messages/${messageId}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRootQuestionId }),
    })
    if (!res.ok) throw new Error('Failed to reassign message')

    // Update local state
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, rootQuestionId: newRootQuestionId } : m
      ),
    }))
  },

  linkQuestions: async (sourceId: string, targetId: string) => {
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, targetId }),
    })
    if (!res.ok) throw new Error('Failed to link questions')
  },

  dismissLinkSuggestion: (index: number) => {
    set((s) => ({
      linkSuggestions: s.linkSuggestions.filter((_, i) => i !== index),
    }))
  },
}))
