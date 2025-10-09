import type { Terminal } from '@/types/terminal'

export const TERMINAL_CONFIG = {
  DEFAULT_FONT_SIZE: 14,
  DEFAULT_SCROLLBACK: 10000,
  MIN_FONT_SIZE: 8,
  MAX_FONT_SIZE: 32,
} as const

export function getTerminalDimensions(terminal: Terminal) {
  return {
    cols: terminal.cols,
    rows: terminal.rows,
  }
}

export function formatTerminalOutput(text: string): string {
  // Ensure text has proper line endings
  return text.replace(/\n/g, '\r\n')
}

export function createTerminalWelcomeMessage(sessionName: string): string {
  return `\x1b[1;32mConnected to ${sessionName}\x1b[0m\r\n\r\n`
}

export function clearTerminalScreen(terminal: Terminal): void {
  terminal.clear()
  terminal.reset()
}
