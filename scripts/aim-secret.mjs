#!/usr/bin/env node
// aim-secret: store credentials locally and let agents use them without seeing them (F033).
import {
  VaultError, backendKind, deleteSecret, execWithSecrets, hasSecret, listSecretNames, setSecret,
} from '../lib/secret-vault.mjs'

const USAGE = `aim-secret - local secret vault. Agents use secrets; they never read them.

  aim-secret set NAME            store a secret (typed at a hidden prompt, or piped with --stdin)
  aim-secret list [--json]       names only
  aim-secret has NAME            exit 0 if set, 1 if not
  aim-secret delete NAME
  aim-secret status              which store is in use
  aim-secret exec --use NAME [--use ENV=NAME ...] -- COMMAND [ARGS...]
                                 run COMMAND with the secret in its environment; its output is
                                 scrubbed before you see it

Never pass a secret as an argument: it would show up in process listings and shell history.`

function die(msg, code = 1) {
  process.stderr.write(`aim-secret: ${msg}\n`)
  process.exit(code)
}

async function readStdinAll() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
}

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stderr.write(label)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stderr.write('\n')
          return resolve(value)
        }
        if (c === '\u0003') {
          stdin.setRawMode(false)
          process.stderr.write('\n')
          return reject(new VaultError('cancelled', 130))
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

async function main(argv) {
  const [cmd, ...rest] = argv
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') return console.log(USAGE)

  if (cmd === 'set') {
    const flags = rest.filter((a) => a.startsWith('--'))
    const pos = rest.filter((a) => !a.startsWith('--'))
    if (pos.length > 1) die('a secret value must not be given as an argument. Use the hidden prompt, or pipe it in with --stdin.', 2)
    if (!pos[0]) die('usage: aim-secret set NAME [--stdin]', 2)
    const useStdin = flags.includes('--stdin') || !process.stdin.isTTY
    const value = useStdin ? await readStdinAll() : await promptHidden(`Value for ${pos[0]} (hidden): `)
    await setSecret(pos[0], value)
    return console.log(`stored ${pos[0]}`)
  }
  if (cmd === 'list') {
    const names = listSecretNames()
    return console.log(rest.includes('--json') ? JSON.stringify(names) : names.join('\n'))
  }
  if (cmd === 'has') {
    if (!rest[0]) die('usage: aim-secret has NAME', 2)
    return process.exit((await hasSecret(rest[0])) ? 0 : 1)
  }
  if (cmd === 'delete') {
    if (!rest[0]) die('usage: aim-secret delete NAME', 2)
    await deleteSecret(rest[0])
    return console.log(`deleted ${rest[0]}`)
  }
  if (cmd === 'status') return console.log(`backend: ${backendKind()}`)

  if (cmd === 'exec') {
    const sep = rest.indexOf('--')
    if (sep === -1 || sep === rest.length - 1) die('usage: aim-secret exec --use NAME -- COMMAND [ARGS...]', 2)
    const opts = rest.slice(0, sep)
    const uses = []
    for (let i = 0; i < opts.length; i++) {
      if (opts[i] === '--use' && opts[i + 1]) uses.push(opts[++i])
      else die(`unexpected option "${opts[i]}"`, 2)
    }
    if (!uses.length) die('exec needs at least one --use NAME', 2)
    const [command, ...args] = rest.slice(sep + 1)
    return process.exit(await execWithSecrets({ uses, command, args }))
  }
  die(`unknown command "${cmd}". Run aim-secret --help`, 2)
}

main(process.argv.slice(2)).catch((e) => die(e.message, e instanceof VaultError ? e.code : 1))
