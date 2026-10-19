import { predict100 } from './physics.js'

export const RELAY_LEGS = 16
export const RELAY_DISTANCE = RELAY_LEGS * 100

const classOrder = (a, b) => Number(a.grade || 0) - Number(b.grade || 0)
  || Number(a.classNumber ?? a.number ?? 0) - Number(b.classNumber ?? b.number ?? 0)
  || String(a.classId ?? a.id).localeCompare(String(b.classId ?? b.id), 'en', { numeric: true })
const rankingTime = student => Number.isFinite(student.best100) && student.best100 > 0 ? student.best100
  : Number.isFinite(student.baseline100) && student.baseline100 > 0 ? student.baseline100 : predict100(student)
const sameIds = (first, second) => Array.isArray(first) && first.length === second.length
  && first.every((id, index) => id === second[index])

/** Refresh the ranking signature between editions, never during an edition. */
export function prepareRelayLineup(cls, getStudent, saved, random = Math.random) {
  const students = [...new Set(cls.studentIds || [])].map(getStudent).filter(student => student
    && student.classId === cls.id && (!cls.schoolId || student.schoolId === cls.schoolId))
    .sort((a, b) => rankingTime(a) - rankingTime(b) || a.id.localeCompare(b.id))
    .slice(0, RELAY_LEGS)
  if (students.length !== RELAY_LEGS) throw new Error(`${cls.name || '這個班級'}需要至少十六位學生才能參加大隊接力。`)
  const rankedIds = students.map(student => student.id)
  const signature = JSON.stringify(rankedIds)
  const validSaved = saved?.classId === cls.id && sameIds(saved.rankedIds, rankedIds)
    && saved.signature === signature && saved.studentIds?.length === RELAY_LEGS
    && new Set(saved.studentIds).size === RELAY_LEGS && saved.studentIds.every(id => rankedIds.includes(id))
    && saved.studentIds[0] === rankedIds[0] && saved.studentIds.at(-1) === rankedIds[1]
  if (validSaved) return { ...structuredClone(saved), id: cls.id, schoolId: cls.schoolId || students[0].schoolId }
  const middle = rankedIds.slice(2)
  for (let index = middle.length - 1; index > 0; index--) {
    const draw = Number(random())
    const position = Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(draw) ? draw : 0.5)) * (index + 1))
    ;[middle[index], middle[position]] = [middle[position], middle[index]]
  }
  const updatedAtMs = Date.now()
  return { id: cls.id, classId: cls.id, schoolId: cls.schoolId || students[0].schoolId, signature,
    rankedIds, studentIds: [rankedIds[0], ...middle, rankedIds[1]],
    updatedAt: new Date(updatedAtMs).toISOString(), updatedAtMs }
}

function qualifierCount(count) {
  return count <= 4 ? 1 : count <= 6 ? 2 : 3
}

function createRound(meetId, number, entrants, sourceMatches = [], friendly = false) {
  const sorted = entrants.slice().sort(classOrder)
  const isFinal = !friendly && sorted.length <= 4
  const matches = []
  for (let offset = 0; offset < sorted.length; offset += 8) {
    const group = sorted.slice(offset, offset + 8)
    const classIds = group.map(entry => entry.classId)
    const bye = group.length === 1
    matches.push({ id: `${meetId}-r${number}-m${offset / 8 + 1}`, round: number, number: offset / 8 + 1,
      final: isFinal, classIds,
      sourceMatchIds: sourceMatches.filter(match => match.qualifiedClassIds.some(id => classIds.includes(id))).map(match => match.id),
      status: bye ? 'bye' : 'pending', qualifyCount: friendly ? 0 : qualifierCount(group.length),
      results: [], qualifiedClassIds: bye && !friendly ? classIds.slice() : [] })
  }
  return { number, isFinal, matches }
}

function lineupFor(lineups, classId) {
  if (lineups instanceof Map) return lineups.get(classId)
  if (Array.isArray(lineups)) return lineups.find(lineup => lineup.classId === classId || lineup.id === classId)
  return lineups?.[classId]
}

function championSnapshot(meet, classId, finishedAt) {
  const entrant = meet.entrants.find(entry => entry.classId === classId)
  const result = meet.rounds.slice().reverse().flatMap(round => round.matches)
    .find(match => match.results.some(result => result.classId === classId))?.results.find(result => result.classId === classId)
  return { ...structuredClone(entrant), ...(result ? structuredClone(result) : { time: null, lane: null, place: 1 }),
    schoolId: meet.schoolId, schoolName: meet.schoolName, meetId: meet.id, ...(result ? { title: '風速小班' } : {}),
    finishedAt, awardedAt: finishedAt, awardedAtMs: Date.parse(finishedAt) }
}

/** Drain automatic byes and create a new round only after its predecessor is complete. */
function advanceRounds(meet, finishedAt) {
  while (meet.status === 'running') {
    const round = meet.rounds.at(-1)
    if (!round || round.matches.some(match => match.status === 'pending')) return
    if (meet.friendly) {
      meet.status = 'complete'
      meet.finishedAt = finishedAt
      return
    }
    const classIds = round.matches.flatMap(match => match.qualifiedClassIds)
    if (classIds.length === 1) {
      meet.champion = championSnapshot(meet, classIds[0], finishedAt)
      meet.status = 'complete'
      meet.finishedAt = finishedAt
      return
    }
    const entrants = classIds.map(classId => meet.entrants.find(entry => entry.classId === classId))
    meet.rounds.push(createRound(meet.id, round.number + 1, entrants, round.matches))
  }
}

/** Snapshot all rosters once; future rounds refer only to this fixed edition. */
export function createRelayMeet(school, lineups, classIds = [], { id: suppliedId, nationalRunId } = {}) {
  const friendly = classIds.length > 0
  const selected = new Set(classIds)
  if (friendly && (selected.size !== classIds.length || classIds.length < 2 || classIds.length > 8)) {
    throw new Error('大隊接力友誼賽請選擇二至八個不同班級。')
  }
  const classes = (school.classes || []).filter(cls => !friendly || selected.has(cls.id))
  if (friendly && classes.length !== selected.size) throw new Error('友誼賽班級不屬於目前學校。')
  const entrants = classes.map(cls => {
    const lineup = lineupFor(lineups, cls.id)
    if (!lineup || lineup.studentIds?.length !== RELAY_LEGS || new Set(lineup.studentIds).size !== RELAY_LEGS
      || (lineup.schoolId && lineup.schoolId !== school.id)) {
      throw new Error(`${cls.name || '班級'}的十六棒名單尚未準備完成。`)
    }
    return { classId: cls.id, className: cls.name, grade: cls.grade, classNumber: cls.number,
      color: cls.color, studentIds: lineup.studentIds.slice() }
  }).sort(classOrder)
  if (!entrants.length) throw new Error('這所學校目前沒有可參賽的班級。')
  const startedAt = new Date().toISOString()
  const id = suppliedId || `relay-${crypto.randomUUID()}`
  const meet = { id, kind: 'relay', schoolId: school.id, schoolName: school.name, friendly,
    ...(nationalRunId ? { nationalRunId } : {}),
    classIds: entrants.map(entry => entry.classId), entrants,
    rounds: [createRound(id, 1, entrants, [], friendly)], startedAt, finishedAt: null,
    status: 'running', completedMatches: 0, champion: null }
  advanceRounds(meet, startedAt)
  return meet
}

export function nextRelayMatch(meet) {
  if (!meet || meet.status !== 'running') return null
  for (const round of meet.rounds) {
    const match = round.matches.find(match => match.status === 'pending')
    if (match) return match
  }
  return null
}

export function completeRelayMatch(meet, matchId, results, finishedAt = new Date().toISOString()) {
  const next = structuredClone(meet)
  const round = next.rounds.find(round => round.matches.some(match => match.id === matchId))
  const match = round?.matches.find(match => match.id === matchId)
  if (next.status !== 'running' || !match || match.status !== 'pending') throw new Error('這場接力已完成或不存在。')
  if (!Array.isArray(results) || results.length !== match.classIds.length
    || new Set(results.map(result => result.classId)).size !== results.length
    || results.some(result => !match.classIds.includes(result.classId) || !Number.isFinite(result.time) || result.time <= 0
      || (result.lane !== undefined && result.lane !== match.classIds.indexOf(result.classId) + 1))
    || !Number.isFinite(Date.parse(finishedAt))) {
    throw new Error('接力成績與參賽班級名單不符。')
  }
  const ordered = results.map(result => {
    const entrant = next.entrants.find(entry => entry.classId === result.classId)
    return { ...structuredClone(result), classId: entrant.classId, className: entrant.className,
      grade: entrant.grade, classNumber: entrant.classNumber, color: entrant.color,
      studentIds: entrant.studentIds.slice(), lane: match.classIds.indexOf(result.classId) + 1 }
  }).sort((a, b) => a.time - b.time || a.lane - b.lane)
    .map((result, index) => ({ ...result, place: index + 1, qualified: !next.friendly && index < match.qualifyCount }))
  Object.assign(match, { status: 'done', results: ordered,
    qualifiedClassIds: ordered.filter(result => result.qualified).map(result => result.classId),
    raceId: next.friendly ? null : match.id, finishedAt })
  next.completedMatches++
  advanceRounds(next, finishedAt)
  return next
}
