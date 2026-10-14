// Brackets contain IDs and snapshots, never references to mutable students.
const effectiveTime = student => Number.isFinite(student.best100) && student.best100 > 0 ? student.best100 : student.baseline100

export function classFinalists(cls, getStudent) {
  return cls.studentIds.map(getStudent).filter(Boolean)
    .sort((a, b) => effectiveTime(a) - effectiveTime(b) || a.id.localeCompare(b.id))
    .slice(0, 3).map(student => student.id)
}

function createRound(meetId, grade, number, entrants, solo = false) {
  const matches = []
  for (let index = 0; index < entrants.length; index += 2) {
    const pair = entrants.slice(index, index + 2)
    const bye = pair.length === 1 && !solo
    matches.push({
      id: `${meetId}-g${grade}-r${number}-m${index / 2 + 1}`,
      grade, round: number, number: index / 2 + 1,
      classIds: pair.map(entry => entry.classId),
      classNames: pair.map(entry => entry.className),
      studentIds: pair.flatMap(entry => entry.studentIds),
      status: bye ? 'bye' : 'pending', winnerClassId: bye ? pair[0].classId : null,
      winnerStudentId: null, winnerName: null, winnerTime: null, raceId: null,
    })
  }
  return { number, matches }
}

export function createWindMeet(school, getStudent, id = crypto.randomUUID()) {
  const grades = [1, 2, 3].map(grade => {
    const entrants = school.classes.filter(cls => cls.grade === grade)
      .sort((a, b) => a.number - b.number)
      .map(cls => ({ classId: cls.id, className: cls.name, classNumber: cls.number, studentIds: classFinalists(cls, getStudent) }))
      .filter(entry => entry.studentIds.length)
    return { grade, entrants, rounds: entrants.length ? [createRound(id, grade, 1, entrants, entrants.length === 1)] : [], champion: null }
  })
  if (!grades.some(group => group.entrants.length)) throw new Error('這所學校目前沒有可參賽的學生。')
  return { id, schoolId: school.id, schoolName: school.name, startedAt: new Date().toISOString(),
    finishedAt: null, status: 'running', paused: false, grades,
    totalMatches: grades.reduce((sum, group) => sum + Math.max(0, group.entrants.length - 1) + (group.entrants.length === 1 ? 1 : 0), 0),
    completedMatches: 0 }
}

export function nextWindMatch(meet) {
  for (const group of meet.grades) for (const round of group.rounds) {
    const match = round.matches.find(match => match.status === 'pending')
    if (match) return match
  }
  return null
}

export function completeWindMatch(meet, matchId, results, finishedAt) {
  const next = structuredClone(meet)
  const group = next.grades.find(group => group.rounds.some(round => round.matches.some(match => match.id === matchId)))
  const round = group?.rounds.find(round => round.matches.some(match => match.id === matchId))
  const match = round?.matches.find(match => match.id === matchId)
  if (!match || match.status !== 'pending') throw new Error('這場對戰已完成或不存在。')
  if (results.length !== match.studentIds.length || new Set(results.map(result => result.studentId)).size !== results.length ||
    new Set(results.map(result => result.lane)).size !== results.length ||
    results.some(result => !match.studentIds.includes(result.studentId) || !Number.isFinite(result.time) || result.time < 10 ||
      !Number.isInteger(result.lane) || result.lane < 1 || result.lane > 8)) {
    throw new Error('對戰成績與參賽名單不符。')
  }
  // Equal hundredths are resolved by lane order, matching the finish display.
  const winner = results.slice().sort((a, b) => a.time - b.time || a.lane - b.lane)[0]
  const entrant = group.entrants.find(entry => entry.studentIds.includes(winner.studentId))
  Object.assign(match, { status: 'done', winnerClassId: entrant.classId, winnerStudentId: winner.studentId,
    winnerName: winner.name, winnerTime: winner.time, raceId: matchId, finishedAt })
  next.completedMatches++
  if (round.matches.every(match => match.status !== 'pending')) {
    const winners = round.matches.map(match => group.entrants.find(entry => entry.classId === match.winnerClassId))
    if (winners.length === 1) {
      group.champion = { studentId: winner.studentId, name: winner.name, classId: entrant.classId,
        className: entrant.className, grade: group.grade, time: winner.time, awardedAt: finishedAt, meetId: meet.id }
    } else group.rounds.push(createRound(meet.id, group.grade, round.number + 1, winners))
  }
  if (next.grades.every(group => !group.entrants.length || group.champion)) {
    next.status = 'complete'
    next.finishedAt = finishedAt
    next.paused = false
  }
  return next
}
