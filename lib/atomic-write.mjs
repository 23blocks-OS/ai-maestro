/**
 * Write a file so a reader sees the old content or the new one, never a torn file (B042,
 * docs/SPEC-ATOMIC-STATE-WRITES.md): temp file in the same folder, fsync, rename over the target,
 * fsync the folder. A crash leaves at most a stray `<file>.<pid>.<n>.tmp` beside the target.
 *
 * Refuses a target that is a symbolic link: the rename would replace the link with a file.
 * `opts.mode` is used for a new file; an existing file keeps its mode.
 * `opts.beforeRename()` runs after the temp file is on disk; throw from it to abort the write.
 * `opts.fs` lets tests inject a failing file system.
 */
import realFs from 'fs'
import path from 'path'

let counter = 0

export function writeFileAtomicSync(file, data, opts = {}) {
  const fs = opts.fs || realFs
  let mode = opts.mode ?? 0o644
  try {
    const st = fs.lstatSync(file)
    if (st.isSymbolicLink()) throw new Error(`refusing to write ${file}: it is a symbolic link`)
    mode = st.mode & 0o7777
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }

  const tmp = `${file}.${process.pid}.${++counter}.${Math.random().toString(36).slice(2, 8)}.tmp`
  let fd = null
  try {
    fd = fs.openSync(tmp, 'wx', mode)
    fs.fchmodSync(fd, mode) // openSync's mode is reduced by the umask
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = null
    opts.beforeRename?.()
    fs.renameSync(tmp, file)
  } catch (err) {
    if (fd !== null) try { fs.closeSync(fd) } catch { /* already failing */ }
    try { fs.unlinkSync(tmp) } catch { /* never created */ }
    throw err
  }

  // Makes the rename itself durable. Best effort: not every platform can open a folder.
  try {
    const dfd = fs.openSync(path.dirname(file), 'r')
    try { fs.fsyncSync(dfd) } finally { fs.closeSync(dfd) }
  } catch { /* Windows, or a file system without folder fsync */ }
}
