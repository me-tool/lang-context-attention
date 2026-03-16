import { generateObject } from 'ai'
import { z } from 'zod'
import type { JudgeProvider, JudgeContext, JudgeResult } from '@llm-context/core'
import type { LanguageModel } from 'ai'

const DEFAULT_JUDGE_TEMPLATE = `You are a conversation topic classifier. Given a user's new message and a list of
existing conversation topics, determine which topic this message belongs to,
or if it's a new topic entirely.

## Existing Topics
{{topics}}

## New Message
{{userMessage}}

Classify this message.`

const judgeResultSchema = z.object({
  targetId: z.string().nullable(),
  isNew: z.boolean(),
  reasoning: z.string(),
  suggestedLinks: z.array(z.string()),
})

export class AiSdkJudgeProvider implements JudgeProvider {
  private model: LanguageModel
  private promptTemplate: string

  constructor(options: { model: LanguageModel; promptTemplate?: string }) {
    this.model = options.model
    this.promptTemplate = options.promptTemplate ?? DEFAULT_JUDGE_TEMPLATE
  }

  async judge(context: JudgeContext): Promise<JudgeResult> {
    const topicsText = context.candidates
      .map(c => `- [${c.id}] ${c.summary} (relevance: ${c.fusedScore.toFixed(4)})`)
      .join('\n')

    const prompt = this.promptTemplate
      .replace('{{topics}}', topicsText)
      .replace('{{userMessage}}', context.userMessage)

    const { object } = await generateObject({
      model: this.model,
      schema: judgeResultSchema,
      prompt,
    })

    return object
  }
}
