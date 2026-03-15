import { NextRequest, NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'

export async function POST(req: NextRequest) {
  try {
    const { systemPrompt, title } = await req.json()

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return NextResponse.json(
        { error: 'systemPrompt is required' },
        { status: 400 }
      )
    }

    const engine = getEngine()
    const session = await engine.createSession(systemPrompt, title)
    return NextResponse.json(session)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  // The engine doesn't have a listSessions method,
  // so for now return an empty list. In production,
  // you'd query the store directly or add this to the engine.
  return NextResponse.json([])
}
