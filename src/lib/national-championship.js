import { createRepresentativeRound, normalizeRegion } from './regional-selection.js'

export function nationalPodiumLabel(place, friendly = false) {
  if (place === 1) return friendly ? '冠軍' : '風神'
  return ({ 2: '亞軍', 3: '季軍', 4: '殿軍' })[place] || `第 ${place} 名`
}

// Select one complete regional edition, never mix podium members from different finals.
export function regionalDelegation(city, meets, getStudent, getSchool) {
  city = normalizeRegion(city)
  const meet = meets.filter(meet => normalizeRegion(meet.city) === city && !meet.friendly && meet.status === 'complete')
    .sort((a, b) => (b.finishedAt || b.startedAt).localeCompare(a.finishedAt || a.startedAt))[0]
  if (!meet) return []
  const group = meet.grades?.[0]
  if (!group) return []
  const podium = group.podium?.length ? group.podium : (group.rounds || [])
    .filter(round => round.isFinal).flatMap(round => round.matches.flatMap(match => match.topThree || []))
  return podium.slice().sort((a, b) => a.place - b.place).slice(0, 3)
    .filter(result => {
      const student = getStudent(result.studentId)
      return student && student.schoolId === result.schoolId && student.classId === result.classId &&
        Number.isFinite(result.time) && result.time >= 10 &&
        (!getSchool || normalizeRegion(getSchool(student.schoolId)?.city) === city)
    }).map(result => ({ ...result, city, sourceMeetId: meet.id }))
}

export function createNationalChampionship(cities, regionMeets, getStudent, { friendly = false, id = crypto.randomUUID(), getSchool } = {}) {
  const names = [...new Set(cities.map(normalizeRegion))]
  if (names.length < 2) throw new Error('全國賽或友誼賽至少需要兩個縣市。')
  const entrants = names.map(city => {
    const qualifiers = regionalDelegation(city, regionMeets, getStudent, getSchool)
    if (qualifiers.length !== 3 || new Set(qualifiers.map(result => result.studentId)).size !== 3) {
      throw new Error(`${city}尚未有完整冠軍、亞軍、季軍，請先完成區域賽。`)
    }
    return { city, studentIds: qualifiers.map(result => result.studentId), qualifiers }
  })
  const studentIds = entrants.flatMap(entry => entry.studentIds)
  if (new Set(studentIds).size !== studentIds.length) throw new Error('不同縣市的代表名單重複，請重新取得區域賽資料。')
  return { id, kind: 'national-championship', eventName: friendly ? '跨縣市百米友誼賽' : '全國百米大賽',
    cities: names, schoolIds: [...new Set(entrants.flatMap(entry => entry.qualifiers.map(result => result.schoolId)))],
    friendly, startedAt: new Date().toISOString(), finishedAt: null, status: 'running', paused: false,
    completedMatches: 0, totalMatches: entrants.length - 1,
    grades: [{ grade: 0, entrants, rounds: [createRepresentativeRound(id, 1, entrants)], champion: null, podium: null }] }
}

export function completeNationalMatch(meet, matchId, results, finishedAt) {
  const next = structuredClone(meet)
  const group = next.grades[0]
  const round = group.rounds.find(round => round.matches.some(match => match.id === matchId))
  const match = round?.matches.find(match => match.id === matchId)
  if (!match || match.status !== 'pending') throw new Error('這場全國對戰已完成或不存在。')
  if (results.length !== match.studentIds.length || new Set(results.map(result => result.studentId)).size !== results.length ||
    new Set(results.map(result => result.lane)).size !== results.length || results.some(result =>
      !match.studentIds.includes(result.studentId) || !Number.isFinite(result.time) || result.time < 10 ||
      !Number.isInteger(result.lane) || result.lane < 1 || result.lane > 6)) {
    throw new Error('全國對戰成績與參賽名單不符。')
  }
  const ordered = results.slice().sort((a, b) => a.time - b.time || a.lane - b.lane)
    .map((result, index) => ({ ...result, place: index + 1 }))
  const topThree = ordered.slice(0, 3)
  const winner = topThree[0]
  Object.assign(match, { status: 'done', topThree, winnerStudentId: winner.studentId,
    winnerClassId: winner.classId, winnerName: winner.name, winnerTime: winner.time,
    raceId: meet.friendly ? null : matchId, finishedAt,
    ...(meet.friendly || round.isFinal ? { results: ordered } : {}) })
  next.completedMatches++
  if (round.matches.every(match => match.status !== 'pending')) {
    if (round.isFinal) {
      group.podium = ordered.slice(0, 6).map(result => ({ ...result, meetId: meet.id,
        awardedAt: finishedAt, awardedAtMs: Date.parse(finishedAt) }))
      group.champion = { ...group.podium[0], ...(meet.friendly ? {} : { title: '風神' }) }
      next.status = 'complete'
      next.finishedAt = finishedAt
      next.paused = false
    } else group.rounds.push(createRepresentativeRound(meet.id, round.number + 1,
      round.matches.map(match => ({ qualifiers: match.topThree }))))
  }
  return next
}
