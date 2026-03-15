import { NextRequest, NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const engine = getEngine()
    const decision = await engine.getRoutingDecision(id)

    if (!decision) {
      return NextResponse.json(
        { error: 'Routing decision not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(decision)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
