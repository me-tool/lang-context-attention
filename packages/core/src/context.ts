import type { ChatMessage, Message, ContextAssemblyResult } from './types.js'

export interface ContextInput {
  systemPrompt: string
  mainMessages: Message[]
  linkedMessages: Message[]
  userMessage: string
  maxContextTokens: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

export function assembleContext(input: ContextInput): ContextAssemblyResult {
  const { systemPrompt, mainMessages, linkedMessages, userMessage, maxContextTokens } = input

  // System prompt and current user message are never truncated
  const systemMsg: ChatMessage = { role: 'system', content: systemPrompt }
  const currentMsg: ChatMessage = { role: 'user', content: userMessage }

  const fixedTokens = estimateTokens(systemPrompt) + estimateTokens(userMessage)
  let remainingBudget = maxContextTokens - fixedTokens

  const includedMessageIds: string[] = []

  // First: include main topic messages (newest first for truncation)
  const mainChatMessages: ChatMessage[] = []
  const sortedMain = [...mainMessages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  // Calculate total main tokens
  let mainTokens = 0
  for (const msg of sortedMain) {
    mainTokens += estimateTokens(msg.content)
  }

  // Calculate total linked tokens
  let linkedTokens = 0
  const sortedLinked = [...linkedMessages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const msg of sortedLinked) {
    linkedTokens += estimateTokens(msg.content)
  }

  // If everything fits, include all
  if (mainTokens + linkedTokens <= remainingBudget) {
    for (const msg of sortedLinked) {
      includedMessageIds.push(msg.id)
    }
    for (const msg of sortedMain) {
      includedMessageIds.push(msg.id)
    }

    const allMessages: ChatMessage[] = [
      systemMsg,
      ...messagesToChatMessages(sortedLinked),
      ...messagesToChatMessages(sortedMain),
      currentMsg,
    ]

    return {
      messages: allMessages,
      messageIds: includedMessageIds,
      estimatedTokens: fixedTokens + mainTokens + linkedTokens,
    }
  }

  // Truncation: first remove oldest linked messages
  const includedLinked: Message[] = []
  let linkedBudget = remainingBudget - mainTokens // Try to keep all main messages

  if (linkedBudget > 0) {
    // Include linked messages from newest to oldest
    for (let i = sortedLinked.length - 1; i >= 0; i--) {
      const tokens = estimateTokens(sortedLinked[i].content)
      if (tokens <= linkedBudget) {
        includedLinked.unshift(sortedLinked[i])
        linkedBudget -= tokens
      }
      // Skip messages that don't fit, try older (possibly shorter) ones
    }
  }

  const actualLinkedTokens = includedLinked.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  remainingBudget -= actualLinkedTokens

  // If main messages still exceed budget, truncate oldest main messages
  const includedMain: Message[] = []
  let mainBudget = remainingBudget

  for (let i = sortedMain.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(sortedMain[i].content)
    if (tokens <= mainBudget) {
      includedMain.unshift(sortedMain[i])
      mainBudget -= tokens
    }
    // Skip messages that don't fit, try older (possibly shorter) ones
  }

  for (const msg of includedLinked) {
    includedMessageIds.push(msg.id)
  }
  for (const msg of includedMain) {
    includedMessageIds.push(msg.id)
  }

  const totalTokens = fixedTokens + actualLinkedTokens + includedMain.reduce((sum, m) => sum + estimateTokens(m.content), 0)

  return {
    messages: [
      systemMsg,
      ...messagesToChatMessages(includedLinked),
      ...messagesToChatMessages(includedMain),
      currentMsg,
    ],
    messageIds: includedMessageIds,
    estimatedTokens: totalTokens,
  }
}
