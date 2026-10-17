import { predict100 } from './physics.js'

export const STUDENT_LIMITS = Object.freeze({
  age: { label: '年齡', min: 11, max: 17, step: 1, unit: '歲' },
  height: { label: '身高', min: 120, max: 220, step: 0.1, unit: 'cm' },
  weight: { label: '體重', min: 25, max: 160, step: 0.1, unit: 'kg' },
})
export const STUDENT_ABILITIES = Object.freeze([
  { key: 'explosiveness', label: '爆發力' }, { key: 'strength', label: '力量' },
  { key: 'technique', label: '技巧' }, { key: 'endurance', label: '肌耐力' },
  { key: 'stamina', label: '體力' },
])

export function admissionDetails(school, classroom, getStudent, reserved = {}) {
  if (!school || !classroom || !school.classes.some(cls => cls.id === classroom.id)) throw new Error('請選擇插班的學校與班級。')
  const sample = classroom.studentIds.map(getStudent).find(Boolean)
  if (!sample || !/^[A-Z]{2,3}\d{7}$/.test(sample.studentNumber)) throw new Error('班級的學號格式無法識別。')
  const prefix = sample.studentNumber.slice(0, -2)
  const occupied = new Set(classroom.studentIds.map(id => Number(id.slice(-2))))
  let seat = 0
  for (let candidate = 1; candidate <= 50; candidate++) {
    if (!occupied.has(candidate) && !reserved[String(candidate)]) { seat = candidate; break }
  }
  if (!seat) throw new Error('這個班級已達 50 人上限，請選擇其他班級。')
  return { seat, studentNumber: `${prefix}${String(seat).padStart(2, '0')}`,
    classIndex: school.classes.findIndex(cls => cls.id === classroom.id) }
}

export function validateStudentInput(input) {
  const name = String(input.name || '').trim(), nickname = String(input.nickname || '').trim()
  if (!name || name.length > 40) throw new Error('請輸入 1～40 字的學生姓名。')
  if (nickname.length > 20) throw new Error('綽號最多 20 字。')
  if (!['男', '女'].includes(input.gender)) throw new Error('請選擇性別。')
  const result = { name, nickname, gender: input.gender, isSchoolTeam: Boolean(input.isSchoolTeam) }
  for (const [key, limit] of Object.entries(STUDENT_LIMITS)) {
    const number = Number(input[key])
    if (input[key] === '' || !Number.isFinite(number) || number < limit.min || number > limit.max ||
      (limit.step === 1 && !Number.isInteger(number)) || Math.abs(number * 10 - Math.round(number * 10)) > 1e-6) {
      throw new Error(`${limit.label}請設定為 ${limit.min}～${limit.max} ${limit.unit}${limit.step === 1 ? '的整數' : '，最多一位小數'}。`)
    }
    result[key] = number
  }
  for (const { key, label } of STUDENT_ABILITIES) {
    const number = Number(input[key])
    if (!Number.isInteger(number) || number < 1 || number > 10) throw new Error(`${label}請設定為 1～10 的整數。`)
    result[key] = number
  }
  return result
}

export function buildAdmittedStudent(input, school, classroom, details, creationId) {
  const data = validateStudentInput(input)
  return { ...data, id: details.studentNumber, studentNumber: details.studentNumber,
    schoolId: school.id, classId: classroom.id, grade: classroom.grade, ...details,
    manuallyCreated: true, creationId, createdAt: new Date().toISOString(),
    baseline100: Math.max(10.01, Math.round(predict100({ ...data, grade: classroom.grade }) * 100) / 100),
    best100: null, isCityTeam: false, isNationalTeam: false,
    ranks: { class: 0, grade: 0, school: 0, national: 0 } }
}
