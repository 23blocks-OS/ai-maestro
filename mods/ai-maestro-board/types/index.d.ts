export type BoardSummary = { open: number; waitingOnMe: number } | null

declare module 'claude-code' {
  interface PluginState {
    'ai-maestro-board': { summary: BoardSummary }
  }
}
