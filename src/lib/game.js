import { shallowReactive } from 'vue'
import { saveChanges, exportWorld } from './storage.js'
import { rankStudents } from './generator.js'
import { setMusic } from './audio.js'

export const game = shallowReactive({
  world: null, ready: false, progress: 0, phase: '準備你的田徑世界', error: '',
  revision: 0, tab: 'home', schoolId: '', studentId: '', toast: '', busy: false,
  saving: false, muted: false, audioStarted: false, exportBusy: false,
})
let students = new Map(), schools = new Map(), classes = new Map(), teams = new Map()
let toastTimer, mutationQueue = Promise.resolve()

export function notify(message) {
  game.toast = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { game.toast = '' }, 4200)
}

export async function initialize() {
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
    worker.onmessage = event => {
      const data = event.data
      if (data.type === 'progress') {
        game.phase = data.phase
        game.progress = Math.min(100, Math.round(data.progress <= 1 ? data.progress * 100 : data.progress))
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

async function updateMeta(change) {
  return transaction(async () => {
    const patch = typeof change === 'function' ? change(game.world) : change
    const next = { ...game.world, ...patch }
    await saveChanges(next)
    Object.assign(game.world, patch)
    game.revision++
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
    })
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
    })
    notify(removing ? '已取消關注隊伍' : '隊伍已加入「我的隊伍」')
  } catch (error) { notify(`關注未儲存：${error.message}`) }
}

export async function editStudent(id, nickname, isSchoolTeam) {
  return transaction(async () => {
    const original = getStudent(id)
    if (!original) throw new Error('找不到學生資料')
    const student = { ...original, nickname: nickname.trim().slice(0, 20), isSchoolTeam: Boolean(isSchoolTeam) }
    const team = getTeam(getSchool(student.schoolId).teamId)
    const memberIds = team.memberIds.filter(memberId => memberId !== id)
    if (student.isSchoolTeam) memberIds.push(id)
    const changedTeam = { ...team, memberIds }
    await saveChanges(game.world, { students: [student], teams: [changedTeam] })
    Object.assign(original, student)
    Object.assign(team, changedTeam)
    game.revision++
    notify('學生資料已保存')
  })
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
    })
    for (const student of changed) Object.assign(getStudent(student.id), student)
    game.world.races.push(race)
    applyMedals(medals)
    if (rankingChanged) rankStudents(game.world)
    game.revision++
    return race
  })
}

export async function awardClass(sessionId, classId) {
  return transaction(async () => {
    const medals = medalsForClass(sessionId, classId, game.world.races)
    if (!medals) return
    await saveChanges(game.world, { awards: medals.awards, teams: [medals.nextTeam] })
    applyMedals(medals)
    game.revision++
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
