export type Waiting = string | null

declare module 'claude-code' {
  interface PluginState {
    'ai-maestro-sql-approval': { waiting: Waiting }
  }
}
