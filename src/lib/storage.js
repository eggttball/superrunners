const DATABASE = 'superrunners-taiwan-v3'
const LEGACY_DATABASES = ['superrunners-taiwan-v1', 'superrunners-taiwan-v2']
const TABLES = ['schools', 'students', 'teams', 'races', 'awards']
let connection
let legacyCleanup

function clearLegacyDatabases() {
  if (!legacyCleanup) {
    legacyCleanup = Promise.all(LEGACY_DATABASES.map(name => new Promise(resolve => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = resolve
      request.onerror = resolve
      // An older app tab may still hold the database. Deletion will resume
      // when that tab closes, without blocking the current v3 world.
      request.onblocked = resolve
    })))
  }
  return legacyCleanup
}

export function openDatabase() {
  if (connection) return connection
  connection = clearLegacyDatabases().then(() => new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    let abandoned = false
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('meta')
      for (const table of TABLES) db.createObjectStore(table, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return }
      request.result.onversionchange = () => { request.result.close(); connection = null }
      resolve(request.result)
    }
    request.onerror = () => { connection = null; reject(request.error) }
    request.onblocked = () => { abandoned = true; connection = null; reject(new Error('請關閉其他 Super Runners 分頁後重新開啟。')) }
  }))
  return connection
}

function completion(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onabort = () => reject(transaction.error || new Error('本機存檔中斷，請檢查可用空間。'))
    transaction.onerror = () => reject(transaction.error || new Error('本機存檔失敗，請檢查可用空間。'))
  })
}

function value(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function metadata(world) {
  const { schools, students, teams, races, awards, ...meta } = world
  return meta
}

export async function loadWorld(onProgress = () => {}) {
  const db = await openDatabase()
  if (!await value(db.transaction('meta').objectStore('meta').get('world'))) return null
  // All tables and their metadata must describe the same committed instant.
  const tx = db.transaction(['meta', ...TABLES])
  const done = completion(tx)
  const reads = [value(tx.objectStore('meta').get('world'))]
  let loaded = 0
  for (const table of TABLES) reads.push(value(tx.objectStore(table).getAll()).then(records => {
    onProgress({ phase: '讀取本機存檔', progress: ++loaded / TABLES.length })
    return records
  }))
  const [[meta, ...tables]] = await Promise.all([Promise.all(reads), done])
  if (!meta) throw new Error('本機存檔不完整，已停止載入以保留資料。')
  if (meta.schemaVersion !== 3) throw new Error('這份存檔的版本無法讀取；原始資料已保留。')
  const world = { ...meta }
  TABLES.forEach((table, index) => { world[table] = tables[index] })
  if (!world.schools.length || !world.students.length || !world.teams.length) throw new Error('本機存檔不完整，已停止載入以保留資料。')
  return world
}

export async function saveInitialWorld(world, onProgress = () => {}) {
  const db = await openDatabase()
  const owner = crypto.randomUUID()
  // Claim and clear in one transaction. A second initializer can replace an interrupted
  // attempt, but every later batch checks ownership before it is allowed to write.
  const claim = db.transaction(['meta', ...TABLES], 'readwrite')
  let claimError
  const claimed = completion(claim).catch(error => { throw claimError || error })
  const marker = claim.objectStore('meta').get('world')
  const raceCount = claim.objectStore('races').count()
  const awardCount = claim.objectStore('awards').count()
  awardCount.onsuccess = () => {
    if (marker.result || raceCount.result || awardCount.result) {
      claimError = new Error('已有本機資料，已停止初始化以避免覆蓋。請重新載入。')
      claim.abort()
      return
    }
    TABLES.forEach(table => claim.objectStore(table).clear())
    claim.objectStore('meta').put(owner, 'initializing')
  }
  await claimed

  const writeBatch = async (tables, write) => {
    const tx = db.transaction(['meta', ...tables], 'readwrite')
    let writeError
    const done = completion(tx).catch(error => { throw writeError || error })
    const request = tx.objectStore('meta').get('initializing')
    request.onsuccess = () => {
      if (request.result !== owner) {
        writeError = new Error('另一個分頁已接手初始化。請關閉多餘分頁後重新載入。')
        tx.abort()
        return
      }
      try { write(tx) }
      catch (error) { writeError = error; tx.abort() }
    }
    await done
  }
  const total = TABLES.reduce((sum, table) => sum + world[table].length, 0)
  let written = 0
  for (const table of TABLES) {
    for (let offset = 0; offset < world[table].length; offset += 5000) {
      const batch = world[table].slice(offset, offset + 5000)
      await writeBatch([table], tx => {
        batch.forEach(record => tx.objectStore(table).put(record))
      })
      written += batch.length
      onProgress({ phase: '保存全國資料', progress: written / total })
    }
  }
  await writeBatch([], tx => {
    tx.objectStore('meta').put(metadata(world), 'world')
    tx.objectStore('meta').delete('initializing')
  })
}

// Related mutations share one transaction: a saved result cannot lose its best time or medals.
export async function saveChanges(world, changes = {}) {
  const db = await openDatabase()
  const tables = Object.keys(changes).filter(table => TABLES.includes(table))
  const tx = db.transaction(['meta', ...tables], 'readwrite')
  const done = completion(tx)
  try {
    tx.objectStore('meta').put(metadata(world), 'world')
    for (const table of tables) for (const record of changes[table]) tx.objectStore(table).put(record)
  } catch (error) {
    tx.abort()
    await done.catch(() => {})
    throw error
  }
  await done
}

// The caller holds the mutation queue until serialization finishes, keeping every
// table consistent without duplicating the entire national population in memory.
export async function exportWorld(world, onProgress = () => {}) {
  const parts = ['{']
  const meta = { ...metadata(world), exportedAt: new Date().toISOString() }
  parts.push(JSON.stringify(meta).slice(1, -1))
  for (const table of TABLES) {
    parts.push(`,"${table}":[`)
    for (let offset = 0; offset < world[table].length; offset += 3000) {
      if (offset) parts.push(',')
      parts.push(new Blob([JSON.stringify(world[table].slice(offset, offset + 3000)).slice(1, -1)]))
      onProgress(table)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    parts.push(']')
  }
  parts.push('}')
  const blob = new Blob(parts, { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `superrunners-tw-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return blob.size
}
