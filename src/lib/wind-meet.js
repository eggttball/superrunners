import { shallowReactive } from 'vue'
import { nextWindMatch } from './wind-selection.js'
import { createMeetClock } from './meet-clock.js'
import { createSprintProfile } from './physics.js'
import { setMusicMode, playCountdown, playStartWhistle } from './audio.js'

export const windMeet = shallowReactive({ active: false, meet: null, match: null, athletes: [], friendly: false, friendshipResults: [],
  phase: 'idle', elapsed: 0, paused: false, speed: 1, error: '', startedAt: '', finishedAt: '' })
let dependencies, advancing = false, endedAt = 0, cue = 3
const clock = createMeetClock(() => { void advance() })
export function installWindMeet(api) { dependencies = api }
const recentCue = at => !document.hidden && performance.timeOrigin + performance.now() - at < 750
const maxTime = () => Math.max(0, ...windMeet.athletes.map(athlete => athlete.profile.time))
const runoutEnd = () => Math.max(0, ...windMeet.athletes.map(athlete => athlete.profile.time + athlete.profile.runoutDuration))

function prepare(at) {
  const match = nextWindMatch(windMeet.meet)
  if (!match) return false
  Object.assign(windMeet, { match, athletes: match.studentIds.map(id => {
    const student = dependencies.getStudent(id)
    return { student: { ...student }, profile: createSprintProfile(student) }
  }), friendly: false, elapsed: -3, phase: 'countdown', startedAt: new Date(at).toISOString(), finishedAt: '', error: '' })
  cue = 3
  if (!windMeet.paused && recentCue(at)) playCountdown(3)
  return true
}

function prepareFriendship(at) {
  const champions = windMeet.meet.grades.map(group => group.champion).filter(Boolean)
  if (champions.length !== 3) return false
  const students = champions.map(champion => dependencies.getStudent(champion.studentId)).filter(Boolean)
  if (students.length !== 3) return false
  const classIds = [...new Set(students.map(student => student.classId))]
  Object.assign(windMeet, {
    match: { id: `${windMeet.meet.id}-friendship`, grade: 0, round: 0, number: 1,
      classIds, classNames: classIds.map(id => champions.find(champion => champion.classId === id)?.className || ''),
      studentIds: students.map(student => student.id) },
    athletes: students.map(student => ({ student: { ...student }, profile: createSprintProfile(student) })),
    friendly: true, friendshipResults: [], elapsed: -3, phase: 'countdown',
    startedAt: new Date(at).toISOString(), finishedAt: '', error: '',
  })
  cue = 3
  if (!windMeet.paused && recentCue(at)) playCountdown(3)
  return true
}

function finishFriendship() {
  const classNames = new Map(windMeet.meet.grades.filter(group => group.champion)
    .map(group => [group.champion.classId, group.champion.className]))
  windMeet.friendshipResults = windMeet.athletes.map((athlete, lane) => ({
    studentId: athlete.student.id, name: athlete.student.name, classId: athlete.student.classId,
    className: classNames.get(athlete.student.classId) || '',
    time: athlete.profile.time, lane,
  })).sort((a, b) => a.time - b.time || a.lane - b.lane).map((result, index) => ({ ...result, place: index + 1 }))
  Object.assign(windMeet, { active: false, phase: 'complete', paused: false })
  clock.stop()
  setMusicMode('ambient')
}

export function startWindMeet(meet, speed = 1) {
  endedAt = 0
  Object.assign(windMeet, { active: true, meet, speed, paused: false, friendly: false, friendshipResults: [] })
  setMusicMode('race')
  prepare(clock.start(speed))
}

export function restoreWindMeet(meet) {
  if (!meet) return
  endedAt = 0
  Object.assign(windMeet, { active: true, meet, speed: 1, paused: true, friendly: false, friendshipResults: [] })
  prepare(performance.timeOrigin + performance.now())
}

export function pauseWindMeet() {
  if (!windMeet.active || windMeet.paused) return
  clock.pause()
  windMeet.paused = true
  void dependencies.savePause(windMeet.meet.id, true).catch(error => { windMeet.error = error.message })
}

export function toggleWindMeetPause() {
  if (!windMeet.active || !['countdown', 'running', 'saving'].includes(windMeet.phase)) return
  if (!windMeet.paused) { pauseWindMeet(); return }
  windMeet.paused = false
  windMeet.error = ''
  clock.resume()
  setMusicMode('race')
  void dependencies.savePause(windMeet.meet.id, false).catch(error => { windMeet.error = error.message })
}

export function setWindMeetSpeed(speed) {
  if (![1, 2, 4, 8, 16].includes(speed)) return
  clock.setSpeed(speed)
  windMeet.speed = speed
}

async function saveMatch() {
  windMeet.phase = 'saving'
  try {
    const meet = await dependencies.saveMatch(windMeet.meet, windMeet.match,
      windMeet.athletes.map((athlete, index) => ({ studentId: athlete.student.id, lane: index + 1, time: athlete.profile.time })),
      windMeet.startedAt, windMeet.finishedAt || new Date().toISOString())
    windMeet.meet = meet
    if (meet.status === 'complete') {
      windMeet.paused = false
      if (!prepareFriendship(endedAt || performance.timeOrigin + performance.now())) {
        windMeet.active = false
        windMeet.phase = 'complete'
        clock.stop()
        setMusicMode('ambient')
      } else setMusicMode('race')
    } else {
      prepare(endedAt || performance.timeOrigin + performance.now())
      // An awaiting write may have outlived the mounted race view. Restore
      // the race score before advancing the next match in the background.
      setMusicMode('race')
    }
    return true
  } catch (error) {
    clock.pause()
    windMeet.phase = 'saveerror'
    windMeet.error = error.message || '本機保存失敗，請保留此畫面並重試。'
    return false
  }
}

async function advance() {
  if (advancing || !windMeet.active || windMeet.paused || !['countdown', 'running'].includes(windMeet.phase)) return
  advancing = true
  try {
    while (windMeet.active && !windMeet.paused && ['countdown', 'running'].includes(windMeet.phase)) {
      const boundary = windMeet.phase === 'countdown' ? Math.min(0, Math.floor(windMeet.elapsed) + 1) : windMeet.finishedAt ? runoutEnd() : maxTime()
      const remaining = boundary - windMeet.elapsed
      const { seconds, at } = clock.take(remaining)
      if (!seconds) break
      windMeet.elapsed = seconds >= remaining ? boundary : windMeet.elapsed + seconds
      if (windMeet.phase === 'countdown') {
        const currentCue = Math.max(1, Math.ceil(-windMeet.elapsed))
        if (currentCue !== cue) { cue = currentCue; if (recentCue(at)) playCountdown(cue) }
        if (windMeet.elapsed >= 0) { windMeet.phase = 'running'; if (recentCue(at)) playStartWhistle() }
      }
      if (windMeet.phase === 'running' && windMeet.elapsed >= maxTime() && !windMeet.finishedAt) windMeet.finishedAt = new Date(at).toISOString()
      if (windMeet.phase === 'running' && windMeet.elapsed >= runoutEnd()) {
        endedAt = at
        if (windMeet.friendly) { finishFriendship(); break }
        if (!await saveMatch()) break
      }
    }
  } finally { advancing = false }
}

export async function retryWindMeetSave() {
  if (windMeet.phase !== 'saveerror' || advancing) return
  advancing = true
  try { if (await saveMatch() && windMeet.active && !windMeet.paused) clock.resume() }
  finally { advancing = false }
}

export function dismissWindMeet() {
  if (!windMeet.active) Object.assign(windMeet, { phase: 'idle', meet: null, match: null, athletes: [], friendly: false, friendshipResults: [] })
}
