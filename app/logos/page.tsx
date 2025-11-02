'use client'

import Image from 'next/image'

export default function LogoPreview() {
  const logos = [
    {
      name: 'Concept 1: Conductor\'s Baton',
      file: 'concept1-baton.svg',
      description: 'A conductor\'s baton with neural network nodes - symbolizing orchestration and AI coordination'
    },
    {
      name: 'Concept 2: Terminal Constellation',
      file: 'concept2-terminal.svg',
      description: 'Terminal window with connected agent nodes - developer-focused and tech-forward'
    },
    {
      name: 'Concept 3: Orchestration Hub',
      file: 'concept3-hub.svg',
      description: 'Central hub with orbiting agents - emphasizes the conductor/agent relationship'
    },
    {
      name: 'Concept 4: Network "M"',
      file: 'concept4-m-network.svg',
      description: 'Letter "M" formed by connected nodes - combines branding with the network concept'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">AI Maestro Logo Concepts</h1>
        <p className="text-gray-400 mb-8">Choose your favorite design direction</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {logos.map((logo) => (
            <div key={logo.file} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="bg-gray-950 rounded-lg p-8 mb-4 flex items-center justify-center h-64 relative">
                <Image
                  src={`/logos/${logo.file}`}
                  alt={logo.name}
                  fill
                  className="object-contain"
                />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{logo.name}</h3>
              <p className="text-gray-400 text-sm">{logo.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-4">Branding Notes</h2>
          <ul className="text-gray-300 space-y-2">
            <li>• <strong>Color Palette:</strong> Blue (#3b82f6) + Purple (#8b5cf6) gradients - modern, tech, AI-forward</li>
            <li>• <strong>Style:</strong> Clean, geometric, minimalist - works at all sizes</li>
            <li>• <strong>Theme:</strong> Orchestration, coordination, neural networks, AI agents</li>
            <li>• <strong>Usage:</strong> SVG format - scales perfectly for favicon, header, GitHub, etc.</li>
          </ul>
        </div>

        <div className="mt-8 text-center">
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
