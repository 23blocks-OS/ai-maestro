import { VersionChecker } from '@/components/VersionChecker'

/** The app's footer: the version, and who made it. One copy for every page that shows the app chrome. */
export default function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 flex-shrink-0">
      <div className="flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 md:h-5">
        <p className="text-xs md:text-sm text-white leading-none">
          <VersionChecker /> • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
        </p>
        <p className="text-xs md:text-sm text-white leading-none">
          Concept by{' '}
          <a
            href="https://x.com/jkpelaez"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
          >
            Juan Peláez
          </a>{' '}
          @{' '}
          <a
            href="https://23blocks.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-red-500 hover:text-red-400 transition-colors"
          >
            23blocks
          </a>
          . Coded by Claude
        </p>
      </div>
    </footer>
  )
}
