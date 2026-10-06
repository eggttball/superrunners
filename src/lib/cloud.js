import { shallowReactive } from 'vue'
import { auth, ADMIN_EMAIL } from './auth.js'
import { databaseURL } from './firebase.js'
import { pendingOperations } from './storage.js'
import { CLOUD_SCHEMA, emptyDynamicStudent, flagIds, idFlags, putScores, schoolUpload, sortedScores, staticMetadata, values, worldIdentity } from './cloud-schema.js'

export const syncState = shallowReactive({ ready: false, busy: false, pending: 0, error: '', phase: '', progress: 0 })
let context, drain, retryTimer, mergeLocal, currentWorld
let operationSequence = 0
let localGeneration = 0, syncRequested = false
const inFlightReads = new Map()

function requireAccount() {
  const user = auth.currentUser
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) throw new Error('請先登入管理者帳號。')
  if (!databaseURL) throw new Error('尚未設定 Realtime Database 網址。')
  return user
}

// REST deliberately performs a server read: an SDK cache hit must not be shown
// as a fresh cloud ranking. Tokens stay in requests and never enter stored data.
async function request(path, { method = 'GET', data, query = {}, headers = {}, etag = false } = {}, refresh = false) {
  const user = requireAccount()
  const token = await user.getIdToken(refresh)
  const url = new URL(`${databaseURL.replace(/\/$/, '')}/${path}.json`)
  url.searchParams.set('auth', token)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, JSON.stringify(value))
  if (method !== 'GET') url.searchParams.set('print', 'silent')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  let response
  try {
    response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers,
      ...(etag ? { 'X-Firebase-ETag': 'true' } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: controller.signal, cache: 'no-store' })
  } catch {
    throw new Error('無法連線至雲端，資料已保留在本機，可稍後重試。')
  } finally { clearTimeout(timeout) }
  if (auth.currentUser?.uid !== user.uid) throw new Error('登入狀態已改變，已停止同步。')
  if (response.status === 401 && !refresh) return request(path, { method, data, query, headers, etag }, true)
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403
      ? '雲端拒絕存取，請確認資料庫規則與管理者權限。'
      : response.status === 412 ? '雲端資料已變更，請重試。' : `雲端請求失敗（${response.status}）。`)
    error.status = response.status
    throw error
  }
  const result = response.status === 204 ? null : await response.json()
  return etag ? { value: result, etag: response.headers.get('ETag') } : result
}

function rootPath() {
  const user = requireAccount()
  if (!context || user.uid !== context.uid) throw new Error('雲端世界尚未連接。')
  return `users/${context.uid}/worlds/${context.worldId}`
}

function progress(phase, value) {
  syncState.phase = phase
  syncState.progress = Math.round(value * 100)
}

function grouped(records, key) {
  const groups = new Map()
  for (const record of records) {
    const id = record[key]
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(record)
  }
  return groups
}

export async function connectCloud(world) {
  syncState.ready = false
  const user = requireAccount()
  const worldId = await worldIdentity(world)
  if (world.cloudBinding && (world.cloudBinding.uid !== user.uid || world.cloudBinding.worldId !== worldId || world.cloudBinding.databaseURL !== databaseURL)) {
    throw new Error('本機存檔連結到另一個帳號或雲端世界；已停止上傳，保留原始資料。')
  }
  context = { uid: user.uid, worldId, databaseURL }
  const path = `users/${user.uid}/manifest`
  progress('確認雲端世界', 0)
  let manifest = await request(path)
  if (!manifest) {
    const candidate = { worldId, schemaVersion: CLOUD_SCHEMA, state: 'uploading', schoolCount: world.schools.length, studentCount: world.students.length }
    try { await request(path, { method: 'PUT', data: candidate, headers: { 'if-match': 'null_etag' } }); manifest = candidate }
    catch (error) { if (error.status !== 412) throw error; manifest = await request(path) }
  }
  if (manifest.schemaVersion !== CLOUD_SCHEMA || manifest.worldId !== worldId) {
    throw new Error('雲端已有不同的世界。已保留本機資料，且不會覆蓋雲端；請先匯出本機存檔。')
  }
  if (manifest.state !== 'ready') {
    const uploaded = await request(`${rootPath()}/uploaded`) || {}
    if (!uploaded._meta) {
      await request(rootPath(), { method: 'PATCH', data: {
        'static/meta': staticMetadata(world), 'uploaded/_meta': true,
        'dynamic/preferences': { favoriteSchoolIds: idFlags(world.favoriteSchoolIds), followedTeamIds: idFlags(world.followedTeamIds) },
      } })
    }
    const students = grouped(world.students, 'schoolId')
    const races = grouped(world.races, 'schoolId')
    const awards = grouped(world.awards, 'schoolId')
    const teams = new Map(world.teams.map(team => [team.id, team]))
    for (let index = 0; index < world.schools.length; index++) {
      const school = world.schools[index]
      progress(`首次上傳：${school.name}（${index + 1}/${world.schools.length}）`, index / world.schools.length)
      if (uploaded[school.id]) continue
      const patch = schoolUpload(world, school, students.get(school.id) || [], teams.get(school.teamId), races.get(school.id) || [], awards.get(school.id) || [])
      // A school is comfortably below RTDB's 16 MB REST write limit. Fail
      // explicitly if a very long history ever exceeds this batch boundary.
      if (new Blob([JSON.stringify(patch)]).size > 15 * 1024 * 1024) throw new Error('單校歷史資料超過上傳批次上限，已保留可續傳進度。')
      await request(rootPath(), { method: 'PATCH', data: patch })
    }
    const latest = await request(path, { etag: true })
    if (latest.value?.worldId !== worldId) throw new Error('雲端世界識別已變更，已停止上傳。')
    if (latest.value.state !== 'ready') await request(path, { method: 'PUT', headers: { 'if-match': latest.etag }, data: { ...latest.value, state: 'ready', completedAt: new Date().toISOString() } })
  }
  progress('雲端已連接', 1)
  syncState.error = ''
  syncState.ready = true
  return { ...context }
}

export async function restoreCloud(onProgress) {
  const user = requireAccount()
  const manifest = await request(`users/${user.uid}/manifest`)
  if (!manifest || manifest.state !== 'ready') throw new Error('雲端尚未完成首次上傳。請在原本有存檔的瀏覽器登入，讓它先上傳資料。')
  if (manifest.schemaVersion !== CLOUD_SCHEMA) throw new Error('雲端資料版本無法讀取。')
  context = { uid: user.uid, worldId: manifest.worldId, databaseURL }
  const meta = await request(`${rootPath()}/static/meta`)
  const schoolKeys = await request(`${rootPath()}/uploaded`)
  const world = { ...meta, cloudBinding: { ...context }, schools: [], students: [], teams: [], races: [], awards: [],
    favoriteSchoolIds: [], followedTeamIds: [], settings: { muted: false } }
  const ids = Object.keys(schoolKeys || {}).filter(id => id !== '_meta')
  if (ids.length !== manifest.schoolCount) throw new Error('雲端固定資料不完整，已停止還原。')
  for (let index = 0; index < ids.length; index++) {
    const chunk = await request(`${rootPath()}/static/schools/${ids[index]}`)
    if (!chunk?.school || !chunk.students || !chunk.team) throw new Error('雲端學校資料缺漏，已停止還原。')
    chunk.school.classes = values(chunk.school.classes).map(cls => ({ ...cls, studentIds: values(cls.studentIds) }))
    world.schools.push(chunk.school)
    for (const student of values(chunk.students)) world.students.push(emptyDynamicStudent(student))
    world.teams.push({ ...chunk.team, memberIds: [], awardIds: [] })
    onProgress({ phase: `從雲端還原學校（${index + 1}/${ids.length}）`, progress: (index + 1) / ids.length * 0.75 })
  }
  if (world.students.length !== manifest.studentCount || await worldIdentity(world) !== manifest.worldId) throw new Error('雲端世界校驗失敗，已停止保存。')
  // Dynamic state is fetched once for a brand-new local copy; subsequent
  // launches only perform the scoped reads below.
  const bests = await request(`${rootPath()}/dynamic/bests`) || {}
  const profiles = await request(`${rootPath()}/dynamic/profiles`) || {}
  const rosters = await request(`${rootPath()}/dynamic/rosters`) || {}
  const teamAwards = await request(`${rootPath()}/dynamic/teamAwards`) || {}
  const preferences = await request(`${rootPath()}/dynamic/preferences`) || {}
  const members = new Set(values(rosters).flatMap(flagIds))
  for (const student of world.students) Object.assign(student, profiles[student.id] || {}, { best100: bests[student.id] ?? null, isSchoolTeam: members.has(student.id) })
  for (const team of world.teams) Object.assign(team, { memberIds: flagIds(rosters[team.id]), awardIds: flagIds(teamAwards[team.id]) })
  world.favoriteSchoolIds = flagIds(preferences.favoriteSchoolIds)
  world.followedTeamIds = flagIds(preferences.followedTeamIds)
  for (let index = 0; index < ids.length; index++) {
    const [races, awards] = await Promise.all([request(`${rootPath()}/dynamic/races/${ids[index]}`), request(`${rootPath()}/dynamic/awards/${ids[index]}`)])
    for (const race of values(races)) world.races.push({ ...race, results: values(race.results) })
    world.awards.push(...values(awards))
    onProgress({ phase: `從雲端還原成績（${index + 1}/${ids.length}）`, progress: 0.75 + (index + 1) / ids.length * 0.2 })
  }
  const byId = new Map(world.students.map(student => [student.id, student]))
  for (const race of world.races) for (const result of race.results) {
    const student = byId.get(result.studentId)
    if (student) student.best100 = student.best100 == null ? result.time : Math.min(student.best100, result.time)
  }
  return world
}

export function cloudOperation(type, payload) {
  const user = auth.currentUser
  if (!user) throw new Error('請先登入再保存資料。')
  localGeneration++
  return { id: crypto.randomUUID(), uid: user.uid, type, payload,
    createdAt: Date.now() + operationSequence++ / 100000, worldId: context?.worldId || null }
}

async function sendOperation(operation) {
  if (operation.uid !== context.uid || (operation.worldId && operation.worldId !== context.worldId)) throw new Error('待同步資料屬於另一個帳號或世界，已停止傳送。')
  const { type, payload } = operation
  if (type === 'patch') {
    await request(rootPath(), { method: 'PATCH', data: payload })
    return {}
  }
  if (type !== 'heat') throw new Error('無法辨識待同步資料類型。')
  const { race, students, awards, teamId, teamAwardIds } = payload
  for (let attempt = 0; attempt < 4; attempt++) {
    const bests = await Promise.all(students.map(student => request(`${rootPath()}/dynamic/bests/${student.id}`)))
    const patch = { [`dynamic/races/${race.schoolId}/${race.id}`]: race }
    const savedBests = []
    for (let index = 0; index < students.length; index++) {
      const student = students[index]
      const best100 = bests[index] == null ? student.best100 : Math.min(bests[index], student.best100)
      patch[`dynamic/bests/${student.id}`] = best100
      putScores(patch, student, best100)
      savedBests.push({ id: student.id, best100 })
    }
    for (const award of awards) patch[`dynamic/awards/${award.schoolId}/${award.id}`] = award
    for (const id of teamAwardIds) patch[`dynamic/teamAwards/${teamId}/${id}`] = true
    try {
      await request(rootPath(), { method: 'PATCH', data: patch })
      return { bests: savedBests }
    } catch (error) {
      // Rules reject stale writes that would make a personal best slower.
      if (attempt === 3 || ![401, 403].includes(error.status)) throw error
    }
  }
}

export function installCloudSync(worldGetter, merger) {
  currentWorld = worldGetter
  mergeLocal = merger
}

export async function retryCloudSync() {
  if (drain) return drain
  clearTimeout(retryTimer)
  syncRequested = false
  drain = (async () => {
    syncState.busy = true
    try {
      syncState.pending = (await pendingOperations()).length
      if (!syncState.ready) {
        const binding = await connectCloud(currentWorld())
        await mergeLocal({ binding })
      }
      let operations = await pendingOperations()
      while (operations.length) {
        syncState.pending = operations.length
        const operation = operations[0]
        const update = await sendOperation(operation)
        // A GET started while this write was in flight may have seen the old
        // server value. Invalidate it before removing its local overlay.
        localGeneration++
        await mergeLocal({ ...update, acknowledge: operation.id })
        operations = await pendingOperations()
      }
      syncState.pending = 0
      syncState.error = ''
    } catch (error) {
      syncState.error = error.message
      if (auth.currentUser && navigator.onLine) retryTimer = setTimeout(() => void retryCloudSync(), 30000)
    } finally { syncState.busy = false }
  })().finally(() => {
    drain = null
    if (syncRequested && !syncState.error) queueMicrotask(() => void retryCloudSync())
  })
  return drain
}

export function queueSync() {
  syncState.pending++
  syncRequested = true
  void retryCloudSync()
}

export function stopCloudSync() {
  clearTimeout(retryTimer)
  syncState.ready = false
}

async function scopedRead(key, read) {
  if (inFlightReads.has(key)) return inFlightReads.get(key)
  const promise = (async () => {
    if (!syncState.ready) throw new Error(syncState.error || '雲端尚未連接，目前顯示本機資料。')
    for (let attempt = 0; attempt < 3; attempt++) {
      const generation = localGeneration
      const result = await read()
      const stillCurrent = () => localGeneration === generation
      if (!stillCurrent()) continue
      const applied = await mergeLocal({ ...result, stillCurrent, cache: { id: key, updatedAt: new Date().toISOString(), data: result } })
      if (applied !== false) return result
    }
    throw new Error('資料正在更新，目前保留本機內容，請稍後重試。')
  })().finally(() => inFlightReads.delete(key))
  inFlightReads.set(key, promise)
  return promise
}

export function fetchRanking(scope, { schoolId, classId, grade } = {}) {
  const path = scope === 'national' ? 'national' : scope === 'class' ? `class/${classId}` : scope === 'grade' ? `grade/${schoolId}/${grade}` : `school/${schoolId}`
  return scopedRead(`ranking:${path}`, async () => {
    const scores = await request(`${rootPath()}/rankings/${path}`, { query: { orderBy: 'time', ...(scope === 'national' ? { limitToFirst: 300 } : {}) } })
    if (!scores) throw new Error('雲端尚無此範圍的排名資料，目前顯示本機資料。')
    return { ranking: { scope, entries: sortedScores(scores) } }
  })
}

export function fetchPreferences() {
  return scopedRead('preferences', async () => ({ preferences: await request(`${rootPath()}/dynamic/preferences`) || {} }))
}

export function fetchTeam(team) {
  return scopedRead(`team:${team.id}`, async () => {
    const [roster, awardIds, awards] = await Promise.all([
      request(`${rootPath()}/dynamic/rosters/${team.id}`), request(`${rootPath()}/dynamic/teamAwards/${team.id}`),
      request(`${rootPath()}/dynamic/awards/${team.schoolId}`),
    ])
    const memberIds = flagIds(roster)
    const profiles = await Promise.all(memberIds.map(async id => {
      const [profile, best100] = await Promise.all([request(`${rootPath()}/dynamic/profiles/${id}`), request(`${rootPath()}/dynamic/bests/${id}`)])
      return { id, nickname: '', isCityTeam: false, isNationalTeam: false, ...profile, best100: best100 ?? null }
    }))
    return { roster: { teamId: team.id, memberIds, awardIds: flagIds(awardIds) }, profiles, awards: values(awards) }
  })
}

export function fetchHistory(schoolId) {
  return scopedRead(`history:${schoolId}`, async () => {
    const [races, awards] = await Promise.all([request(`${rootPath()}/dynamic/races/${schoolId}`), request(`${rootPath()}/dynamic/awards/${schoolId}`)])
    return { races: values(races).map(race => ({ ...race, results: values(race.results) })), awards: values(awards) }
  })
}

export function fetchStudent(student, teamId) {
  return scopedRead(`student:${student.id}`, async () => {
    const [profile, best100, isSchoolTeam] = await Promise.all([request(`${rootPath()}/dynamic/profiles/${student.id}`),
      request(`${rootPath()}/dynamic/bests/${student.id}`), request(`${rootPath()}/dynamic/rosters/${teamId}/${student.id}`)])
    return { profiles: [{ id: student.id, nickname: '', isCityTeam: false, isNationalTeam: false, ...profile, best100: best100 ?? null, isSchoolTeam: !!isSchoolTeam }] }
  })
}
