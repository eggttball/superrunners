import { reactive, shallowReactive } from 'vue'
import { saveChanges, saveLocalMetaPatch, requestPersistentStorage, exportWorld, pendingOperations } from './storage.js'
import { cloudOperation, installCloudSync, queueSync, restoreCloud, retryCloudSync, reserveStudentSeat, releaseStudentSeat } from './cloud.js'
import { flagIds } from './cloud-schema.js'
import { rankStudents } from './generator.js'
import { createSprintProfile } from './physics.js'
import { playCountdown, playStartWhistle, setMusic, setMusicMode } from './audio.js'
import { compareSchoolOrder } from './school-order.js'
import { createMeetClock } from './meet-clock.js'
import { createWindMeet, nextWindMatch, completeWindMatch } from './wind-selection.js'
import { createRegionalMeet, completeRegionalMatch, normalizeRegion } from './regional-selection.js'
import { createNationalChampionship, completeNationalMatch } from './national-championship.js'
import { installWindMeet, restoreWindMeet, restoreNationalWindMeet, windMeet } from './wind-meet.js'
import { admissionDetails, buildAdmittedStudent, validateStudentInput } from './student-admission.js'
import { prepareRelayLineup, createRelayMeet, completeRelayMatch } from './relay-rules.js'
import { relayMeet, installRelayMeet, restoreRelayMeet } from './relay-meet.js'

export const game = shallowReactive({
  world: null, ready: false, progress: 0, phase: '準備你的田徑世界', error: '',
  revision: 0, tab: 'home', schoolId: '', studentId: '', raceTeamId: '', nationalRanking: false, raceTitle: '', toast: '', busy: false,
  saving: false, muted: false, audioStarted: false, exportBusy: false, navigationRevision: 0,
})
let students = new Map(), schools = new Map(), classes = new Map(), teams = new Map()
const admittedStudents = new Map()
let toastTimer, mutationQueue = Promise.resolve()
let initializationStarted = false

// This controller deliberately lives outside RaceView. Both automatic modes
// keep running while the player reads schools, teams, or returns home.
export const autoMeet = reactive({
  active: false, schoolId: '', sessionId: '', queue: [], heatIndex: 0,
  scope: 'school', runId: '', schoolIds: [], schoolIndex: 0,
  completedSchools: 0, completedHeats: 0, completedClasses: 0, completedStudents: 0, totalHeats: 0,
  resumeAvailable: false,
  phase: 'idle', athletes: [], elapsed: 0, paused: false, speed: 1,
  startedAt: '', finishedAt: '', error: '',
})
let autoCountdownCue = 0, autoAdvancing = false, autoHeatEndedAt = 0
const autoClock = createMeetClock(() => { void advanceAutomaticMeet() })

export function notify(message) {
  game.toast = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { game.toast = '' }, 4200)
}

export async function initialize() {
  if (initializationStarted) return
  initializationStarted = true
  // One editable tab prevents stale copies of the national database from overwriting each other.
  if (navigator.locks) {
    navigator.locks.request('superrunners-session', { ifAvailable: true }, async lock => {
      if (!lock) { game.error = '遊戲已在另一個分頁開啟。請先關閉該分頁，再重新載入這裡。'; return }
      await boot()
      await new Promise(() => {})
    }).catch(error => { game.error = error.message })
  } else await boot()
}

function boot() {
  return new Promise(resolve => {
    void requestPersistentStorage()
    const worker = new Worker(new URL('./world.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = async event => {
      const data = event.data
      if (data.type === 'progress') {
        game.phase = data.phase
        game.progress = Math.min(100, Math.round(data.progress <= 1 ? data.progress * 100 : data.progress))
      }
      if (data.type === 'missing') {
        try {
          const world = await restoreCloud(progress => {
            game.phase = progress.phase
            game.progress = Math.round(progress.progress * 100)
          })
          worker.postMessage({ type: 'restore', world })
        } catch (error) {
          game.error = error.message
          worker.terminate()
          resolve()
        }
      }
      if (data.type === 'ready') {
        const world = data.world
        worker.terminate()
        // Populate directly to avoid a temporary array of hundreds of thousands of pairs.
        students = new Map()
        for (const student of world.students) {
          students.set(student.id, student)
          if (student.manuallyCreated) admittedStudents.set(student.id, student)
        }
        schools = new Map(world.schools.map(school => [school.id, school]))
        teams = new Map(world.teams.map(team => [team.id, team]))
        classes = new Map()
        for (const school of world.schools) for (const cls of school.classes) classes.set(cls.id, cls)
        game.world = world
        world.relayMeets ||= []
        world.relayRaces ||= []
        world.relayLineups ||= []
        world.relayChampions ||= {}
        installRelayMeet({ getStudent, canStart: () => !autoMeet.active && !windMeet.active,
          getMeet: id => game.world.relayMeets.find(meet => meet.id === id), createMeet: createSchoolRelayMeet, saveMatch: recordRelayMatch,
          saveProgress: async progress => {
            await saveLocalMetaPatch({ relayMeetProgress: progress })
            game.world.relayMeetProgress = progress
          },
        })
        installWindMeet({ getStudent, getSchool, getClass, saveMatch: (meet, ...args) => meet.kind === 'national-championship' ? recordNationalMatch(meet, ...args) : meet.kind === 'regional' ? recordRegionalMatch(meet, ...args) : recordWindMatch(meet, ...args), savePause: saveWindPause,
          canStart: () => !autoMeet.active && !relayMeet.active, createMeet: createSchoolWindMeet,
          getMeet: id => game.world.windMeets.find(meet => meet.id === id),
          getRunMeets: runId => game.world.windMeets.filter(meet => meet.nationalRunId === runId),
          saveProgress: async progress => {
            await saveLocalMetaPatch({ nationalWindMeetProgress: progress })
            game.world.nationalWindMeetProgress = progress
          },
        })
        installCloudSync(() => game.world, mergeCloudData, getStudent)
        // Existing local data is usable immediately, even with an offline
        // backlog or a long first upload. The outbox preserves new edits.
        void retryCloudSync()
        game.muted = world.settings?.muted ?? false
        if (game.audioStarted) setMusic(game.muted).catch(() => {})
        game.ready = true
        game.phase = '全國資料已就緒'
        game.revision++
        const latestRelay = world.relayMeets.filter(meet => !meet.nationalRunId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
        const relayProgress = world.relayMeetProgress || (latestRelay?.status === 'running'
          ? { active: true, meet: latestRelay, elapsed: -3, paused: false, speed: 1, plans: [] } : null)
        const restoredRelay = await restoreRelayMeet(relayProgress)
        const restoredWind = !restoredRelay && await restoreNationalWindMeet(world.nationalWindMeetProgress)
        if (!restoredRelay && !restoredWind) restoreWindMeet([...world.nationalMeets, ...world.regionMeets, ...world.windMeets.filter(meet => !meet.nationalRunId)].filter(meet => meet.status === 'running')
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0])
        const cancelledRuns = new Set(world.cancelledAutomaticMeetRunIds || [])
        const savedProgress = world.autoMeetProgress?.active && !cancelledRuns.has(world.autoMeetProgress.runId)
          ? world.autoMeetProgress : null
        const progress = savedProgress || recoverNationalAutomaticMeet(world)
        if (progress && !windMeet.active && !relayMeet.active) {
          resumeAutomaticMeet(progress)
          persistAutoMeetProgress()
        }
        resolve()
      }
      if (data.type === 'error') {
        game.error = data.message
        worker.terminate()
        resolve()
      }
    }
    worker.onerror = event => {
      game.error = event.message || '資料初始化無法完成，請重新載入。'
      worker.terminate()
      resolve()
    }
    worker.postMessage({ type: 'initialize' })
  })
}

function autoMeetSnapshot() {
  return {
    active: autoMeet.active, scope: autoMeet.scope, runId: autoMeet.runId,
    schoolIds: [...autoMeet.schoolIds], schoolIndex: autoMeet.schoolIndex,
    schoolId: autoMeet.schoolId, sessionId: autoMeet.sessionId,
    heatIndex: autoMeet.heatIndex, completedSchools: autoMeet.completedSchools,
    completedHeats: autoMeet.completedHeats, completedClasses: autoMeet.completedClasses,
    completedStudents: autoMeet.completedStudents, totalHeats: autoMeet.totalHeats,
    queue: autoMeet.queue.map(heat => ({ ...heat, studentIds: [...heat.studentIds] })),
    speed: autoMeet.speed, paused: autoMeet.paused,
  }
}

function persistAutoMeetProgress() {
  if (!game.world) return
  const progress = autoMeet.active ? autoMeetSnapshot() : null
  game.world.autoMeetProgress = progress
  void saveLocalMetaPatch({ autoMeetProgress: progress }).catch(error => {
    if (autoMeet.active) notify(`自動賽進度暫存失敗：${error.message}`)
  })
}

function recoverNationalAutomaticMeet(world) {
  const schoolList = world.schools.filter(school => school.classes.some(cls => cls.studentIds.length)).sort(compareSchoolOrder)
  const schoolsById = new Map(schoolList.map(school => [school.id, school]))
  const cancelledRuns = new Set(world.cancelledAutomaticMeetRunIds || [])
  const runs = new Map()
  for (const race of world.races) {
    if (!race.sessionId?.startsWith('auto-') || !schoolsById.has(race.schoolId)) continue
    const suffix = `-${race.schoolId}`
    if (!race.sessionId.endsWith(suffix)) continue
    const runId = race.sessionId.slice(0, -suffix.length)
    if (!runs.has(runId)) runs.set(runId, { runId, racesBySchool: new Map(), latestAt: 0 })
    const run = runs.get(runId)
    if (!run.racesBySchool.has(race.schoolId)) run.racesBySchool.set(race.schoolId, [])
    run.racesBySchool.get(race.schoolId).push(race)
    run.latestAt = Math.max(run.latestAt, Date.parse(race.finishedAt) || 0)
  }

  // A national itinerary shares one run ID across multiple schools. School-only
  // meets have one school and must never be mistaken for a national session.
  const latestRun = [...runs.values()].sort((a, b) => b.latestAt - a.latestAt)[0]
  if (!latestRun || cancelledRuns.has(latestRun.runId) || latestRun.racesBySchool.size < 2) return null

  let schoolIndex = 0, heatIndex = 0, completedSchools = 0
  let completedHeats = 0, completedClasses = 0, completedStudents = 0
  let interrupted = false, interruptedQueue = []
  for (let index = 0; index < schoolList.length; index++) {
    const school = schoolList[index]
    const savedRaces = latestRun.racesBySchool.get(school.id) || []
    const queue = automaticHeatQueue(school, savedRaces)
    const racesByHeat = new Map(savedRaces.map(race => [`${race.classId}:${race.heat}`, race]))
    let completedInSchool = 0
    for (const heat of queue) {
      const race = racesByHeat.get(`${heat.classId}:${heat.heat}`)
      if (!race) {
        schoolIndex = index
        heatIndex = completedInSchool
        interrupted = true
        interruptedQueue = queue
        break
      }
      completedInSchool++
      completedHeats++
      completedStudents += race.results?.length || 0
    }
    for (const cls of school.classes) {
      const classHeats = queue.filter(heat => heat.classId === cls.id)
      if (classHeats.length && classHeats.every(heat => racesByHeat.has(`${heat.classId}:${heat.heat}`))) completedClasses++
    }
    if (interrupted) break
    completedSchools++
  }
  if (!interrupted) return null
  return {
    active: true, scope: 'national', runId: latestRun.runId,
    schoolIds: schoolList.map(school => school.id), schoolIndex,
    schoolId: schoolList[schoolIndex]?.id, sessionId: `${latestRun.runId}-${schoolList[schoolIndex]?.id}`,
    heatIndex, completedSchools, completedHeats, completedClasses, completedStudents,
    queue: interruptedQueue,
    totalHeats: schoolList.reduce((total, school) => total + automaticHeatQueue(school, latestRun.racesBySchool.get(school.id) || []).length, 0),
    speed: 16, paused: false, recovered: true,
  }
}

function resumeAutomaticMeet(snapshot) {
  if (!snapshot?.schoolIds?.length || snapshot.schoolIndex >= snapshot.schoolIds.length) return
  const heatIndex = Math.max(0, snapshot.heatIndex || 0)
  Object.assign(autoMeet, {
    active: true, scope: snapshot.scope, runId: snapshot.runId,
    schoolIds: [...snapshot.schoolIds], schoolIndex: snapshot.schoolIndex,
    completedSchools: snapshot.completedSchools, completedHeats: snapshot.completedHeats,
    completedClasses: snapshot.completedClasses, completedStudents: snapshot.completedStudents,
    totalHeats: snapshot.totalHeats, speed: snapshot.speed || 1,
    paused: Boolean(snapshot.paused), phase: 'countdown', error: '', resumeAvailable: false,
  })
  setMusicMode('race')
  prepareAutomaticSchool()
  if (snapshot.queue?.length) autoMeet.queue = snapshot.queue.map(heat => ({ ...heat, studentIds: [...heat.studentIds] }))
  else autoMeet.queue = automaticHeatQueue(getSchool(autoMeet.schoolId),
    game.world.races.filter(race => race.sessionId === autoMeet.sessionId))
  autoMeet.heatIndex = Math.min(heatIndex, Math.max(0, autoMeet.queue.length - 1))
  prepareAutomaticHeat(autoClock.start(autoMeet.speed))
  if (autoMeet.paused) autoClock.pause()
  else notify(snapshot.recovered
    ? `已從比賽紀錄找回全國賽進度，從${getSchool(autoMeet.schoolId)?.name || '目前學校'}繼續。`
    : `已從上次進度繼續${autoMeet.scope === 'national' ? '全國' : '全校'}自動百米賽。`)
}

export const getStudent = id => students.get(id)
export const getAdmittedStudents = () => admittedStudents.values()
export const getSchool = id => schools.get(id)
export const getClass = id => classes.get(id)
export const getTeam = id => teams.get(id)
export function getWindTitle(studentId) {
  game.revision
  if (!studentId) return null
  const god = game.world?.nationalChampion
  if (god?.studentId === studentId) return { ...god, title: '風神', kind: 'god' }
  const student = getStudent(studentId)
  const prince = student && game.world?.regionChampions?.[normalizeRegion(getSchool(student.schoolId)?.city)]
  if (prince?.studentId === studentId) return { ...prince, title: '風速王子', kind: 'prince' }
  const title = student && game.world?.windChampions?.[student.schoolId]?.[student.grade]
  return title?.studentId === studentId ? { ...title, title: '風速小子', kind: 'school' } : null
}
export function getSchoolTeamCountForClass(classId) {
  const cls = getClass(classId)
  if (!cls) return 0
  return cls.studentIds.reduce((count, studentId) => count + (getStudent(studentId)?.isSchoolTeam ? 1 : 0), 0)
}
export const timeText = time => Number.isFinite(time) ? time.toFixed(2) : '—'
export const dateText = value => new Date(value).toLocaleString('zh-TW', { hour12: false })
export const studentTime = student => Number.isFinite(student.best100) && student.best100 > 0 ? student.best100 : student.baseline100

export function go(tab, schoolId = '') {
  if (tab !== 'race') game.raceTeamId = ''
  game.tab = tab
  game.navigationRevision++
  if (schoolId) game.schoolId = schoolId
  game.studentId = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export async function startAudio() {
  if (!game.ready || game.audioStarted) return
  try { await setMusic(game.muted); game.audioStarted = true } catch { /* Next interaction may retry browser audio permission. */ }
}

function transaction(operation, saving = true) {
  const result = mutationQueue.then(async () => {
    if (saving) game.saving = true
    try { return await operation() }
    finally { if (saving) game.saving = false }
  })
  mutationQueue = result.catch(() => {})
  return result
}

// Cloud snapshots and user edits share the same local mutation queue. Pending
// operations overlay reads so an offline edit is never erased by a refresh.
async function mergeCloudData(update) {
  return transaction(async () => {
    const pending = (await pendingOperations()).filter(operation => operation.id !== update.acknowledge)
    if (update.stillCurrent && !update.stillCurrent()) return false
    const patches = Object.assign({}, ...pending.map(operation => {
      if (operation.type === 'patch') return operation.payload
      if (operation.type !== 'student-create') return {}
      const { student, teamId } = operation.payload
      return { [`dynamic/profiles/${student.id}/nickname`]: student.nickname,
        [`dynamic/rosters/${teamId}/${student.id}`]: student.isSchoolTeam }
    }))
    const changed = new Map()
    const changedTeams = new Map()
    const changedSchools = new Map()
    for (const student of update.addedStudents || []) {
      if (getStudent(student.id)) continue
      const school = getSchool(student.schoolId), classroom = getClass(student.classId)
      if (!student.manuallyCreated || !school || !classroom || classroom.schoolId !== school.id || classroom.grade !== student.grade) {
        throw new Error('新增學生的班級資料無法識別，已保留本機存檔。')
      }
      const next = changedSchools.get(school.id) || { ...school, classes: school.classes.map(cls => ({ ...cls, studentIds: [...cls.studentIds] })) }
      const target = next.classes.find(cls => cls.id === classroom.id)
      if (!target.studentIds.includes(student.id)) {
        if (target.studentIds.length >= 50) throw new Error('插班資料超過班級人數上限，已保留本機存檔。')
        target.studentIds.push(student.id)
      }
      changedSchools.set(school.id, next)
      changed.set(student.id, { ...student, ranks: { ...student.ranks } })
    }
    const studentCopy = id => {
      if (!changed.has(id) && getStudent(id)) changed.set(id, { ...getStudent(id), ranks: { ...getStudent(id).ranks } })
      return changed.get(id)
    }
    for (const profile of [...(update.profiles || []), ...(update.bests || [])]) {
      const student = studentCopy(profile.id)
      if (!student) continue
      const previousBest = student.best100
      Object.assign(student, profile)
      student.best100 = profile.best100 == null ? previousBest : previousBest == null ? profile.best100 : Math.min(previousBest, profile.best100)
    }
    if (update.ranking) for (const entry of update.ranking.entries) {
      const student = studentCopy(entry.id)
      if (!student) continue
      if (entry.best100 != null) student.best100 = student.best100 == null ? entry.best100 : Math.min(student.best100, entry.best100)
      student.ranks[update.ranking.scope] = entry.rank
    }
    if (update.roster) {
      const { teamId, memberIds, awardIds } = update.roster
      const team = getTeam(teamId)
      if (team) {
        const nextIds = new Set(memberIds)
        for (const [path, value] of Object.entries(patches)) {
          const prefix = `dynamic/rosters/${teamId}/`
          if (path.startsWith(prefix)) { if (value) nextIds.add(path.slice(prefix.length)); else nextIds.delete(path.slice(prefix.length)) }
        }
        for (const id of new Set([...team.memberIds, ...nextIds])) {
          const student = studentCopy(id)
          if (student) student.isSchoolTeam = nextIds.has(id)
        }
        changedTeams.set(teamId, { ...team, memberIds: [...nextIds], awardIds: [...new Set([...team.awardIds, ...awardIds])] })
      }
    }
    for (const student of changed.values()) {
      for (const key of ['nickname', 'isCityTeam', 'isNationalTeam']) {
        const path = `dynamic/profiles/${student.id}/${key}`
        if (path in patches) student[key] = patches[path]
      }
      const team = getTeam(getSchool(student.schoolId).teamId)
      const path = `dynamic/rosters/${team.id}/${student.id}`
      if (path in patches) student.isSchoolTeam = !!patches[path]
      // A one-student detail refresh also updates the local team's index.
      if (student.isSchoolTeam !== Boolean(getStudent(student.id)?.isSchoolTeam)) {
        const next = changedTeams.get(team.id) || { ...team, memberIds: [...team.memberIds] }
        next.memberIds = next.memberIds.filter(id => id !== student.id)
        if (student.isSchoolTeam) next.memberIds.push(student.id)
        changedTeams.set(team.id, next)
      }
    }
    const meta = {}
    if (update.admissionCursor != null) meta.admissionCursor = Math.max(game.world.admissionCursor || 0, update.admissionCursor)
    if (update.schoolChampions) {
      const { schoolId, champions } = update.schoolChampions
      const merged = { ...champions }
      for (const operation of pending) {
        if (operation.type === 'heat' && operation.payload.windChampion && operation.payload.race.schoolId === schoolId) {
          merged[operation.payload.windChampion.grade] = operation.payload.windChampion
        }
      }
      meta.windChampions = { ...game.world.windChampions, [schoolId]: merged }
    }
    const changedWindMeets = (update.windMeets || []).map(meet => {
      const unsent = pending.map(operation => operation.type === 'heat' ? operation.payload.windMeet :
        operation.type === 'patch' ? operation.payload[`dynamic/windMeets/${meet.schoolId}/${meet.id}`] : null)
        .filter(saved => saved?.id === meet.id).at(-1)
      const local = game.world.windMeets.find(saved => saved.id === meet.id)
      return unsent || (local?.completedMatches > meet.completedMatches ? local : meet)
    })
    if (update.regionChampions) {
      const merged = { ...game.world.regionChampions, ...update.regionChampions }
      for (const operation of pending) if (operation.type === 'heat' && operation.payload.regionChampion) {
        const champion = operation.payload.regionChampion
        const saved = merged[champion.city]
        if (!saved || (champion.awardedAtMs ?? Date.parse(champion.awardedAt)) >= (saved.awardedAtMs ?? Date.parse(saved.awardedAt))) merged[champion.city] = champion
      }
      meta.regionChampions = merged
    }
    const changedRegionMeets = (update.regionMeets || []).map(meet => {
      const unsent = pending.map(operation => operation.type === 'heat' ? operation.payload.regionMeet :
        operation.type === 'patch' ? operation.payload[`dynamic/regionMeets/${meet.city}/${meet.id}`] : null)
        .filter(saved => saved?.id === meet.id).at(-1)
      const local = game.world.regionMeets.find(saved => saved.id === meet.id)
      return unsent || (local?.completedMatches > meet.completedMatches ? local : meet)
    })
    if (Object.hasOwn(update, 'nationalChampion')) {
      let champion = update.nationalChampion
      const candidates = [game.world.nationalChampion, ...pending.filter(operation => operation.type === 'heat').map(operation => operation.payload.nationalChampion)]
      for (const candidate of candidates) if (candidate && (!champion || candidate.awardedAtMs >= champion.awardedAtMs)) champion = candidate
      meta.nationalChampion = champion
    }
    const changedNationalMeets = (update.nationalMeets || []).map(meet => {
      const unsent = pending.map(operation => operation.type === 'heat' ? operation.payload.nationalMeet :
        operation.type === 'patch' ? operation.payload[`dynamic/nationalMeets/${meet.id}`] : null)
        .filter(saved => saved?.id === meet.id).at(-1)
      const local = game.world.nationalMeets.find(saved => saved.id === meet.id)
      return unsent || (local?.completedMatches > meet.completedMatches ? local : meet)
    })
    const changedRelayMeets = (update.relayMeets || []).map(meet => {
      const unsent = pending.map(operation => operation.type === 'relay' ? operation.payload.meet :
        operation.type === 'patch' ? operation.payload[`dynamic/relayMeets/${meet.schoolId}/${meet.id}`] : null)
        .filter(value => value?.id === meet.id).at(-1)
      const local = game.world.relayMeets.find(value => value.id === meet.id)
      return unsent || (local?.completedMatches > meet.completedMatches ? local : meet)
    })
    const changedRelayLineups = (update.relayLineups || []).map(lineup => {
      const unsent = pending.map(operation => operation.type === 'relay' ? operation.payload.lineups?.find(value => value.id === lineup.id) :
        operation.type === 'patch' ? operation.payload[`dynamic/relayLineups/${lineup.classId}`] : null).filter(Boolean).at(-1)
      const local = game.world.relayLineups.find(value => value.id === lineup.id)
      return unsent || ((local?.updatedAtMs ?? Date.parse(local?.updatedAt)) > (lineup.updatedAtMs ?? Date.parse(lineup.updatedAt)) ? local : lineup)
    })
    if (update.relayChampions) {
      const merged = { ...game.world.relayChampions }
      const candidates = [...Object.values(update.relayChampions), ...pending.filter(operation => operation.type === 'relay').map(operation => operation.payload.champion)]
      for (const champion of candidates) if (champion) {
        const current = merged[champion.schoolId]
        if (!current || champion.awardedAtMs >= current.awardedAtMs) merged[champion.schoolId] = champion
      }
      meta.relayChampions = merged
    }
    const newRelayRaces = (update.relayRaces || []).filter(race => !game.world.relayRaces.some(value => value.id === race.id))
    const savedRelayRace = update.syncedRelayRaceId && game.world.relayRaces.find(race => race.id === update.syncedRelayRaceId)
    const syncedRelayRace = savedRelayRace?.syncStatus === 'pending'
      ? { ...(update.relayRaces || []).find(race => race.id === savedRelayRace.id) || savedRelayRace } : null
    if (syncedRelayRace) delete syncedRelayRace.syncStatus
    const nationalHonors = { ...game.world.nationalHonors }
    for (const [id, honors] of Object.entries(update.nationalHonors || {})) {
      nationalHonors[id] = [...new Map([...(nationalHonors[id] || []), ...honors].map(honor => [honor.meetId, honor])).values()]
    }
    for (const meet of changedNationalMeets) for (const honor of meet.grades[0].podium || []) {
      nationalHonors[honor.studentId] = [...new Map([...(nationalHonors[honor.studentId] || []), honor].map(honor => [honor.meetId, honor])).values()]
    }
    if (update.nationalHonors || changedNationalMeets.length) meta.nationalHonors = nationalHonors
    if (update.binding) meta.cloudBinding = update.binding
    if (update.preferences) for (const key of ['favoriteSchoolIds', 'followedTeamIds']) {
      const flags = { ...update.preferences[key] }
      for (const [path, value] of Object.entries(patches)) {
        const prefix = `dynamic/preferences/${key}/`
        if (path.startsWith(prefix)) flags[path.slice(prefix.length)] = value
      }
      meta[key] = flagIds(flags)
    }
    const newRaces = (update.races || []).filter(race => !game.world.races.some(existing => existing.id === race.id))
    const newAwards = (update.awards || []).filter(award => !game.world.awards.some(existing => existing.id === award.id))
    const savedRace = update.syncedRaceId && game.world.races.find(race => race.id === update.syncedRaceId)
    const syncedRace = savedRace?.syncStatus === 'pending' ? { ...savedRace } : null
    if (syncedRace) delete syncedRace.syncStatus
    await saveChanges({ ...game.world, ...meta }, { schools: [...changedSchools.values()], students: [...changed.values()], teams: [...changedTeams.values()], races: [...newRaces, ...(syncedRace ? [syncedRace] : [])], awards: newAwards, windMeets: changedWindMeets, regionMeets: changedRegionMeets, nationalMeets: changedNationalMeets,
      relayMeets: changedRelayMeets, relayLineups: changedRelayLineups, relayRaces: [...newRelayRaces, ...(syncedRelayRace ? [syncedRelayRace] : [])] },
      { acknowledge: update.acknowledge, cache: update.cache })
    Object.assign(game.world, meta)
    for (const [table, values] of [['relayMeets', changedRelayMeets], ['relayLineups', changedRelayLineups]]) for (const value of values) {
      const index = game.world[table].findIndex(saved => saved.id === value.id)
      if (index < 0) game.world[table].push(value)
      else game.world[table][index] = value
    }
    game.world.relayRaces.push(...newRelayRaces)
    if (syncedRelayRace) { Object.assign(savedRelayRace, syncedRelayRace); delete savedRelayRace.syncStatus }
    for (const meet of changedWindMeets) {
      const index = game.world.windMeets.findIndex(saved => saved.id === meet.id)
      if (index < 0) game.world.windMeets.push(meet)
      else game.world.windMeets[index] = meet
    }
    for (const meet of changedRegionMeets) {
      const index = game.world.regionMeets.findIndex(saved => saved.id === meet.id)
      if (index < 0) game.world.regionMeets.push(meet)
      else game.world.regionMeets[index] = meet
    }
    for (const meet of changedNationalMeets) {
      const index = game.world.nationalMeets.findIndex(saved => saved.id === meet.id)
      if (index < 0) game.world.nationalMeets.push(meet)
      else game.world.nationalMeets[index] = meet
    }
    for (const school of changedSchools.values()) {
      const original = getSchool(school.id)
      for (const classroom of school.classes) Object.assign(getClass(classroom.id), classroom)
      // Keep existing class objects referenced by race selectors.
      Object.assign(original, { ...school, classes: original.classes })
    }
    let populationChanged = false
    for (const student of changed.values()) {
      const original = getStudent(student.id)
      if (original) Object.assign(original, student)
      else {
        students.set(student.id, student)
        admittedStudents.set(student.id, student)
        game.world.students.push(student)
        populationChanged = true
      }
    }
    if (populationChanged) {
      rankStudents(game.world)
      if (update.ranking) for (const entry of update.ranking.entries) {
        const student = getStudent(entry.id)
        if (student) student.ranks[update.ranking.scope] = entry.rank
      }
    }
    for (const team of changedTeams.values()) Object.assign(getTeam(team.id), team)
    game.world.races.push(...newRaces)
    if (syncedRace) {
      Object.assign(savedRace, syncedRace)
      delete savedRace.syncStatus
    }
    game.world.awards.push(...newAwards)
    game.revision++
  }, false)
}

async function updateMeta(change, cloudPatch) {
  return transaction(async () => {
    const patch = typeof change === 'function' ? change(game.world) : change
    const next = { ...game.world, ...patch }
    await saveChanges(next, {}, { enqueue: cloudPatch ? cloudOperation('patch', cloudPatch(patch)) : undefined })
    Object.assign(game.world, patch)
    game.revision++
    if (cloudPatch) queueSync()
  })
}

export async function toggleMusic() {
  const muted = !game.muted
  game.muted = muted
  try {
    // Enqueue immediately so fast toggles are persisted in the order they occurred.
    const saved = game.ready ? updateMeta(world => ({ settings: { ...world.settings, muted } })) : Promise.resolve()
    await Promise.all([setMusic(muted), saved])
    game.audioStarted = true
  } catch (error) { notify(`音樂設定未能保存：${error.message}`) }
}

export async function toggleFavorite(schoolId) {
  try {
    let removing
    await updateMeta(world => {
      const ids = world.favoriteSchoolIds
      removing = ids.includes(schoolId)
      return { favoriteSchoolIds: removing ? ids.filter(id => id !== schoolId) : [...ids, schoolId] }
    }, patch => ({ [`dynamic/preferences/favoriteSchoolIds/${schoolId}`]: patch.favoriteSchoolIds.includes(schoolId) || null }))
    notify(removing ? '已取消收藏學校' : '已收藏學校，可在校內比賽快速選取')
  } catch (error) { notify(`收藏未儲存：${error.message}`) }
}

export async function toggleFollow(teamId) {
  try {
    let removing
    await updateMeta(world => {
      const ids = world.followedTeamIds
      removing = ids.includes(teamId)
      return { followedTeamIds: removing ? ids.filter(id => id !== teamId) : [...ids, teamId] }
    }, patch => ({ [`dynamic/preferences/followedTeamIds/${teamId}`]: patch.followedTeamIds.includes(teamId) || null }))
    notify(removing ? '已取消關注隊伍' : '隊伍已加入「我的隊伍」')
  } catch (error) { notify(`關注未儲存：${error.message}`) }
}

export async function editStudent(id, changes) {
  return transaction(async () => {
    const original = getStudent(id)
    if (!original) throw new Error('找不到學生資料')
    const student = { ...original,
      ...('nickname' in changes ? { nickname: changes.nickname.trim().slice(0, 20) } : {}),
      ...('isSchoolTeam' in changes ? { isSchoolTeam: Boolean(changes.isSchoolTeam) } : {}),
    }
    const team = getTeam(getSchool(student.schoolId).teamId)
    const memberIds = team.memberIds.filter(memberId => memberId !== id)
    if (student.isSchoolTeam) memberIds.push(id)
    const changedTeam = { ...team, memberIds }
    const patch = {}
    if (student.nickname !== original.nickname) patch[`dynamic/profiles/${id}/nickname`] = student.nickname
    if (student.isSchoolTeam !== original.isSchoolTeam) patch[`dynamic/rosters/${team.id}/${id}`] = student.isSchoolTeam || null
    await saveChanges(game.world, { students: [student], teams: [changedTeam] }, { enqueue: Object.keys(patch).length ? cloudOperation('patch', patch) : undefined })
    Object.assign(original, student)
    Object.assign(team, changedTeam)
    game.revision++
    if (Object.keys(patch).length) queueSync()
    notify('學生資料已保存')
  })
}

export async function admitStudent(input, schoolId, classId, creationId = crypto.randomUUID()) {
  validateStudentInput(input)
  const school = getSchool(schoolId), classroom = getClass(classId)
  admissionDetails(school, classroom, getStudent)
  const details = await reserveStudentSeat(school, classroom,
    reserved => admissionDetails(school, classroom, getStudent, reserved), creationId)
  try {
    return await transaction(async () => {
      const existing = getStudent(details.studentNumber)
      if (existing?.creationId === creationId) return existing
      if (existing || classroom.studentIds.length >= 50) throw new Error('班級名額已變更，請重新選擇班級。')
      const student = buildAdmittedStudent(input, school, classroom, details, creationId)
      const nextClass = { ...classroom, studentIds: [...classroom.studentIds, student.id] }
      const nextSchool = { ...school, classes: school.classes.map(cls => cls.id === classId ? nextClass : cls) }
      const team = getTeam(school.teamId)
      const nextTeam = { ...team, memberIds: student.isSchoolTeam ? [...team.memberIds, student.id] : [...team.memberIds] }
      await saveChanges(game.world, { schools: [nextSchool], students: [student], teams: [nextTeam] }, {
        enqueue: cloudOperation('student-create', { student, teamId: team.id }),
      })
      Object.assign(classroom, nextClass)
      Object.assign(team, nextTeam)
      students.set(student.id, student)
      admittedStudents.set(student.id, student)
      game.world.students.push(student)
      rankStudents(game.world)
      game.revision++
      queueSync()
      notify(`${student.name} 已加入 ${school.name} ${classroom.name}`)
      return student
    })
  } catch (error) {
    await releaseStudentSeat(classId, details.seat, creationId).catch(() => {})
    throw error
  }
}

function automaticHeatQueue(school, savedRaces = []) {
  const startedAt = savedRaces.length ? Math.min(...savedRaces.map(race => Date.parse(race.startedAt || race.finishedAt))) : Infinity
  return school.classes
    .slice()
    .sort((a, b) => a.grade - b.grade || a.number - b.number)
    .flatMap(cls => {
      const participants = savedRaces.find(race => race.classId === cls.id && race.classParticipantIds?.length)?.classParticipantIds ||
        cls.studentIds.filter(id => !getStudent(id)?.manuallyCreated || Date.parse(getStudent(id).createdAt) <= startedAt)
      return Array.from({ length: Math.ceil(participants.length / 8) }, (_, index) => ({
        classId: cls.id, heat: index + 1, totalHeats: Math.ceil(participants.length / 8),
        studentIds: participants.slice(index * 8, index * 8 + 8),
      }))
    })
}

function prepareAutomaticSchool() {
  const schoolId = autoMeet.schoolIds[autoMeet.schoolIndex]
  Object.assign(autoMeet, {
    schoolId,
    // Each school has its own session, so medals remain school/class awards.
    sessionId: `${autoMeet.runId}-${schoolId}`,
    queue: automaticHeatQueue(getSchool(schoolId)), heatIndex: 0,
  })
}

function recentAutomaticCue(at) {
  return !document.hidden && performance.timeOrigin + performance.now() - at < 750
}

function prepareAutomaticHeat(at) {
  const heat = autoMeet.queue[autoMeet.heatIndex]
  if (!heat) return
  autoMeet.athletes = heat.studentIds.map(id => {
    const student = getStudent(id)
    return { student: { ...student }, profile: createSprintProfile(student) }
  })
  autoMeet.elapsed = -3
  autoMeet.error = ''
  autoMeet.startedAt = new Date(at).toISOString()
  autoMeet.finishedAt = ''
  autoHeatEndedAt = 0
  autoMeet.phase = 'countdown'
  autoCountdownCue = 3
  if (!autoMeet.paused && recentAutomaticCue(at)) playCountdown(3)
}

function automaticMaxTime() {
  return Math.max(0, ...autoMeet.athletes.map(athlete => athlete.profile.time))
}

function automaticRunoutEnd() {
  return Math.max(0, ...autoMeet.athletes.map(athlete => athlete.profile.time + athlete.profile.runoutDuration))
}

async function advanceAutomaticMeet() {
  if (autoAdvancing || !autoMeet.active || autoMeet.paused || !['countdown', 'running'].includes(autoMeet.phase)) return
  autoAdvancing = true
  try {
    // A delayed pulse can cover several heats. Consume every interval in
    // order, awaiting each save before changing heat/class/school.
    while (autoMeet.active && !autoMeet.paused && ['countdown', 'running'].includes(autoMeet.phase)) {
      const boundary = autoMeet.phase === 'countdown'
        ? Math.min(0, Math.floor(autoMeet.elapsed) + 1)
        : autoMeet.finishedAt ? automaticRunoutEnd() : automaticMaxTime()
      const remaining = boundary - autoMeet.elapsed
      const { seconds, at } = autoClock.take(remaining)
      if (seconds === 0) break
      autoMeet.elapsed = seconds >= remaining ? boundary : autoMeet.elapsed + seconds
      if (autoMeet.phase === 'countdown') {
        const cue = Math.max(1, Math.ceil(-autoMeet.elapsed))
        if (cue !== autoCountdownCue) {
          autoCountdownCue = cue
          if (recentAutomaticCue(at)) playCountdown(cue)
        }
        if (autoMeet.elapsed >= 0) {
          autoMeet.phase = 'running'
          if (recentAutomaticCue(at)) playStartWhistle()
        }
      }
      if (autoMeet.phase === 'running' && autoMeet.elapsed >= automaticMaxTime() && !autoMeet.finishedAt) {
        autoMeet.finishedAt = new Date(at).toISOString()
      }
      if (autoMeet.phase === 'running' && autoMeet.elapsed >= automaticRunoutEnd()) {
        autoHeatEndedAt = at
        if (!await finishAutomaticHeat()) break
      }
    }
  } finally { autoAdvancing = false }
}

async function finishAutomaticHeat() {
  if (!autoMeet.active || !['running', 'saveerror'].includes(autoMeet.phase)) return false
  const runId = autoMeet.runId
  autoMeet.phase = 'saving'
  if (!autoMeet.finishedAt) autoMeet.finishedAt = new Date().toISOString()
  const heat = autoMeet.queue[autoMeet.heatIndex]
  try {
    await recordHeat({
      id: `${autoMeet.sessionId}-heat-${autoMeet.heatIndex + 1}`,
      sessionId: autoMeet.sessionId,
      schoolId: autoMeet.schoolId,
      classId: heat.classId,
      classParticipantIds: autoMeet.queue.filter(entry => entry.classId === heat.classId).flatMap(entry => entry.studentIds),
      heat: heat.heat,
      startedAt: autoMeet.startedAt,
      finishedAt: autoMeet.finishedAt,
      results: autoMeet.athletes
        .map((athlete, index) => ({ studentId: athlete.student.id, lane: index + 1, time: athlete.profile.time }))
        .sort((a, b) => a.time - b.time)
        .map((result, index) => ({ ...result, place: index + 1 })),
    })
    // A stop request may arrive while IndexedDB or cloud outbox saving is in
    // progress. Keep that completed heat, but never advance the canceled run.
    if (!autoMeet.active || autoMeet.runId !== runId) return false
    autoMeet.completedHeats++
    autoMeet.completedStudents += heat.studentIds.length
    if (heat.heat === heat.totalHeats) autoMeet.completedClasses++
    if (autoMeet.heatIndex + 1 >= autoMeet.queue.length) {
      autoMeet.completedSchools++
      if (autoMeet.schoolIndex + 1 >= autoMeet.schoolIds.length) {
        autoMeet.phase = 'complete'
        autoMeet.active = false
        autoMeet.resumeAvailable = false
        autoClock.stop()
        persistAutoMeetProgress()
        setMusicMode('ambient')
        notify(`${autoMeet.scope === 'national' ? '全國各校' : '全校'}百米賽已全部完成，成績與獎牌已保存。`)
        return true
      }
      autoMeet.schoolIndex++
      prepareAutomaticSchool()
    } else autoMeet.heatIndex++
    persistAutoMeetProgress()
    prepareAutomaticHeat(autoHeatEndedAt)
    return true
  } catch (error) {
    if (!autoMeet.active || autoMeet.runId !== runId) return false
    autoClock.pause()
    autoMeet.error = error.message || '本組成績保存失敗。'
    autoMeet.phase = 'saveerror'
    notify(`自動賽程已暫停：${autoMeet.error}`)
    return false
  }
}

function startSchoolItinerary(schoolList, scope) {
  if (relayMeet.active) { notify('大隊接力尚未結束，請先完成目前賽程。'); return false }
  if (windMeet.active) { notify('風速小子選拔賽尚未結束，請先完成目前賽程。'); return false }
  if (autoMeet.active) {
    notify('已有自動百米賽正在進行，請先完成目前賽程。')
    return false
  }
  if (!schoolList.length) { notify('目前沒有可參賽的學校。'); return false }
  // Keep only school IDs and the current school's heats, not a national
  // queue containing every student's ID. Fixed world data stays untouched.
  const totalHeats = schoolList.reduce((total, school) => total + school.classes.reduce((count, cls) => count + Math.ceil(cls.studentIds.length / 8), 0), 0)
  Object.assign(autoMeet, {
    active: true, scope, runId: `auto-${crypto.randomUUID()}`,
    schoolIds: schoolList.map(school => school.id), schoolIndex: 0,
    completedSchools: 0, completedHeats: 0, completedClasses: 0, completedStudents: 0, totalHeats,
    resumeAvailable: false,
    athletes: [], elapsed: 0, paused: false,
    speed: scope === 'national' ? 16 : 1, phase: 'countdown', startedAt: '', finishedAt: '', error: '',
  })
  setMusicMode('race')
  prepareAutomaticSchool()
  prepareAutomaticHeat(autoClock.start(autoMeet.speed))
  persistAutoMeetProgress()
  notify(scope === 'national' ? `全國 ${schoolList.length} 所學校的校內百米賽已開始，從${schoolList[0].city}出發。` : `${schoolList[0].name}全校百米賽已自動開賽。`)
  return true
}

export function startAutomaticMeet(schoolId) {
  const school = getSchool(schoolId)
  if (!school?.classes.some(cls => cls.studentIds.length)) return false
  return startSchoolItinerary([school], 'school')
}

export function startNationalAutomaticMeet() {
  if (!game.ready) return false
  const schoolList = game.world.schools.filter(school => school.classes.some(cls => cls.studentIds.length)).sort(compareSchoolOrder)
  return startSchoolItinerary(schoolList, 'national')
}

export async function terminateNationalAutomaticMeet() {
  if (!autoMeet.active || autoMeet.scope !== 'national') return false
  const cancelledRunId = autoMeet.runId
  autoClock.stop()
  Object.assign(autoMeet, {
    active: false, runId: '', schoolIds: [], schoolIndex: 0, schoolId: '', sessionId: '',
    queue: [], heatIndex: 0, completedSchools: 0, completedHeats: 0, completedClasses: 0,
    completedStudents: 0, totalHeats: 0, athletes: [], elapsed: 0, paused: false,
    phase: 'idle', startedAt: '', finishedAt: '', error: '', resumeAvailable: false,
  })
  setMusicMode('ambient')

  const cancelledRuns = new Set(game.world.cancelledAutomaticMeetRunIds || [])
  if (cancelledRunId) cancelledRuns.add(cancelledRunId)
  game.world.cancelledAutomaticMeetRunIds = [...cancelledRuns]
  game.world.autoMeetProgress = null
  try {
    await saveLocalMetaPatch({
      autoMeetProgress: null,
      cancelledAutomaticMeetRunIds: game.world.cancelledAutomaticMeetRunIds,
    })
    notify('全國百米賽程已終止；已完成的成績保留，剩餘賽程不會續跑。')
    return true
  } catch (error) {
    notify(`賽程已停止，但取消狀態無法保存到本機：${error.message}`)
    return false
  }
}

export function dismissAutomaticMeetResult() {
  if (!autoMeet.active && autoMeet.phase === 'complete') autoMeet.phase = 'idle'
}

export function toggleAutomaticMeetPause() {
  if (!autoMeet.active || !['countdown', 'running', 'saving'].includes(autoMeet.phase)) return
  if (!autoMeet.paused) { pauseAutomaticMeet(); return }
  autoMeet.paused = false
  autoClock.resume()
  persistAutoMeetProgress()
  if (autoMeet.phase === 'countdown') playCountdown(Math.max(1, Math.ceil(-autoMeet.elapsed)))
}

export function pauseAutomaticMeet() {
  if (!autoMeet.active || autoMeet.paused) return
  autoClock.pause()
  autoMeet.paused = true
  persistAutoMeetProgress()
}

export function setAutomaticMeetSpeed(speed) {
  if (!autoMeet.active || ![1, 2, 4, 8, 16].includes(speed)) return
  autoClock.setSpeed(speed)
  autoMeet.speed = speed
  persistAutoMeetProgress()
}

export async function retryAutomaticMeetSave() {
  if (!autoMeet.active || autoMeet.phase !== 'saveerror' || autoAdvancing) return
  autoAdvancing = true
  try {
    if (await finishAutomaticHeat() && autoMeet.active && !autoMeet.paused) autoClock.resume()
  } finally { autoAdvancing = false }
}

function medalsForClass(sessionId, classId, races) {
  if (game.world.awards.some(award => award.sessionId === sessionId && award.classId === classId)) return null
  const cls = getClass(classId)
  const classRaces = races.filter(race => race.sessionId === sessionId && race.classId === classId)
  const results = classRaces.flatMap(race => race.results)
  const participants = new Set(results.map(result => result.studentId))
  const expected = classRaces.find(race => race.classParticipantIds?.length)?.classParticipantIds || cls.studentIds
  if (participants.size !== expected.length || !expected.every(id => participants.has(id))) return null
  const dateTime = classRaces.reduce((latest, race) => race.finishedAt > latest ? race.finishedAt : latest, '')
  const awards = results.sort((a, b) => a.time - b.time).slice(0, 3).map((result, index) => ({
    id: `${sessionId}-${classId}-medal-${index}`, sessionId, classId, schoolId: cls.schoolId,
    studentId: result.studentId, studentName: result.name, studentNumber: result.studentNumber,
    schoolName: result.schoolName, className: result.className, classColor: result.classColor,
    year: new Date(dateTime).getFullYear(), dateTime, event: '100m',
    competition: `校內百米・${cls.name}`, type: 'individual', medal: ['金牌', '銀牌', '銅牌'][index],
    place: index + 1, time: result.time,
  }))
  const team = getTeam(getSchool(cls.schoolId).teamId)
  const teamAwards = awards.filter(award => team.memberIds.includes(award.studentId)).map(award => award.id)
  return { awards, team, nextTeam: { ...team, awardIds: [...new Set([...team.awardIds, ...teamAwards])] } }
}

function applyMedals(medals) {
  if (!medals) return
  game.world.awards.push(...medals.awards)
  Object.assign(medals.team, medals.nextTeam)
}

export async function recordHeat({ id, sessionId, schoolId, classId = null, classIds = [], classParticipantIds = [], teamId = null, mode = 'class', windMatchId = null, regionMatchId = null, nationalMatchId = null, heat, results, startedAt, finishedAt = new Date().toISOString() }) {
  return transaction(async () => {
    const existing = game.world.races.find(race => race.id === id)
    if (existing) return existing
    const cls = classId ? getClass(classId) : null
    const team = teamId ? getTeam(teamId) : null
    const school = getSchool(schoolId)
    const crossClass = ['wind-selection', 'wind-practice'].includes(mode)
    const regional = mode === 'regional'
    const championship = mode === 'national-championship'
    const savedMeet = windMatchId && game.world.windMeets.find(meet => meet.id === sessionId)
    const savedRegion = regionMatchId && game.world.regionMeets.find(meet => meet.id === sessionId)
    const savedNational = nationalMatchId && game.world.nationalMeets.find(meet => meet.id === sessionId)
    const match = (savedMeet || savedRegion || savedNational) && nextWindMatch(savedNational || savedRegion || savedMeet)
    const teamFlag = team && ({ school: 'isSchoolTeam', city: 'isCityTeam', national: 'isNationalTeam' }[team.type])
    const invalidParticipant = result => {
      const student = getStudent(result.studentId)
      return !student || (team
        ? !team.memberIds.includes(student.id) || !teamFlag || !student[teamFlag]
        : championship ? !match?.studentIds.includes(student.id) || !savedNational?.cities.includes(normalizeRegion(getSchool(student.schoolId)?.city))
          : regional ? !match?.studentIds.includes(student.id) || normalizeRegion(getSchool(student.schoolId)?.city) !== savedRegion?.city
          : crossClass ? student.schoolId !== schoolId || !classIds.includes(student.classId) : !cls?.studentIds.includes(student.id))
    }
    if (!school || (teamId ? !team : championship ? !savedNational || savedNational.friendly || savedNational.schoolIds[0] !== schoolId || match?.id !== nationalMatchId
      : regional ? !savedRegion || savedRegion.friendly || savedRegion.schoolIds[0] !== schoolId || match?.id !== regionMatchId
      : crossClass ? !classIds.length || classIds.some(id => getClass(id)?.schoolId !== schoolId) : !cls || cls.schoolId !== schoolId) ||
      (mode === 'wind-selection' && (!savedMeet || savedMeet.schoolId !== schoolId || match?.id !== windMatchId)) || !results.length || results.length > 8 ||
      new Set(results.map(result => result.studentId)).size !== results.length ||
      results.some(result => invalidParticipant(result) || !Number.isFinite(result.time) || result.time < 10)) {
      throw new Error('本組成績資料不完整，無法保存。')
    }
    const race = {
      id, sessionId, schoolId, classId: cls?.id ?? null, teamId: team?.id ?? null, teamName: team?.name ?? null,
      schoolName: school.name, className: championship ? savedNational.eventName : regional ? savedRegion.eventName : team ? `${team.name} 隊內賽` : crossClass ? classIds.map(id => getClass(id).name).join(' vs. ') : cls.name,
      classColor: cls?.color ?? null,
      ...(classParticipantIds.length ? { classParticipantIds: [...new Set(classParticipantIds)] } : {}),
      heat, event: '100m', mode, classIds, ...(championship ? { nationalMatchId, cities: match.cities, schoolIds: match.schoolIds, round: match.round }
        : regional ? { regionMatchId, city: savedRegion.city, schoolIds: match.schoolIds, round: match.round }
        : match ? { windMatchId, grade: match.grade, round: match.round } : {}), startedAt, finishedAt, syncStatus: 'pending',
      results: results.map(result => {
        const student = getStudent(result.studentId)
        const previousBest100 = Number.isFinite(student.best100) && student.best100 > 0 ? student.best100 : null
        return { ...result, name: student.name, nickname: student.nickname, gender: student.gender,
          height: student.height, weight: student.weight, studentNumber: student.studentNumber,
          personalBest: previousBest100 === null || result.time < previousBest100, previousBest100,
          schoolId: student.schoolId, classId: student.classId, grade: student.grade,
          className: getClass(student.classId).name, classColor: getClass(student.classId).color,
          schoolName: getSchool(student.schoolId).name, city: normalizeRegion(getSchool(student.schoolId).city), dateTime: finishedAt }
      }).sort((a, b) => a.time - b.time || a.lane - b.lane).map((result, index) => ({ ...result, place: index + 1 })),
    }
    const changed = results.map(result => {
      const student = getStudent(result.studentId)
      return { ...student, best100: Number.isFinite(student.best100) && student.best100 > 0 ? Math.min(student.best100, result.time) : result.time }
    })
    const rankingChanged = changed.some(student => Math.round(studentTime(student) * 100) !== Math.round(studentTime(getStudent(student.id)) * 100))
    const medals = team || crossClass || regional || championship ? null : medalsForClass(sessionId, classId, [...game.world.races, race])
    const nextMeet = savedMeet ? completeWindMatch(savedMeet, windMatchId, race.results, finishedAt) : null
    const nextRegion = savedRegion ? completeRegionalMatch(savedRegion, regionMatchId, race.results, finishedAt) : null
    const nextNational = savedNational ? completeNationalMatch(savedNational, nationalMatchId, race.results, finishedAt) : null
    const nextGod = nextNational?.grades[0].champion || null
    const nextPrince = nextRegion?.grades[0].champion || null
    const nextChampion = nextMeet?.grades.find(group => group.grade === match.grade)?.champion || null
    const nextWorld = nextGod ? { ...game.world, nationalChampion: nextGod, nationalHonors: { ...game.world.nationalHonors } }
      : nextPrince ? { ...game.world, regionChampions: { ...game.world.regionChampions, [nextPrince.city]: nextPrince } }
      : nextChampion ? { ...game.world, windChampions: {
      ...game.world.windChampions, [schoolId]: { ...game.world.windChampions[schoolId], [nextChampion.grade]: nextChampion },
    } } : game.world
    if (nextGod) for (const honor of nextNational.grades[0].podium) {
      nextWorld.nationalHonors[honor.studentId] = [...(nextWorld.nationalHonors[honor.studentId] || []).filter(saved => saved.meetId !== honor.meetId), honor]
    }
    // Class races may award class medals; team races only update personal bests.
    await saveChanges(nextWorld, {
      students: changed, races: [race],
      ...(nextMeet ? { windMeets: [nextMeet] } : {}),
      ...(nextRegion ? { regionMeets: [nextRegion] } : {}),
      ...(nextNational ? { nationalMeets: [nextNational] } : {}),
      ...(medals ? { awards: medals.awards, teams: [medals.nextTeam] } : {}),
    }, { enqueue: cloudOperation('heat', {
      race,
      students: changed.map(({ id, schoolId, classId, grade, baseline100, best100 }) => ({ id, schoolId, classId, grade, baseline100, best100 })),
      awards: medals?.awards || [], teamId: getSchool(schoolId).teamId,
      teamAwardIds: medals ? medals.nextTeam.awardIds.filter(id => !medals.team.awardIds.includes(id)) : [],
      ...(nextMeet ? { windMeet: nextMeet } : {}), ...(nextChampion ? { windChampion: nextChampion } : {}),
      ...(nextRegion ? { regionMeet: nextRegion } : {}), ...(nextPrince ? { regionChampion: nextPrince } : {}),
      ...(nextNational ? { nationalMeet: nextNational } : {}), ...(nextGod ? { nationalChampion: nextGod } : {}),
    }) })
    for (const student of changed) Object.assign(getStudent(student.id), student)
    game.world.races.push(race)
    if (nextMeet) game.world.windMeets[game.world.windMeets.findIndex(meet => meet.id === nextMeet.id)] = nextMeet
    if (nextChampion) game.world.windChampions = nextWorld.windChampions
    if (nextRegion) game.world.regionMeets[game.world.regionMeets.findIndex(meet => meet.id === nextRegion.id)] = nextRegion
    if (nextPrince) game.world.regionChampions = nextWorld.regionChampions
    if (nextNational) game.world.nationalMeets[game.world.nationalMeets.findIndex(meet => meet.id === nextNational.id)] = nextNational
    if (nextGod) { game.world.nationalChampion = nextGod; game.world.nationalHonors = nextWorld.nationalHonors }
    applyMedals(medals)
    if (rankingChanged) rankStudents(game.world)
    game.revision++
    queueSync()
    return race
  })
}

export async function createSchoolWindMeet(schoolId, { id, nationalRunId } = {}) {
  return transaction(async () => {
    const nationalCurrent = nationalRunId && windMeet.active && windMeet.scope === 'national' && windMeet.runId === nationalRunId
    if (relayMeet.active || autoMeet.active || (windMeet.active && !nationalCurrent) || (nationalRunId && !nationalCurrent)) throw new Error('請先完成目前的自動賽程。')
    const existing = id && game.world.windMeets.find(meet => meet.id === id)
    if (existing) return existing
    const school = getSchool(schoolId)
    if (!school) throw new Error('請先選擇學校。')
    const meet = { ...createWindMeet(school, getStudent, id), ...(nationalRunId ? { nationalRunId } : {}) }
    await saveChanges(game.world, { windMeets: [meet] }, { enqueue: cloudOperation('patch', {
      [`dynamic/windMeets/${schoolId}/${meet.id}`]: meet,
    }) })
    game.world.windMeets.push(meet)
    game.revision++
    queueSync()
    return meet
  })
}

export async function createSchoolRelayMeet(schoolId, classIds = [], { id, nationalRunId } = {}) {
  return transaction(async () => {
    const nationalCurrent = nationalRunId && relayMeet.active && relayMeet.scope === 'national' && relayMeet.runId === nationalRunId
    if (autoMeet.active || windMeet.active || (relayMeet.active && !nationalCurrent) || (nationalRunId && !nationalCurrent)) throw new Error('請先完成目前的自動賽程。')
    const existing = id && game.world.relayMeets.find(meet => meet.id === id)
    if (existing) return existing
    const school = getSchool(schoolId)
    if (!school) throw new Error('請先選擇學校。')
    const ids = new Set(classIds)
    if (ids.size && (ids.size < 2 || ids.size > 8)) throw new Error('友誼接力請選擇 2～8 個班級。')
    if ([...ids].some(id => getClass(id)?.schoolId !== schoolId)) throw new Error('請選擇同一所學校的班級。')
    const saved = new Map(game.world.relayLineups.map(lineup => [lineup.classId, lineup]))
    const lineups = school.classes.filter(cls => !ids.size || ids.has(cls.id))
      .map(cls => prepareRelayLineup(cls, getStudent, saved.get(cls.id)))
    const meet = createRelayMeet(school, lineups, [...ids], { id, nationalRunId })
    const patch = Object.fromEntries(lineups.map(lineup => [`dynamic/relayLineups/${lineup.classId}`, lineup]))
    if (!meet.friendly) patch[`dynamic/relayMeets/${schoolId}/${meet.id}`] = meet
    await saveChanges(game.world, { relayLineups: lineups, relayMeets: meet.friendly ? [] : [meet] },
      { enqueue: cloudOperation('patch', patch) })
    for (const lineup of lineups) {
      const index = game.world.relayLineups.findIndex(saved => saved.id === lineup.id)
      if (index < 0) game.world.relayLineups.push(lineup)
      else game.world.relayLineups[index] = lineup
    }
    if (!meet.friendly) game.world.relayMeets.push(meet)
    game.revision++
    queueSync()
    return meet
  })
}

async function recordRelayMatch(meet, match, results, startedAt, finishedAt) {
  return transaction(async () => {
    const saved = game.world.relayMeets.find(value => value.id === meet.id) || meet
    if (game.world.relayRaces.some(race => race.id === match.id)) return saved
    const next = completeRelayMatch(saved, match.id, results, finishedAt)
    const officialResults = next.rounds.flatMap(round => round.matches).find(value => value.id === match.id).results
    const race = { id: match.id, mode: 'relay', meetId: meet.id, relayMatchId: match.id,
      schoolId: meet.schoolId, round: match.round, number: match.number,
      startedAt, finishedAt, results: officialResults, syncStatus: 'pending' }
    const champion = next.status === 'complete' && next.champion ? {
      schoolId: meet.schoolId, classId: next.champion.classId, className: next.champion.className,
      meetId: meet.id, time: next.champion.time, title: '風速小班',
      awardedAt: finishedAt, awardedAtMs: Date.parse(finishedAt),
    } : null
    const champions = { ...game.world.relayChampions }
    const previous = champions[meet.schoolId]
    if (champion && (!previous || champion.awardedAtMs >= previous.awardedAtMs)) champions[meet.schoolId] = champion
    await saveChanges({ ...game.world, relayChampions: champions }, { relayMeets: [next], relayRaces: [race] },
      { enqueue: cloudOperation('relay', { meet: next, race, ...(champion ? { champion } : {}) }) })
    const index = game.world.relayMeets.findIndex(value => value.id === meet.id)
    if (index < 0) game.world.relayMeets.push(next)
    else game.world.relayMeets[index] = next
    game.world.relayRaces.push(race)
    game.world.relayChampions = champions
    game.revision++
    queueSync()
    return next
  })
}

async function recordWindMatch(meet, match, results, startedAt, finishedAt) {
  await recordHeat({ id: match.id, sessionId: meet.id, schoolId: meet.schoolId, classIds: match.classIds,
    mode: 'wind-selection', windMatchId: match.id, heat: meet.completedMatches + 1, results, startedAt, finishedAt })
  return game.world.windMeets.find(saved => saved.id === meet.id)
}

export async function createRegionMeet(city, schoolIds = []) {
  return transaction(async () => {
    if (relayMeet.active || autoMeet.active || windMeet.active) throw new Error('請先完成或終止目前的自動賽程。')
    const selected = new Set(schoolIds)
    const eligible = game.world.schools.filter(school => normalizeRegion(school.city) === normalizeRegion(city) && (!selected.size || selected.has(school.id)))
    const meet = createRegionalMeet(city, eligible, getStudent, game.world.windChampions, getClass, { friendly: selected.size > 0 })
    if (!meet.friendly) {
      await saveChanges(game.world, { regionMeets: [meet] }, { enqueue: cloudOperation('patch', {
        [`dynamic/regionMeets/${meet.city}/${meet.id}`]: meet,
      }) })
      game.world.regionMeets.push(meet)
      game.revision++
      queueSync()
    }
    return meet
  })
}

async function recordRegionalMatch(meet, match, results, startedAt, finishedAt) {
  await recordHeat({ id: match.id, sessionId: meet.id, schoolId: meet.schoolIds[0], classIds: match.classIds,
    mode: 'regional', regionMatchId: match.id, heat: meet.completedMatches + 1, results, startedAt, finishedAt })
  return game.world.regionMeets.find(saved => saved.id === meet.id)
}

export async function createNationalMeet(cities, { friendly = false } = {}) {
  return transaction(async () => {
    if (relayMeet.active || autoMeet.active || windMeet.active) throw new Error('請先完成目前的自動賽程。')
    const meet = createNationalChampionship(cities, game.world.regionMeets, getStudent, { friendly, getSchool })
    if (!friendly) {
      await saveChanges(game.world, { nationalMeets: [meet] }, { enqueue: cloudOperation('patch', {
        [`dynamic/nationalMeets/${meet.id}`]: meet,
      }) })
      game.world.nationalMeets.push(meet)
      game.revision++
      queueSync()
    }
    return meet
  })
}

async function recordNationalMatch(meet, match, results, startedAt, finishedAt) {
  await recordHeat({ id: match.id, sessionId: meet.id, schoolId: meet.schoolIds[0], classIds: match.classIds,
    mode: 'national-championship', nationalMatchId: match.id, heat: meet.completedMatches + 1, results, startedAt, finishedAt })
  return game.world.nationalMeets.find(saved => saved.id === meet.id)
}

async function saveWindPause(meetId, paused) {
  return transaction(async () => {
    const meet = game.world.windMeets.find(saved => saved.id === meetId) || game.world.regionMeets.find(saved => saved.id === meetId) || game.world.nationalMeets.find(saved => saved.id === meetId)
    if (!meet || meet.status !== 'running') return
    const next = { ...meet, paused }
    const regional = meet.kind === 'regional'
    const national = meet.kind === 'national-championship'
    const table = national ? 'nationalMeets' : regional ? 'regionMeets' : 'windMeets'
    await saveChanges(game.world, { [table]: [next] }, { enqueue: cloudOperation('patch', {
      [national ? `dynamic/nationalMeets/${meet.id}` : regional ? `dynamic/regionMeets/${meet.city}/${meet.id}` : `dynamic/windMeets/${meet.schoolId}/${meet.id}`]: next,
    }) })
    const collection = game.world[table]
    collection[collection.indexOf(meet)] = next
    game.revision++
    queueSync()
  })
}

export async function awardClass(sessionId, classId) {
  return transaction(async () => {
    const medals = medalsForClass(sessionId, classId, game.world.races)
    if (!medals) return
    const patch = {}
    for (const award of medals.awards) patch[`dynamic/awards/${award.schoolId}/${award.id}`] = award
    for (const id of medals.nextTeam.awardIds) patch[`dynamic/teamAwards/${medals.team.id}/${id}`] = true
    await saveChanges(game.world, { awards: medals.awards, teams: [medals.nextTeam] }, { enqueue: cloudOperation('patch', patch) })
    applyMedals(medals)
    game.revision++
    queueSync()
  })
}

export async function downloadSave() {
  if (game.exportBusy || !game.ready) return
  game.exportBusy = true
  try {
    const size = await transaction(() => exportWorld(game.world), false)
    notify(`完整 JSON 已匯出（${(size / 1024 / 1024).toFixed(1)} MB）`)
  } catch (error) { notify(`匯出失敗：${error.message}`) }
  finally { game.exportBusy = false }
}
