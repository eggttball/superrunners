import { shallowReactive } from 'vue'
import { nextRelayMatch, completeRelayMatch } from './relay-rules.js'
import { createRelayRace } from './relay-physics.js'
import { createMeetClock } from './meet-clock.js'
import { setMusicMode, playCountdown, playStartWhistle } from './audio.js'

export const relayMeet = shallowReactive({ active: false, meet: null, match: null, plans: [],
  elapsed: 0, paused: false, speed: 1, phase: 'idle', error: '', startedAt: '', finishedAt: '' })
let dependencies, advancing = false, cue = 3, lastCheckpoint = 0
let progressWrites = Promise.resolve()
const clock = createMeetClock(() => { void advance() })
const now = () => performance.timeOrigin + performance.now()
const recentCue = at => !document.hidden && now() - at < 750
const maxTime = () => Math.max(0, ...relayMeet.plans.map(plan => plan.totalTime))
const clone = value => JSON.parse(JSON.stringify(value))

export function installRelayMeet(api) { dependencies = api }

function snapshot() {
  if (!relayMeet.active) return null
  return clone({ active: true, meet: relayMeet.meet, matchId: relayMeet.match?.id,
    plans: relayMeet.plans, elapsed: relayMeet.elapsed, paused: relayMeet.paused,
    speed: relayMeet.speed, phase: relayMeet.phase, startedAt: relayMeet.startedAt,
    finishedAt: relayMeet.finishedAt, pendingClock: clock.snapshotPending() })
}

function persistProgress(clear = false) {
  const progress = clear ? null : snapshot()
  const write = progressWrites.then(() => dependencies.saveProgress(progress))
  progressWrites = write.catch(() => {})
  lastCheckpoint = performance.now()
  return write
}

function checkpoint() {
  void persistProgress().catch(error => { relayMeet.error = `進度暫存失敗：${error.message}` })
}

function prepare(at) {
  const match = nextRelayMatch(relayMeet.meet)
  if (!match) return false
  Object.assign(relayMeet, { match, plans: createRelayRace(match, relayMeet.meet, dependencies.getStudent),
    elapsed: -3, phase: 'countdown', startedAt: new Date(at).toISOString(), finishedAt: '', error: '' })
  cue = 3
  if (!relayMeet.paused && recentCue(at)) playCountdown(3)
  return true
}

async function finish() {
  clock.stop()
  await persistProgress(true)
  Object.assign(relayMeet, { active: false, phase: 'complete', paused: false, error: '' })
  setMusicMode('ambient')
}

export async function startRelayMeet(meet) {
  if (relayMeet.active || !dependencies.canStart()) throw new Error('請先完成目前的自動賽程。')
  Object.assign(relayMeet, { active: true, meet, match: null, plans: [], elapsed: 0,
    paused: false, speed: 1, phase: 'preparing', error: '' })
  try {
    if (!prepare(now())) { await finish(); return }
    await persistProgress()
    relayMeet.startedAt = new Date(clock.start(relayMeet.speed)).toISOString()
    if (relayMeet.paused) clock.pause()
    setMusicMode('race')
  } catch (error) {
    clock.pause()
    Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message })
  }
}

export async function restoreRelayMeet(progress) {
  if (!progress?.active || !progress.meet || !dependencies.canStart()) return false
  const meet = !progress.meet.friendly && dependencies.getMeet(progress.meet.id) || progress.meet
  Object.assign(relayMeet, { ...progress, meet, match: null, active: true, error: '',
    speed: [1, 2, 4, 8, 16].includes(progress.speed) ? progress.speed : 1,
    paused: Boolean(progress.paused) })
  if (meet.status === 'complete') {
    try { await finish() }
    catch (error) { Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message }) }
    return true
  }
  const match = nextRelayMatch(meet)
  if (!match) {
    try { await finish() }
    catch (error) { Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message }) }
    return true
  }
  const sameMatch = match.id === progress.matchId && progress.plans?.length === match.classIds.length
  if (sameMatch) {
    relayMeet.match = match
    relayMeet.plans = progress.plans
    relayMeet.elapsed = Math.max(-3, Math.min(maxTime() + 3.2, Number(progress.elapsed) || 0))
    relayMeet.phase = relayMeet.elapsed < 0 ? 'countdown' : 'running'
    cue = Math.ceil(-relayMeet.elapsed)
  } else prepare(now())
  try {
    // Keep the old sampled time in the durable checkpoint before the new
    // clock starts; newly prepared random curves cannot run before saving.
    if (sameMatch) clock.restorePending(progress.pendingClock)
    await persistProgress()
    const pending = clock.snapshotPending()
    clock.start(relayMeet.speed)
    clock.restorePending(pending)
    if (relayMeet.paused) clock.pause()
    else setMusicMode('race')
  } catch (error) {
    clock.pause()
    Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message })
  }
  return true
}

export function pauseRelayMeet() {
  if (!relayMeet.active || relayMeet.paused) return
  clock.pause()
  relayMeet.paused = true
  checkpoint()
}

export function toggleRelayPause() {
  if (!relayMeet.active || relayMeet.phase === 'saveerror') return
  if (!relayMeet.paused) { pauseRelayMeet(); return }
  relayMeet.paused = false
  clock.resume()
  setMusicMode('race')
  checkpoint()
}

export function setRelaySpeed(speed) {
  if (!relayMeet.active || ![1, 2, 4, 8, 16].includes(speed) || relayMeet.speed === speed) return
  clock.setSpeed(speed)
  relayMeet.speed = speed
  checkpoint()
}

async function saveMatch(at = now()) {
  const match = relayMeet.match
  relayMeet.phase = 'saving'
  const finishedAt = relayMeet.finishedAt || new Date().toISOString()
  const results = relayMeet.plans.map(plan => ({ classId: plan.classId, className: plan.className,
    color: plan.color, lane: plan.lane, time: plan.totalTime, studentIds: [...plan.studentIds],
    lineup: plan.legs.map(leg => ({ ...leg.student, leg: leg.index + 1 })),
    splits: plan.legs.map(leg => ({ studentId: leg.studentId, leg: leg.index + 1,
      time: leg.endTime - leg.startTime, startDistance: leg.startDistance, endDistance: leg.endDistance })),
    exchanges: plan.exchanges }))
  try {
    relayMeet.meet = relayMeet.meet.friendly
      ? completeRelayMatch(relayMeet.meet, match.id, results, finishedAt)
      : await dependencies.saveMatch(relayMeet.meet, match, results, relayMeet.startedAt, finishedAt)
    if (!prepare(at)) { await finish(); return }
    // Store the new random plans before consuming any subsequent clock time.
    await persistProgress()
  } catch (error) {
    clock.pause()
    Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message })
  }
}

export async function retryRelaySave() {
  if (!relayMeet.active || relayMeet.phase !== 'saveerror' || advancing) return
  advancing = true
  try {
    // A failure may be the next race's checkpoint after a successful result save.
    if (relayMeet.meet.status === 'complete') await finish()
    else if (relayMeet.elapsed >= maxTime()) await saveMatch()
    else { await persistProgress(); relayMeet.phase = relayMeet.elapsed < 0 ? 'countdown' : 'running'; relayMeet.error = '' }
    if (relayMeet.active && relayMeet.phase !== 'saveerror') {
      relayMeet.paused = false
      clock.setSpeed(relayMeet.speed)
      clock.resume()
      setMusicMode('race')
      checkpoint()
    }
  } catch (error) { relayMeet.error = error.message }
  finally { advancing = false }
}

export function dismissRelayMeet() {
  if (relayMeet.active) return
  clock.stop()
  Object.assign(relayMeet, { meet: null, match: null, plans: [], phase: 'idle', error: '' })
}

async function advance() {
  if (!relayMeet.active || relayMeet.paused || advancing || !['countdown', 'running'].includes(relayMeet.phase)) return
  advancing = true
  try {
    let transitions = 0
    while (relayMeet.active && !relayMeet.paused && transitions++ < 12) {
      const end = relayMeet.phase === 'countdown' ? 0 : maxTime() + 3.2
      const tick = clock.take(Math.max(0, end - relayMeet.elapsed), { realtime: relayMeet.phase === 'countdown' })
      relayMeet.elapsed += tick.seconds
      if (relayMeet.phase === 'countdown') {
        const remaining = Math.ceil(-relayMeet.elapsed)
        if (remaining > 0 && remaining !== cue) {
          cue = remaining
          if (recentCue(tick.at || now())) playCountdown(remaining)
        }
        if (relayMeet.elapsed >= 0) {
          relayMeet.phase = 'running'
          if (recentCue(tick.at || now())) playStartWhistle()
        } else break
      } else if (relayMeet.elapsed >= end) {
        relayMeet.finishedAt = new Date(tick.at || now()).toISOString()
        await saveMatch(tick.at || now())
      } else break
      if (!tick.seconds && relayMeet.phase === 'running') break
    }
    if (relayMeet.active && performance.now() - lastCheckpoint > 5000) checkpoint()
  } catch (error) {
    clock.pause()
    Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message })
  } finally { advancing = false }
}
