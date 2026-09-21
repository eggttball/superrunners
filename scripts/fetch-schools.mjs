#!/usr/bin/env node
// The checked-in catalog is a pinned school-year snapshot, never a browser fetch.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const YEAR = 115
const PUBLICATION_URL = 'https://depart.moe.edu.tw/ED4500/News_Content.aspx?n=63F5AB3D02A8BBAC&sms=1FF9979D10DBF9F3&s=52D3798D5069E231'
const SOURCE_DEFINITIONS = [
  { key: 'j1_new', name: '國民中學名錄', minimum: 700 },
  { key: 'aj_new', name: '附設國中部名錄', minimum: 150 },
]
// Application identifiers, not Ministry of Education administrative codes.
const CITY_CODES = {
  臺北市: 'TP', 新北市: 'NT', 基隆市: 'KL', 桃園市: 'TY',
  新竹市: 'HC', 新竹縣: 'HS', 苗栗縣: 'ML', 臺中市: 'TC',
  彰化縣: 'CH', 南投縣: 'NA', 雲林縣: 'YL', 嘉義市: 'CY',
  嘉義縣: 'JY', 臺南市: 'TN', 高雄市: 'KH', 屏東縣: 'PT',
  宜蘭縣: 'IL', 花蓮縣: 'HL', 臺東縣: 'TT', 澎湖縣: 'PH',
  金門縣: 'KM', 連江縣: 'LC',
}
const args = process.argv.slice(2)
const offline = args.includes('--offline')
const inputIndex = args.indexOf('--input-dir')
const inputDirectory = inputIndex >= 0 ? args[inputIndex + 1] : null
if (inputIndex >= 0 && (!inputDirectory || inputDirectory.startsWith('--'))) {
  throw new Error('--input-dir requires a directory containing j1_new.json and aj_new.json.')
}
if (offline && inputDirectory) throw new Error('Choose --offline or --input-dir, not both.')
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input-dir') i++
  else if (args[i] !== '--offline') throw new Error(`Unknown argument: ${args[i]}`)
}

const sha256 = value => createHash('sha256').update(value).digest('hex')
const snapshotPath = key => resolve(ROOT, `scripts/school-sources/${YEAR}-${key}.json`)

async function readSource(definition) {
  const url = `https://stats.moe.gov.tw/files/opendata/${definition.key}.json`
  const yearSpecificUrl = `https://stats.moe.gov.tw/files/school/${YEAR}/${definition.key}.xlsx`
  if (offline) {
    const snapshot = JSON.parse(await readFile(snapshotPath(definition.key), 'utf8'))
    if (snapshot.year !== YEAR || snapshot.url !== url || !Array.isArray(snapshot.records)) {
      throw new Error(`Invalid cached source: ${definition.key}`)
    }
    if (sha256(JSON.stringify(snapshot.records)) !== snapshot.recordsSha256) {
      throw new Error(`Cached records checksum differs: ${definition.key}`)
    }
    return snapshot
  }

  let bytes
  if (inputDirectory) {
    bytes = await readFile(resolve(inputDirectory, `${definition.key}.json`))
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
  }
  const allYears = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
  if (!Array.isArray(allYears)) throw new Error(`Expected an official record array: ${url}`)
  const records = allYears.filter(record => String(record['學年度']) === String(YEAR))
  if (records.length < definition.minimum) {
    throw new Error(`${definition.name}: only ${records.length} records for ${YEAR}; refusing partial data.`)
  }
  return {
    name: definition.name, year: YEAR, url, yearSpecificUrl,
    retrievedAt: new Date().toISOString(),
    responseSha256: sha256(bytes), recordsSha256: sha256(JSON.stringify(records)), records,
  }
}

function toCatalog(snapshots) {
  const seen = new Set()
  const schools = snapshots.flatMap(snapshot => snapshot.records.map(record => {
    const officialCode = record['代碼']
    const name = record['學校名稱']
    const address = record['地址']
    const website = record['網址']
    const city = record['縣市名稱']?.replace(/^\[\d+\]/, '')
    const cityCode = CITY_CODES[city]
    if (String(record['學年度']) !== String(YEAR) || !/^\d{6}$/.test(officialCode)
      || typeof name !== 'string' || !name.trim() || !cityCode
      || typeof address !== 'string' || !address.trim() || typeof website !== 'string') {
      throw new Error(`Unexpected source record: ${JSON.stringify(record)}`)
    }
    if (website && !/^https?:\/\//.test(website)) throw new Error(`Unexpected website: ${officialCode}`)
    if (seen.has(officialCode)) throw new Error(`Duplicate official school code: ${officialCode}`)
    seen.add(officialCode)
    return { id: `${cityCode}-${officialCode}`, officialCode, name, city, cityCode, address, website }
  }))
  if (new Set(schools.map(school => school.city)).size !== 22) {
    throw new Error('The source does not cover all 22 Taiwan municipalities/counties.')
  }
  const cityOrder = Object.keys(CITY_CODES)
  return schools.sort((a, b) => cityOrder.indexOf(a.city) - cityOrder.indexOf(b.city)
    || a.officialCode.localeCompare(b.officialCode, 'en'))
}

async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(`${path}.tmp`, text)
  await rename(`${path}.tmp`, path)
}

const snapshots = await Promise.all(SOURCE_DEFINITIONS.map(readSource))
const catalog = toCatalog(snapshots)
const catalogSource = {
  name: `教育部統計處 ${YEAR} 學年度國民中學暨附設國中部名錄`,
  publisher: '教育部統計處', url: PUBLICATION_URL,
  year: YEAR, academicYear: `${YEAR}（2026–2027）`,
  retrievedAt: snapshots.map(source => source.retrievedAt).sort().at(-1),
  schoolCount: catalog.length, cityCount: 22,
  juniorSchoolCount: snapshots[0].records.length,
  attachedDivisionCount: snapshots[1].records.length,
  missingWebsiteCount: catalog.filter(school => !school.website).length,
  scope: '臺灣 22 縣市，國民中學及教育部名錄所列附設國中部；保留原始校名。',
  note: '校名、代碼、地址與網址來自官方名錄。學生、班級、能力及比賽成績均為遊戲虛構資料。',
  sources: snapshots.map(({ records, ...source }) => ({ ...source, recordCount: records.length })),
}
const moduleText = '// Generated by scripts/fetch-schools.mjs; do not hand-edit school records.\n'
  + `export const catalogSource = ${JSON.stringify(catalogSource, null, 2)}\n\n`
  + 'export const catalog = [\n'
  + catalog.map(school => `  ${JSON.stringify(school)},`).join('\n')
  + '\n]\n'

for (let i = 0; i < snapshots.length; i++) {
  await writeAtomic(snapshotPath(SOURCE_DEFINITIONS[i].key), JSON.stringify(snapshots[i], null, 2) + '\n')
}
await writeAtomic(resolve(ROOT, 'src/data/schools.js'), moduleText)
console.log(`Saved ${catalog.length} schools (${catalogSource.juniorSchoolCount} junior schools + ${catalogSource.attachedDivisionCount} attached divisions), 22 cities/counties, school year ${YEAR}.`)
