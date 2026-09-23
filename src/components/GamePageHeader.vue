<script setup vapor>
import PixelRunner from './PixelRunner.vue'

defineProps({
  title: String,
  caption: String,
  description: String,
  theme: { type: String, default: 'schools' },
})
const colors = { schools: '#61b9ac', teams: '#9b83cd', race: '#e87560' }
</script>

<template>
  <header class="page-hero">
    <div class="page-hero-portrait" aria-hidden="true">
      <PixelRunner :seed="'page-' + theme" :gender="theme === 'teams' ? '女' : '男'" :color="colors[theme]" :size="80" />
      <span class="portrait-ground"></span>
    </div>
    <div class="page-hero-copy">
      <span class="eyebrow"><span class="pixel-checker" aria-hidden="true"></span>{{ caption }}</span>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <div class="page-hero-extra"><slot /></div>
  </header>
</template>
