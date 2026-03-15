import { NextRequest, NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const engine = getEngine()
    const session = await engine.getSession(id)

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const rootQuestions = await engine.getRootQuestions(id)
    return NextResponse.json({ ...session, rootQuestions })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
