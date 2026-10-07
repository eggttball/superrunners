// Animation frames keep the foreground smooth; a worker also wakes the meet
// while the document is hidden. Neither callback frequency defines race time.
export function createMeetClock(onTick) {
  let worker, fallback, frame, listening = false, ticking = false
  let running = false, rate = 1, sampledAt = 0
  const segments = []
  const epoch = timestamp => performance.timeOrigin + timestamp

  function sample() {
    const now = performance.now()
    if (running && now > sampledAt) {
      const tail = segments.at(-1)
      if (tail && tail.rate === rate && tail.end === sampledAt) tail.end = now
      else segments.push({ start: sampledAt, end: now, rate })
    }
    sampledAt = now
    return epoch(now)
  }

  function pulse() { sample(); onTick() }
  function paint() {
    frame = undefined
    pulse()
    if (ticking) frame = requestAnimationFrame(paint)
  }

  function startFallback() {
    worker?.terminate()
    worker = undefined
    if (ticking && !fallback) fallback = setInterval(pulse, 250)
  }

  function startWakeups() {
    if (ticking) return
    ticking = true
    frame = requestAnimationFrame(paint)
    document.addEventListener('visibilitychange', pulse)
    listening = true
    try {
      const current = new Worker(new URL('./meet-clock.worker.js', import.meta.url), { type: 'module' })
      worker = current
      current.onmessage = () => {
        if (worker !== current || !ticking) return
        current.postMessage('ack')
        pulse()
      }
      current.onerror = () => { if (worker === current) startFallback() }
    } catch { startFallback() }
  }

  function stopWakeups() {
    ticking = false
    cancelAnimationFrame(frame)
    clearInterval(fallback)
    frame = fallback = undefined
    worker?.terminate()
    worker = undefined
    if (listening) document.removeEventListener('visibilitychange', pulse)
    listening = false
  }

  function stop() {
    running = false
    stopWakeups()
    segments.length = 0
  }

  return {
    start(speed = 1) {
      stop()
      rate = speed
      sampledAt = performance.now()
      running = true
      startWakeups()
      return epoch(sampledAt)
    },
    pause() { sample(); running = false; stopWakeups() },
    resume() {
      if (running) return
      sampledAt = performance.now()
      running = true
      startWakeups()
    },
    setSpeed(speed) { sample(); rate = speed },
    stop,
    // Preserve each interval's rate and wall-clock position. Speed changes,
    // pauses and delayed callbacks can never rewrite previously elapsed time.
    take(maxSeconds) {
      let seconds = 0, at = null
      while (segments.length && seconds < maxSeconds) {
        const segment = segments[0]
        const available = (segment.end - segment.start) / 1000 * segment.rate
        const amount = Math.min(maxSeconds - seconds, available)
        seconds += amount
        if (amount === available) {
          at = epoch(segment.end)
          segments.shift()
        } else {
          segment.start += amount / segment.rate * 1000
          at = epoch(segment.start)
        }
      }
      return { seconds, at }
    },
  }
}
