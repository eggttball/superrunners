import { shallowReactive } from 'vue'
import { nextWindMatch } from './wind-selection.js'
import { createMeetClock } from './meet-clock.js'
import { createSprintProfile } from './physics.js'
import { setMusicMode, playCountdown, playStartWhistle } from './audio.js'

export const windMeet = shallowReactive({ active: false, meet: null, match: null, athletes: [], friendly: false, friendshipResults: [],
  scope: 'school', runId: '', schoolIds: [], schoolIndex: 0, completedSchools: 0, completedMatches: 0, totalMatches: 0, stage: 'school',
  phase: 'idle', elapsed: 0, paused: false, speed: 1, error: '', startedAt: '', finishedAt: '' })
let dependencies, advancing = false, endedAt = 0, cue = 3
const clock = createMeetClock(() => { void advance() })
export function installWindMeet(api) { dependencies = api }
const recentCue = at => !document.hidden && performance.timeOrigin + performance.now() - at < 750
const maxTime = () => Math.max(0, ...windMeet.athletes.map(athlete => athlete.profile.time))
const runoutEnd = () => Math.max(0, ...windMeet.athletes.map(athlete => athlete.profile.time + athlete.profile.runoutDuration))
const schoolMeetId = () => `${windMeet.runId}-${windMeet.schoolIds[windMeet.schoolIndex]}`
let progressWrites = Promise.resolve()

function persistProgress(clear = false) {
  if (windMeet.scope !== 'national') return Promise.resolve()
  const progress = windMeet.active && !clear && windMeet.stage !== 'finished' ? {
    active: true, runId: windMeet.runId, schoolIds: [...windMeet.schoolIds], schoolIndex: windMeet.schoolIndex,
    completedSchools: windMeet.completedSchools, completedMatches: windMeet.completedMatches, totalMatches: windMeet.totalMatches,
    speed: windMeet.speed, paused: windMeet.paused, stage: windMeet.stage,
  } : null
  const write = progressWrites.then(() => dependencies.saveProgress(progress))
  progressWrites = write.catch(() => {})
  return write
}

function saveControl() {
  const runId = windMeet.runId
  const write = windMeet.scope === 'national' ? persistProgress()
    : windMeet.friendly ? Promise.resolve() : dependencies.savePause(windMeet.meet.id, windMeet.paused)
  void write.catch(error => { if (windMeet.active && windMeet.runId === runId) windMeet.error = error.message })
}

function finishSelection() {
  Object.assign(windMeet, { active: false, phase: 'complete', paused: false })
  clock.stop()
  setMusicMode('ambient')
}

async function prepareNationalSchool(at) {
  if (!windMeet.active) return false
  const runId = windMeet.runId
  windMeet.phase = 'preparing'
  windMeet.meet = null
  windMeet.match = null
  windMeet.athletes = []
  windMeet.friendly = false
  windMeet.error = ''
  try {
    const meet = dependencies.getMeet(schoolMeetId()) || await dependencies.createMeet(windMeet.schoolIds[windMeet.schoolIndex], {
      id: schoolMeetId(), nationalRunId: runId,
    })
    if (!windMeet.active || windMeet.runId !== runId) return false
    windMeet.meet = meet
    windMeet.stage = meet.status === 'complete' ? 'friendly' : 'school'
    await persistProgress()
    if (!windMeet.active || windMeet.runId !== runId) return false
    if (meet.status === 'complete') {
      if (!prepareFriendship(at)) return finishNationalSchool(at)
    } else if (!prepare(at)) throw new Error('目前學校沒有可接續的選拔對戰，請重試。')
    setMusicMode('race')
    return true
  } catch (error) {
    if (!windMeet.active || windMeet.runId !== runId) return false
    clock.pause()
    windMeet.phase = 'saveerror'
    windMeet.error = error.message || '目前學校的選拔賽無法準備，請重試。'
    return false
  }
}

async function finishNationalSchool(at) {
  const runId = windMeet.runId
  windMeet.phase = 'saving'
  windMeet.completedSchools = windMeet.schoolIndex + 1
  if (windMeet.completedSchools === windMeet.schoolIds.length) {
    windMeet.stage = 'finished'
    await persistProgress(true)
    if (!windMeet.active || windMeet.runId !== runId) return false
    finishSelection()
    return true
  }
  windMeet.schoolIndex++
  windMeet.stage = 'nextschool'
  // Save the next school before creating its meet. Retrying uses a stable ID.
  await persistProgress()
  if (!windMeet.active || windMeet.runId !== runId) return false
  return prepareNationalSchool(at)
}

function prepare(at) {
  const match = nextWindMatch(windMeet.meet)
  if (!match) return false
  Object.assign(windMeet, { match, athletes: match.studentIds.map(id => {
    const student = dependencies.getStudent(id)
    return { student: { ...student }, profile: createSprintProfile(student) }
  }), friendly: false, elapsed: -3, phase: 'countdown', startedAt: new Date(at).toISOString(), finishedAt: '', error: '' })
  windMeet.stage = 'school'
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
    friendly: true, stage: 'friendly', friendshipResults: [], elapsed: -3, phase: 'countdown',
    startedAt: new Date(at).toISOString(), finishedAt: '', error: '',
  })
  cue = 3
  if (!windMeet.paused && recentCue(at)) playCountdown(3)
  return true
}

async function finishFriendship(at) {
  const classNames = new Map(windMeet.meet.grades.filter(group => group.champion)
    .map(group => [group.champion.classId, group.champion.className]))
  windMeet.friendshipResults = windMeet.athletes.map((athlete, lane) => ({
    studentId: athlete.student.id, name: athlete.student.name, classId: athlete.student.classId,
    className: classNames.get(athlete.student.classId) || '',
    time: athlete.profile.time, lane: lane + 1,
  })).sort((a, b) => a.time - b.time || a.lane - b.lane).map((result, index) => ({ ...result, place: index + 1 }))
  if (windMeet.scope === 'national') return finishNationalSchool(at)
  finishSelection()
  return true
}

export function startWindMeet(meet, speed = 1) {
  endedAt = 0
  Object.assign(windMeet, { active: true, meet, speed, paused: false, friendly: false, friendshipResults: [],
    scope: 'school', runId: '', schoolIds: [], schoolIndex: 0, completedSchools: 0, completedMatches: 0, totalMatches: 0 })
  setMusicMode('race')
  prepare(clock.start(speed))
}

export function restoreWindMeet(meet) {
  if (!meet) return
  endedAt = 0
  Object.assign(windMeet, { active: true, meet, speed: 1, paused: true, friendly: false, friendshipResults: [], scope: 'school', runId: '', schoolIds: [], schoolIndex: 0 })
  prepare(performance.timeOrigin + performance.now())
}

export async function startNationalWindMeet(schools) {
  if (!schools.length) throw new Error('目前沒有可參賽的學校。')
  if (windMeet.active || !dependencies.canStart()) throw new Error('請先完成或終止目前的自動賽程。')
  const runId = `wind-national-${crypto.randomUUID()}`
  Object.assign(windMeet, { active: true, scope: 'national', runId, schoolIds: schools.map(school => school.id),
    schoolIndex: 0, completedSchools: 0, completedMatches: 0,
    totalMatches: schools.reduce((sum, school) => sum + school.classes.filter(cls => cls.studentIds.length).length, 0),
    speed: 16, paused: false, stage: 'nextschool', meet: null, match: null, friendly: false, friendshipResults: [], error: '', phase: 'preparing' })
  const at = clock.start(16)
  try {
    await persistProgress()
    if (windMeet.active && windMeet.runId === runId) await prepareNationalSchool(at)
  } catch (error) {
    if (!windMeet.active || windMeet.runId !== runId) return
    clock.pause()
    windMeet.phase = 'saveerror'
    windMeet.error = error.message
  }
}

export async function restoreNationalWindMeet(progress) {
  if (!progress?.active || !progress.schoolIds?.length || progress.schoolIndex >= progress.schoolIds.length) return false
  Object.assign(windMeet, { ...progress, scope: 'national', paused: Boolean(progress.paused),
    speed: [1, 2, 4, 8, 16].includes(progress.speed) ? progress.speed : 16,
    meet: null, match: null, athletes: [], friendly: false, friendshipResults: [], phase: 'preparing', error: '' })
  // Reconcile the cursor with committed meets if a refresh interrupted its write.
  windMeet.completedMatches = dependencies.getRunMeets(progress.runId).reduce((sum, meet) => sum + meet.completedMatches, 0)
  const at = clock.start(windMeet.speed)
  if (windMeet.paused) clock.pause()
  await prepareNationalSchool(at)
  return true
}

export async function terminateNationalWindMeet() {
  if (!windMeet.active || windMeet.scope !== 'national') return false
  clock.stop()
  Object.assign(windMeet, { active: false, phase: 'idle', runId: '', meet: null, match: null, athletes: [],
    schoolIds: [], friendly: false, friendshipResults: [], paused: false, error: '' })
  setMusicMode('ambient')
  await persistProgress()
  return true
}

export function pauseWindMeet() {
  if (!windMeet.active || windMeet.paused) return
  clock.pause()
  windMeet.paused = true
  saveControl()
}

export function toggleWindMeetPause() {
  if (!windMeet.active || !['countdown', 'running', 'saving', 'preparing'].includes(windMeet.phase)) return
  if (!windMeet.paused) { pauseWindMeet(); return }
  windMeet.paused = false
  windMeet.error = ''
  clock.resume()
  setMusicMode('race')
  saveControl()
}

export function setWindMeetSpeed(speed) {
  if (!windMeet.active || speed === windMeet.speed || ![1, 2, 4, 8, 16].includes(speed)) return
  clock.setSpeed(speed)
  windMeet.speed = speed
  if (windMeet.scope === 'national') saveControl()
}

async function saveMatch() {
  const runId = windMeet.runId
  const national = windMeet.scope === 'national'
  const previousMatches = windMeet.meet.completedMatches
  windMeet.phase = 'saving'
  try {
    const meet = await dependencies.saveMatch(windMeet.meet, windMeet.match,
      windMeet.athletes.map((athlete, index) => ({ studentId: athlete.student.id, lane: index + 1, time: athlete.profile.time })),
      windMeet.startedAt, windMeet.finishedAt || new Date().toISOString())
    if (!windMeet.active || windMeet.runId !== runId) return false
    windMeet.meet = meet
    if (national) {
      windMeet.completedMatches += meet.completedMatches - previousMatches
      windMeet.stage = meet.status === 'complete' ? 'friendly' : 'school'
      await persistProgress()
      if (!windMeet.active || windMeet.runId !== runId) return false
    }
    if (meet.status === 'complete') {
      if (!prepareFriendship(endedAt || performance.timeOrigin + performance.now())) {
        if (national) return finishNationalSchool(endedAt || performance.timeOrigin + performance.now())
        finishSelection()
      } else setMusicMode('race')
    } else {
      prepare(endedAt || performance.timeOrigin + performance.now())
      // An awaiting write may have outlived the mounted race view. Restore
      // the race score before advancing the next match in the background.
      setMusicMode('race')
    }
    return true
  } catch (error) {
    if (!windMeet.active || windMeet.runId !== runId) return false
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
        if (windMeet.friendly) {
          try { if (!await finishFriendship(at)) break }
          catch (error) {
            if (windMeet.active) { clock.pause(); windMeet.phase = 'saveerror'; windMeet.error = error.message }
            break
          }
          continue
        }
        if (!await saveMatch()) break
      }
    }
  } finally { advancing = false }
}

export async function retryWindMeetSave() {
  if (windMeet.phase !== 'saveerror' || advancing) return
  const runId = windMeet.runId
  advancing = true
  try {
    if (windMeet.scope === 'national' && windMeet.stage === 'finished') {
      await persistProgress(true)
      if (!windMeet.active || windMeet.runId !== runId) return
      finishSelection()
      return
    }
    const saved = windMeet.scope === 'national' && (windMeet.stage !== 'school' || !windMeet.match)
      ? await prepareNationalSchool(performance.timeOrigin + performance.now()) : await saveMatch()
    if (saved && windMeet.active && !windMeet.paused) clock.resume()
  } catch (error) {
    if (windMeet.active && windMeet.runId === runId) { windMeet.phase = 'saveerror'; windMeet.error = error.message }
  }
  finally { advancing = false }
}

export function dismissWindMeet() {
  if (!windMeet.active) Object.assign(windMeet, { phase: 'idle', meet: null, match: null, athletes: [], friendly: false, friendshipResults: [], scope: 'school', runId: '' })
}
