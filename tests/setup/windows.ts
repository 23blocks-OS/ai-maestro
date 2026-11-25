/**
 * Native Windows test runs (F041). Nothing here runs on macOS or Linux.
 *
 * - os.homedir() reads USERPROFILE on Windows, not HOME. The tests point HOME at a temporary folder to keep the
 *   real ~/.aimaestro out of reach; without this they would read and write the real profile on Windows.
 * - `bash` on a Windows PATH is usually C:\\Windows\\System32\\bash.exe, which starts WSL. Tests that run a
 *   script with bash get Git for Windows' bash, the one AI Maestro itself uses there (lib/git-bash.mjs).
 */
import os from 'os'
import path from 'path'
import { syncBuiltinESMExports } from 'module'
import { gitBashPath } from '../../lib/git-bash.mjs'

if (process.platform === 'win32') {
  const realHomedir = os.homedir.bind(os)
  os.homedir = () => process.env.HOME || realHomedir()
  syncBuiltinESMExports()

  const bash = gitBashPath()
  const key = Object.keys(process.env).find(k => k.toLowerCase() === 'path') || 'Path'
  if (bash) process.env[key] = `${path.dirname(bash)};${process.env[key] || ''}`
}
