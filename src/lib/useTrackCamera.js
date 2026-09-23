import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { HOME_TRACK_VIEW } from './track-geometry.js'

const MIN_ZOOM = 1
const MAX_ZOOM = 10
const GESTURE_THRESHOLD = 4
const SINGLE_FINGER_PINCH_THRESHOLD = 18
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const distanceBetween = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)
const sceneCenter = {
  x: HOME_TRACK_VIEW.x + HOME_TRACK_VIEW.width / 2,
  y: HOME_TRACK_VIEW.y + HOME_TRACK_VIEW.height / 2,
}

export function useTrackCamera(surface) {
  const camera = reactive({ x: sceneCenter.x, y: sceneCenter.y, zoom: MIN_ZOOM })
  const size = reactive({ width: 0, height: 0 })
  const interaction = reactive({ dragging: false })
  const pointers = new Map()
  let gesture = null
  let gestureFrame = 0
  let observer = null
  let element = null

  // Expand the base view to include the green letterbox margins. This keeps the
  // 1× image identical to SVG "meet" and makes every green pixel interactive.
  const frame = computed(() => {
    const ratio = size.width && size.height ? size.width / size.height : HOME_TRACK_VIEW.width / HOME_TRACK_VIEW.height
    const width = Math.max(HOME_TRACK_VIEW.width, HOME_TRACK_VIEW.height * ratio)
    const height = Math.max(HOME_TRACK_VIEW.height, HOME_TRACK_VIEW.width / ratio)
    return { x: sceneCenter.x - width / 2, y: sceneCenter.y - height / 2, width, height }
  })
  const viewBox = computed(() => {
    if (!size.width || !size.height) return ''
    const width = frame.value.width / camera.zoom
    const height = frame.value.height / camera.zoom
    return [camera.x - width / 2, camera.y - height / 2, width, height].join(' ')
  })
  const canZoomOut = computed(() => camera.zoom > MIN_ZOOM)
  const canZoomIn = computed(() => camera.zoom < MAX_ZOOM)

  function setCamera(zoom, x, y) {
    const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    const halfWidth = frame.value.width / nextZoom / 2
    const halfHeight = frame.value.height / nextZoom / 2
    camera.zoom = nextZoom
    // At 1× there is exactly one valid position: the original full view.
    camera.x = clamp(x, frame.value.x + halfWidth, frame.value.x + frame.value.width - halfWidth)
    camera.y = clamp(y, frame.value.y + halfHeight, frame.value.y + frame.value.height - halfHeight)
  }

  function localPoint(event) {
    const rect = element.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function worldPoint(point) {
    return {
      x: camera.x + (point.x / size.width - .5) * frame.value.width / camera.zoom,
      y: camera.y + (point.y / size.height - .5) * frame.value.height / camera.zoom,
    }
  }

  function placeAnchor(anchor, point, zoom) {
    const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    setCamera(nextZoom,
      anchor.x - (point.x / size.width - .5) * frame.value.width / nextZoom,
      anchor.y - (point.y / size.height - .5) * frame.value.height / nextZoom)
  }

  function zoomAt(factor, point = { x: size.width / 2, y: size.height / 2 }) {
    if (!size.width || !size.height) return
    placeAnchor(worldPoint(point), point, camera.zoom * factor)
  }

  function panByWheel(deltaX, deltaY) {
    if (!size.width || !size.height) return
    setCamera(camera.zoom,
      camera.x - deltaX / size.width * frame.value.width / camera.zoom,
      camera.y - deltaY / size.height * frame.value.height / camera.zoom)
  }

  function pointerGeometry() {
    const [first, second] = pointers.values()
    if (!first) return null
    return second ? {
      point: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      distance: distanceBetween(first, second),
    } : { point: first, distance: 0 }
  }

  function beginGesture() {
    const geometry = pointerGeometry()
    gesture = geometry ? {
      anchor: worldPoint(geometry.point),
      zoom: camera.zoom,
      distance: geometry.distance,
      startPositions: new Map([...pointers].map(([id, point]) => [id, { ...point }])),
      movedPointers: new Set(),
      mode: pointers.size === 1 ? 'pan' : null,
    } : null
    interaction.dragging = pointers.size > 0
  }

  function clearGesture() {
    if (gestureFrame) cancelAnimationFrame(gestureFrame)
    gestureFrame = 0
    const ids = [...pointers.keys()]
    pointers.clear()
    gesture = null
    interaction.dragging = false
    for (const id of ids) {
      if (element?.hasPointerCapture(id)) element.releasePointerCapture(id)
    }
  }

  function pointerDown(event) {
    if (event.button !== 0 || pointers.size >= 2 || !size.width || !size.height) return
    if (event.cancelable) event.preventDefault()
    if (event.pointerType === 'mouse') element.focus({ preventScroll: true })
    pointers.set(event.pointerId, localPoint(event))
    element.setPointerCapture(event.pointerId)
    beginGesture()
  }

  function pointerMove(event) {
    if (!pointers.has(event.pointerId)) return
    const point = localPoint(event)
    const start = gesture?.startPositions.get(event.pointerId)
    pointers.set(event.pointerId, point)
    if (start && distanceBetween(point, start) >= GESTURE_THRESHOLD) {
      gesture.movedPointers.add(event.pointerId)
    }
    if (gestureFrame) return
    gestureFrame = requestAnimationFrame(() => {
      gestureFrame = 0
      applyGesture()
    })
  }

  function applyGesture() {
    const geometry = pointerGeometry()
    if (!gesture || !geometry) return
    if (pointers.size === 2 && gesture.distance >= 1 && !gesture.mode) {
      const entries = [...pointers.entries()]
      const firstStart = gesture.startPositions.get(entries[0][0])
      const secondStart = gesture.startPositions.get(entries[1][0])
      const firstMove = { x: entries[0][1].x - firstStart.x, y: entries[0][1].y - firstStart.y }
      const secondMove = { x: entries[1][1].x - secondStart.x, y: entries[1][1].y - secondStart.y }
      const commonMove = Math.hypot((firstMove.x + secondMove.x) / 2, (firstMove.y + secondMove.y) / 2)
      const pinchMove = Math.abs(geometry.distance - gesture.distance) / 2

      // Mobile browsers report each finger separately. Wait until both have
      // moved before classifying the gesture, unless one finger creates an
      // unmistakably large pinch while the other stays anchored.
      if (gesture.movedPointers.size < 2) {
        if (pinchMove < SINGLE_FINGER_PINCH_THRESHOLD) return
        gesture.mode = 'pinch'
      } else if (Math.max(commonMove, pinchMove) < GESTURE_THRESHOLD) {
        return
      } else {
        gesture.mode = pinchMove > commonMove * 0.75 ? 'pinch' : 'pan'
      }
    }

    const zoom = gesture.mode === 'pinch' && gesture.distance >= 1
      ? gesture.zoom * geometry.distance / gesture.distance
      : gesture.zoom
    placeAnchor(gesture.anchor, geometry.point, zoom)
  }

  function pointerEnd(event) {
    if (!pointers.delete(event.pointerId)) return
    if (gestureFrame) cancelAnimationFrame(gestureFrame)
    gestureFrame = 0
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    // Rebase when a finger is added/removed, so pinch → drag doesn't jump.
    beginGesture()
  }

  function wheel(event) {
    if (!size.width || !size.height) return
    event.preventDefault()
    if (pointers.size) return
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1
    const delta = event.deltaY * unit
    // Mac trackpad two-finger scrolling arrives as high-resolution, pixel-mode
    // wheel events (often with both axes). Treat that as canvas panning. A
    // ctrl-wheel is the browser's trackpad pinch gesture, so it remains zoom.
    const smoothTrackpad = event.deltaMode === 0 && !event.ctrlKey
      && (Math.abs(event.deltaX) > 0 || Math.abs(event.deltaY) < 50)
    if (smoothTrackpad) {
      panByWheel(event.deltaX, event.deltaY)
      return
    }
    const exponent = clamp(-delta * (event.ctrlKey ? .01 : .002), -.6, .6)
    zoomAt(Math.exp(exponent), localPoint(event))
  }

  function reset() {
    clearGesture()
    setCamera(MIN_ZOOM, sceneCenter.x, sceneCenter.y)
  }

  function keyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === '+' || event.key === '=') zoomAt(1.3)
    else if (event.key === '-') zoomAt(1 / 1.3)
    else if (event.key === 'Home' || event.key === '0') reset()
    else if (event.key.startsWith('Arrow')) {
      const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      setCamera(camera.zoom, camera.x + dx * frame.value.width / camera.zoom * .1,
        camera.y + dy * frame.value.height / camera.zoom * .1)
    } else return
    event.preventDefault()
  }

  function resize() {
    const rect = element.getBoundingClientRect()
    if (rect.width === size.width && rect.height === size.height) return
    clearGesture()
    size.width = rect.width
    size.height = rect.height
    setCamera(camera.zoom, camera.x, camera.y)
  }

  onMounted(() => {
    element = surface.value
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(element)
    // Explicitly non-passive: zoom the track instead of scrolling/zooming the page.
    element.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('blur', clearGesture)
  })
  onBeforeUnmount(() => {
    clearGesture()
    observer?.disconnect()
    element?.removeEventListener('wheel', wheel)
    window.removeEventListener('blur', clearGesture)
  })

  return { viewBox, canZoomOut, canZoomIn, interaction, zoomAt, reset, pointerDown, pointerMove, pointerEnd, keyDown }
}
