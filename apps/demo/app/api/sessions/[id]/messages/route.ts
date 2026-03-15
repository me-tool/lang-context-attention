import { NextRequest, NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const engine = getEngine()
    const messages = await engine.getTimeline(id)
    return NextResponse.json(messages)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
