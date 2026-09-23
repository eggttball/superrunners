<script setup vapor>
import { ref } from 'vue'
import Track from './Track.vue'
import { useTrackCamera } from '../lib/useTrackCamera.js'

const surface = ref(null)
const { viewBox, canZoomOut, interaction, reset, pointerDown, pointerMove, pointerEnd, keyDown } = useTrackCamera(surface)
</script>

<template>
  <div class="track-explorer">
    <div ref="surface" class="track-explorer-surface" :class="{ 'is-dragging': interaction.dragging, 'is-zoomed': canZoomOut }"
      tabindex="0" role="region" aria-label="可縮放的操場"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd"
      @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @keydown="keyDown">
      <Track :animated="true" arcade :camera-view-box="viewBox" />
    </div>
    <button v-if="canZoomOut" type="button" class="track-camera-reset" @click="reset" title="回到全景（Home）">全景</button>
  </div>
</template>

<style scoped>
.track-explorer { position: relative; width: 100%; height: 100%; min-height: 0; isolation: isolate; }
.track-explorer-surface { width: 100%; height: 100%; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: zoom-in; }
.track-explorer-surface.is-zoomed { cursor: grab; }
.track-explorer-surface.is-dragging { cursor: grabbing; }
.track-explorer-surface:focus-visible { outline-offset: -4px; }
.track-camera-reset { position: absolute; right: 10px; top: 10px; min-width: 52px; height: 36px; padding: 0 10px; border: 2px solid #263c59; border-radius: 6px; background: #fff9e8; color: #263c59; box-shadow: 2px 2px 0 #263c593b; font-size: 11px; font-weight: 700; touch-action: manipulation; }
.track-camera-reset:hover { background: #ffdc61; }
@media (pointer: coarse) {
  .track-camera-reset { min-width: 58px; height: 44px; }
}
@media (max-width: 480px) {
  .track-camera-reset { top: 6px; right: 6px; }
}
</style>
