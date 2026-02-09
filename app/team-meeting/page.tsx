'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import MeetingLobby from '@/components/team-meeting/MeetingLobby'
import MeetingRoom from '@/components/team-meeting/MeetingRoom'
import ErrorBoundary from '@/components/ErrorBoundary'

function TeamMeetingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const meetingId = searchParams.get('meeting')

  if (meetingId) {
    return <MeetingRoom meetingId={meetingId} />
  }

  return (
    <MeetingLobby
      onNewMeeting={() => router.push('/team-meeting?meeting=new')}
    />
  )
}

export default function TeamMeetingPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
        </div>
      }
    >
      <ErrorBoundary fallbackLabel="Team Meeting">
        <TeamMeetingContent />
      </ErrorBoundary>
    </Suspense>
  )
}
