'use client'

import { MonitorSmartphone, ArrowLeftRight } from 'lucide-react'
import { messageTime } from '@/lib/chat-utils'

/**
 * Words someone said or typed at one of the agent's devices (F098). A device cannot know who spoke, so this is never
 * drawn as the person's own message: its own colour, the device's name, and "someone".
 */
export default function DeviceMessage({ device, source, text, timestamp }: { device?: string; source?: string | null; text: string; timestamp?: string }) {
  const how = source === 'typed' ? 'someone typed' : source === 'said' ? 'someone said' : 'someone'
  return (
    <div className="flex justify-end mx-3 my-1.5" data-testid="device-message">
      <div className="max-w-[85%] min-w-0">
        <div className="flex items-center justify-end gap-1.5 mb-0.5 mr-1 text-[11px] text-teal-300/90">
          <MonitorSmartphone className="w-3.5 h-3.5" aria-hidden="true" />
          <span>At {device || 'a device'} · {how}</span>
        </div>
        <div className="px-3 py-2 rounded-2xl rounded-br-sm bg-teal-900/60 border border-teal-700/60 text-teal-50 text-sm select-text">
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
        {timestamp && <div className="text-right mt-0.5 mr-1 text-[10px] text-gray-500">{messageTime(timestamp)}</div>}
      </div>
    </div>
  )
}

/**
 * A turn of the agent's speaking side (F100): what someone said at a device, what the speaking side answered, and the
 * work it handed to the agent's main session and back. Shown so the conversation has no holes.
 */
export function SpeakingMessage({ kind, device, source, text, timestamp }: { kind?: string; device?: string | null; source?: string | null; text: string; timestamp?: string }) {
  if (kind === 'heard') return <DeviceMessage device={device || undefined} source={source} text={text} timestamp={timestamp} />
  if (kind === 'said') {
    return (
      <div className="flex justify-start mx-3 my-1.5" data-testid="speaking-said">
        <div className="max-w-[85%] min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 ml-1 text-[11px] text-teal-300/90">
            <MonitorSmartphone className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Said at {device || 'a device'} · speaking side</span>
          </div>
          <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-gray-800 border border-teal-800/60 text-gray-100 text-sm select-text">
            <p className="whitespace-pre-wrap break-words">{text}</p>
          </div>
          {timestamp && <div className="mt-0.5 ml-1 text-[10px] text-gray-500">{messageTime(timestamp)}</div>}
        </div>
      </div>
    )
  }
  const label = kind === 'handoff' ? 'Handed to the main session' : 'Back from the main session'
  return (
    <div className="flex justify-center mx-3 my-1" data-testid={`speaking-${kind}`}>
      <details className="max-w-[85%] text-[11px] text-gray-500">
        <summary className="cursor-pointer list-none flex items-center gap-1.5">
          <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
          <span>{label}{device ? ` · ${device}` : ''}</span>
          {timestamp && <span className="opacity-70">{messageTime(timestamp)}</span>}
        </summary>
        <p className="mt-1 whitespace-pre-wrap break-words text-gray-400">{text}</p>
      </details>
    </div>
  )
}
