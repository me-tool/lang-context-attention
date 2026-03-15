import { NextRequest, NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { newRootQuestionId } = await req.json()

    if (!newRootQuestionId) {
      return NextResponse.json(
        { error: 'newRootQuestionId is required' },
        { status: 400 }
      )
    }

    const engine = getEngine()
    await engine.reassignMessage(id, newRootQuestionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
