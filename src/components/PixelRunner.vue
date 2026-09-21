<script setup vapor>
import { computed } from 'vue'

const props = defineProps({
  seed: { type: String, default: 'runner' },
  color: { type: String, default: '#c4ed79' },
  gender: { type: String, default: '' },
  height: { type: [Number, String], default: 160 },
  weight: { type: [Number, String], default: 52 },
  speed: { type: Number, default: 0 },
  facing: { type: String, default: 'right' },
  backdrop: { type: Boolean, default: true },
  running: { type: Boolean, default: false },
  size: { type: [Number, String], default: 40 },
  overhead: { type: Boolean, default: false },
  label: { type: String, default: '' },
})

function seedHash(seed) {
  let hash = 2166136261
  for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return hash
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))

const appearance = computed(() => {
  const hash = seedHash(props.seed)
  const female = props.gender ? props.gender === '女' : Boolean((hash >>> 1) & 1)
  const heightScale = clamp(1 + (Number(props.height) - 160) * 0.0024, 0.93, 1.05)
  const weightScale = clamp(1 + (Number(props.weight) - 52) * 0.0032, 0.90, 1.18)
  return {
    female,
    // Five ordered skin-tone levels, from light to deep.
    skin: ['#f2c7a5', '#dfaa7d', '#c4875d', '#9e6244', '#70432f'][hash % 5],
    hair: ['#242524', '#352a24', '#493126', '#202a30', '#5a3b2a'][(hash >>> 3) % 5],
    pants: ['#24384c', '#34473d', '#44394f', '#4b3a32', '#253f46', '#3f4455', '#553842'][(hash >>> 6) % 7],
    shoes: ['#f5f0df', '#2b302f', '#df685b', '#e1bd55', '#70a8c2', '#dcd8d0', '#755b93'][(hash >>> 10) % 7],
    curly: (hash >>> 14) % 10 < 3,
    glasses: (hash >>> 18) % 6 === 0,
    longHair: female && (hash >>> 21) % 10 < 6,
    bodyTransform: `translate(12 23) scale(${weightScale} ${heightScale}) translate(-12 -23)`,
  }
})

const runnerStyle = computed(() => ({
  '--stride-duration': `${clamp(0.39 - Math.max(0, props.speed) * 0.022, 0.20, 0.38)}s`,
}))
</script>

<template>
  <svg
    class="pixel-runner"
    :class="[{ 'is-running': running }, 'run-d']"
    :width="size"
    :height="overhead ? Number(size) / 2 : size"
    :viewBox="overhead ? '0 0 16 8' : '0 0 24 24'"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :style="runnerStyle"
    shape-rendering="crispEdges"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g v-if="overhead">
      <g class="pose-a">
        <path d="M1 2h5v2H1zM2 5h4v2H2z" :fill="appearance.pants" />
        <path d="M0 2h2v2H0zM1 5h2v2H1z" :fill="appearance.shoes" />
        <path d="M8 0h3v2H8zM5 6h3v2H5z" :fill="appearance.skin" />
      </g>
      <g class="pose-b">
        <path d="M2 1h4v2H2zM1 4h5v2H1z" :fill="appearance.pants" />
        <path d="M1 1h2v2H1zM0 4h2v2H0z" :fill="appearance.shoes" />
        <path d="M5 0h3v2H5zM8 6h3v2H8z" :fill="appearance.skin" />
      </g>

      <path v-if="appearance.female" d="M5 2h7v4H5zM6 1h5v6H6z" :fill="color" />
      <path v-else d="M5 1h7v6H5zM4 2h9v4H4z" :fill="color" />
      <path d="M6 2h1v4H6z" fill="#fff" opacity=".48" />

      <path v-if="appearance.longHair" d="M9 1h4v6H9zM11 0h3v8h-3z" :fill="appearance.hair" />
      <path v-else-if="appearance.female" d="M10 1h4v6h-4zM12 0h2v8h-2z" :fill="appearance.hair" />
      <path d="M11 2h4v4h-4zM12 1h2v6h-2z" :fill="appearance.skin" />

      <path v-if="appearance.curly" d="M11 1h2V0h2v2h1v2h-2V3h-2v2h-1zM13 6h2v1h-2z" :fill="appearance.hair" />
      <path v-else d="M11 2h2v4h-2zM12 1h2v1h-2zM12 6h2v1h-2z" :fill="appearance.hair" />
      <path v-if="appearance.glasses" d="M14 2h1v2h-1zM14 5h1v1h-1z" fill="#26312c" />
      <path v-else d="M14 3h1v1h-1z" fill="#26312c" />
    </g>

    <template v-else-if="running">
      <rect v-if="backdrop" x="0" y="0" width="24" height="24" rx="3" fill="#e7ecdc" />
      <g :transform="`${facing === 'left' ? 'translate(24 0) scale(-1 1) ' : ''}${appearance.bodyTransform}`">
        <path d="M5 22h14v1H5z" fill="#143c2d" opacity=".13" />
        <g class="pose-a">
          <path d="M9 16h4v5H9zM13 17h4v3h-4z" :fill="appearance.pants" />
          <path d="M7 21h6v2H7zM16 20h5v2h-5z" :fill="appearance.shoes" />
          <path d="M7 12h3v5H7zM15 12h3v4h-3z" :fill="appearance.skin" />
        </g>
        <g class="pose-b">
          <path d="M8 17h4v3H8zM13 16h4v5h-4z" :fill="appearance.pants" />
          <path d="M5 20h6v2H5zM14 21h6v2h-6z" :fill="appearance.shoes" />
          <path d="M4 13h3v4H4zM17 12h3v5h-3z" :fill="appearance.skin" />
        </g>
        <path d="M8 11h10v7H8zM7 12h11v3H7z" :fill="color" />
        <path d="M10 9h4v3h-4z" :fill="appearance.skin" />
        <path v-if="appearance.female && appearance.longHair" d="M7 3h9v9H7zM8 2h8v13h-2V5h-4v10H8z" :fill="appearance.hair" />
        <path v-else-if="appearance.female" d="M8 3h8v8h-2V5h-4v6H8zM9 2h7v3H9z" :fill="appearance.hair" />
        <path v-else d="M8 3h8v4H8zM9 2h7v3H9z" :fill="appearance.hair" />
        <path d="M10 4h7v6h-5v2h-2z" :fill="appearance.skin" />
        <path d="M16 6h2v2h-2zM18 7h1v1h-1z" :fill="appearance.skin" />
        <path v-if="appearance.curly" d="M8 3h3V1h3v1h3V1h2v3h1v3h-2V5h-2V4h-2v2h-2v3H8V7H6V4h2z" :fill="appearance.hair" />
        <path v-if="appearance.glasses" d="M14 6h3v1h-3zM16 7h1v2h-1z" fill="#27312e" />
        <path v-else d="M16 7h1v1h-1z" fill="#26312c" />
      </g>
    </template>
    <template v-else>
      <rect v-if="backdrop" x="0" y="0" width="24" height="24" rx="3" fill="#e7ecdc" />
      <g :transform="appearance.bodyTransform">
      <path d="M6 22h13v1H6z" fill="#143c2d" opacity=".13" />

      <g class="pose-a">
        <path d="M8 17h4v4H8zM13 17h4v4h-4z" :fill="appearance.pants" />
        <path d="M7 21h5v2H7zM13 21h5v2h-5z" :fill="appearance.shoes" />
        <path d="M5 13h3v5H5zM17 13h3v5h-3z" :fill="appearance.skin" />
      </g>
      <g class="pose-b">
        <path d="M7 17h5v3H7zM13 17h4v4h-4z" :fill="appearance.pants" />
        <path d="M5 20h6v2H5zM14 21h6v2h-6z" :fill="appearance.shoes" />
        <path d="M4 13h4v3H4zM3 12h3v3H3zM17 14h3v3h-3zM19 13h3v3h-3z" :fill="appearance.skin" />
      </g>

      <template v-if="appearance.female">
        <path d="M7 12h11v3H7zM8 11h9v7H8zM9 17h7v1H9z" :fill="color" />
        <path d="M8 12h1v5H8z" fill="#fff" opacity=".52" />
      </template>
      <template v-else>
        <path d="M6 12h13v4H6zM7 11h11v7H7z" :fill="color" />
        <path d="M7 12h2v5H7z" fill="#fff" opacity=".52" />
      </template>

      <path d="M10 9h5v3h-5z" :fill="appearance.skin" />

      <template v-if="appearance.female && appearance.longHair">
        <path d="M6 3h12v10H6zM7 2h10v13h-2V5H9v10H7z" :fill="appearance.hair" />
        <path d="M8 4h9v6H8zM9 9h7v2H9z" :fill="appearance.skin" />
      </template>
      <template v-else-if="appearance.female">
        <path d="M6 3h12v7h-2v2H8v-2H6zM7 2h10v2H7z" :fill="appearance.hair" />
        <path d="M8 4h9v6H8zM9 9h7v2H9z" :fill="appearance.skin" />
      </template>
      <template v-else>
        <path d="M7 3h11v4H7zM8 2h9v2H8z" :fill="appearance.hair" />
        <path d="M8 4h9v6H8zM9 9h7v2H9z" :fill="appearance.skin" />
        <path d="M7 4h2v4H7zM8 3h10v2H8z" :fill="appearance.hair" />
      </template>

      <path v-if="appearance.curly" d="M7 2h3V1h3v1h3V1h2v2h2v3h-2v2h-2V5h-2V4h-2v2h-2v3H7V7H5V4h2z" :fill="appearance.hair" />

      <g v-if="appearance.glasses" fill="#27312e">
        <path d="M9 6h4v1H9zM9 7h1v2H9zM12 7h1v2h-1zM14 6h4v1h-4zM14 7h1v2h-1zM17 7h1v2h-1zM13 7h1v1h-1z" />
      </g>
      <g v-else fill="#26312c">
        <path d="M10 7h1v1h-1zM15 7h1v1h-1z" />
      </g>
      <path d="M12 9h3v1h-3z" fill="#8c4f43" opacity=".72" />
      </g>
    </template>
  </svg>
</template>

<style scoped>
.pixel-runner { display: inline-block; flex: 0 0 auto; vertical-align: middle; overflow: visible; image-rendering: pixelated; }
.pose-b { opacity: 0; }
.run-d.is-running .pose-a { animation: pixel-step-d-a var(--stride-duration) steps(1, end) infinite; }
.run-d.is-running .pose-b { animation: pixel-step-d-b var(--stride-duration) steps(1, end) infinite; }
@keyframes pixel-step-d-a { 0%, 49% { opacity: 1; transform: translate(0, 0); } 50%, 100% { opacity: 0; transform: translate(.2px, -.2px); } }
@keyframes pixel-step-d-b { 0%, 49% { opacity: 0; transform: translate(-.2px, -.2px); } 50%, 100% { opacity: 1; transform: translate(0, 0); } }
@media (prefers-reduced-motion: reduce) { .is-running .pose-a, .is-running .pose-b { animation: none; } }
</style>
