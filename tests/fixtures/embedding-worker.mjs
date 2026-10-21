let busy = false
let count = 0
process.on('disconnect', () => process.exit(0))
process.on('message', ({ id, texts }) => {
  if (texts[0] === 'CRASH') return process.exit(2)
  if (texts[0] === 'HANG') { setInterval(() => {}, 1000); return }
  if (texts[0] === 'SLOWSTART') {
    return setTimeout(() => process.send({ id, vectors: [Object.assign(new Float32Array(384), { 0: 1, 1: process.pid })] }), 400)
  }
  if (busy) return process.send({ id, error: 'Concurrent inference', retire: true })
  busy = true
  setTimeout(() => {
    count++
    if (texts[0] === 'FAIL') process.send({ id, error: 'Inference failed', retire: true })
    else process.send({ id, vectors: texts.map(text => {
      const row = new Float32Array(384)
      row[0] = text.length
      row[1] = process.pid
      return row
    }), retire: count >= Number(process.env.TEST_MAX_BATCHES || 100) })
    busy = false
  }, 10)
})
