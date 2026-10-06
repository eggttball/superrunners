// Pure conversions. Fixed student attributes are never re-sent after bootstrap.
export const CLOUD_SCHEMA = 1
export const scoreTime = student => student.best100 ?? student.baseline100
export const idFlags = ids => Object.fromEntries(ids.map(id => [id, true]))
export const flagIds = flags => Object.keys(flags || {}).filter(id => flags[id])
export const values = object => Object.values(object || {})

export async function worldIdentity(world) {
  const text = JSON.stringify([world.schemaVersion, world.seed, world.createdAt, world.schools.length, world.students.length])
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function staticStudent(student) {
  const { nickname, isSchoolTeam, isCityTeam, isNationalTeam, best100, ranks, ...fixed } = student
  return fixed
}

export function emptyDynamicStudent(fixed) {
  return { ...fixed, nickname: '', isSchoolTeam: false, isCityTeam: false, isNationalTeam: false,
    best100: null, ranks: { class: 0, grade: 0, school: 0, national: 0 } }
}

export function staticTeam(team) {
  const { memberIds, awardIds, ...fixed } = team
  return fixed
}

export function staticMetadata(world) {
  const { schools, students, teams, races, awards, favoriteSchoolIds, followedTeamIds, settings, cloudBinding, exportedAt, ...meta } = world
  return meta
}

export function rankPaths(student) {
  return [`rankings/class/${student.classId}`, `rankings/grade/${student.schoolId}/${student.grade}`,
    `rankings/school/${student.schoolId}`, 'rankings/national']
}

export function putScores(patch, student, best100 = student.best100) {
  const score = { time: best100 ?? student.baseline100, best100: best100 ?? null }
  for (const path of rankPaths(student)) patch[`${path}/${student.id}`] = score
}

export function schoolUpload(world, school, students, team, races, awards) {
  const patch = {
    [`static/schools/${school.id}`]: { school, students: students.map(staticStudent), team: staticTeam(team) },
    [`dynamic/rosters/${team.id}`]: idFlags(team.memberIds),
    [`dynamic/teamAwards/${team.id}`]: idFlags(team.awardIds),
  }
  for (const student of students) {
    if (student.nickname || student.isCityTeam || student.isNationalTeam) {
      patch[`dynamic/profiles/${student.id}`] = {
        nickname: student.nickname, isCityTeam: student.isCityTeam, isNationalTeam: student.isNationalTeam,
      }
    }
    if (student.best100 !== null) patch[`dynamic/bests/${student.id}`] = student.best100
    putScores(patch, student)
  }
  for (const race of races) patch[`dynamic/races/${school.id}/${race.id}`] = race
  for (const award of awards) patch[`dynamic/awards/${school.id}/${award.id}`] = award
  patch[`uploaded/${school.id}`] = true
  return patch
}

export function sortedScores(scores) {
  return Object.entries(scores || {}).map(([id, score]) => ({ id, time: score.time, best100: score.best100 ?? null }))
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
    .map((entry, index, entries) => {
      // Competition ranks: equal hundredths share a place (1, 1, 3).
      let first = index
      while (first > 0 && Math.round(entries[first - 1].time * 100) === Math.round(entry.time * 100)) first--
      return { ...entry, rank: first + 1 }
    })
}
