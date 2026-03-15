import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

import { generateObject } from 'ai'
import { AiSdkJudgeProvider } from '../judge-provider.js'

const mockedGenerateObject = vi.mocked(generateObject)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AiSdkJudgeProvider', () => {
  const fakeModel = {} as any

  it('should render prompt template with topics and user message', async () => {
    const mockResult = {
      targetId: 'q-1',
      isNew: false,
      reasoning: 'Matches existing topic',
      suggestedLinks: [],
    }
    mockedGenerateObject.mockResolvedValueOnce({ object: mockResult } as any)

    const provider = new AiSdkJudgeProvider({ model: fakeModel })

    await provider.judge({
      userMessage: 'How do I configure ESLint?',
      candidates: [
        { id: 'q-1', summary: 'ESLint configuration', fusedScore: 0.85 },
        { id: 'q-2', summary: 'TypeScript setup', fusedScore: 0.42 },
      ],
    })

    expect(mockedGenerateObject).toHaveBeenCalledOnce()
    const call = mockedGenerateObject.mock.calls[0][0] as any
    expect(call.prompt).toContain('[q-1] ESLint configuration (relevance: 0.8500)')
    expect(call.prompt).toContain('[q-2] TypeScript setup (relevance: 0.4200)')
    expect(call.prompt).toContain('How do I configure ESLint?')
  })

  it('should return JudgeResult from generateObject', async () => {
    const mockResult = {
      targetId: null,
      isNew: true,
      reasoning: 'New topic detected',
      suggestedLinks: ['q-1'],
    }
    mockedGenerateObject.mockResolvedValueOnce({ object: mockResult } as any)

    const provider = new AiSdkJudgeProvider({ model: fakeModel })

    const result = await provider.judge({
      userMessage: 'What is quantum computing?',
      candidates: [],
    })

    expect(result).toEqual(mockResult)
  })

  it('should use custom prompt template when provided', async () => {
    const customTemplate = 'Topics: {{topics}} | Message: {{userMessage}}'
    const mockResult = {
      targetId: 'q-1',
      isNew: false,
      reasoning: 'match',
      suggestedLinks: [],
    }
    mockedGenerateObject.mockResolvedValueOnce({ object: mockResult } as any)

    const provider = new AiSdkJudgeProvider({
      model: fakeModel,
      promptTemplate: customTemplate,
    })

    await provider.judge({
      userMessage: 'hello',
      candidates: [{ id: 'q-1', summary: 'greetings', fusedScore: 0.5 }],
    })

    const call = mockedGenerateObject.mock.calls[0][0] as any
    expect(call.prompt).toBe(
      'Topics: - [q-1] greetings (relevance: 0.5000) | Message: hello',
    )
  })
})
