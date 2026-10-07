// Send at most one outstanding pulse. A suspended page must not collect an
// unbounded message queue; the main clock measures elapsed time itself.
let awaitingAck = false
self.onmessage = () => { awaitingAck = false }
setInterval(() => {
  if (awaitingAck) return
  awaitingAck = true
  self.postMessage('tick')
}, 250)
