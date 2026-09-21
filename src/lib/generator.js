import { predict100 } from './physics.js'

const CITY_PREFIXES = {
  臺北市: 'TP', 新北市: 'NT', 桃園市: 'TY', 臺中市: 'TC', 臺南市: 'TN', 高雄市: 'KH',
  基隆市: 'KL', 新竹市: 'HC', 新竹縣: 'HS', 苗栗縣: 'ML', 彰化縣: 'CH', 南投縣: 'NA',
  雲林縣: 'YL', 嘉義市: 'CY', 嘉義縣: 'JY', 屏東縣: 'PT', 宜蘭縣: 'IL', 花蓮縣: 'HL',
  臺東縣: 'TT', 澎湖縣: 'PH', 金門縣: 'KM', 連江縣: 'LC',
}

// Broad Taiwan surname frequencies. All names and people are fictional.
const SURNAMES = [
  ['陳', 11.1], ['林', 8.3], ['黃', 6.0], ['張', 5.3], ['李', 5.1], ['王', 4.2],
  ['吳', 4.0], ['劉', 3.1], ['蔡', 2.9], ['楊', 2.7], ['許', 2.3], ['鄭', 1.9],
  ['謝', 1.8], ['洪', 1.5], ['郭', 1.5], ['邱', 1.4], ['曾', 1.4], ['廖', 1.3],
  ['賴', 1.3], ['徐', 1.2], ['周', 1.1], ['葉', 1.1], ['蘇', 1.0], ['莊', 1.0],
  ['呂', 0.9], ['江', 0.9], ['何', 0.8], ['蕭', 0.8], ['羅', 0.8], ['高', 0.7],
  ['潘', 0.7], ['簡', 0.7], ['朱', 0.7], ['鍾', 0.7], ['游', 0.6], ['彭', 0.6],
  ['詹', 0.6], ['胡', 0.6], ['施', 0.6], ['沈', 0.5], ['余', 0.5], ['盧', 0.5],
  ['梁', 0.5], ['趙', 0.5], ['顏', 0.5], ['柯', 0.5], ['翁', 0.4], ['魏', 0.4],
  ['孫', 0.4], ['戴', 0.4], ['范', 0.4], ['方', 0.4], ['宋', 0.4], ['杜', 0.3],
  ['傅', 0.3], ['侯', 0.3], ['曹', 0.3], ['薛', 0.3], ['丁', 0.3], ['卓', 0.3],
  ['阮', 0.3], ['馬', 0.3], ['董', 0.3], ['温', 0.3], ['唐', 0.3], ['藍', 0.3],
  ['石', 0.3], ['蔣', 0.3], ['古', 0.2], ['紀', 0.2], ['姚', 0.2], ['連', 0.2],
  ['田', 0.2], ['歐', 0.2], ['程', 0.2], ['褚', 0.1], ['涂', 0.2], ['饒', 0.1],
]
const SURNAME_TOTAL = SURNAMES.reduce((sum, [, weight]) => sum + weight, 0)
const COMPOUND_SURNAMES = ['歐陽', '司徒', '上官', '司馬', '諸葛']
const GIVEN = {
  男: {
    first: Array.from('承柏宇冠宥品子廷冠昱哲俊奕宏祐彥家睿秉威皓建泓佑聖博凱彥文振信士東世明國健智書羽浩澤維予正嘉瑞敬修翊展恩允'),
    last: Array.from('恩廷宇翔睿哲佑軒安皓宏辰翰傑丞祐霖勳豪維均銘洋凱謙穎毅叡達良翔樺昊倫倫煜庭緯成平樂青元熙云暘樂澤誠岳寬銓勛遠立'),
    single: Array.from('翔安傑豪維謙哲恩睿宇辰毅陽岳廷樺誠昊凱勳'),
  },
  女: {
    first: Array.from('怡品妍詠宥子佳沛宜采思羽庭郁芷詩欣昀依婉心雨若芸映予語可韻雅彤亦奕晴佩宛家晨予巧宣以曼伊鈺涵柔安書嘉苡芯念唯'),
    last: Array.from('涵妤彤恩安晴萱璇甄庭君蓉柔潔寧媛綺瑄宜穎琪如琳儀薰真羽希心岑馨喬珊雯嫻瑜盈妍伶菲倩靜妮葳茵淇惠均婕蓁昀蒨'),
    single: Array.from('晴柔恩潔心庭萱君芸涵妤甄彤瑄安靜妍琳羽瑩'),
  },
}
const INDIGENOUS_GIVEN = ['巴奈', '阿美', '阿洛', '伊斯坦達', '達克', '尤命', '拉娃', '撒可努', '依菈', '馬耀', '以力', '洛瓦']
const INDIGENOUS_FAMILY = ['達路', '拉外', '達比拉斯', '卡里布安', '巴萬', '伊斯卡卡夫特', '比亞', '希巨', '達利']
const TRANSLITERATED_GIVEN = ['安德烈', '艾莉絲', '伊凡', '艾瑪', '米亞', '凱文', '諾亞', '莉娜']
const ATTRIBUTES = ['explosiveness', 'endurance', 'stamina', 'strength', 'technique']
const GRADE_LABELS = ['一年級', '二年級', '三年級']
const CLASS_COLORS = [
  '#d5ee7e', '#73c6ec', '#e99a76', '#c8a5ef', '#efca68', '#72d2b1', '#e695bd', '#ef8354',
  '#8fa7f2', '#e5dc72', '#71c3a4', '#d58de4', '#f0a45d', '#78aee3', '#de7f88', '#a7d46f',
  '#f1b6c2', '#8bd2d4', '#d7ad6b', '#a5a2e9', '#76c986', '#e38eb3', '#c3d06d', '#7fb8ce',
  '#ec997f', '#92c67b', '#d1a1d7', '#edbd72', '#75c8c0', '#c89bec', '#dfa06f', '#86bce7',
  '#d88b9a', '#aad276', '#b4a5e6', '#e8c36e',
]

function randomSource(seed) {
  let value = 2166136261
  for (const char of String(seed)) value = Math.imul(value ^ char.codePointAt(0), 16777619)
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let result = Math.imul(value ^ (value >>> 15), 1 | value)
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function normalSource(random) {
  let spare = null
  return () => {
    if (spare !== null) {
      const value = spare
      spare = null
      return value
    }
    const magnitude = Math.sqrt(-2 * Math.log(1 - random()))
    const angle = 2 * Math.PI * random()
    spare = magnitude * Math.sin(angle)
    return magnitude * Math.cos(angle)
  }
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
const round1 = value => Math.round(value * 10) / 10
const pad2 = value => String(value).padStart(2, '0')
const pick = (items, random) => items[Math.floor(random() * items.length)]

function surname(random) {
  let target = random() * SURNAME_TOTAL
  for (const [name, weight] of SURNAMES) {
    target -= weight
    if (target <= 0) return name
  }
  return SURNAMES.at(-1)[0]
}

function studentName(gender, random) {
  const style = random()
  if (style < 0.017) return `${pick(INDIGENOUS_GIVEN, random)}·${pick(INDIGENOUS_FAMILY, random)}`
  if (style < 0.02) return `${surname(random)}${pick(TRANSLITERATED_GIVEN, random)}`
  const given = GIVEN[gender]
  if (style < 0.026) return pick(COMPOUND_SURNAMES, random) + pick(given.first, random) + pick(given.last, random)
  if (style < 0.08) return surname(random) + pick(given.single, random)
  return surname(random) + pick(given.first, random) + pick(given.last, random)
}

function typicalClassCount(random) {
  const value = random()
  if (value < 0.55) return 8
  if (value < 0.80) return 9
  if (value < 0.92) return 10
  if (value < 0.98) return 11
  return 12
}

function shuffled(items, random) {
  const copy = items.slice()
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const temporary = copy[index]
    copy[index] = copy[target]
    copy[target] = temporary
  }
  return copy
}

const hundredth = value => Math.round(value * 100) / 100

function bandTimes(count, minimum, maximum, random, shape = 1) {
  return Array.from({ length: count }, () => {
    const unit = shape === 1 ? random() : Math.pow(random(), shape)
    return hundredth(minimum + unit * (maximum - minimum))
  })
}

/**
 * Give every class its own performance curve. The physical formula decides
 * who is quicker inside the class; the sampled bands decide how common each
 * result range is. This keeps classroom distributions varied without making
 * the numbers unrelated to student attributes.
 */
function assignClassBaselineTimes(classStudents, grade, random) {
  const count = classStudents.length
  const minimumMain = Math.ceil(count * 0.50)
  const maximumMain = Math.floor(count * 0.75)
  const mainCount = minimumMain + Math.floor(random() * (maximumMain - minimumMain + 1))
  let remaining = count - mainCount
  const thirteenCount = Math.min(remaining, Math.max(2, Math.round(count * (0.08 + random() * 0.10))))
  remaining -= thirteenCount
  const twelveCount = Math.min(remaining, random() < 0.38 ? 1 + (random() < 0.12 ? 1 : 0) : 0)
  remaining -= twelveCount
  const elevenCount = Math.min(remaining, random() < 0.035 ? 1 : 0)
  const slowCount = Math.max(0, count - mainCount - thirteenCount - twelveCount - elevenCount)
  // Each class has its own curve. Grade maturity shifts the centre by only
  // 0.20 seconds per year, so individual development can still outweigh age.
  const maturityShift = (2 - grade) * 0.20
  const classCentre = 15.05 + maturityShift + (random() - 0.5) * 0.50
  const targets = [
    ...bandTimes(elevenCount, 11.25, 11.96, random),
    ...bandTimes(twelveCount, 12.20, 12.97, random),
    ...bandTimes(thirteenCount, 13.00, 13.98, random, 1.15 + grade * 0.10),
    ...Array.from({ length: mainCount }, () => {
      const triangular = (random() + random()) / 2
      return hundredth(clamp(classCentre - 0.85 + triangular * 1.7, 14.00, 15.99))
    }),
    ...bandTimes(slowCount, 16.00, 19.20 + maturityShift, random, 1.7),
  ].sort((a, b) => a - b)

  const byAbility = classStudents.slice().sort((a, b) => predict100(a) - predict100(b) || a.id.localeCompare(b.id))
  for (let index = 0; index < byAbility.length; index += 1) byAbility[index].baseline100 = targets[index]
}

function createStudent({ id, schoolId, classId, grade }, random, normal) {
  const gender = random() < 0.515 ? '男' : '女'
  const boy = gender === '男'
  const age = 11 + grade + (random() < 0.52 ? 1 : 0)
  const ageGrowth = age - (11 + grade)
  let height = (boy ? [154, 161, 166] : [153, 156, 158])[grade - 1] + ageGrowth * (boy ? 2 : 1) + normal() * (boy ? 6.6 : 5.5)
  const unusualHeight = random()
  if (unusualHeight < 0.001) height = 128 + random() * 14
  else if (unusualHeight < 0.002) height = (boy ? 185 : 178) + random() * (boy ? 21 : 17)
  height = round1(clamp(height, 125, 207))
  // Weight tracks height through BMI; sparse tails retain natural body diversity.
  let bmi = 19.8 + (grade - 1) * 0.6 + normal() * 2.3
  const unusualWeight = random()
  if (unusualWeight < 0.015) bmi += 7 + random() * 6
  else if (unusualWeight < 0.03) bmi -= 3
  const weight = round1(clamp(bmi, 13.5, 36) * (height / 100) ** 2)
  const athleticism = normal() * 0.8
  const means = boy ? [5.0, 4.9, 5.0, 5.0, 4.8] : [4.55, 4.7, 4.8, 4.15, 4.8]
  const student = {
    id, studentNumber: id, schoolId, classId,
    name: studentName(gender, random), nickname: '', gender, grade, age, height, weight,
  }
  for (let index = 0; index < ATTRIBUTES.length; index += 1) {
    student[ATTRIBUTES[index]] = clamp(Math.round(means[index] + (grade - 1) * 0.32 + athleticism + normal() * 1.45), 1, 10)
  }
  Object.assign(student, {
    isSchoolTeam: false, isCityTeam: false, isNationalTeam: false,
    best100: null, baseline100: null,
    ranks: { class: 0, grade: 0, school: 0, national: 0 },
  })
  return student
}

function cityPrefix(city, fallbackPrefixes) {
  const normalized = city.replaceAll('台', '臺')
  if (CITY_PREFIXES[normalized]) return CITY_PREFIXES[normalized]
  if (!fallbackPrefixes.has(city)) {
    const index = fallbackPrefixes.size
    if (index >= 26) throw new Error('無法配置更多縣市的學號代碼。')
    fallbackPrefixes.set(city, `Z${String.fromCharCode(65 + index)}`)
  }
  return fallbackPrefixes.get(city)
}

/** Create the entire fixed population once. Persist the result instead of regenerating on navigation. */
export function generateWorld(catalog, { seed = 'superrunners-tw-115-v3', createdAt = new Date().toISOString(), onProgress } = {}) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('學校名錄是空的，無法建立學生資料。')
  const random = randomSource(seed)
  const normal = normalSource(random)
  const citySchoolCounts = new Map()
  const fallbackPrefixes = new Map()
  const seenSchoolIds = new Set()
  const world = {
    schemaVersion: 3,
    schoolTeamSelectionVersion: 1,
    country: { code: 'TW', name: '臺灣' },
    createdAt, seed,
    source: { name: '教育部學校名錄', note: '學校名稱為真實公開資料；學生、能力與成績皆為虛構。' },
    schools: [], students: [], teams: [], races: [], awards: [],
    favoriteSchoolIds: [], followedTeamIds: [], settings: { muted: false },
  }
  onProgress?.({ phase: 'population', completed: 0, total: catalog.length, students: 0, progress: 0 })

  for (const entry of catalog) {
    if (!entry.id || !entry.city || seenSchoolIds.has(entry.id)) throw new Error('學校名錄有缺漏或重複的識別碼。')
    seenSchoolIds.add(entry.id)
    const prefix = cityPrefix(entry.city, fallbackPrefixes)
    const cityIndex = citySchoolCounts.get(prefix) ?? 0
    citySchoolCounts.set(prefix, cityIndex + 1)
    const group = Math.floor(cityIndex / 99)
    if (group > 26) throw new Error(`${entry.city}的學校數量超出學號格式上限。`)
    const studentPrefix = prefix + (group > 0 ? String.fromCharCode(64 + group) : '')
    const schoolNumber = (cityIndex % 99) + 1
    const school = { ...entry, schoolNumber, teamId: `team-${entry.id}`, classes: [] }
    const schoolStudents = []
    const schoolPalette = shuffled(CLASS_COLORS, random)
    let colorIndex = 0

    for (let grade = 1; grade <= 3; grade += 1) {
      const classCount = typicalClassCount(random)
      for (let number = 1; number <= classCount; number += 1) {
        const classroom = {
          id: `${school.id}-${grade}-${pad2(number)}`,
          schoolId: school.id, grade, number, name: `${GRADE_LABELS[grade - 1]} ${number} 班`,
          color: schoolPalette[colorIndex++ % schoolPalette.length], studentIds: [],
        }
        const studentCount = 30 + Math.floor(random() * 11)
        const classStudents = []
        for (let seat = 1; seat <= studentCount; seat += 1) {
          const id = `${studentPrefix}${pad2(schoolNumber)}${grade}${pad2(number)}${pad2(seat)}`
          const student = createStudent({ id, schoolId: school.id, classId: classroom.id, grade }, random, normal)
          classroom.studentIds.push(id)
          classStudents.push(student)
          schoolStudents.push(student)
          world.students.push(student)
        }
        assignClassBaselineTimes(classStudents, grade, random)
        school.classes.push(classroom)
      }
    }

    // Ten-to-eleven-second students are deliberately exceptional: most
    // schools have none, a few have one, and no school starts with more than two.
    const eliteRoll = random()
    const eliteCount = eliteRoll < 0.03 ? 2 : eliteRoll < 0.18 ? 1 : 0
    if (eliteCount) {
      const eliteCandidates = schoolStudents.slice().sort((a, b) => predict100(a) - predict100(b))
      for (let index = 0; index < eliteCount; index += 1) {
        eliteCandidates[index].baseline100 = hundredth(10.55 + random() * 0.43)
      }
    }

    const team = {
      id: school.teamId, type: 'school', name: `${school.name}田徑隊`,
      schoolId: school.id, city: school.city, createdAt, memberIds: [], awardIds: [],
    }
    // Each school starts with a small, plausible roster. Faster students are
    // more likely to join, while the draw still leaves room for motivation,
    // schedule and interest to differ from pure performance ranking.
    const memberCount = 8 + Math.floor(random() * 9)
    const selectedIds = selectSchoolTeamIds(schoolStudents, memberCount, random)
    for (const student of schoolStudents) {
      if (!selectedIds.has(student.id)) continue
      student.isSchoolTeam = true
      team.memberIds.push(student.id)
    }
    world.teams.push(team)
    world.schools.push(school)
    onProgress?.({ phase: 'population', completed: world.schools.length, total: catalog.length, students: world.students.length, progress: world.schools.length / catalog.length * 0.85 })
  }

  onProgress?.({ phase: 'ranking', completed: 0, total: world.students.length, students: world.students.length, progress: 0.85 })
  rankStudents(world)
  onProgress?.({ phase: 'complete', completed: world.students.length, total: world.students.length, students: world.students.length, progress: 1 })
  return world
}

const rankingTime = student => Number.isFinite(student.best100) && student.best100 > 0 ? student.best100 : student.baseline100

function schoolTeamProbability(rank) {
  if (rank <= 5) return 0.90
  if (rank <= 10) return 0.80
  if (rank <= 15) return 0.70
  if (rank <= 20) return 0.60
  return 0.50
}

function selectSchoolTeamIds(schoolStudents, memberCount, random, initialIds = new Set()) {
  const rankedCandidates = schoolStudents.slice().sort((a, b) => rankingTime(a) - rankingTime(b) || a.id.localeCompare(b.id))
  const selectedIds = new Set(initialIds)
  for (let index = 0; index < rankedCandidates.length && selectedIds.size < memberCount; index += 1) {
    const student = rankedCandidates[index]
    if (selectedIds.has(student.id)) continue
    if (random() < schoolTeamProbability(index + 1)) selectedIds.add(student.id)
  }
  // The long tail has a 50% chance, but this guarantees the requested
  // minimum roster if a seeded draw happens to reject too many candidates.
  for (const student of rankedCandidates) {
    if (selectedIds.size >= memberCount) break
    selectedIds.add(student.id)
  }
  return selectedIds
}

/** Repair worlds generated before probabilistic school-team selection existed. */
export function repairSchoolTeams(world, seed = `${world.seed}:school-teams-v1`) {
  const random = randomSource(seed)
  const studentsBySchool = new Map()
  const studentById = new Map(world.students.map(student => [student.id, student]))
  for (const student of world.students) {
    const list = studentsBySchool.get(student.schoolId) || []
    list.push(student)
    studentsBySchool.set(student.schoolId, list)
  }
  const changedStudents = []
  const changedTeams = []
  for (const school of world.schools) {
    const team = world.teams.find(candidate => candidate.id === school.teamId)
    if (!team || team.memberIds.length >= 8) continue
    const schoolStudents = studentsBySchool.get(school.id) || []
    const existingIds = new Set(team.memberIds.filter(id => studentById.get(id)?.schoolId === school.id))
    const target = 8 + Math.floor(random() * 9)
    const selectedIds = selectSchoolTeamIds(schoolStudents, target, random, existingIds)
    const nextMemberIds = schoolStudents.filter(student => selectedIds.has(student.id)).map(student => student.id)
    const nextSet = new Set(nextMemberIds)
    for (const student of schoolStudents) {
      const nextValue = nextSet.has(student.id)
      if (student.isSchoolTeam !== nextValue) {
        student.isSchoolTeam = nextValue
        changedStudents.push(student)
      }
    }
    team.memberIds = nextMemberIds
    changedTeams.push(team)
  }
  return { students: changedStudents, teams: changedTeams }
}

function placeInGroup(groups, key, time) {
  const state = groups.get(key)
  if (!state) {
    groups.set(key, { count: 1, time, rank: 1 })
    return 1
  }
  state.count += 1
  if (state.time !== time) {
    state.time = time
    state.rank = state.count
  }
  return state.rank
}

/** Mutate all four competition ranks; equal recorded hundredths share their place (1, 1, 3). */
export function rankStudents(world) {
  const gradeForClass = new Map()
  for (const school of world.schools) {
    for (const classroom of school.classes) gradeForClass.set(classroom.id, `${school.id}:${classroom.grade}`)
  }
  const sorted = world.students.slice().sort((a, b) => rankingTime(a) - rankingTime(b))
  const classes = new Map()
  const grades = new Map()
  const schools = new Map()
  let previousTime = null
  let nationalRank = 0
  for (let index = 0; index < sorted.length; index += 1) {
    const student = sorted[index]
    // Compare at the official display precision, not incidental floating point noise.
    const time = Math.round(rankingTime(student) * 100)
    if (time !== previousTime) nationalRank = index + 1
    previousTime = time
    const ranks = student.ranks ?? (student.ranks = {})
    ranks.class = placeInGroup(classes, student.classId, time)
    ranks.grade = placeInGroup(grades, gradeForClass.get(student.classId), time)
    ranks.school = placeInGroup(schools, student.schoolId, time)
    ranks.national = nationalRank
  }
  return world
}
