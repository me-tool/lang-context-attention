import { NextRequest } from 'next/server'
import { getEngine, linkSuggestionQueue } from '@/lib/engine'

export async function POST(req: NextRequest) {
  try {
    const { sessionId, message } = await req.json()

    if (!sessionId || !message) {
      return new Response(
        JSON.stringify({ error: 'sessionId and message are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const engine = getEngine()

    // Clear suggestion queue before processing to capture new suggestions
    const queueLenBefore = linkSuggestionQueue.length

    const result = await engine.processMessage(sessionId, message)

    // Capture any new link suggestions
    const newSuggestions = linkSuggestionQueue.slice(queueLenBefore)

    // Create streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Root-Question-Id': result.rootQuestionId,
        'X-User-Message-Id': result.routingDecision.messageId,
        'X-Routing-Decision-Id': result.routingDecision.id,
        'X-Link-Suggestions': JSON.stringify(newSuggestions),
        'Access-Control-Expose-Headers':
          'X-Root-Question-Id, X-User-Message-Id, X-Routing-Decision-Id, X-Link-Suggestions',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
