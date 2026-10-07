<script setup vapor>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { game, initialize, go, toggleMusic, downloadSave, startAudio, pauseAutomaticMeet } from './lib/game.js'
import { authState, signOut } from './lib/auth.js'
import { syncState, retryCloudSync, stopCloudSync } from './lib/cloud.js'
import HomeView from './components/HomeView.vue'
import SchoolsView from './components/SchoolsView.vue'
import TeamsView from './components/TeamsView.vue'
import RaceView from './components/RaceView.vue'
import StudentDialog from './components/StudentDialog.vue'
import Icon from './components/Icon.vue'
import AuthPanel from './components/AuthPanel.vue'

const progressLabel = computed(() => syncState.busy && !syncState.ready ? syncState.phase : ({ population: '正在建立全國班級與學生', ranking: '正在計算全國能力排名', complete: '全國資料生成完成' }[game.phase] || game.phase))
const displayedProgress = computed(() => syncState.busy && !syncState.ready ? syncState.progress : game.progress)
const saveStatus = computed(() => game.saving ? '保存中' : syncState.busy ? '同步中' : syncState.pending ? `${syncState.pending} 筆待同步` : syncState.ready ? '雲端已同步' : game.ready ? '本機已存檔' : '讀取存檔中')
function preventUnsavedExit(event) { if (game.saving || game.exportBusy) { event.preventDefault(); event.returnValue = '' } }
function reload() { window.location.reload() }
async function logout() { pauseAutomaticMeet(); stopCloudSync(); await signOut() }
function resumeSync() { if (authState.user && game.world) void retryCloudSync() }
function openSchools() { game.nationalRanking = false; go('schools') }
function openNationalRanking() { game.nationalRanking = true; go('schools') }
onMounted(() => {
  if (authState.user) initialize()
  watch(() => authState.user, user => { if (user && !game.ready) initialize(); else if (user) resumeSync(); else stopCloudSync() })
  document.addEventListener('pointerdown', startAudio)
  document.addEventListener('keydown', startAudio)
  window.addEventListener('beforeunload', preventUnsavedExit)
  window.addEventListener('online', resumeSync)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', startAudio)
  document.removeEventListener('keydown', startAudio)
  window.removeEventListener('beforeunload', preventUnsavedExit)
  window.removeEventListener('online', resumeSync)
})
</script>

<template>
  <div class="app-shell arcade-shell" :class="{ 'interior-shell': game.tab !== 'home' || !authState.user }">
    <header class="topbar">
      <button class="wordmark" @click="go('home')" aria-label="Super Runners 首頁">
        <svg viewBox="0 0 32 32" class="brand-mark" aria-hidden="true"><path d="M18 2h6v6h-6zm-6 8h10v4h-5v5h-5zm-5 1h5v4H7zm14 3h5v4h-5zm-9 5h5v5h-5zm-6 5h6v4H6zm12-5h5v8h-5z" /></svg>
        <span>SUPER<span class="brand-light">RUNNERS</span></span>
      </button>
      <div v-if="authState.user" class="topbar-tools">
        <span class="save-status"><i :class="{ pulsing: game.saving || syncState.busy || !game.ready }"></i>{{ saveStatus }}</span>
        <button class="icon-button" @click="toggleMusic" :disabled="!game.ready" :aria-label="game.muted ? '開啟背景音樂' : '靜音背景音樂'" :title="game.muted ? '開啟背景音樂' : '靜音背景音樂'"><Icon :name="game.muted ? 'muted' : 'sound'" /></button>
        <button v-if="authState.user" class="auth-user" @click="logout" title="登出" aria-label="登出"><Icon name="user" :size="16" /><span>登出</span></button>
        <button class="btn small export-button" @click="downloadSave" :disabled="!game.ready || game.exportBusy || game.saving"><Icon name="download" :size="16" /><span>{{ game.exportBusy ? '正在匯出…' : '匯出存檔' }}</span></button>
      </div>
    </header>

    <main>
      <div v-if="authState.user && game.ready && (syncState.error || (!syncState.ready && syncState.busy))" class="cloud-sync-notice" role="status"><span>{{ syncState.busy ? syncState.phase + ' · ' + syncState.progress + '%' : syncState.error }}</span><button class="btn small" :disabled="syncState.busy" @click="resumeSync">{{ syncState.busy ? '同步中…' : '重試同步' }}</button></div>
      <nav v-if="authState.user && game.ready && game.tab !== 'home'" class="page-navigation" aria-label="遊戲選單">
        <button class="return-home" @click="go('home')"><Icon name="back" :size="17" />回主場</button>
        <div class="page-navigation-tabs">
          <button class="nav-schools" :aria-current="game.tab === 'schools' && !game.nationalRanking ? 'page' : undefined" @click="openSchools"><Icon name="school" :size="17" />學校資料</button>
          <button class="nav-national" :aria-current="game.tab === 'schools' && game.nationalRanking ? 'page' : undefined" @click="openNationalRanking"><Icon name="trophy" :size="17" />全國排名</button>
          <button class="nav-teams" :aria-current="game.tab === 'teams' ? 'page' : undefined" @click="go('teams')"><Icon name="team" :size="17" />我的隊伍</button>
          <button class="nav-race" :aria-current="game.tab === 'race' ? 'page' : undefined" @click="go('race')"><Icon name="flag" :size="17" />校內比賽</button>
        </div>
      </nav>
      <div v-if="authState.loading" class="auth-loading panel" role="status">正在確認登入狀態…</div>
      <AuthPanel v-else-if="!authState.user" />
      <template v-else>
        <HomeView v-if="game.tab === 'home'" />
        <template v-else-if="game.ready">
          <SchoolsView v-if="game.tab === 'schools'" />
          <TeamsView v-else-if="game.tab === 'teams'" />
          <RaceView v-else-if="game.tab === 'race'" />
        </template>
        <div v-else class="await-world panel"><Icon name="globe" :size="42" /><h2>你的田徑世界即將就緒</h2><p class="muted">正在讀取存檔；此瀏覽器沒有資料時，會從雲端還原。</p></div>

        <div v-if="!game.ready" class="loading-card" role="status" aria-live="polite">
          <template v-if="game.error"><Icon name="settings" /><div><strong>無法載入本機資料</strong><p>{{ game.error }}</p></div><button class="btn small" @click="reload">重新載入</button></template>
          <template v-else><div class="loading-orbit"></div><div class="loading-copy"><strong>{{ progressLabel }}</strong><p>首次同步需要一點時間，請保持此頁開啟。固定資料之後會直接從本機讀取。</p><div class="progress-line"><i :style="{ width: displayedProgress + '%' }"></i></div></div><span class="mono">{{ displayedProgress }}%</span></template>
        </div>
      </template>
    </main>

    <footer class="site-footer"><span><i class="tiny-square"></i> MADE FOR THE NEXT GENERATION</span><span>臺灣 · 115 學年度 <b>/</b> 像素田徑世界 <b>/</b> V.01</span></footer>
    <div v-if="game.toast" class="toast" role="status"><Icon name="check" :size="18" />{{ game.toast }}</div>
    <StudentDialog v-if="authState.user && game.ready && game.studentId" />
  </div>
</template>
