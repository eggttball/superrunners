import { rankStudents, repairSchoolTeams } from './generator.js'
import { loadWorld, saveChanges, saveInitialWorld, saveLocalMetaPatch, metadata, TABLES } from './storage.js'
import { compactRelayHistory, compactRelayProgress } from './relay-data.js'

const pendingAcks = new Map()
let nextMessageId = 0
let restoredWorld = null

function waitForAck(message) {
  const id = ++nextMessageId
  const acknowledged = new Promise(resolve => pendingAcks.set(id, resolve))
  try { self.postMessage({ ...message, id }) }
  catch (error) { pendingAcks.delete(id); throw error }
  return acknowledged
}

function sendProgress(data) { self.postMessage({ type: 'progress', ...data }) }

async function sendWorld(world) {
  self.postMessage({ type: 'world-start', meta: metadata(world), tables: TABLES })
  const batchSize = 2000
  for (const table of TABLES) {
    const records = world[table] || []
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const end = Math.min(offset + batchSize, records.length)
      await waitForAck({ type: 'world-chunk', table, records: records.slice(offset, end) })
      // Release the worker's copy as soon as the receiving window has accepted this batch.
      for (let index = offset; index < end; index++) records[index] = null
    }
    world[table] = []
  }
  self.postMessage({ type: 'ready' })
}

async function prepareWorld(world, restoring) {
  try {
    if (!world) {
      self.postMessage({ type: 'missing' })
      return
    }
    world.windMeets ||= []
    world.windChampions ||= {}
    world.regionMeets ||= []
    world.regionChampions ||= {}
    world.nationalMeets ||= []
    world.nationalChampion ||= null
    world.nationalHonors ||= {}
    world.relayMeets ||= []
    world.relayRaces ||= []
    world.relayLineups ||= []

    const compactedRelay = compactRelayHistory(world)
    const progressCompacted = compactRelayProgress(world.relayMeetProgress)
    if (restoring) {
      rankStudents(world)
      await saveInitialWorld(world, sendProgress)
    } else {
      sendProgress({ phase: 'ranking', progress: 1 })
      const needsTeamRepair = world.schoolTeamSelectionVersion !== 1
      let repaired = { students: [], teams: [] }
      if (needsTeamRepair) {
        repaired = repairSchoolTeams(world)
        world.schoolTeamSelectionVersion = 1
      }
      rankStudents(world)
      if (needsTeamRepair) await saveChanges(world, repaired)
      const migrationBatchSize = 100
      for (let offset = 0; offset < compactedRelay.changedRaces.length; offset += migrationBatchSize) {
        await saveChanges(world, { relayRaces: compactedRelay.changedRaces.slice(offset, offset + migrationBatchSize) })
      }
      for (let offset = 0; offset < compactedRelay.changedMeets.length; offset += migrationBatchSize) {
        await saveChanges(world, { relayMeets: compactedRelay.changedMeets.slice(offset, offset + migrationBatchSize) })
      }
      if (progressCompacted) await saveLocalMetaPatch({ relayMeetProgress: world.relayMeetProgress })
      compactedRelay.changedRaces.length = 0
      compactedRelay.changedMeets.length = 0
      repaired = null
    }
    await sendWorld(world)
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || '無法建立本機存檔。' })
  }
}

async function initializeLocal() {
  try {
    const world = await loadWorld(sendProgress)
    await prepareWorld(world, false)
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || '無法讀取本機存檔。' })
  }
}

self.onmessage = event => {
  const data = event.data
  if (data.type === 'world-ack' || data.type === 'restore-ack') {
    pendingAcks.get(data.id)?.()
    pendingAcks.delete(data.id)
    return
  }
  if (data.type === 'initialize') {
    void initializeLocal()
    return
  }
  if (data.type === 'restore-start') {
    restoredWorld = { ...data.meta }
    for (const table of TABLES) restoredWorld[table] = []
    return
  }
  if (data.type === 'restore-chunk') {
    if (!restoredWorld || !TABLES.includes(data.table) || !Array.isArray(data.records)) {
      self.postMessage({ type: 'error', message: '雲端還原資料區塊無法識別。' })
      return
    }
    restoredWorld[data.table].push(...data.records)
    self.postMessage({ type: 'restore-ack', id: data.id })
    return
  }
  if (data.type === 'restore-end') {
    const world = restoredWorld
    restoredWorld = null
    void prepareWorld(world, true)
  }
}
