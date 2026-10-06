import { rankStudents, repairSchoolTeams } from './generator.js'
import { loadWorld, saveChanges, saveInitialWorld } from './storage.js'

self.onmessage = async event => {
  try {
    const progress = data => self.postMessage({ type: 'progress', ...data })
    let world = event.data.type === 'restore' ? event.data.world : await loadWorld(progress)
    if (!world) {
      self.postMessage({ type: 'missing' })
      return
    }
    if (event.data.type === 'restore') {
      rankStudents(world)
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
