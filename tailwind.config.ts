import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#1e1e1e',
          fg: '#d4d4d4',
          selection: '#264f78',
          cursor: '#aeafad',
        },
        sidebar: {
          bg: '#252526',
          hover: '#2a2d2e',
          active: '#37373d',
          border: '#3e3e42',
        },
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
