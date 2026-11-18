'use client'

import { ToastProvider } from '@/contexts/ToastContext'
import { installHttpsAgentCalls } from '@/lib/https-agent-calls'

// Before any panel fetches: on an HTTPS address, calls to another host's agent go through this host
installHttpsAgentCalls()

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
