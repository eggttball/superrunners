<script setup vapor>
import { computed, reactive, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { game, getSchool, getClass, getStudent, admitStudent, timeText } from '../lib/game.js'
import { admissionDetails, estimateAdmission, STUDENT_ABILITIES, STUDENT_LIMITS } from '../lib/student-admission.js'
import { syncState } from '../lib/cloud.js'
import { COUNTIES } from '../lib/school-order.js'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'

const props = defineProps({ schoolId: { type: String, default: '' }, classId: { type: String, default: '' } })
const emit = defineEmits(['close', 'created'])
const normalizeCity = value => String(value || '').replaceAll('台', '臺')
let creationId = crypto.randomUUID()
const dialog = ref(null), saving = ref(false), error = ref('')
const schoolId = ref(props.schoolId)
const initialSchool = getSchool(props.schoolId)
const city = ref(normalizeCity(initialSchool?.city))
const grade = ref(getClass(props.classId)?.grade || 1)
const classId = ref(props.classId)
const form = reactive({ name: '', nickname: '', gender: '男', age: 11 + grade.value,
  height: 160, weight: 50, explosiveness: 6, strength: 6, technique: 6, endurance: 6, stamina: 6, isSchoolTeam: false })
Object.assign(form, { estimateMode: 'attributes', estimateMinimum: '', estimateMaximum: '' })
const schools = computed(() => game.world.schools.filter(school => normalizeCity(school.city) === city.value))
const school = computed(() => { game.revision; return getSchool(schoolId.value) })
const classes = computed(() => { game.revision; return school.value?.classes.filter(cls => cls.grade === grade.value) || [] })
const classroom = computed(() => { game.revision; return getClass(classId.value) })
const destination = computed(() => {
  game.revision
  try { return { ...admissionDetails(school.value, classroom.value, getStudent), error: '' } }
  catch (cause) { return { studentNumber: '', error: cause.message } }
})
const estimate = computed(() => {
  try { return { ...estimateAdmission(form, grade.value), error: '' } }
  catch (cause) { return { mode: form.estimateMode, error: cause.message } }
})
const online = ref(navigator.onLine)
const canSave = computed(() => !saving.value && syncState.ready && online.value && !destination.value.error && !estimate.value.error)
const gradeLabels = ['一年級', '二年級', '三年級']
const previousFocus = document.activeElement
let previousOverflow = ''

watch(city, () => {
  if (!schools.value.some(school => school.id === schoolId.value)) schoolId.value = ''
})
watch(schoolId, () => { classId.value = '' })
watch(classId, () => { creationId = crypto.randomUUID() })
watch(classes, current => {
  if (!current.some(cls => cls.id === classId.value)) classId.value = current.find(cls => cls.studentIds.length < 50)?.id || ''
}, { immediate: true })

function close() { if (!saving.value) emit('close') }
function updateOnline() { online.value = navigator.onLine }
function backdropClick(event) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}
async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  try {
    const student = await admitStudent({ ...form }, schoolId.value, classId.value, creationId)
    emit('created', student)
  } catch (cause) { error.value = cause.message || '新增失敗，請再試一次。' }
  finally { saving.value = false }
}
onMounted(async () => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  await nextTick()
  dialog.value.querySelector('[name="student-name"]')?.focus()
})
onUnmounted(() => {
  window.removeEventListener('online', updateOnline)
  window.removeEventListener('offline', updateOnline)
  document.body.style.overflow = previousOverflow
  if (dialog.value?.open) dialog.value.close()
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
})
</script>

<template>
  <dialog ref="dialog" class="student-create-dialog" aria-labelledby="student-create-title" @cancel.prevent="close" @click="backdropClick">
    <form @submit.prevent="save">
      <header class="create-header"><div><span class="eyebrow">NEW RUNNER</span><h2 id="student-create-title">新增學生</h2><p>打造跑者，加入你的校園。</p></div><button type="button" class="btn small ghost" aria-label="關閉新增學生" :disabled="saving" @click="close"><Icon name="close" :size="20" /></button></header>
      <fieldset :disabled="saving" class="create-fields">
        <legend class="sr-only">學生資料與入學班級</legend>
        <section class="create-section"><h3><Icon name="school" :size="18" />插班入學</h3>
          <div class="create-grid">
            <label>縣市<select v-model="city" required><option value="">請選擇縣市</option><option v-for="county in COUNTIES" :key="county" :value="county">{{ county }}</option></select></label>
            <label>學校<select v-model="schoolId" required :disabled="!city"><option value="">請選擇學校</option><option v-for="item in schools" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
            <label>年級<select v-model.number="grade" required><option v-for="year in 3" :key="year" :value="year">{{ gradeLabels[year - 1] }}</option></select></label>
            <label>班級<select v-model="classId" required :disabled="!schoolId"><option value="">請選擇班級</option><option v-for="cls in classes" :key="cls.id" :value="cls.id" :disabled="cls.studentIds.length >= 50">{{ cls.name }} · {{ cls.studentIds.length }} / 50 人{{ cls.studentIds.length >= 50 ? '（已滿）' : '' }}</option></select></label>
          </div>
        </section>
        <section class="create-section"><h3><Icon name="user" :size="18" />個人資料</h3>
          <div class="create-grid">
            <label>姓名<input v-model="form.name" name="student-name" required maxlength="40" placeholder="學生姓名" autocomplete="off" /></label>
            <label>綽號 <small>選填</small><input v-model="form.nickname" maxlength="20" placeholder="專屬綽號" autocomplete="off" /></label>
            <label>性別<select v-model="form.gender" required><option value="男">男</option><option value="女">女</option></select></label>
            <label v-for="(limit, key) in STUDENT_LIMITS" :key="key">{{ limit.label }} <small>{{ limit.unit }}</small><input v-model.number="form[key]" type="number" required :min="limit.min" :max="limit.max" :step="limit.step" inputmode="decimal" /></label>
          </div>
        </section>
        <section class="create-section"><h3><Icon name="clock" :size="18" />預估百米</h3>
          <label class="estimate-mode-field">預估方式<select v-model="form.estimateMode"><option value="attributes">依身體條件與能力推算</option><option value="range">自行指定秒數區間</option></select></label>
          <div v-if="form.estimateMode === 'range'" class="create-grid estimate-range-fields">
            <label>最快秒數<input v-model.number="form.estimateMinimum" type="number" min="10.01" max="30" step="0.01" required inputmode="decimal" placeholder="填寫秒數" /></label>
            <label>最慢秒數<input v-model.number="form.estimateMaximum" type="number" min="10.01" max="30" step="0.01" required inputmode="decimal" placeholder="填寫秒數" /></label>
          </div>
          <p v-if="estimate.error" class="inline-error" role="alert">{{ estimate.error }}</p>
          <p v-else class="estimate-help">{{ form.estimateMode === 'range' ? '新增時會在區間內抽取並保存一個預估基準；實際比賽仍會依能力產生波動。' : '依學生的身體資料與五項能力推算預估基準。' }}</p>
        </section>
        <section class="create-section"><h3><Icon name="bolt" :size="18" />跑者能力 <small>1～10</small></h3>
          <div class="create-abilities"><div v-for="ability in STUDENT_ABILITIES" :key="ability.key" class="create-ability"><label :for="`create-${ability.key}`">{{ ability.label }}</label><div class="create-meter" aria-hidden="true"><i v-for="level in 10" :key="level" :class="{ filled: level <= form[ability.key], medium: level >= 7 && level <= 8, high: level >= 9 }"></i></div><input :id="`create-${ability.key}`" v-model.number="form[ability.key]" type="number" required min="1" max="10" step="1" inputmode="numeric" /></div></div>
        </section>
        <label class="create-team"><input v-model="form.isSchoolTeam" type="checkbox" /><Icon name="sprint" :size="22" /><span>加入學校田徑隊</span></label>
      </fieldset>
      <aside class="create-preview" aria-label="新增學生預覽"><PixelRunner :seed="destination.studentNumber || creationId" :gender="form.gender" :height="form.height" :weight="form.weight" :color="classroom?.color || '#e87560'" :size="84" /><div><strong>{{ form.name.trim() || '新跑者' }}<small v-if="form.nickname.trim()">{{ form.nickname.trim() }}</small></strong><p>{{ classroom ? `${school?.name} · ${classroom.name}` : '選擇班級，穿上班服' }}</p><span class="mono">{{ destination.studentNumber || '學號自動產生' }}</span></div><div class="create-estimate"><span>{{ estimate.mode === 'range' ? '預估區間' : '預估百米' }}</span><b v-if="estimate.mode === 'range' && !estimate.error">{{ timeText(estimate.minimum) }}–{{ timeText(estimate.maximum) }}<small>s</small></b><b v-else>{{ estimate.time ? timeText(estimate.time) : '—' }}<small v-if="estimate.time">s</small></b></div></aside>
      <p class="create-note">學號依班級空位產生，百米預估依所選方式設定；正式比賽後會留下個人最佳。</p>
      <p v-if="error" class="create-error" role="alert">{{ error }}</p>
      <p v-else-if="estimate.error" class="create-note" role="status">{{ estimate.error }}</p>
      <p v-else-if="destination.error" class="create-note" role="status">{{ destination.error }}</p>
      <p v-if="!online || !syncState.ready" class="create-note" role="status">新增學生需要連線確認班級名額，請等待雲端連接。</p>
      <footer class="create-footer"><button type="button" class="btn ghost" :disabled="saving" @click="close">取消</button><button type="submit" class="btn primary" :disabled="!canSave"><Icon name="check" :size="18" />{{ saving ? '正在新增…' : '新增並入學' }}</button></footer>
    </form>
  </dialog>
</template>

<style scoped>
.student-create-dialog { width: min(680px, calc(100vw - 28px)); max-height: calc(100dvh - 32px); margin: auto; padding: 0; overflow-y: auto; overscroll-behavior: contain; border: 3px solid var(--ink, #243d52); border-radius: 9px; color: var(--ink, #243d52); background: var(--game-cream, #fff8e6); box-shadow: 7px 7px 0 #172e4970; }
.student-create-dialog::backdrop { background: #203b5b9e; backdrop-filter: blur(4px); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.create-header { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 22px 24px; background: #ffe1ac; border-bottom: 3px solid #243d52; }
.create-header .eyebrow { color: #875322; }
.create-header h2 { margin: 7px 0; font-size: 27px; }
.create-header p { margin: 0; color: #655b50; font-size: 13px; }
.create-fields { border: 0; margin: 0; padding: 20px 24px 0; min-width: 0; }
.create-section { margin-bottom: 22px; }
.create-section h3 { display: flex; align-items: center; gap: 8px; font-size: 16px; margin: 0 0 12px; }
.create-section h3 small { margin-left: auto; color: #6c7e89; font-size: 12px; }
.estimate-mode-field { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
.estimate-mode-field select { width: 100%; max-width: 360px; margin-top: 4px; border: 2px solid #9aadb0; background: #fffdf5; color: #243d52; font-size: 14px; }
.estimate-range-fields { max-width: 420px; margin-top: 12px; }
.estimate-help, .inline-error { margin: 9px 0 0; color: #617180; font-size: 12px; line-height: 1.6; }
.inline-error { color: #b54230; }
.create-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.create-grid label { display: block; min-width: 0; font-size: 13px; font-weight: 600; }
.create-grid small { font-weight: 400; color: #6c7e89; }
.create-grid input, .create-grid select { display: block; width: 100%; margin-top: 6px; border: 2px solid #9aadb0; background: #fffdf5; color: #243d52; font-size: 14px; }
.create-abilities { display: grid; gap: 9px; }
.create-ability { display: flex; align-items: center; gap: 10px; }
.create-ability label { width: 52px; flex-shrink: 0; font-size: 13px; }
.create-ability input { width: 64px; border: 2px solid #9aadb0; background: #fffdf5; color: #243d52; text-align: center; font-size: 14px; }
.create-meter { display: flex; flex: 1; gap: 5px; }
.create-meter i { flex: 1; height: 13px; background: #d7ded1; border-radius: 2px; }
.create-meter i.filled { background: #4b9f65; }
.create-meter i.filled.medium { background: #eab83f; }
.create-meter i.filled.high { background: #df6250; }
.create-team { display: flex; align-items: center; gap: 10px; border: 2px solid #dca474; background: #fff0d4; border-radius: 5px; padding: 12px; font-size: 14px; cursor: pointer; }
.create-team svg { color: #bb572d; }
.create-preview { display: flex; align-items: center; gap: 12px; margin: 20px 24px 10px; padding: 12px; border: 2px solid #afbfab; border-radius: 6px; background: #edf3df; }
.create-preview > svg { flex-shrink: 0; }
.create-preview > div { min-width: 0; }
.create-preview strong { display: block; font-size: 17px; overflow-wrap: anywhere; }
.create-preview strong small { display: block; margin-top: 3px; font-size: 12px; color: #637c50; }
.create-preview p { margin: 6px 0; font-size: 12px; color: #556879; }
.create-preview .mono { font-size: 12px; }
.create-estimate { margin-left: auto; text-align: right; flex-shrink: 0; }
.create-estimate > span { font-size: 11px; color: #556879; }
.create-estimate b { display: block; margin-top: 4px; font: bold 24px ui-monospace, monospace; }
.create-estimate b small { margin-left: 4px; font-size: 13px; }
.create-note, .create-error { margin: 8px 24px; font-size: 12px; line-height: 1.7; color: #617180; }
.create-error { color: #b54230; font-weight: 600; }
.create-footer { display: flex; justify-content: end; gap: 12px; padding: 18px 24px; }
@media (max-width: 480px) { .create-header { padding: 18px 16px; } .create-fields { padding: 16px 16px 0; } .create-grid { gap: 10px; } .create-preview { margin: 18px 16px 10px; flex-wrap: wrap; } .create-preview > svg { width: 64px; height: 64px; } .create-preview > div:not(.create-estimate) { flex: 1; } .create-estimate { width: 100%; display: flex; align-items: center; justify-content: end; gap: 12px; padding-top: 8px; border-top: 1px solid #c7d4be; } .create-estimate b { margin: 0; } .create-note, .create-error { margin-left: 16px; margin-right: 16px; } .create-footer { padding: 16px; } }
</style>
