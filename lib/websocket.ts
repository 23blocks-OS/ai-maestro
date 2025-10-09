import type { WebSocketMessage } from '@/types/websocket'

export function createInputMessage(data: string): WebSocketMessage {
  return {
    type: 'input',
    data,
    timestamp: Date.now(),
  }
}

export function createResizeMessage(cols: number, rows: number): WebSocketMessage {
  return {
    type: 'resize',
    cols,
    rows,
    timestamp: Date.now(),
  }
}

export function parseWebSocketMessage(data: string): WebSocketMessage {
  try {
    return JSON.parse(data)
  } catch (error) {
    // If not JSON, treat as raw output
    return {
      type: 'output',
      data,
      timestamp: Date.now(),
    }
  }
}

export function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined'
}
