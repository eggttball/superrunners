<script setup vapor>
import { computed } from 'vue'
import { game, go } from '../lib/game.js'
import { catalog, catalogSource } from '../data/schools.js'
import Track from './Track.vue'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'
import '../home.css'

const menus = [
  { id: 'race', title: '校內比賽', sub: '各就各位，準備刷新紀錄！', color: '#ff726b', gender: '女', tag: 'GO!' },
  { id: 'teams', title: '我的隊伍', sub: '集合！你的明日之星', color: '#8260d9', gender: '男', tag: 'TEAM' },
  { id: 'schools', title: '學校資料', sub: '下一位飛毛腿，會在哪裡？', color: '#327dcc', gender: '女', tag: 'MAP' },
]
const upcoming = [
  { title: '區域比賽', icon: 'pin' },
  { title: '全國大賽', icon: 'trophy' },
  { title: '資助隊伍', icon: 'heart' },
  { title: '設定', icon: 'settings' },
]
const stats = computed(() => {
  game.revision
  return { students: game.world?.students.length || 0, races: game.world?.races.length || 0, teams: game.world?.followedTeamIds.length || 0 }
})
</script>

<template>
  <section class="home-game" aria-label="田徑遊戲主畫面">
    <div class="home-game-layout">
      <section class="playfield" aria-labelledby="playfield-title">
        <header class="playfield-header">
          <div class="playfield-label"><span class="pixel-checker" aria-hidden="true"></span><h1 id="playfield-title">你的主場</h1><span class="playfield-season">115 學年度</span></div>
          <span class="playfield-weather"><Icon name="sun" :size="18" />晴天，適合開跑！</span>
        </header>
        <div class="playfield-scene">
          <Track :animated="true" arcade />
        </div>
        <div class="playfield-caption"><span><span class="game-live-dot" aria-hidden="true"></span>今天，也要比昨天更快一點。</span><span class="playfield-spec">400m <b>×</b> 8 跑道</span></div>
      </section>

      <aside class="game-menu-panel" aria-label="遊戲主選單">
        <div class="game-menu-intro"><span class="game-player">PLAYER 01</span><span class="game-level"><Icon name="star" :size="13" />新賽季</span><h2>準備好，<span>開跑！</span></h2><p>選好下一站，故事由你開始。</p></div>
        <nav class="game-main-menu" aria-label="選擇遊戲功能">
          <button v-for="menu in menus" :key="menu.id" class="game-menu-button" :class="'game-menu-' + menu.id" @click="go(menu.id)">
            <span class="game-menu-portrait"><PixelRunner :seed="'menu-' + menu.id" :gender="menu.gender" :color="menu.color" :size="60" :backdrop="false" running /></span>
            <span class="game-menu-copy"><strong>{{ menu.title }}</strong><small>{{ menu.sub }}</small></span>
            <span class="game-menu-tag">{{ menu.tag }}</span>
            <Icon class="game-menu-arrow" name="arrow" :size="20" />
          </button>
        </nav>
        <div class="game-upcoming-title"><span>下一章冒險</span><small>COMING SOON</small></div>
        <div class="game-upcoming">
          <button v-for="menu in upcoming" :key="menu.title" disabled :aria-label="menu.title + '，下一階段開放'"><Icon :name="menu.icon" :size="18" /><span>{{ menu.title }}</span><span class="game-lock" aria-hidden="true">＋</span></button>
        </div>
        <div class="game-menu-tip"><Icon name="bolt" :size="18" /><span>每個傳奇，都從起跑線開始。</span></div>
      </aside>
    </div>

    <div class="game-world-bar" aria-label="田徑世界資料">
      <span class="game-world-label"><Icon name="globe" :size="18" />臺灣田徑世界</span>
      <span><b>{{ catalog.length.toLocaleString() }}</b> 所學校</span>
      <span><b>{{ stats.students ? stats.students.toLocaleString() : '—' }}</b> 位選手</span>
      <span><b>{{ stats.races }}</b> 場比賽</span>
      <span><b>{{ stats.teams }}</b> 支關注隊伍</span>
      <details class="game-world-info"><summary aria-label="學校資料來源與存檔說明">ⓘ</summary><p>學校名錄來自<a :href="catalogSource.url" target="_blank" rel="noopener noreferrer">教育部 115 學年度開放資料</a>。學生與成績皆為虛構。存檔保存在此瀏覽器，記得定期匯出。</p></details>
    </div>
  </section>
</template>
