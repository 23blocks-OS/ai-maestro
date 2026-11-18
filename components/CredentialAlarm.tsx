import { KeyRound } from 'lucide-react'
import type { CredentialCheck } from '@/types/agent'

/** The live credential check on an agent card (#65 part 2): red when the session uses another account, amber when unproven. */
export default function CredentialAlarm({ check }: { check?: CredentialCheck }) {
  if (!check || check.state === 'match') return null
  const red = check.state === 'mismatch'
  return (
    <span role="img" aria-label={red ? 'Wrong account' : 'Account not verified'} title={check.detail} data-testid="credential-alarm"
      className={`flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${red ? 'bg-red-500/90 text-white' : 'bg-amber-500/20 text-amber-300'}`}>
      <KeyRound className="w-3 h-3" />
    </span>
  )
}
