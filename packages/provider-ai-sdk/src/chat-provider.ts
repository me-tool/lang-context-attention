import { generateText, streamText } from 'ai'
import type { ChatProvider, ChatMessage } from '@llm-context/core'
import type { LanguageModel } from 'ai'

export class AiSdkChatProvider implements ChatProvider {
  constructor(private model: LanguageModel) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const { text } = await generateText({
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })
    return text
  }

  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    const result = streamText({
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })
    for await (const chunk of result.textStream) {
      yield chunk
    }
  }
}
