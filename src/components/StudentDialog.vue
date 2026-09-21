<script setup vapor>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { game, getStudent, getSchool, getClass, editStudent, timeText, dateText } from '../lib/game.js'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'

const dialog = ref(null)
const student = computed(() => { game.revision; const value = getStudent(game.studentId); return value ? { ...value, ranks: { ...value.ranks } } : null })
const school = computed(() => student.value ? getSchool(student.value.schoolId) : null)
const classroom = computed(() => student.value ? getClass(student.value.classId) : null)
const nickname = ref(student.value?.nickname || '')
const isSchoolTeam = ref(Boolean(student.value?.isSchoolTeam))
const saving = ref(false)
const error = ref('')
const historyLimit = ref(10)
const previousFocus = document.activeElement
let previousOverflow = ''
const attributes = [
  { key: 'explosiveness', label: '爆發力', hint: '起步加速' },
  { key: 'strength', label: '力量', hint: '推進力量' },
  { key: 'technique', label: '技巧', hint: '跑姿效率' },
  { key: 'endurance', label: '肌耐力', hint: '速度維持' },
  { key: 'stamina', label: '體力', hint: '持續輸出' },
]
const abilityTier = value => value >= 9 ? 'high' : value >= 7 ? 'medium' : 'base'
const rankLabels = [{ key: 'class', label: '班級排名' }, { key: 'grade', label: '年級排名' }, { key: 'school', label: '全校排名' }, { key: 'national', label: '全國排名' }]
const history = computed(() => {
  game.revision
  if (!student.value) return []
  return game.world.races.flatMap(race => race.results.filter(result => result.studentId === student.value.id)
    .map(result => ({ ...result, id: race.id, heat: race.heat, dateTime: result.dateTime || race.finishedAt })))
    .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
})
const visibleHistory = computed(() => history.value.slice(0, historyLimit.value))
const medalCount = computed(() => { game.revision; return student.value ? game.world.awards.filter(award => award.studentId === student.value.id).length : 0 })

function close() { if (!saving.value) game.studentId = '' }

async function save() {
  if (saving.value || !student.value) return
  saving.value = true
  error.value = ''
  try {
    await editStudent(student.value.id, nickname.value, isSchoolTeam.value)
    saving.value = false
    close()
  } catch (cause) {
    error.value = cause.message || '資料未能保存，請再試一次。'
    saving.value = false
  }
}

function trapFocus(event) {
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
    .filter(element => element.getClientRects().length > 0)
  if (!controls.length) { event.preventDefault(); dialog.value.focus(); return }
  const first = controls[0], last = controls[controls.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !controls.includes(active))) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (active === last || !controls.includes(active))) { event.preventDefault(); first.focus() }
}

function backdropClick(event) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}

onMounted(async () => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  await nextTick()
  dialog.value.querySelector('[data-dialog-close]')?.focus()
})
onUnmounted(() => {
  document.body.style.overflow = previousOverflow
  if (dialog.value?.open) dialog.value.close()
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
})
</script>

<template>
  <dialog ref="dialog" class="student-dialog" aria-labelledby="student-dialog-title" aria-describedby="student-dialog-description" @cancel.prevent="close" @keydown="trapFocus" @click="backdropClick">
    <form v-if="student && school && classroom" class="student-profile" @submit.prevent="save">
      <header class="profile-header"><div><span class="eyebrow">ATHLETE PROFILE</span><p id="student-dialog-description">每一步，都有自己的節奏。</p></div><button type="button" class="dialog-close" data-dialog-close :disabled="saving" aria-label="關閉學生資料" @click="close"><Icon name="close" :size="21" /></button></header>
      <div class="profile-identity"><div class="profile-avatar" :style="{ '--class-color': classroom.color }"><PixelRunner :seed="student.id" :gender="student.gender" :height="student.height" :weight="student.weight" :color="classroom.color" :size="104" /></div><div class="profile-name"><span class="badge green"><i class="uniform-dot" :style="{ background: classroom.color }"></i>{{ school.city }} · {{ classroom.name }}</span><h2 id="student-dialog-title">{{ student.name }}<span v-if="student.nickname">{{ student.nickname }}</span></h2><p>{{ school.name }}</p><span class="student-id mono">{{ student.studentNumber }}</span></div><div class="profile-best"><span>100M PERSONAL BEST</span><strong>{{ timeText(student.best100) }}<small v-if="student.best100 !== null">s</small></strong><small>{{ student.best100 === null ? '尚未參賽' : '百米個人最佳' }}</small></div></div>
      <div class="profile-body">
        <div class="profile-basics"><div><span>性別</span><strong>{{ student.gender }}</strong></div><div><span>年齡</span><strong>{{ student.age }}<small>歲</small></strong></div><div><span>身高</span><strong>{{ student.height }}<small>cm</small></strong></div><div><span>體重</span><strong>{{ student.weight }}<small>kg</small></strong></div><div><span>學校代碼</span><strong class="school-number">{{ school.officialCode }}</strong></div></div>
        <div class="profile-section-heading"><h3>跑者能力</h3><span>初始能力 · 1–10</span></div>
        <div class="attribute-list"><div v-for="attribute in attributes" :key="attribute.key" class="attribute-row" :class="'ability-' + abilityTier(student[attribute.key])"><span class="attribute-label">{{ attribute.label }}<small>{{ attribute.hint }}</small></span><div class="attribute-meter" role="meter" :aria-label="attribute.label" aria-valuemin="1" aria-valuemax="10" :aria-valuenow="student[attribute.key]"><span v-for="level in 10" :key="level" :class="{ filled: level <= student[attribute.key], 'tier-base': level <= 6, 'tier-medium': level >= 7 && level <= 8, 'tier-high': level >= 9 }"></span></div><b>{{ student[attribute.key] }}<small>/10</small></b></div></div>
        <div class="profile-prediction"><Icon name="bolt" :size="18" /><span>預估百米能力<strong>{{ timeText(student.baseline100) }}<small>秒</small></strong></span><p>依初始身體條件與能力估算</p></div>
        <div class="profile-section-heading"><h3>百米能力排名</h3><span>{{ student.best100 === null ? '目前依預估成績排名' : '目前依個人最佳排名' }}</span></div>
        <div class="profile-ranks"><div v-for="rank in rankLabels" :key="rank.key"><span>{{ rank.label }}</span><strong><small>#</small>{{ student.ranks[rank.key].toLocaleString() }}</strong></div></div>
        <p class="profile-note">排名以個人最佳或尚未參賽者的預估 100m 成績比較，完賽後更新。</p>
        <div class="profile-section-heading"><h3>跑者設定</h3><span>可編輯項目</span></div>
        <label class="nickname-field"><span>綽號<small>{{ nickname.length }}/20</small></span><input v-model="nickname" type="text" maxlength="20" placeholder="給這位跑者一個專屬稱呼" :disabled="saving" autocomplete="off" /></label>
        <label class="school-team-toggle"><div><Icon name="team" :size="21" /><span><strong>學校田徑隊員</strong><small>加入或移出 {{ school.name }}田徑隊</small></span></div><input v-model="isSchoolTeam" type="checkbox" :disabled="saving" /><span class="switch-visual" aria-hidden="true"></span></label>
        <div class="representative-status"><div><Icon name="flag" :size="16" /><span>縣市代表隊</span><span class="badge" :class="{ green: student.isCityTeam }">{{ student.isCityTeam ? '已入選' : '未入選' }}</span></div><div><Icon name="globe" :size="16" /><span>國家代表隊</span><span class="badge" :class="{ green: student.isNationalTeam }">{{ student.isNationalTeam ? '已入選' : '未入選' }}</span></div></div>
        <p class="profile-note">代表隊身分由系統選拔產生；自動選拔將於下一階段開放。</p>
        <div class="profile-section-heading history-heading"><h3><Icon name="clock" :size="17" />比賽紀錄</h3><span>{{ history.length }} 次出賽 · {{ medalCount }} 面獎牌</span></div>
        <div v-if="!history.length" class="profile-history-empty"><Icon name="flag" :size="25" /><strong>故事，從第一場比賽開始</strong><p>完賽時間與當時的姓名、班級會永久保留在這裡。</p></div>
        <div v-else class="profile-history"><div v-for="record in visibleHistory" :key="record.id" class="individual-record"><div class="record-place">#{{ record.place }}</div><div class="record-info"><strong>100 公尺 · {{ record.className }} · 第 {{ record.heat }} 組</strong><span>{{ record.name }}{{ record.nickname ? `（${record.nickname}）` : '' }} · {{ record.studentNumber }} · 第 {{ record.lane }} 道</span><small>{{ dateText(record.dateTime) }} · {{ record.schoolName }}</small></div><b class="mono">{{ timeText(record.time) }}<small>s</small></b></div><button v-if="history.length > historyLimit" type="button" class="btn small ghost more-history" @click="historyLimit += 10">顯示更多紀錄（還有 {{ history.length - historyLimit }} 筆）</button></div>
      </div>
      <footer class="profile-footer"><p v-if="error" class="profile-error" role="alert">{{ error }}</p><div><span class="muted">{{ saving ? '正在保存資料…' : '變更會儲存在此瀏覽器' }}</span><button type="button" class="btn ghost" :disabled="saving" @click="close">取消</button><button type="submit" class="btn primary" :disabled="saving"><Icon name="check" :size="17" />{{ saving ? '保存中…' : '保存變更' }}</button></div></footer>
    </form>
    <div v-else class="profile-missing"><h2 id="student-dialog-title">找不到學生資料</h2><p id="student-dialog-description">請關閉後重新選擇學生。</p><button type="button" class="btn" data-dialog-close @click="close">關閉</button></div>
  </dialog>
</template>

<style scoped>
.student-dialog { width: min(730px, calc(100vw - 36px)); max-height: min(900px, calc(100dvh - 48px)); margin: auto; padding: 0; border: 1px solid #536047; border-radius: 15px; background: #1b2a23; color: #f5f3e9; overflow-y: auto; overscroll-behavior: contain; box-shadow: 0 28px 100px #0009; scrollbar-width: thin; scrollbar-color: #4e6144 #1b2a23; }
.student-dialog::backdrop { background: #06100bd4; backdrop-filter: blur(7px); }
.profile-header { display: flex; justify-content: space-between; align-items: center; padding: 26px 30px 0; }
.profile-header .eyebrow { font-size: 10px; }
.profile-header p { margin: 7px 0 0; color: #92a193; font-size: 11px; }
.dialog-close { display: grid; place-items: center; width: 33px; height: 33px; border: 1px solid #40503e; border-radius: 50%; color: #adbba9; background: #223226; cursor: pointer; }
.dialog-close:hover { color: #f5f3e9; background: #35462d; }
.profile-identity { display: flex; align-items: center; gap: 18px; padding: 24px 30px 26px; }
.profile-avatar { flex-shrink: 0; width: 104px; height: 112px; background: repeating-linear-gradient(0deg, transparent 0, transparent 21px, #71866616 22px), repeating-linear-gradient(90deg, transparent 0, transparent 21px, #71866616 22px), #e7ecdc; border: 1px solid color-mix(in srgb, var(--class-color), #83917b 55%); border-radius: 10px; }
.uniform-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; box-shadow: 0 0 0 1px #fff4 inset; }
.profile-name { flex: 1; min-width: 0; }
.profile-name .badge { font-size: 9px; }
.profile-name h2 { font-size: 29px; margin: 11px 0 8px; line-height: 1.3; }
.profile-name h2 > span { display: block; margin-top: 5px; font-size: 12px; color: #c7f36a; font-weight: 400; }
.profile-name p { font-size: 12px; margin: 0 0 7px; color: #b0bfac; }
.student-id { color: #869981; font-size: 11px; }
.profile-best { display: flex; flex-direction: column; align-items: end; align-self: end; flex-shrink: 0; padding-bottom: 7px; }
.profile-best > span { font-size: 7px; letter-spacing: 1.1px; color: #96aa86; }
.profile-best > strong { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 36px; letter-spacing: -2px; font-weight: 500; color: #c7f36a; margin: 7px 0 4px; }
.profile-best > strong small { font-size: 17px; letter-spacing: 0; margin-left: 5px; }
.profile-best > small { color: #a5b299; font-size: 10px; }
.profile-body { padding: 0 30px 26px; }
.profile-basics { display: grid; grid-template-columns: repeat(4, 1fr) 1.3fr; padding: 19px 0; border-top: 1px solid #3a483a; border-bottom: 1px solid #3a483a; }
.profile-basics > div { display: flex; align-items: center; flex-direction: column; gap: 9px; border-right: 1px solid #384636; }
.profile-basics > div:last-child { border: 0; }
.profile-basics span { color: #92a18b; font-size: 10px; }
.profile-basics strong { color: #dce6ce; font-size: 17px; font-weight: 500; }
.profile-basics small { margin-left: 3px; font-size: 10px; color: #95a889; }
.profile-basics .school-number { font-size: 15px; }
.profile-section-heading { display: flex; justify-content: space-between; gap: 15px; align-items: center; margin: 29px 0 18px; }
.profile-section-heading h3 { font-size: 14px; margin: 0; font-weight: 500; }
.profile-section-heading > span { color: #92a28b; font-size: 10px; }
.attribute-list { display: grid; gap: 15px; }
.attribute-row { display: flex; align-items: center; gap: 18px; }
.attribute-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; width: 120px; font-size: 12px; }
.attribute-label small { color: #83957b; font-size: 9px; }
.attribute-meter { flex: 1; display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
.attribute-meter span { height: 9px; border-radius: 1px; background: #33432e; }
.attribute-meter span.filled.tier-base { background: #b8df74; }
.attribute-meter span.filled.tier-medium { background: #edc757; }
.attribute-meter span.filled.tier-high { background: #ed7469; }
.attribute-row > b { min-width: 42px; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; color: #b8df74; }
.attribute-row.ability-medium > b { color: #edc757; }
.attribute-row.ability-high > b { color: #ed7469; }
.attribute-row > b small { color: #829376; font-size: 10px; margin-left: 3px; }
.profile-prediction { display: flex; align-items: center; gap: 11px; padding: 16px; margin-top: 22px; background: #263623; border-radius: 7px; color: #bad687; }
.profile-prediction > span { display: flex; gap: 15px; align-items: center; font-size: 11px; }
.profile-prediction strong { color: #daefa8; font-size: 17px; }
.profile-prediction strong small { font-size: 9px; margin-left: 4px; }
.profile-prediction p { color: #93a682; margin: 0 0 0 auto; font-size: 9px; }
.profile-ranks { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.profile-ranks > div { padding: 15px 9px; background: #17231b; border: 1px solid #384834; border-radius: 7px; display: flex; flex-direction: column; gap: 13px; align-items: center; }
.profile-ranks span { color: #9bab90; font-size: 10px; }
.profile-ranks strong { font: 22px ui-monospace, SFMono-Regular, Menlo, monospace; color: #d4e9b2; white-space: nowrap; }
.profile-ranks strong small { font-size: 12px; color: #779165; margin-right: 4px; }
.profile-note { color: #86987d; font-size: 10px; line-height: 1.9; margin: 11px 0 0; }
.nickname-field { display: grid; gap: 9px; font-size: 12px; }
.nickname-field > span { display: flex; justify-content: space-between; color: #b6c7a8; }
.nickname-field small { color: #849879; font-size: 10px; }
.nickname-field input { padding: 12px 13px; width: 100%; border: 1px solid #46583f; border-radius: 6px; background: #16251b; color: #e5efda; font: inherit; font-size: 12px; box-sizing: border-box; }
.nickname-field input::placeholder { color: #809476; }
.school-team-toggle { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 18px 0; padding: 18px 15px; background: #243322; border: 1px solid #40543a; border-radius: 7px; cursor: pointer; }
.school-team-toggle > div { display: flex; align-items: center; gap: 13px; color: #b7cc9c; }
.school-team-toggle strong { display: block; font-size: 12px; font-weight: 500; color: #e0eace; }
.school-team-toggle small { display: block; margin-top: 6px; font-size: 10px; line-height: 1.6; color: #9aac8a; }
.school-team-toggle input { position: absolute; right: 15px; width: 37px; height: 22px; margin: 0; opacity: 0; cursor: pointer; }
.switch-visual { width: 37px; height: 22px; border-radius: 20px; background: #50604a; flex-shrink: 0; pointer-events: none; }
.switch-visual::after { content: ''; display: block; width: 16px; height: 16px; margin: 3px; border-radius: 50%; background: #dce6d6; transition: transform .16s; }
.school-team-toggle input:checked + .switch-visual { background: #c7f36a; }
.school-team-toggle input:checked + .switch-visual::after { transform: translateX(15px); background: #27361e; }
.school-team-toggle input:focus-visible + .switch-visual { outline: 2px solid #d6f399; outline-offset: 4px; }
.representative-status { display: flex; gap: 13px; }
.representative-status > div { flex: 1; display: flex; align-items: center; gap: 9px; padding: 13px; border: 1px solid #384b32; border-radius: 6px; color: #93a789; font-size: 11px; }
.representative-status .badge { margin-left: auto; font-size: 9px; white-space: nowrap; }
.history-heading h3 { display: flex; align-items: center; gap: 8px; }
.profile-history-empty { display: flex; flex-direction: column; align-items: center; gap: 11px; padding: 28px 16px; border: 1px dashed #415439; border-radius: 8px; background: #18251b; color: #99ae87; text-align: center; }
.profile-history-empty strong { font-size: 12px; color: #b7cba6; font-weight: 500; }
.profile-history-empty p { margin: 0; font-size: 10px; line-height: 1.8; }
.individual-record { display: flex; align-items: center; gap: 13px; border-top: 1px solid #36472f; padding: 15px 0; }
.record-place { width: 31px; flex-shrink: 0; font: 14px ui-monospace, SFMono-Regular, Menlo, monospace; color: #b6d78e; }
.record-info { display: grid; gap: 6px; flex: 1; min-width: 0; }
.record-info strong { font-size: 11px; color: #d0dfbf; font-weight: 500; }
.record-info span { font-size: 10px; color: #95aa83; }
.record-info small { color: #879c76; font-size: 9px; line-height: 1.7; }
.individual-record > b { font-size: 18px; font-weight: 500; color: #cee8a5; white-space: nowrap; }
.individual-record > b small { font-size: 10px; margin-left: 4px; color: #96ad81; }
.more-history { width: 100%; margin-top: 8px; }
.profile-footer { position: sticky; bottom: 0; padding: 18px 30px; background: #203020f5; border-top: 1px solid #415239; backdrop-filter: blur(10px); }
.profile-footer > div { display: flex; justify-content: end; align-items: center; gap: 10px; }
.profile-footer > div > span { margin-right: auto; font-size: 10px; }
.profile-error { color: #f7b39b; font-size: 12px; line-height: 1.6; margin: 0 0 12px; }
.profile-missing { padding: 36px; }
.profile-missing p { color: #a3b1a7; }
@media (max-width: 580px) { .student-dialog { width: calc(100vw - 20px); max-height: calc(100dvh - 20px); border-radius: 11px; } .profile-header { padding: 20px 18px 0; } .profile-identity { flex-wrap: wrap; padding: 20px 18px; gap: 12px; } .profile-avatar { width: 84px; height: 90px; } .profile-avatar :deep(svg) { width: 84px; height: 84px; } .profile-name h2 { font-size: 24px; } .profile-best { width: 100%; flex-direction: row; align-items: center; gap: 12px; justify-content: end; padding-top: 10px; border-top: 1px solid #3c4d33; } .profile-best > span { margin-right: auto; font-size: 7px; } .profile-best > strong { font-size: 29px; margin: 0; } .profile-best > small { font-size: 9px; } .profile-body { padding: 0 18px 22px; } .profile-basics { grid-template-columns: repeat(4, 1fr); } .profile-basics > div:nth-child(4) { border: 0; } .profile-basics > div:last-child { display: none; } .attribute-row { gap: 9px; } .attribute-label { width: 85px; font-size: 11px; } .attribute-label small { font-size: 8px; } .attribute-meter { gap: 3px; } .attribute-row > b { min-width: 34px; font-size: 12px; } .profile-prediction { flex-wrap: wrap; gap: 8px; padding: 13px; } .profile-prediction p { width: 100%; padding-left: 26px; } .profile-ranks { gap: 6px; } .profile-ranks > div { padding: 14px 5px; } .profile-ranks strong { font-size: 18px; } .profile-ranks strong small { font-size: 9px; margin-right: 2px; } .profile-section-heading > span { font-size: 9px; } .representative-status { flex-direction: column; gap: 8px; } .profile-footer { padding: 15px 18px; } .profile-footer > div { flex-wrap: wrap; } .profile-footer > div > span { width: 100%; text-align: right; } .individual-record { gap: 7px; } .individual-record > b { font-size: 16px; } }
@media (prefers-reduced-motion: reduce) { .switch-visual::after { transition: none; } }
@media (max-width: 580px) { .profile-ranks strong { font-size: clamp(12px, 3.7vw, 18px); } }
</style>
