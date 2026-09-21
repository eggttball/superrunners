<script setup vapor>
import { computed, ref } from 'vue'
import { game, go, getTeam, getStudent, getSchool, getClass, toggleFollow, timeText, dateText } from '../lib/game.js'
import Icon from './Icon.vue'
import PixelRunner from './PixelRunner.vue'

const selectedId = ref('')
const followed = computed(() => {
  game.revision
  return game.world.followedTeamIds.map(getTeam).filter(Boolean).map(team => ({ ...team }))
})
const selected = computed(() => { game.revision; const team = followed.value.find(team => team.id === selectedId.value); return team || null })
const members = computed(() => { game.revision; return selected.value ? selected.value.memberIds.map(getStudent).filter(Boolean).map(student => ({ ...student })) : [] })
const awards = computed(() => { game.revision; return selected.value ? game.world.awards.filter(award => selected.value.awardIds.includes(award.id)) : [] })
const typeLabel = type => ({ school: '學校田徑隊', city: '縣市代表隊', national: '國家代表隊' }[type])
</script>

<template>
  <section class="content-view">
    <div class="view-header"><div><div class="eyebrow">YOUR CLUBHOUSE</div><h1>我的隊伍<span class="heading-dot">.</span></h1><p class="muted">留意每一顆新星，陪伴他們跑得更遠。</p></div><button class="btn primary" @click="go('schools')"><Icon name="school" :size="18" />探索學校<Icon name="arrow" :size="18" /></button></div>
    <div v-if="!followed.length" class="panel team-empty">
      <div class="empty-team-sprites"><PixelRunner seed="empty-team-1" gender="女" color="#c7f36a" :size="85" /><PixelRunner seed="empty-team-2" gender="男" color="#eca675" :size="105" /><PixelRunner seed="empty-team-3" gender="女" color="#8caeda" :size="85" /></div>
      <span class="eyebrow">EVERY GREAT TEAM STARTS SOMEWHERE</span><h2>你的第一支隊伍，正在等你</h2><p>前往學校資料，點選「關注田徑隊」，<br />就能在這裡追蹤成員、最佳成績與得獎紀錄。</p><button class="btn primary" @click="go('schools')">發掘一支隊伍<Icon name="arrow" :size="18" /></button>
      <div class="representative-note"><Icon name="globe" :size="18" /><span>縣市與國家代表隊將於下一階段透過自動選拔產生。</span></div>
    </div>
    <div v-else class="teams-layout">
      <div class="team-list"><button v-for="team in followed" :key="team.id" class="panel team-list-card" :class="{ selected: selectedId === team.id }" @click="selectedId = team.id"><div class="team-emblem"><Icon :name="team.type === 'school' ? 'school' : 'globe'" :size="26" /></div><span class="badge">{{ typeLabel(team.type) }}</span><h3>{{ team.name }}</h3><p class="muted">{{ team.city }} · {{ team.memberIds.length }} 位隊員</p><span class="team-list-footer">查看隊伍 <Icon name="arrow" :size="18" /></span></button></div>
      <div v-if="selected" class="panel team-detail">
        <div class="split-heading"><div><span class="eyebrow">{{ typeLabel(selected.type) }}</span><h2>{{ selected.name }}</h2></div><button class="btn small ghost" @click="toggleFollow(selected.id)"><Icon name="heart" :size="16" />取消關注</button></div>
        <p class="muted">遊戲內成立於 {{ dateText(selected.createdAt) }}</p>
        <div class="stat-grid compact"><div class="stat-card"><strong>{{ members.length }}</strong><span>田徑隊員</span></div><div class="stat-card"><strong>{{ awards.length }}</strong><span>歷年獎牌</span></div><div class="stat-card"><strong>{{ timeText(Math.min(...members.map(s => s.best100 ?? Infinity))) }}</strong><span>隊內百米最佳 / 秒</span></div></div>
        <div class="section-title"><h3>隊員名單</h3><span class="muted">點選隊員查看完整資料</span></div>
        <div v-if="!members.length" class="empty-state">目前尚無隊員。可在學校資料將學生加入田徑隊。</div>
        <div v-else class="table-wrap"><table class="data-table"><thead><tr><th>隊員</th><th>縣市 / 學校</th><th>班級 / 學號</th><th>百米最佳</th></tr></thead><tbody><tr v-for="student in members" :key="student.id"><td><button class="student-link" @click="game.studentId = student.id"><PixelRunner :seed="student.id" :gender="student.gender" :height="student.height" :weight="student.weight" :color="getClass(student.classId).color" :size="33" /><span>{{ student.name }}<small v-if="student.nickname">{{ student.nickname }}</small></span></button></td><td>{{ getSchool(student.schoolId).city }}<small>{{ getSchool(student.schoolId).name }}</small></td><td>{{ getClass(student.classId).name }}<small class="mono">{{ student.studentNumber }}</small></td><td class="mono">{{ timeText(student.best100) }}<small>{{ student.best100 === null ? '尚未參賽' : '秒' }}</small></td></tr></tbody></table></div>
        <div class="section-title"><h3>歷年榮譽</h3><Icon name="trophy" :size="20" /></div>
        <p v-if="!awards.length" class="empty-state small-empty">獎牌櫃等著第一場勝利。校內百米各班前三名會留下紀錄。</p>
        <div v-for="award in awards" :key="award.id" class="award-row"><span class="medal-icon" :class="'medal-' + award.place"><Icon name="trophy" :size="20" /></span><div><strong>{{ award.year }} · {{ award.competition }} · {{ award.medal }}</strong><small>{{ award.studentName }} · 100 公尺</small></div><b class="mono">{{ timeText(award.time) }} s</b></div>
      </div>
      <div v-else class="panel empty-state team-prompt"><Icon name="team" :size="44" /><h2>選擇一支隊伍</h2><p>看看他們的成長，與下一個目標。</p></div>
    </div>
  </section>
</template>
