import { compareSchoolOrder } from './school-order.js'

export const normalizeRegion = city => String(city || '').replaceAll('台', '臺').trim()
export const regionalEventName = city => `${normalizeRegion(city)}${normalizeRegion(city).endsWith('縣') ? '縣運' : '市運'}百米賽`
const effectiveTime = student => student.best100 ?? student.baseline100

export function schoolRepresentatives(school, getStudent, champions = {}) {
  return [1, 2, 3].map(grade => {
    const champion = getStudent(champions[grade]?.studentId)
    if (champion?.schoolId === school.id && champion.grade === grade) return champion
    return school.classes.filter(cls => cls.grade === grade).flatMap(cls => cls.studentIds)
      .map(getStudent).filter(Boolean)
      .sort((a, b) => effectiveTime(a) - effectiveTime(b) || a.id.localeCompare(b.id))[0]
  }).filter(Boolean)
}

export function createRepresentativeRound(id, number, entrants) {
  const isFinal = entrants.length <= 2
  const matches = []
  for (let index = 0; index < entrants.length; index += 2) {
    const pair = entrants.slice(index, index + 2)
    const qualifiers = pair.flatMap(entry => entry.qualifiers)
    const bye = pair.length === 1 && !isFinal
    matches.push({ id: `${id}-r${number}-m${index / 2 + 1}`, grade: 0, round: number,
      number: index / 2 + 1, final: isFinal, studentIds: qualifiers.map(result => result.studentId),
      schoolIds: [...new Set(qualifiers.map(result => result.schoolId))],
      cities: [...new Set(qualifiers.map(result => result.city).filter(Boolean))],
      classIds: [...new Set(qualifiers.map(result => result.classId))],
      classNames: [...new Set(qualifiers.map(result => result.className))],
      status: bye ? 'bye' : 'pending', topThree: bye ? qualifiers : [],
      winnerStudentId: null, winnerName: null, winnerTime: null, raceId: null })
  }
  return { number, isFinal, matches }
}

export function createRegionalMeet(city, schools, getStudent, champions, getClass, { friendly = false, id = crypto.randomUUID() } = {}) {
  city = normalizeRegion(city)
  const entrants = schools.filter(school => normalizeRegion(school.city) === city).sort(compareSchoolOrder)
    .map(school => {
      const representatives = schoolRepresentatives(school, getStudent, champions?.[school.id])
      return { schoolId: school.id, schoolName: school.name, studentIds: representatives.map(student => student.id),
        qualifiers: representatives.map(student => ({ studentId: student.id, name: student.name,
          schoolId: school.id, schoolName: school.name, classId: student.classId,
          className: getClass(student.classId).name, grade: student.grade, time: null })) }
    }).filter(entry => entry.studentIds.length)
  if (!entrants.length) throw new Error('這個縣市目前沒有可參賽的學校。')
  if (friendly && entrants.length < 2) throw new Error('友誼賽請至少選擇兩所學校。')
  let firstRound = createRepresentativeRound(id, 1, entrants)
  if (friendly) {
    const qualifiers = entrants.flatMap(entry => entry.qualifiers)
    firstRound = { number: 1, isFinal: false, matches: [] }
    for (let offset = 0; offset < qualifiers.length; offset += 8) {
      const runners = qualifiers.slice(offset, offset + 8)
      firstRound.matches.push({ id: `${id}-friendly-${offset / 8 + 1}`, grade: 0, round: 1, number: offset / 8 + 1,
        final: false, studentIds: runners.map(result => result.studentId),
        schoolIds: [...new Set(runners.map(result => result.schoolId))],
        classIds: [...new Set(runners.map(result => result.classId))], classNames: [...new Set(runners.map(result => result.className))],
        status: 'pending', topThree: [] })
    }
  }
  return { id, kind: 'regional', city, eventName: regionalEventName(city), friendly,
    schoolIds: entrants.map(entry => entry.schoolId), startedAt: new Date().toISOString(), finishedAt: null,
    status: 'running', paused: false, completedMatches: 0,
    totalMatches: friendly ? firstRound.matches.length : Math.max(1, entrants.length - 1),
    grades: [{ grade: 0, entrants, rounds: [firstRound], champion: null, podium: null }] }
}

export function completeRegionalMatch(meet, matchId, results, finishedAt) {
  const next = structuredClone(meet)
  const group = next.grades[0]
  const round = group.rounds.find(round => round.matches.some(match => match.id === matchId))
  const match = round?.matches.find(match => match.id === matchId)
  if (!match || match.status !== 'pending') throw new Error('這場區域對戰已完成或不存在。')
  if (results.length !== match.studentIds.length || new Set(results.map(result => result.studentId)).size !== results.length ||
    new Set(results.map(result => result.lane)).size !== results.length || results.some(result =>
      !match.studentIds.includes(result.studentId) || !Number.isFinite(result.time) || result.time < 10 ||
      !Number.isInteger(result.lane) || result.lane < 1 || result.lane > (meet.friendly ? 8 : 6))) {
    throw new Error('區域對戰成績與參賽名單不符。')
  }
  const ordered = results.slice().sort((a, b) => a.time - b.time || a.lane - b.lane)
  const topThree = ordered.slice(0, 3).map((result, index) => ({ place: index + 1,
    studentId: result.studentId, name: result.name, schoolId: result.schoolId, schoolName: result.schoolName,
    classId: result.classId, className: result.className, grade: result.grade, time: result.time }))
  const winner = topThree[0]
  Object.assign(match, { status: 'done', topThree, winnerStudentId: winner.studentId,
    winnerClassId: winner.classId, winnerName: winner.name, winnerTime: winner.time,
    raceId: meet.friendly ? null : matchId, finishedAt, ...(meet.friendly ? { results: ordered } : {}) })
  next.completedMatches++
  if (round.matches.every(match => match.status !== 'pending')) {
    if (round.isFinal || meet.friendly) {
      if (!meet.friendly) {
        group.podium = topThree.map(result => ({ ...result, city: meet.city, meetId: meet.id,
          awardedAt: finishedAt, awardedAtMs: Date.parse(finishedAt) }))
        group.champion = { ...group.podium[0], title: '風速王子' }
      }
      next.status = 'complete'
      next.finishedAt = finishedAt
      next.paused = false
    } else group.rounds.push(createRepresentativeRound(meet.id, round.number + 1,
      round.matches.map(match => ({ qualifiers: match.topThree }))))
  }
  return next
}
