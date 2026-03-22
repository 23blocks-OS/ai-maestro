/* Force-dynamic prevents Next.js from caching this page as static HTML.
   Safari on iPadOS aggressively caches pages — this ensures fresh code is served. */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AgentCreationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
