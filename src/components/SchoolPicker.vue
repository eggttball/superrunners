<script setup vapor>
import { computed, ref, watch } from 'vue'
import { game } from '../lib/game.js'
import Icon from './Icon.vue'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const counties = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣']
const normalize = value => String(value || '').replaceAll('台', '臺').trim().toLowerCase()
const schools = computed(() => game.world?.schools || [])
const city = ref(normalize(schools.value.find(school => school.id === props.modelValue)?.city))
const search = ref('')
const favoritesOnly = ref(false)
const awaitingSelection = computed(() => !city.value && !favoritesOnly.value && !search.value.trim())
const favorites = computed(() => { game.revision; return new Set(game.world?.favoriteSchoolIds || []) })
const cityOptions = computed(() => counties.map(name => ({ name, count: schools.value.filter(school => normalize(school.city) === name).length })))
const filteredSchools = computed(() => {
  if (awaitingSelection.value) return []
  const query = normalize(search.value)
  return schools.value.filter(school => (!city.value || normalize(school.city) === normalize(city.value))
    && (!favoritesOnly.value || favorites.value.has(school.id))
    && (!query || normalize(`${school.name} ${school.city} ${school.officialCode}`).includes(query)))
})

watch(() => props.modelValue, id => {
  const selected = schools.value.find(school => school.id === id)
  if (selected && normalize(selected.city) !== city.value) city.value = normalize(selected.city)
})

function resetFilters() { city.value = ''; search.value = ''; favoritesOnly.value = false }
</script>

<template>
  <aside class="panel picker-panel school-picker" aria-label="選擇學校">
    <div class="picker-title"><div><span class="eyebrow">FIND YOUR SCHOOL</span><h2>探索學校</h2></div><Icon name="school" :size="25" /></div>
    <label class="field county-field"><span>縣市</span><select v-model="city"><option value="">請先選擇縣市</option><option v-for="county in cityOptions" :key="county.name" :value="county.name">{{ county.name }} · {{ county.count }} 所</option></select></label>
    <label class="field school-search"><span>搜尋學校</span><span class="search-control"><Icon name="search" :size="17" /><input v-model="search" type="search" placeholder="輸入校名或學校代碼" autocomplete="off" /></span></label>
    <label class="favorite-filter"><input v-model="favoritesOnly" type="checkbox" /><Icon name="star" :size="16" /><span>只看收藏學校</span><span class="favorite-count">{{ favorites.size }}</span></label>
    <div class="list-heading"><span>{{ favoritesOnly ? '我的收藏' : city || '全國名錄' }}</span><span aria-live="polite">{{ filteredSchools.length }} 所學校</span></div>
    <div class="school-options" tabindex="0" aria-label="學校清單">
      <button v-for="school in filteredSchools" :key="school.id" type="button" class="school-option" :class="{ selected: modelValue === school.id }" :aria-pressed="modelValue === school.id" @click="emit('update:modelValue', school.id)">
        <span class="school-option-icon"><Icon name="school" :size="20" /></span><span class="school-option-copy"><strong>{{ school.name }}</strong><small>{{ school.city }} <span>· {{ school.officialCode }}</span></small></span><Icon v-if="favorites.has(school.id)" name="star" :size="15" /><Icon v-else-if="modelValue === school.id" name="arrow" :size="16" />
      </button>
      <div v-if="!filteredSchools.length" class="empty-state picker-empty"><Icon :name="awaitingSelection ? 'pin' : favoritesOnly ? 'star' : 'search'" :size="28" /><p>{{ awaitingSelection ? '先選擇縣市，或輸入校名搜尋' : favoritesOnly ? '這個範圍還沒有收藏學校' : '沒有符合條件的學校' }}</p><button v-if="!awaitingSelection" class="btn small ghost" @click="resetFilters">清除篩選</button></div>
    </div>
    <p class="picker-source">教育部公開學校名錄 <span>·</span> 學生皆為虛構</p>
  </aside>
</template>

<style scoped>
.school-picker { align-self: start; min-width: 0; overflow: hidden; }
.picker-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 25px; }
.picker-title > svg { color: #c7f36a; }
.picker-title h2 { margin: 7px 0 0; font-size: 22px; }
.county-field, .school-search { display: grid; gap: 9px; margin-bottom: 17px; }
.field > span:first-child { font-size: 12px; color: #a3b1a7; }
.county-field select, .search-control { width: 100%; min-height: 43px; border: 1px solid #3a4a3f; border-radius: 7px; background: #15221b; color: #f5f3e9; }
.county-field select { padding: 0 11px; font: inherit; font-size: 13px; }
.search-control { display: flex; align-items: center; gap: 9px; padding: 0 11px; }
.search-control svg { flex-shrink: 0; color: #a3b1a7; }
.search-control input { width: 100%; min-width: 0; padding: 12px 0; border: 0; background: transparent; color: #f5f3e9; font: inherit; font-size: 13px; outline-offset: 4px; }
.search-control input::placeholder { color: #89978e; }
.favorite-filter { display: flex; align-items: center; gap: 7px; cursor: pointer; font-size: 12px; color: #c6cec8; margin: 3px 0 24px; }
.favorite-filter input { width: 15px; height: 15px; accent-color: #c7f36a; margin: 0 2px 0 0; }
.favorite-filter svg { color: #c7f36a; }
.favorite-count { margin-left: auto; color: #c7f36a; font-variant-numeric: tabular-nums; }
.list-heading { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 12px; color: #a3b1a7; font-size: 11px; border-bottom: 1px solid #334138; }
.school-options { max-height: 485px; overflow-y: auto; overscroll-behavior: contain; padding: 9px 0; scrollbar-width: thin; scrollbar-color: #526449 transparent; }
.school-option { display: flex; align-items: center; gap: 10px; width: 100%; margin: 3px 0; padding: 12px 9px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #cbd4cd; font: inherit; text-align: left; cursor: pointer; transition: background .18s, border-color .18s; }
.school-option:hover { background: #25362a; }
.school-option.selected { border-color: #536441; background: #2b3a28; color: #d9f8a4; }
.school-option-icon { display: grid; place-items: center; width: 32px; height: 36px; flex-shrink: 0; border-radius: 5px; background: #223027; color: #9eae9c; }
.selected .school-option-icon { color: #c7f36a; background: #37482c; }
.school-option-copy { flex: 1; min-width: 0; }
.school-option-copy strong { display: block; font-size: 13px; line-height: 1.6; font-weight: 600; }
.school-option-copy small { display: block; margin-top: 4px; color: #9baa9f; font-size: 10px; }
.school-option > svg { flex-shrink: 0; color: #c7f36a; }
.picker-empty { padding: 32px 4px; font-size: 12px; }
.picker-empty > svg { margin-bottom: 7px; }
.picker-empty p { margin-bottom: 16px; }
.picker-source { margin: 13px 0 0; padding-top: 14px; border-top: 1px solid #334138; color: #829487; font-size: 10px; text-align: center; }
.picker-source span { margin: 0 4px; }
@media (max-width: 760px) { .school-options { max-height: 250px; } }
</style>
