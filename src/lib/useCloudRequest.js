import { onUnmounted, ref } from 'vue'

// The screen owns the request indicator; a late response from another school
// must not replace the currently selected school's list.
export function useCloudRequest() {
  const loading = ref(false)
  const error = ref('')
  const updatedAt = ref('')
  let revision = 0
  onUnmounted(() => revision++)
  async function load(action, apply = () => {}) {
    const request = ++revision
    loading.value = true
    error.value = ''
    updatedAt.value = ''
    try {
      const result = await action()
      if (request !== revision) return
      apply(result)
      updatedAt.value = new Date().toLocaleTimeString('zh-TW', { hour12: false })
    } catch (cause) {
      if (request === revision) {
        error.value = cause.message
        if (cause.cachedRanking) apply({ ranking: cause.cachedRanking })
      }
    } finally {
      if (request === revision) loading.value = false
    }
  }
  return { loading, error, updatedAt, load }
}
