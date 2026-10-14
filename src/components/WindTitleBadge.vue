<script setup vapor>
import { computed } from 'vue'
import { getWindTitle, timeText } from '../lib/game.js'
import Icon from './Icon.vue'
const props = defineProps({ studentId: String, compact: Boolean })
const title = computed(() => getWindTitle(props.studentId))
</script>

<template>
  <span v-if="title" class="wind-title-badge" :class="{ compact }" :title="`風速小子 · ${timeText(title.time)} 秒`" aria-label="風速小子">
    <Icon :name="compact ? 'trophy' : 'sprint'" :size="compact ? 14 : 16" /><span v-if="!compact">風速小子</span>
  </span>
</template>
