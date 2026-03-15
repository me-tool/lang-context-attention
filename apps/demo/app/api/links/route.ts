import { NextRequest, NextResponse } from 'next/server'
import { getEngine } from '@/lib/engine'

export async function POST(req: NextRequest) {
  try {
    const { sourceId, targetId } = await req.json()

    if (!sourceId || !targetId) {
      return NextResponse.json(
        { error: 'sourceId and targetId are required' },
        { status: 400 }
      )
    }

    const engine = getEngine()
    const link = await engine.linkQuestions(sourceId, targetId)

    return NextResponse.json(link)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { linkId } = await req.json()

    if (!linkId) {
      return NextResponse.json(
        { error: 'linkId is required' },
        { status: 400 }
      )
    }

    const engine = getEngine()
    await engine.unlinkQuestions(linkId)

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
