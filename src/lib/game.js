import { reactive, shallowReactive } from 'vue'
import { saveChanges, exportWorld, pendingOperations } from './storage.js'
import { cloudOperation, installCloudSync, queueSync, restoreCloud, retryCloudSync } from './cloud.js'
import { flagIds } from './cloud-schema.js'
import { rankStudents } from './generator.js'
import { createSprintProfile } from './physics.js'
import { playCountdown, playStartWhistle, setMusic, setMusicMode } from './audio.js'
import { compareSchoolOrder } from './school-order.js'

export const game = shallowReactive({
  world: null, ready: false, progress: 0, phase: '準備你的田徑世界', error: '',
  revision: 0, tab: 'home', schoolId: '', studentId: '', nationalRanking: false, toast: '', busy: false,
  saving: false, muted: false, audioStarted: false, exportBusy: false, navigationRevision: 0,
})
let students = new Map(), schools = new Map(), classes = new Map(), teams = new Map()
let toastTimer, mutationQueue = Promise.resolve()
let initializationStarted = false

// This controller deliberately lives outside RaceView. Both automatic modes
// keep running while the player reads schools, teams, or returns home.
export const autoMeet = reactive({
  active: false, schoolId: '', sessionId: '', queue: [], heatIndex: 0,
  scope: 'school', runId: '', schoolIds: [], schoolIndex: 0,
  completedSchools: 0, completedHeats: 0, completedClasses: 0, completedStudents: 0, totalHeats: 0,
  phase: 'idle', athletes: [], elapsed: 0, paused: false, speed: 1,
  startedAt: '', finishedAt: '', error: '',
})
let autoFrame = 0, autoPreviousTimestamp = 0, autoCountdownCue = 0

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
        for (const student of world.students) students.set(student.id, student)
        schools = new Map(world.schools.map(school => [school.id, school]))
        teams = new Map(world.teams.map(team => [team.id, team]))
        classes = new Map()
        for (const school of world.schools) for (const cls of school.classes) classes.set(cls.id, cls)
        game.world = world
        installCloudSync(() => game.world, mergeCloudData)
        // Existing local data is usable immediately, even with an offline
        // backlog or a long first upload. The outbox preserves new edits.
        void retryCloudSync()
        game.muted = world.settings?.muted ?? false
        if (game.audioStarted) setMusic(game.muted).catch(() => {})
        game.ready = true
        game.phase = '全國資料已就緒'
        game.revision++
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

export const getStudent = id => students.get(id)
export const getSchool = id => schools.get(id)
export const getClass = id => classes.get(id)
export const getTeam = id => teams.get(id)
export const timeText = time => Number.isFinite(time) ? time.toFixed(2) : '—'
export const dateText = value => new Date(value).toLocaleString('zh-TW', { hour12: false })
export const studentTime = student => Number.isFinite(student.best100) && student.best100 > 0 ? student.best100 : student.baseline100

export function go(tab, schoolId = '') {
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
    const patches = Object.assign({}, ...pending.filter(operation => operation.type === 'patch').map(operation => operation.payload))
    const changed = new Map()
    const changedTeams = new Map()
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
      if (student.isSchoolTeam !== getStudent(student.id).isSchoolTeam) {
        const next = changedTeams.get(team.id) || { ...team, memberIds: [...team.memberIds] }
        next.memberIds = next.memberIds.filter(id => id !== student.id)
        if (student.isSchoolTeam) next.memberIds.push(student.id)
        changedTeams.set(team.id, next)
      }
    }
    const meta = {}
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
    await saveChanges({ ...game.world, ...meta }, { students: [...changed.values()], teams: [...changedTeams.values()], races: newRaces, awards: newAwards },
      { acknowledge: update.acknowledge, cache: update.cache })
    Object.assign(game.world, meta)
    for (const student of changed.values()) Object.assign(getStudent(student.id), student)
    for (const team of changedTeams.values()) Object.assign(getTeam(team.id), team)
    game.world.races.push(...newRaces)
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

function automaticHeatQueue(school) {
  return school.classes
    .slice()
    .sort((a, b) => a.grade - b.grade || a.number - b.number)
    .flatMap(cls => Array.from({ length: Math.ceil(cls.studentIds.length / 8) }, (_, index) => ({
      classId: cls.id,
      heat: index + 1,
      totalHeats: Math.ceil(cls.studentIds.length / 8),
      studentIds: cls.studentIds.slice(index * 8, index * 8 + 8),
    })))
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

function prepareAutomaticHeat() {
  const heat = autoMeet.queue[autoMeet.heatIndex]
  if (!heat) return
  autoMeet.athletes = heat.studentIds.map(id => {
    const student = getStudent(id)
    return { student: { ...student }, profile: createSprintProfile(student) }
  })
  autoMeet.elapsed = -3
  autoMeet.error = ''
  autoMeet.startedAt = new Date().toISOString()
  autoMeet.finishedAt = ''
  autoMeet.phase = 'countdown'
  autoCountdownCue = 3
  if (!autoMeet.paused) playCountdown(3)
}

function automaticMaxTime() {
  return Math.max(0, ...autoMeet.athletes.map(athlete => athlete.profile.time))
}

function automaticRunoutEnd() {
  return Math.max(0, ...autoMeet.athletes.map(athlete => athlete.profile.time + athlete.profile.runoutDuration))
}

function beginAutomaticLoop() {
  cancelAnimationFrame(autoFrame)
  autoPreviousTimestamp = 0
  autoFrame = requestAnimationFrame(tickAutomaticMeet)
}

function tickAutomaticMeet(timestamp) {
  if (!autoMeet.active || autoMeet.phase === 'saveerror') return
  if (!autoPreviousTimestamp) autoPreviousTimestamp = timestamp
  const delta = Math.min((timestamp - autoPreviousTimestamp) / 1000, 0.1)
  autoPreviousTimestamp = timestamp
  if (autoMeet.paused) {
    autoFrame = requestAnimationFrame(tickAutomaticMeet)
    return
  }
  autoMeet.elapsed += delta * autoMeet.speed

  if (autoMeet.phase === 'countdown') {
    const cue = Math.max(1, Math.ceil(-autoMeet.elapsed))
    if (cue !== autoCountdownCue) { autoCountdownCue = cue; playCountdown(cue) }
    if (autoMeet.elapsed >= 0) {
      autoMeet.phase = 'running'
      playStartWhistle()
    }
  }
  if (autoMeet.phase === 'running' && autoMeet.elapsed >= automaticMaxTime() && !autoMeet.finishedAt) {
    autoMeet.finishedAt = new Date().toISOString()
  }
  if (autoMeet.phase === 'running' && autoMeet.elapsed >= automaticRunoutEnd()) {
    autoMeet.elapsed = automaticRunoutEnd()
    finishAutomaticHeat()
    return
  }
  autoFrame = requestAnimationFrame(tickAutomaticMeet)
}

async function finishAutomaticHeat() {
  if (!autoMeet.active || autoMeet.phase !== 'running') return
  cancelAnimationFrame(autoFrame)
  autoMeet.phase = 'saving'
  if (!autoMeet.finishedAt) autoMeet.finishedAt = new Date().toISOString()
  const heat = autoMeet.queue[autoMeet.heatIndex]
  try {
    await recordHeat({
      id: `${autoMeet.sessionId}-heat-${autoMeet.heatIndex + 1}`,
      sessionId: autoMeet.sessionId,
      schoolId: autoMeet.schoolId,
      classId: heat.classId,
      heat: heat.heat,
      startedAt: autoMeet.startedAt,
      finishedAt: autoMeet.finishedAt,
      results: autoMeet.athletes
        .map((athlete, index) => ({ studentId: athlete.student.id, lane: index + 1, time: athlete.profile.time }))
        .sort((a, b) => a.time - b.time)
        .map((result, index) => ({ ...result, place: index + 1 })),
    })
    autoMeet.completedHeats++
    autoMeet.completedStudents += heat.studentIds.length
    if (heat.heat === heat.totalHeats) autoMeet.completedClasses++
    if (autoMeet.heatIndex + 1 >= autoMeet.queue.length) {
      autoMeet.completedSchools++
      if (autoMeet.schoolIndex + 1 >= autoMeet.schoolIds.length) {
        autoMeet.phase = 'complete'
        autoMeet.active = false
        setMusicMode('ambient')
        notify(`${autoMeet.scope === 'national' ? '全國各校' : '全校'}百米賽已全部完成，成績與獎牌已保存。`)
        return
      }
      autoMeet.schoolIndex++
      prepareAutomaticSchool()
    } else autoMeet.heatIndex++
    prepareAutomaticHeat()
    beginAutomaticLoop()
  } catch (error) {
    autoMeet.error = error.message || '本組成績保存失敗。'
    autoMeet.phase = 'saveerror'
    notify(`自動賽程已暫停：${autoMeet.error}`)
  }
}

function startSchoolItinerary(schoolList, scope) {
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
    athletes: [], elapsed: 0, paused: false,
    speed: 1, phase: 'countdown', startedAt: '', finishedAt: '', error: '',
  })
  setMusicMode('race')
  prepareAutomaticSchool()
  prepareAutomaticHeat()
  beginAutomaticLoop()
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

export function dismissAutomaticMeetResult() {
  if (!autoMeet.active && autoMeet.phase === 'complete') autoMeet.phase = 'idle'
}

export function toggleAutomaticMeetPause() {
  if (!autoMeet.active || !['countdown', 'running', 'saving'].includes(autoMeet.phase)) return
  autoMeet.paused = !autoMeet.paused
  if (!autoMeet.paused && autoMeet.phase === 'countdown') playCountdown(Math.max(1, Math.ceil(-autoMeet.elapsed)))
}

export function setAutomaticMeetSpeed(speed) {
  if (!autoMeet.active || ![1, 2, 4].includes(speed)) return
  autoMeet.speed = speed
}

export function retryAutomaticMeetSave() {
  if (autoMeet.active && autoMeet.phase === 'saveerror') {
    autoMeet.phase = 'running'
    finishAutomaticHeat()
  }
}

function medalsForClass(sessionId, classId, races) {
  if (game.world.awards.some(award => award.sessionId === sessionId && award.classId === classId)) return null
  const cls = getClass(classId)
  const classRaces = races.filter(race => race.sessionId === sessionId && race.classId === classId)
  const results = classRaces.flatMap(race => race.results)
  const participants = new Set(results.map(result => result.studentId))
  if (participants.size !== cls.studentIds.length || !cls.studentIds.every(id => participants.has(id))) return null
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

export async function recordHeat({ id, sessionId, schoolId, classId, heat, results, startedAt, finishedAt = new Date().toISOString() }) {
  return transaction(async () => {
    const existing = game.world.races.find(race => race.id === id)
    if (existing) return existing
    const cls = getClass(classId)
    if (!cls || cls.schoolId !== schoolId || !results.length || results.length > 8 ||
      new Set(results.map(result => result.studentId)).size !== results.length ||
      results.some(result => !cls.studentIds.includes(result.studentId) || !Number.isFinite(result.time) || result.time < 10)) {
      throw new Error('本組成績資料不完整，無法保存。')
    }
    const race = {
      id, sessionId, schoolId, classId, schoolName: getSchool(schoolId).name, className: cls.name,
      classColor: cls.color,
      heat, event: '100m', startedAt, finishedAt,
      results: results.map(result => {
        const student = getStudent(result.studentId)
        return { ...result, name: student.name, nickname: student.nickname, gender: student.gender,
          height: student.height, weight: student.weight, studentNumber: student.studentNumber,
          className: getClass(student.classId).name, classColor: getClass(student.classId).color,
          schoolName: getSchool(student.schoolId).name, dateTime: finishedAt }
      }).sort((a, b) => a.time - b.time).map((result, index) => ({ ...result, place: index + 1 })),
    }
    const changed = results.map(result => {
      const student = getStudent(result.studentId)
      return { ...student, best100: Number.isFinite(student.best100) && student.best100 > 0 ? Math.min(student.best100, result.time) : result.time }
    })
    const rankingChanged = changed.some(student => Math.round(studentTime(student) * 100) !== Math.round(studentTime(getStudent(student.id)) * 100))
    const medals = medalsForClass(sessionId, classId, [...game.world.races, race])
    // Finishing the class commits its heat, personal bests and medals together.
    await saveChanges(game.world, {
      students: changed, races: [race],
      ...(medals ? { awards: medals.awards, teams: [medals.nextTeam] } : {}),
    }, { enqueue: cloudOperation('heat', {
      race,
      students: changed.map(({ id, schoolId, classId, grade, baseline100, best100 }) => ({ id, schoolId, classId, grade, baseline100, best100 })),
      awards: medals?.awards || [], teamId: getSchool(schoolId).teamId,
      teamAwardIds: medals ? medals.nextTeam.awardIds.filter(id => !medals.team.awardIds.includes(id)) : [],
    }) })
    for (const student of changed) Object.assign(getStudent(student.id), student)
    game.world.races.push(race)
    applyMedals(medals)
    if (rankingChanged) rankStudents(game.world)
    game.revision++
    queueSync()
    return race
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
