import { KeyRound } from 'lucide-react'
import type { accountOf } from '@/lib/credential-words'

/** The account an agent is set to use, in its header (#65 part 2): red when the session uses another one */
export default function AccountChip({ account }: { account: NonNullable<ReturnType<typeof accountOf>> }) {
  return (
    <span data-testid="header-account" title={account.title}
      className={`flex items-center gap-1 truncate min-w-0 ${account.state === 'mismatch' ? 'text-red-400 font-semibold' : account.state === 'unverified' ? 'text-amber-300' : 'text-gray-400'}`}>
      <KeyRound className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{account.state === 'mismatch' ? `Wrong account: set to ${account.label}` : account.label}</span>
    </span>
  )
}
