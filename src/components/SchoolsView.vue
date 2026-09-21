<script setup vapor>
import { computed, ref, watch } from 'vue'
import { game, getSchool, getClass, getStudent, getTeam, toggleFavorite, toggleFollow, timeText, studentTime, go } from '../lib/game.js'
import SchoolPicker from './SchoolPicker.vue'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'

const grade = ref(1)
const classId = ref('')
const scope = ref('class')
const page = ref(1)
const pageSize = 15
const gradeLabels = ['一年級', '二年級', '三年級']
const scopeLabels = { class: '班級', grade: '年級', school: '全校' }
const school = computed(() => { game.revision; const value = getSchool(game.schoolId); return value ? { ...value } : null })
const team = computed(() => { game.revision; const value = school.value && getTeam(school.value.teamId); return value ? { ...value, memberIds: [...value.memberIds] } : null })
const isFavorite = computed(() => { game.revision; return game.world.favoriteSchoolIds.includes(game.schoolId) })
const isFollowed = computed(() => { game.revision; return team.value ? game.world.followedTeamIds.includes(team.value.id) : false })
const classes = computed(() => school.value?.classes.filter(cls => cls.grade === grade.value) || [])
const selectedClass = computed(() => getClass(classId.value))
const studentCount = computed(() => school.value?.classes.reduce((sum, cls) => sum + cls.studentIds.length, 0) || 0)
const rankedStudents = computed(() => {
  game.revision
  if (!school.value) return []
  const selectedClasses = scope.value === 'school' ? school.value.classes : scope.value === 'grade' ? classes.value : selectedClass.value ? [selectedClass.value] : []
  return selectedClasses.flatMap(cls => cls.studentIds).map(getStudent).filter(Boolean)
    .map(student => ({ ...student, ranks: { ...student.ranks } }))
    .sort((a, b) => a.ranks[scope.value] - b.ranks[scope.value] || studentTime(a) - studentTime(b) || a.id.localeCompare(b.id))
})
const pageCount = computed(() => Math.max(1, Math.ceil(rankedStudents.value.length / pageSize)))
const visibleStudents = computed(() => rankedStudents.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const awards = computed(() => { game.revision; return game.world.awards.filter(award => award.schoolId === game.schoolId).slice().sort((a, b) => b.dateTime.localeCompare(a.dateTime) || a.place - b.place) })
const tableLabel = computed(() => scope.value === 'school' ? '全校學生' : scope.value === 'grade' ? `${gradeLabels[grade.value - 1]}學生` : selectedClass.value?.name || '班級學生')

watch(() => game.schoolId, () => { grade.value = 1; classId.value = getSchool(game.schoolId)?.classes.find(cls => cls.grade === 1)?.id || ''; page.value = 1 }, { immediate: true })
watch(grade, () => { classId.value = classes.value[0]?.id || '' })
watch([grade, classId, scope], () => { page.value = 1 })
watch(pageCount, count => { if (page.value > count) page.value = count })
</script>

<template>
  <section class="content-view schools-view">
    <div class="view-header"><div><div class="eyebrow">THE NEXT GENERATION</div><h1>學校資料<span class="heading-dot">.</span></h1><p class="muted">每一所學校，都藏著下一位跑道新星。</p></div><span class="badge green"><Icon name="globe" :size="14" />臺灣 · {{ game.world.schools.length }} 所學校</span></div>
    <div class="school-layout">
      <SchoolPicker v-model="game.schoolId" />
      <div v-if="school" class="panel detail-panel school-detail">
        <div class="school-heading"><div class="school-emblem"><Icon name="school" :size="32" /></div><div class="school-heading-copy"><span class="eyebrow">{{ school.city }} <span class="school-code">/ {{ school.officialCode }}</span></span><h2>{{ school.name }}</h2><p v-if="school.address" class="school-address"><Icon name="pin" :size="13" />{{ school.address }}</p></div></div>
        <div class="school-actions"><button class="btn small" :class="{ primary: isFavorite }" :aria-pressed="isFavorite" :disabled="game.saving" @click="toggleFavorite(school.id)"><Icon name="star" :size="16" />{{ isFavorite ? '已收藏學校' : '收藏學校' }}</button><button v-if="team" class="btn small" :class="{ primary: isFollowed }" :aria-pressed="isFollowed" :disabled="game.saving" @click="toggleFollow(team.id)"><Icon name="heart" :size="16" />{{ isFollowed ? '已關注田徑隊' : '關注田徑隊' }}</button><button class="btn small ghost school-race-link" @click="go('race', school.id)">舉辦校內比賽<Icon name="arrow" :size="16" /></button></div>
        <div class="stat-grid school-stat-grid"><div class="stat-card"><strong>3</strong><span>年級</span></div><div class="stat-card"><strong>{{ school.classes.length }}</strong><span>班級</span></div><div class="stat-card"><strong>{{ studentCount.toLocaleString() }}</strong><span>學生</span></div><div class="stat-card"><strong>{{ team?.memberIds.length || 0 }}</strong><span>田徑隊員</span></div></div>
        <div class="section-title"><h3>發掘跑道上的潛力</h3><span class="muted">學生名冊</span></div>
        <div class="grade-picker" aria-label="選擇年級"><button v-for="year in 3" :key="year" type="button" :class="{ active: grade === year }" :aria-pressed="grade === year" @click="grade = year">{{ gradeLabels[year - 1] }}<span>{{ school.classes.filter(cls => cls.grade === year).length }} 班</span></button></div>
        <div class="class-picker" aria-label="選擇班級"><button v-for="cls in classes" :key="cls.id" class="chip" :class="{ active: classId === cls.id }" :aria-pressed="classId === cls.id" @click="classId = cls.id; scope = 'class'"><i class="class-color" :style="{ background: cls.color }"></i>{{ cls.name }}<small>{{ cls.studentIds.length }} 人</small></button></div>
        <div class="roster-toolbar"><div><strong>{{ tableLabel }}</strong><span class="muted">{{ rankedStudents.length }} 位</span></div><label>能力排名範圍<select v-model="scope"><option value="class">班級排名</option><option value="grade">年級排名</option><option value="school">全校排名</option></select></label></div>
        <p class="ranking-note">依百米個人最佳排序；尚未參賽的學生以預估 100m 成績排名。點選姓名查看完整能力。</p>
        <div class="table-wrap"><table class="data-table student-table"><thead><tr><th>{{ scopeLabels[scope] }}排名</th><th>學生 / 學號</th><th>班級</th><th>性別 / 年齡</th><th>百米成績</th><th>隊員身分</th></tr></thead><tbody><tr v-for="student in visibleStudents" :key="student.id"><td><span class="rank-number" :class="{ 'rank-leading': student.ranks[scope] <= 3 }">{{ String(student.ranks[scope]).padStart(2, '0') }}</span></td><td><button class="student-link school-student-link" @click="game.studentId = student.id"><PixelRunner :seed="student.id" :gender="student.gender" :height="student.height" :weight="student.weight" :color="getClass(student.classId).color" :size="36" /><span><strong>{{ student.name }}<em v-if="student.nickname">{{ student.nickname }}</em></strong><small class="mono">{{ student.studentNumber }}</small></span></button></td><td><i class="class-color" :style="{ background: getClass(student.classId).color }"></i>{{ getClass(student.classId).name }}</td><td>{{ student.gender }}<small>{{ student.age }} 歲</small></td><td><span class="result-time mono">{{ timeText(studentTime(student)) }}<small>s</small></span><small class="time-kind" :class="{ estimated: student.best100 === null }">{{ student.best100 === null ? '預估 100m' : '個人最佳' }}</small></td><td><span v-if="student.isNationalTeam" class="badge green">國家代表</span><span v-else-if="student.isCityTeam" class="badge green">縣市代表</span><span v-else-if="student.isSchoolTeam" class="badge green">校隊</span><span v-else class="muted">一般學生</span></td></tr></tbody></table></div>
        <div v-if="!rankedStudents.length" class="empty-state">這個範圍目前沒有學生。</div>
        <div class="pagination"><span class="muted">{{ rankedStudents.length ? (page - 1) * pageSize + 1 : 0 }}–{{ Math.min(page * pageSize, rankedStudents.length) }} / {{ rankedStudents.length }} 位學生</span><div><button class="btn small ghost" :disabled="page <= 1" aria-label="上一頁學生" @click="page--"><Icon name="back" :size="15" /></button><span aria-live="polite">{{ page }} <span class="muted">/ {{ pageCount }}</span></span><button class="btn small ghost" :disabled="page >= pageCount" aria-label="下一頁學生" @click="page++"><Icon name="arrow" :size="15" /></button></div></div>
        <div class="section-title school-honors-title"><h3><Icon name="trophy" :size="19" />歷年榮譽</h3><span class="muted">{{ awards.length }} 面獎牌</span></div>
        <div v-if="!awards.length" class="school-medals-empty"><Icon name="trophy" :size="28" /><div><strong>第一面獎牌，等你來寫下</strong><p>各班百米全數完賽後，前三名會在這裡留下年度、姓名與成績。</p></div></div>
        <div v-else class="school-awards"><div v-for="award in awards" :key="award.id" class="award-row"><span class="medal-icon" :class="'medal-' + award.place"><Icon name="trophy" :size="20" /></span><div><strong>{{ award.year }} · {{ award.competition }} · {{ award.medal }}</strong><button class="medal-student" @click="game.studentId = award.studentId">{{ award.studentName }}<Icon name="arrow" :size="12" /></button></div><b class="mono">{{ timeText(award.time) }} s</b></div></div>
      </div>
      <div v-else class="panel detail-panel school-welcome"><div class="welcome-track"><PixelRunner seed="school-explore-1" gender="女" color="#c7f36a" :size="94" /><PixelRunner seed="school-explore-2" gender="男" color="#a2bcdc" :size="75" /></div><span class="eyebrow">BIG DREAMS START AT SCHOOL</span><h2>下一位新星，從這裡出發</h2><p>選擇一所學校，認識班上的每一位跑者，<br />收藏主場、關注田徑隊，發掘他們的百米潛力。</p><span class="badge"><Icon name="pin" :size="14" />22 縣市 · 全國國中名錄</span></div>
    </div>
  </section>
</template>

<style scoped>
.school-detail { min-width: 0; }
.school-heading { display: flex; gap: 18px; align-items: center; }
.school-emblem { display: grid; place-items: center; width: 68px; height: 74px; flex-shrink: 0; background: #2d3d2c; color: #c7f36a; border: 1px solid #46563c; border-radius: 14px 14px 22px 22px; }
.school-heading-copy { min-width: 0; }
.school-heading h2 { margin: 8px 0; font-size: clamp(21px, 2.1vw, 30px); letter-spacing: -.5px; }
.school-code { color: #89998d; margin-left: 8px; }
.school-address { display: flex; align-items: center; gap: 5px; margin: 0; color: #9daa9f; font-size: 11px; line-height: 1.7; }
.school-address svg { flex-shrink: 0; }
.school-actions { display: flex; flex-wrap: wrap; gap: 9px; margin: 24px 0; }
.school-race-link { margin-left: auto; }
.school-stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 31px; }
.grade-picker { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 5px; background: #132019; border-radius: 8px; margin-top: 18px; }
.grade-picker button { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 11px 6px; border: 0; border-radius: 5px; background: transparent; color: #a3b1a7; cursor: pointer; font: inherit; font-size: 13px; }
.grade-picker button span { font-size: 10px; opacity: .7; }
.grade-picker button.active { background: #34462d; color: #c7f36a; }
.class-picker { display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0 27px; }
.class-picker .chip { gap: 8px; border: 1px solid #3a4a3c; background: #202f25; color: #b5c2b8; }
.class-picker .chip.active { border-color: #809352; background: #34412a; color: #d3efa4; }
.class-picker small { color: #96a58f; font-size: 10px; }
.class-color { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; box-shadow: 0 0 0 1px #fff3 inset; }
.roster-toolbar, .roster-toolbar > div, .roster-toolbar label { display: flex; align-items: center; gap: 12px; }
.roster-toolbar { justify-content: space-between; flex-wrap: wrap; }
.roster-toolbar strong { font-size: 15px; }
.roster-toolbar > div > span, .roster-toolbar label { font-size: 11px; }
.roster-toolbar label { color: #a3b1a7; }
.roster-toolbar select { padding: 8px 10px; border: 1px solid #3b4b40; border-radius: 5px; background: #17271c; color: #e4e9d8; font: inherit; }
.ranking-note { color: #8f9f92; font-size: 10px; line-height: 1.9; margin: 12px 0 15px; }
.student-table { min-width: 635px; }
.student-table th { white-space: nowrap; }
.school-student-link { gap: 9px; }
.school-student-link strong { font-size: 12px; font-weight: 500; }
.school-student-link em { font-style: normal; font-size: 10px; color: #c7f36a; margin-left: 6px; }
.rank-number { color: #819488; font: 14px ui-monospace, SFMono-Regular, Menlo, monospace; }
.rank-leading { color: #c7f36a; }
.result-time { font-size: 15px; color: #eff1df; }
.result-time small { display: inline; font-size: 10px; margin-left: 4px; color: #96a18f; }
.time-kind { color: #b1c19c; }
.time-kind.estimated { color: #88998f; }
.student-table .badge { font-size: 9px; padding: 5px 7px; }
.pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 18px; font-size: 11px; }
.pagination > div { display: flex; align-items: center; gap: 15px; }
.pagination .btn { min-width: 30px; padding: 7px; }
.school-honors-title { margin-top: 34px; padding-top: 26px; border-top: 1px solid #344037; }
.school-honors-title h3 { display: flex; align-items: center; gap: 9px; }
.school-honors-title svg { color: #c7f36a; }
.school-medals-empty { display: flex; align-items: center; gap: 19px; padding: 25px; background: #16221b; border: 1px dashed #40503e; border-radius: 8px; color: #9ba995; }
.school-medals-empty svg { flex-shrink: 0; color: #b0c090; }
.school-medals-empty strong { font-size: 12px; color: #c5d1bb; font-weight: 500; }
.school-medals-empty p { margin: 7px 0 0; font-size: 11px; line-height: 1.8; }
.school-awards { max-height: 380px; overflow-y: auto; }
.medal-student { display: flex; align-items: center; gap: 7px; padding: 0; margin-top: 7px; color: #a7b896; border: 0; background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.school-welcome { display: flex; align-items: center; justify-content: center; flex-direction: column; min-height: 580px; padding: 60px 28px; text-align: center; }
.welcome-track { display: flex; align-items: end; justify-content: center; gap: 7px; width: 230px; border-bottom: 2px solid #44543b; margin-bottom: 30px; padding: 18px; background: linear-gradient(transparent, #263625); border-radius: 100px 100px 0 0; }
.school-welcome .eyebrow { font-size: 9px; }
.school-welcome h2 { margin: 18px 0 9px; font-size: clamp(19px, 2vw, 27px); }
.school-welcome p { margin: 0 0 23px; color: #9eaea0; font-size: 13px; line-height: 2; }
@media (max-width: 760px) { .school-race-link { margin-left: 0; } .school-stat-grid { gap: 7px; } .school-emblem { width: 54px; height: 62px; } .school-heading { gap: 12px; } .grade-picker button { flex-direction: column; gap: 4px; } .school-medals-empty { padding: 18px; } .school-welcome { min-height: 400px; } }
</style>
