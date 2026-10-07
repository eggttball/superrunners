// Shared by the school picker and the nationwide school-meet itinerary.
export const COUNTIES = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣']

const normalizeCity = city => String(city || '').replaceAll('台', '臺').trim()
const countyIndex = new Map(COUNTIES.map((city, index) => [city, index]))

export function compareSchoolOrder(a, b) {
  const aCity = normalizeCity(a.city), bCity = normalizeCity(b.city)
  return (countyIndex.get(aCity) ?? COUNTIES.length) - (countyIndex.get(bCity) ?? COUNTIES.length)
    || aCity.localeCompare(bCity, 'zh-Hant')
    || String(a.officialCode || a.id).localeCompare(String(b.officialCode || b.id), 'en', { numeric: true })
    || a.id.localeCompare(b.id)
}
