'use client'

import { MonitorSmartphone } from 'lucide-react'
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
