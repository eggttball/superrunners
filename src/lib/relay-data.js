const raceLineupKeys = ['id', 'name', 'classId', 'schoolId', 'leg']
const meetResultKeys = ['classId', 'className', 'grade', 'classNumber', 'color', 'lane', 'time', 'place', 'qualified', 'studentIds']
const entrantKeys = ['classId', 'className', 'grade', 'classNumber', 'color', 'studentIds']
const matchKeys = ['id', 'round', 'number', 'final', 'classIds', 'sourceMatchIds', 'status', 'qualifyCount',
  'results', 'qualifiedClassIds', 'raceId', 'finishedAt']
const roundKeys = ['number', 'isFinal', 'matches']
const meetKeys = ['id', 'kind', 'schoolId', 'schoolName', 'friendly', 'nationalRunId', 'classIds', 'entrants',
  'rounds', 'startedAt', 'finishedAt', 'status', 'completedMatches', 'champion']
const raceLineKeys = ['studentId', 'leg', 'time', 'startTime', 'endTime', 'startDistance', 'endDistance']
const exchangeKeys = ['index', 'fromStudentId', 'toStudentId', 'boundary', 'zoneStart', 'zoneEnd', 'distance', 'technique',
  'loss', 'speedRetention', 'overlapDuration', 'prepareDistance', 'time', 'preRunStart', 'preRunDistance',
  'preRunLength', 'preRunDuration', 'preRunSpeed', 'catchSpeed', 'overlapDistance', 'overlapStart', 'overlapEnd',
  'prepareTime', 'receivingLane', 'queuePosition', 'queueOrder']
const raceResultKeys = ['classId', 'className', 'grade', 'classNumber', 'color', 'lane', 'time', 'totalTime', 'place',
  'qualified', 'studentIds', 'lineup', 'splits', 'exchanges', 'legs']
const raceKeys = ['id', 'mode', 'meetId', 'relayMatchId', 'schoolId', 'round', 'number', 'startedAt', 'finishedAt',
  'friendly', 'results', 'syncStatus']
const planKeys = ['classId', 'className', 'color', 'lane', 'studentIds', 'totalTime', 'legs', 'exchanges']
const legKeys = ['studentId', 'index', 'startTime', 'endTime', 'startDistance', 'endDistance', 'profile',
  'incomingExchange', 'outgoingExchange']
const profileKeys = ['time', 'distance', 'accelerationDuration', 'fatigueStart', 'fatigueLoss', 'peakSpeed',
  'initialSpeed', 'finishSpeed', 'runoutDuration', 'knots']

export function relayMeetResultSnapshot(result) {
  return Object.fromEntries(meetResultKeys.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]))
}

function keepKeys(record, keys) {
  if (!record || typeof record !== 'object') return false
  let changed = false
  for (const key of Object.keys(record)) if (!keys.includes(key)) {
    delete record[key]
    changed = true
  }
  return changed
}

function compactMeet(meet) {
  let changed = keepKeys(meet, meetKeys)
  for (const entrant of meet.entrants || []) changed = keepKeys(entrant, entrantKeys) || changed
  for (const round of meet.rounds || []) {
    changed = keepKeys(round, roundKeys) || changed
    for (const match of round.matches || []) {
      changed = keepKeys(match, matchKeys) || changed
      for (const result of match.results || []) changed = keepKeys(result, meetResultKeys) || changed
    }
  }
  if (meet.champion) changed = keepKeys(meet.champion, [...entrantKeys, 'time', 'lane', 'place', 'title',
    'schoolId', 'schoolName', 'meetId', 'finishedAt', 'awardedAt', 'awardedAtMs']) || changed
  return changed
}

function compactRace(race) {
  let changed = keepKeys(race, raceKeys)
  for (const result of race.results || []) {
    changed = keepKeys(result, raceResultKeys) || changed
    for (const athlete of result.lineup || []) changed = keepKeys(athlete, raceLineupKeys) || changed
    for (const split of result.splits || []) changed = keepKeys(split, raceLineKeys) || changed
    for (const exchange of result.exchanges || []) changed = keepKeys(exchange, exchangeKeys) || changed
    for (const leg of result.legs || []) {
      changed = keepKeys(leg, legKeys) || changed
      if (leg.profile) changed = keepKeys(leg.profile, profileKeys) || changed
      if (leg.student) { delete leg.student; changed = true }
    }
  }
  return changed
}

/** Remove old repeated student snapshots while preserving identity links and race details. */
export function compactRelayHistory(world) {
  const changedMeets = []
  const changedRaces = []
  for (const meet of world.relayMeets || []) if (compactMeet(meet)) changedMeets.push(meet)
  for (const race of world.relayRaces || []) if (compactRace(race)) changedRaces.push(race)
  return { changedMeets, changedRaces }
}

/** The saved relay playback needs pace knots, but not duplicate students or source sprint curves. */
export function compactRelayProgress(progress) {
  if (!progress || !Array.isArray(progress.plans)) return false
  let changed = progress.meet ? compactMeet(progress.meet) : false
  for (const plan of progress.plans) {
    changed = keepKeys(plan, planKeys) || changed
    for (const leg of plan.legs || []) {
      changed = keepKeys(leg, legKeys) || changed
      if (leg.student) { delete leg.student; changed = true }
      if (leg.profile) {
        changed = keepKeys(leg.profile, profileKeys) || changed
        if (leg.profile.sourceSprint) { delete leg.profile.sourceSprint; changed = true }
      }
    }
  }
  return changed
}

export function relayLineupSnapshot(student, leg) {
  return { id: student.id, name: student.name, classId: student.classId,
    schoolId: student.schoolId, leg }
}
