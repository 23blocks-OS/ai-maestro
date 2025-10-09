import type { Terminal as XTermTerminal } from '@xterm/xterm'

export interface TerminalDimensions {
  cols: number
  rows: number
}

export interface TerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: TerminalTheme
  scrollback?: number
}

export interface TerminalTheme {
  background?: string
  foreground?: string
  cursor?: string
  selection?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
}

export type Terminal = XTermTerminal
