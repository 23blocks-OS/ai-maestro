/**
 * F041: the PowerShell scripts of the native Windows install (install.ps1, scripts/windows/*.ps1). They only run on
 * Windows, so these checks keep a typo from reaching a user: Windows PowerShell 5.1 reads a file without a BOM in the
 * ANSI code page (so: ASCII only), and "$name: text" in a string is a parse error there (a scope-qualified variable).
 * Where PowerShell is installed (Windows; pwsh on Linux CI images), every script also goes through its parser.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const scripts = ['install.ps1', ...fs.readdirSync(path.join(root, 'scripts', 'windows')).filter(f => f.endsWith('.ps1')).map(f => path.join('scripts', 'windows', f))]

function powershell(): string | null {
  for (const exe of process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh']) {
    try { execFileSync(exe, ['-NoProfile', '-Command', '1'], { stdio: 'ignore', timeout: 30_000 }); return exe } catch { /* not here */ }
  }
  return null
}

describe('native Windows PowerShell scripts (F041)', () => {
  it('are ASCII only, which Windows PowerShell 5.1 reads the same in every code page', () => {
    for (const f of scripts) {
      const bad = fs.readFileSync(path.join(root, f), 'utf8').split('\n').map((l, i) => [i + 1, l] as const).filter(([, l]) => /[^\x00-\x7f]/.test(l))
      expect(bad.map(([n]) => `${f}:${n}`)).toEqual([])
    }
  })

  it('never write "$name:" in a string (PowerShell reads a scope-qualified variable and refuses the file)', () => {
    for (const f of scripts) {
      const bad = fs.readFileSync(path.join(root, f), 'utf8').split('\n').map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => /\$(?!env:|script:|global:|using:)[A-Za-z_][A-Za-z0-9_]*:[^A-Za-z0-9_\\:]/.test(l))
      expect(bad.map(([n, l]) => `${f}:${n}: ${l.trim()}`)).toEqual([])
    }
  })

  const ps = powershell()
  it.skipIf(!ps)('parse without errors', () => {
    for (const f of scripts) {
      const out = execFileSync(ps!, ['-NoProfile', '-Command',
        `$e = $null; [void][Management.Automation.Language.Parser]::ParseFile('${path.join(root, f).replace(/'/g, "''")}', [ref]$null, [ref]$e); $e | ForEach-Object { $_.Message + ' @' + $_.Extent.StartLineNumber }`],
      { encoding: 'utf8', timeout: 60_000 }).trim()
      expect(out, f).toBe('')
    }
  })
})
