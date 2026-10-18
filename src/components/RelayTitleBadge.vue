<script setup vapor>
import { computed } from 'vue'
import { game, getClass, timeText } from '../lib/game.js'
import Icon from './Icon.vue'

const props = defineProps({ classId: String, compact: Boolean })
const champion = computed(() => {
  game.revision
  const schoolId = getClass(props.classId)?.schoolId
  const award = schoolId && game.world?.relayChampions?.[schoolId]
  return award?.classId === props.classId ? award : null
})
</script>

<template>
  <span v-if="champion" class="relay-title-badge" :class="{ compact }" :title="`${champion.title || '風速小班'} · ${timeText(champion.time)} 秒`" aria-label="風速小班">
    <Icon name="team" :size="compact ? 14 : 16" /><span v-if="!compact">{{ champion.title || '風速小班' }}</span>
  </span>
</template>

<style scoped>
.relay-title-badge { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex-shrink: 0; padding: 3px 7px; border: 1px solid #a65128; border-radius: 4px; background: #ffda78; color: #813212; font-size: 11px; font-weight: 800; vertical-align: middle; white-space: nowrap; box-shadow: 1px 2px 0 #a0452520; }
.relay-title-badge.compact { width: 21px; height: 21px; padding: 2px; }
</style>
