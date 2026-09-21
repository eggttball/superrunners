let context, musicGain, effectsGain, timer, step = 0, mode = 'ambient'

const tracks = {
  ambient: {
    interval: 360,
    wave: 'triangle',
    patterns: [
      [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66],
      [293.66, 349.23, 440, 587.33, 523.25, 440, 392, 329.63],
    ],
  },
  race: {
    interval: 220,
    wave: 'square',
    patterns: [
      [329.63, 392, 440, 493.88, 440, 523.25, 493.88, 392],
      [349.23, 440, 523.25, 587.33, 523.25, 659.25, 587.33, 440],
      [293.66, 369.99, 440, 554.37, 493.88, 440, 369.99, 329.63],
    ],
  },
}

function ensureContext() {
  if (context) return true
  const Audio = window.AudioContext || window.webkitAudioContext
  if (!Audio) return false
  context = new Audio()
  musicGain = context.createGain()
  effectsGain = context.createGain()
  musicGain.gain.value = 0.055
  effectsGain.gain.value = 0.16
  musicGain.connect(context.destination)
  effectsGain.connect(context.destination)
  return true
}

function tone(frequency, start, duration, gain, type = 'triangle', output = musicGain, endFrequency = frequency) {
  if (!context || context.state !== 'running') return
  const oscillator = context.createOscillator()
  const envelope = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.025, duration / 4))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope).connect(output)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

function playMusicStep() {
  if (!context || context.state !== 'running') return
  const track = tracks[mode]
  const pattern = track.patterns[Math.floor(step / 16) % track.patterns.length]
  const frequency = pattern[step % pattern.length]
  const now = context.currentTime

  if (mode === 'race') {
    tone(frequency, now, 0.16, 0.17, track.wave)
    if (step % 2 === 0) tone(frequency / 2, now, 0.20, 0.10, 'sawtooth')
    if (step % 4 === 0) tone(frequency * 2, now, 0.09, 0.08, 'triangle')
  } else {
    tone(frequency, now, 0.30, 0.28, track.wave)
    if (step % 8 === 0) tone(frequency / 2, now, 0.42, 0.07, 'sine')
  }
  step += 1
}

function restartMusicLoop() {
  clearInterval(timer)
  step = 0
  if (!context) return
  playMusicStep()
  timer = setInterval(playMusicStep, tracks[mode].interval)
}

export async function setMusic(muted) {
  if (muted) {
    if (context) await context.suspend()
    return
  }
  if (!ensureContext()) return
  await context.resume()
  if (!timer) restartMusicLoop()
}

export function setMusicMode(nextMode) {
  const next = nextMode === 'race' ? 'race' : 'ambient'
  if (mode === next) return
  mode = next
  if (context) restartMusicLoop()
}

export function playCountdown(number) {
  if (!context || context.state !== 'running') return
  const now = context.currentTime
  const frequencies = { 3: 520, 2: 620, 1: 760 }
  tone(frequencies[number] || 620, now, 0.16, 0.46, 'square', effectsGain)
}

export function playStartWhistle() {
  if (!context || context.state !== 'running') return
  const now = context.currentTime
  tone(1180, now, 0.42, 0.58, 'sine', effectsGain, 1760)
  tone(1480, now + 0.04, 0.34, 0.22, 'triangle', effectsGain, 2050)
}

export function stopMusic() {
  clearInterval(timer)
  timer = undefined
  context?.close()
  context = undefined
  musicGain = undefined
  effectsGain = undefined
}
