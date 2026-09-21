import { generateWorld, rankStudents, repairSchoolTeams } from './generator.js'
import { catalog, catalogSource } from '../data/schools.js'
import { loadWorld, saveChanges, saveInitialWorld } from './storage.js'

self.onmessage = async () => {
  try {
    const progress = data => self.postMessage({ type: 'progress', ...data })
    let world = await loadWorld(progress)
    if (!world) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      world = generateWorld(catalog, { seed, createdAt: new Date().toISOString(), onProgress: progress })
      world.source = catalogSource
      await saveInitialWorld(world, progress)
    } else {
      // Ranks are derived from saved bests, so refresh them off the UI thread.
      progress({ phase: 'ranking', progress: 1 })
      const needsTeamRepair = world.schoolTeamSelectionVersion !== 1
      let repaired = { students: [], teams: [] }
      if (needsTeamRepair) {
        repaired = repairSchoolTeams(world)
        world.schoolTeamSelectionVersion = 1
      }
      rankStudents(world)
      if (needsTeamRepair) {
        await saveChanges(world, repaired)
      }
    }
    self.postMessage({ type: 'ready', world })
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || '無法建立本機存檔。' })
  }
}
