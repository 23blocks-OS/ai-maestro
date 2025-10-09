export interface WebSocketMessage {
  type: 'input' | 'output' | 'resize' | 'ping' | 'pong' | 'error'
  data?: string
  cols?: number
  rows?: number
  timestamp?: number
  error?: string
}

export interface WebSocketInputMessage extends WebSocketMessage {
  type: 'input'
  data: string
}

export interface WebSocketOutputMessage extends WebSocketMessage {
  type: 'output'
  data: string
}

export interface WebSocketResizeMessage extends WebSocketMessage {
  type: 'resize'
  cols: number
  rows: number
}

export interface WebSocketErrorMessage extends WebSocketMessage {
  type: 'error'
  error: string
}

export type WebSocketStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
