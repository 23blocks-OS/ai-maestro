import { describe, it, expect } from 'vitest'
import { paneShell, paneShellArgv, quote, setEnv, unsetEnv, envPrefix, sequence, agentEnvLine, commandWords } from '@/lib/pane-shell'

describe('pane shell (F041)', () => {
  it('is PowerShell on Windows and POSIX elsewhere', () => {
    expect(paneShell('win32')).toBe('powershell')
    expect(paneShell('darwin')).toBe('posix')
    expect(paneShell('linux')).toBe('posix')
    expect(paneShellArgv('win32')).toEqual(['powershell.exe', '-NoLogo', '-ExecutionPolicy', 'RemoteSigned'])
    expect(paneShellArgv('linux')).toEqual([])
  })

  it('quotes a value as one literal word in each shell', () => {
    expect(quote('posix', "it's $HOME")).toBe("'it'\\''s $HOME'")
    expect(quote('powershell', "it's $HOME")).toBe("'it''s $HOME'")
    expect(quote('powershell', 'C:\\Users\\Bob')).toBe("'C:\\Users\\Bob'")
  })

  it('writes the agent environment line for each shell', () => {
    const vars = { AMP_DIR: '/h/.agent-messaging/agents/x', AIM_AGENT_NAME: 'lola', AIM_AGENT_ID: 'id-1' }
    // POSIX: byte-for-byte the line the services typed before
    expect(agentEnvLine('posix', vars)).toBe("export AMP_DIR='/h/.agent-messaging/agents/x' AIM_AGENT_NAME='lola' AIM_AGENT_ID='id-1'; unset CLAUDECODE")
    // Windows: AMP_DIR with forward slashes, which the AMP scripts (Git Bash) and Windows programs both read
    expect(agentEnvLine('powershell', { ...vars, AMP_DIR: 'C:\\Users\\Bob\\.agent-messaging' })).toBe(
      "$env:AMP_DIR='C:/Users/Bob/.agent-messaging'; $env:AIM_AGENT_NAME='lola'; $env:AIM_AGENT_ID='id-1'; Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue")
    expect(agentEnvLine('posix', { AIM_AGENT_NAME: 'lola' })).toBe("export AIM_AGENT_NAME='lola'; unset CLAUDECODE")
  })

  it('prefixes a command with variables', () => {
    expect(envPrefix('posix', { A: '1', B: 'x y' })).toBe("A='1' B='x y' ")
    expect(envPrefix('powershell', { A: '1' })).toBe("$env:A='1'; ")
    expect(envPrefix('posix', {})).toBe('')
  })

  it('refuses a variable name a shell would read as code', () => {
    expect(() => setEnv('posix', { 'A;rm -rf': 'x' })).toThrow(/Invalid environment variable name/)
    expect(() => unsetEnv('powershell', '$(x)')).toThrow(/Invalid environment variable name/)
  })

  it('quotes a command line for PowerShell, and leaves POSIX alone', () => {
    const line = "pi --tools read,grep,amp_send --exclude-tools 'mcp__*' --add-dir ~/x --model claude[1m] --name @lola"
    expect(commandWords('posix', line)).toBe(line)
    // A comma would make an array (two arguments), @ a splat, [ ] a wildcard; ~ is not expanded for a program
    expect(commandWords('powershell', line)).toBe("pi --tools 'read,grep,amp_send' --exclude-tools 'mcp__*' --add-dir \"$HOME/x\" --model 'claude[1m]' --name '@lola'")
    expect(commandWords('powershell', 'claude --permission-mode bypassPermissions')).toBe('claude --permission-mode bypassPermissions')
    expect(commandWords('powershell', 'C:\\Tools\\claude.exe --chrome')).toBe('C:\\Tools\\claude.exe --chrome')
    // A program name that needs quotes is called with the call operator
    expect(commandWords('powershell', 'my,tool --x')).toBe("& 'my,tool' --x")
  })

  it('sequences commands and drops empty parts', () => {
    expect(sequence('posix', ['a', '', 'b;'])).toBe('a; b')
    expect(unsetEnv('posix', 'X')).toBe('unset X')
  })
})
