import type { Metadata, Viewport } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import Providers from '@/components/Providers'
import './globals.css'

// Archivo: a signage grotesque with a real width axis, so one family covers UI
// text and condensed labels without loading a second face.
const sans = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-sans',
  display: 'swap',
})

// Mono is for code, terminal output, ids and quantities — not decoration.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

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
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} font-sans`}><Providers>{children}</Providers></body>
    </html>
  )
}
