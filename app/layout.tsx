import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Maestro',
  description: 'Orchestrate multiple AI coding agents from one beautiful dashboard',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/logo-constellation.svg',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  openGraph: {
    type: 'website',
    title: 'AI Maestro - Orchestrate Your AI Coding Agents',
    description: 'Stop juggling terminal windows. Orchestrate multiple AI coding agents (Claude Code, Aider, Cursor, Copilot) from one beautiful web dashboard.',
    url: 'https://github.com/23blocks-OS/ai-maestro',
    siteName: 'AI Maestro',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Maestro - Orchestrate your AI coding agents',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Maestro - Orchestrate Your AI Coding Agents',
    description: 'Stop juggling terminal windows. Orchestrate multiple AI coding agents from one beautiful dashboard.',
    images: ['/og-image.png'],
    creator: '@jkpelaez',
  },
  authors: [
    {
      name: 'Juan Peláez',
      url: 'https://x.com/jkpelaez',
    },
  ],
  keywords: [
    'AI coding agents',
    'Claude Code',
    'Aider',
    'Cursor',
    'GitHub Copilot',
    'tmux dashboard',
    'developer tools',
    'AI pair programming',
    'terminal multiplexer',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>{children}</body>
    </html>
  )
}
