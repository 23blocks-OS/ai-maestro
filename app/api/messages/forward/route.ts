import { NextRequest, NextResponse } from 'next/server'
import { forwardMessage } from '@/lib/messageQueue'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messageId, fromSession, toSession, forwardNote } = body

    // Validate required fields
    if (!messageId || !fromSession || !toSession) {
      return NextResponse.json(
        { error: 'messageId, fromSession, and toSession are required' },
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
    const forwardedMessage = await forwardMessage(
      messageId,
      fromSession,
      toSession,
      forwardNote || undefined
    )

    return NextResponse.json({
      success: true,
      message: 'Message forwarded successfully',
      forwardedMessage: {
        id: forwardedMessage.id,
        to: forwardedMessage.to,
        subject: forwardedMessage.subject,
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
