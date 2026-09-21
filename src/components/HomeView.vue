<script setup vapor>
import { computed } from 'vue'
import { game, go } from '../lib/game.js'
import { catalog, catalogSource } from '../data/schools.js'
import Track from './Track.vue'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'

const menus = [
  { id: 'teams', title: '我的隊伍', sub: '發掘潛力，集結新星', icon: 'team', number: '01' },
  { id: 'schools', title: '學校資料', sub: '走進全臺每一座校園', icon: 'school', number: '02' },
  { id: 'race', title: '校內比賽', sub: '站上起跑線，跑出紀錄', icon: 'flag', number: '03', primary: true },
  { title: '區域比賽', sub: '下一階段', icon: 'pin', number: '04' },
  { title: '全國大賽', sub: '下一階段', icon: 'trophy', number: '05' },
  { title: '資助隊伍', sub: '下一階段', icon: 'heart', number: '06' },
  { title: '設定', sub: '下一階段', icon: 'settings', number: '07' },
]
const stats = computed(() => {
  game.revision
  return { students: game.world?.students.length || 0, races: game.world?.races.length || 0, teams: game.world?.followedTeamIds.length || 0 }
})
</script>

<template>
  <section class="home-view">
    <div class="home-intro">
      <div>
        <div class="eyebrow"><span class="live-dot"></span> THE TRACK IS YOURS <span class="eyebrow-separator">/</span> 臺灣校園田徑</div>
        <h1>每個傳奇，<br class="mobile-break" />都從<span>起跑線</span>開始<span class="title-dot">.</span></h1>
        <p class="home-description">發掘校園裡的明日之星，讓每一份天賦，都有自己的跑道。</p>
      </div>
      <div class="season-stamp"><span>2026</span><strong>NEW SEASON</strong><small>115 學年度・第一賽季</small></div>
    </div>

    <div class="stadium-card">
      <div class="stadium-topline"><span><span class="live-dot"></span> 田徑基地 <b>THE STADIUM</b></span><span class="stadium-weather"><Icon name="sun" :size="16" />晴朗 · 微風 <b>READY TO RUN</b></span></div>
      <div class="stadium-stage">
        <Track :animated="true" />
        <div class="stadium-inscription"><span>WELCOME TO YOUR HOME GROUND</span><strong>RUN YOUR<br /><em>STORY.</em></strong><div class="pixel-squad"><PixelRunner seed="home-one" gender="女" color="#c7f36a" :size="38" running /><PixelRunner seed="home-two" gender="男" color="#e6a975" :size="38" running /><PixelRunner seed="home-three" gender="女" color="#80b9e4" :size="38" running /></div></div>
        <div class="track-annotation"><span class="annotation-line"></span><span>標準 400m 田徑場<br /><b>8 LANES · 1.22m / LANE</b></span></div>
      </div>
      <div class="stadium-bottomline"><span><span class="pixel-dot"></span> 今天，也是一個刷新紀錄的好日子。</span><span>100m SPRINT <span class="dim">/</span> YOUR NEXT PERSONAL BEST →</span></div>
    </div>

    <div class="menu-section-heading"><span class="eyebrow">YOUR NEXT MOVE</span><span class="muted">選擇下一站，開始你的田徑故事</span></div>
    <div class="home-menu">
      <button v-for="menu in menus" :key="menu.title" class="menu-card" :class="{ 'menu-primary': menu.primary, 'menu-unavailable': !menu.id }" :disabled="!menu.id" @click="go(menu.id)">
        <div class="menu-card-top"><Icon :name="menu.icon" :size="25" /><span class="menu-number">{{ menu.number }}</span></div>
        <strong>{{ menu.title }}</strong><small>{{ menu.sub }}</small><Icon v-if="menu.id" class="menu-arrow" name="arrow" :size="17" /><span v-else class="coming-label">SOON</span>
      </button>
    </div>

    <div class="world-strip">
      <div class="world-strip-label"><Icon name="globe" :size="25" /><div><strong>一個持續成長的田徑世界</strong><small>真實校園 × 原創像素選手</small></div></div>
      <div class="world-count"><strong>{{ catalog.length.toLocaleString() }}</strong><span>所國中與國中部</span></div>
      <div class="world-count"><strong>22</strong><span>個縣市</span></div>
      <div class="world-count"><strong>{{ stats.students ? stats.students.toLocaleString() : '—' }}</strong><span>位獨一無二的學生</span></div>
      <div class="world-count"><strong>{{ stats.races.toLocaleString() }}</strong><span>場百米分組賽</span></div>
    </div>
    <p class="data-note">學校名錄來自<a :href="catalogSource.url" target="_blank" rel="noopener noreferrer">教育部 115 學年度開放資料</a>；所有學生、身體素質與遊戲成績皆為虛構。資料保存在此瀏覽器，記得定期匯出你的世界。</p>
  </section>
</template>
