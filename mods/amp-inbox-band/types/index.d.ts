export type Unread = number

declare module 'claude-code' {
  interface PluginState {
    'amp-inbox-band': { unread: Unread; isHidden: boolean }
  }
}
