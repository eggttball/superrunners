<script setup vapor>
import { computed } from 'vue'
import { getWindTitle, timeText } from '../lib/game.js'
import Icon from './Icon.vue'
const props = defineProps({ studentId: String, compact: Boolean })
const title = computed(() => getWindTitle(props.studentId))
</script>

<template>
  <span v-if="title" class="wind-title-badge" :class="{ compact, 'wind-prince-badge': title.kind === 'prince', 'wind-god-badge': title.kind === 'god' }" :title="`${title.title}${title.city ? ' · ' + title.city : ''} · ${timeText(title.time)} 秒`" :aria-label="title.title">
    <Icon :name="title.kind === 'god' ? 'bolt' : title.kind === 'prince' ? 'flag' : compact ? 'trophy' : 'sprint'" :size="compact ? 14 : 16" /><span v-if="!compact">{{ title.title }}</span>
  </span>
</template>
