<script setup vapor>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { game, initialize, go, toggleMusic, downloadSave, startAudio } from './lib/game.js'
import { authState, signOut } from './lib/auth.js'
import HomeView from './components/HomeView.vue'
import SchoolsView from './components/SchoolsView.vue'
import TeamsView from './components/TeamsView.vue'
import RaceView from './components/RaceView.vue'
import StudentDialog from './components/StudentDialog.vue'
import Icon from './components/Icon.vue'
import AuthPanel from './components/AuthPanel.vue'

const labels = { home: '田徑基地', schools: '學校資料', teams: '我的隊伍', race: '校內比賽' }
const progressLabel = computed(() => ({ population: '正在建立全國班級與學生', ranking: '正在計算全國能力排名', complete: '全國資料生成完成' }[game.phase] || game.phase))
const showAuth = ref(false)
function preventUnsavedExit(event) { if (game.saving || game.exportBusy) { event.preventDefault(); event.returnValue = '' } }
function reload() { window.location.reload() }
async function logout() { await signOut(); showAuth.value = false }
onMounted(() => {
  initialize()
  document.addEventListener('pointerdown', startAudio)
  document.addEventListener('keydown', startAudio)
  window.addEventListener('beforeunload', preventUnsavedExit)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', startAudio)
  document.removeEventListener('keydown', startAudio)
  window.removeEventListener('beforeunload', preventUnsavedExit)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <button class="wordmark" @click="go('home')" aria-label="Super Runners 首頁">
        <svg viewBox="0 0 32 32" class="brand-mark" aria-hidden="true"><path d="M18 2h6v6h-6zm-6 8h10v4h-5v5h-5zm-5 1h5v4H7zm14 3h5v4h-5zm-9 5h5v5h-5zm-6 5h6v4H6zm12-5h5v8h-5z" /></svg>
        <span>SUPER<span class="brand-light">RUNNERS</span><small>校園田徑經理</small></span>
      </button>
      <nav class="main-nav" aria-label="主要選單">
        <button v-for="(label, tab) in labels" :key="tab" :class="{ active: game.tab === tab }" @click="go(tab)">{{ label }}</button>
      </nav>
      <div class="topbar-tools">
        <span class="save-status"><i :class="{ pulsing: game.saving || !game.ready }"></i>{{ game.saving ? '保存中' : game.ready ? '本機已存檔' : '建立世界中' }}</span>
        <button class="icon-button" @click="toggleMusic" :disabled="!game.ready" :aria-label="game.muted ? '開啟背景音樂' : '靜音背景音樂'" :title="game.muted ? '開啟背景音樂' : '靜音背景音樂'"><Icon :name="game.muted ? 'muted' : 'sound'" /></button>
        <button v-if="authState.user" class="auth-user" @click="logout" :title="`登出 ${authState.user.email}`"><span class="auth-avatar">{{ (authState.user.email || '?')[0].toUpperCase() }}</span><span class="auth-email">{{ authState.user.email }}</span><small>登出</small></button>
        <button v-else class="btn small auth-trigger" @click="showAuth = !showAuth"><Icon name="user" :size="16" />登入</button>
        <button class="btn small export-button" @click="downloadSave" :disabled="!game.ready || game.exportBusy || game.saving"><Icon name="download" :size="16" /><span>{{ game.exportBusy ? '正在匯出…' : '匯出存檔' }}</span></button>
      </div>
    </header>

    <main>
      <AuthPanel v-if="showAuth && !authState.user && game.tab === 'home'" />
      <HomeView v-if="game.tab === 'home'" />
      <template v-else-if="game.ready">
        <SchoolsView v-if="game.tab === 'schools'" />
        <TeamsView v-else-if="game.tab === 'teams'" />
        <RaceView v-else-if="game.tab === 'race'" />
      </template>
      <div v-else class="await-world panel"><Icon name="globe" :size="42" /><h2>你的田徑世界即將就緒</h2><p class="muted">第一次開啟會建立所有學校、班級與學生，完成後就能開始。</p></div>

      <div v-if="!game.ready" class="loading-card" role="status" aria-live="polite">
        <template v-if="game.error"><Icon name="settings" /><div><strong>無法載入本機資料</strong><p>{{ game.error }}</p></div><button class="btn small" @click="reload">重新載入</button></template>
        <template v-else><div class="loading-orbit"></div><div class="loading-copy"><strong>{{ progressLabel }}</strong><p>首次建立需要一點時間，之後會保留每一位學生。</p><div class="progress-line"><i :style="{ width: game.progress + '%' }"></i></div></div><span class="mono">{{ game.progress }}%</span></template>
      </div>
    </main>

    <footer class="site-footer"><span><i class="tiny-square"></i> MADE FOR THE NEXT GENERATION</span><span>臺灣 · 115 學年度 <b>/</b> 像素田徑世界 <b>/</b> V.01</span></footer>
    <div v-if="game.toast" class="toast" role="status"><Icon name="check" :size="18" />{{ game.toast }}</div>
    <StudentDialog v-if="game.ready && game.studentId" />
  </div>
</template>
