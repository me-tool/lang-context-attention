import { embed } from 'ai'
import type { EmbeddingProvider } from '@llm-context/core'
import type { EmbeddingModel } from 'ai'

export class AiSdkEmbeddingProvider implements EmbeddingProvider {
  private model: EmbeddingModel<string>
  readonly dimensions: number

  constructor(options: { model: EmbeddingModel<string>; dimensions: number }) {
    this.model = options.model
    this.dimensions = options.dimensions
  }

  async embed(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: this.model,
      value: text,
    })
    return embedding
  }
}
