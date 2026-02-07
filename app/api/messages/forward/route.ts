import { NextRequest, NextResponse } from 'next/server'
import { forwardFromUI } from '@/lib/message-send'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messageId, originalMessage, fromSession, toSession, forwardNote } = body

    // Validate required fields
    // Either messageId (local forward) or originalMessage (remote forward) must be provided
    if ((!messageId && !originalMessage) || !fromSession || !toSession) {
      return NextResponse.json(
        { error: 'Either messageId or originalMessage, plus fromSession and toSession are required' },
        { status: 400 }
      )
    }

    // Validate that from and to sessions are different
    if (fromSession === toSession) {
      return NextResponse.json(
        { error: 'Cannot forward message to the same session' },
        { status: 400 }
      )
    }

    // Forward the message
    const result = await forwardFromUI({
      originalMessageId: messageId,
      fromAgent: fromSession,
      toAgent: toSession,
      forwardNote: forwardNote || undefined,
      providedOriginalMessage: originalMessage || undefined,
    })

    return NextResponse.json({
      success: true,
      message: 'Message forwarded successfully',
      forwardedMessage: {
        id: result.message.id,
        to: result.message.to,
        subject: result.message.subject,
      },
    })
  } catch (error) {
    console.error('Error forwarding message:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to forward message' },
      { status: 500 }
    )
  }
}
