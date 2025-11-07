import { NextRequest, NextResponse } from 'next/server'
import { forwardMessage } from '@/lib/messageQueue'

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
    // If originalMessage is provided (remote forward), use it directly
    // Otherwise use messageId (local forward)
    const forwardedMessage = await forwardMessage(
      messageId,
      fromSession,
      toSession,
      forwardNote || undefined,
      originalMessage || undefined
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
