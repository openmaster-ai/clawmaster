import { describe, it, expect } from 'vitest'
import { platformResults } from '../platformResults'

describe('platformResults', () => {
  it('exports all expected adapter functions', () => {
    // Core system
    expect(typeof platformResults.detectSystem).toBe('function')

    // Gateway
    expect(typeof platformResults.getGatewayStatus).toBe('function')
    expect(typeof platformResults.startGateway).toBe('function')
    expect(typeof platformResults.stopGateway).toBe('function')
    expect(typeof platformResults.restartGateway).toBe('function')

    // Config
    expect(typeof platformResults.getConfig).toBe('function')
    expect(typeof platformResults.setConfig).toBe('function')
    expect(typeof platformResults.saveFullConfig).toBe('function')

    // Channels
    expect(typeof platformResults.getChannels).toBe('function')
    expect(typeof platformResults.addChannel).toBe('function')
    expect(typeof platformResults.removeChannel).toBe('function')
    expect(typeof platformResults.verifyChannelAccount).toBe('function')

    // Models
    expect(typeof platformResults.getModels).toBe('function')
    expect(typeof platformResults.setDefaultModel).toBe('function')
    expect(typeof platformResults.testModelProvider).toBe('function')

    // Skills
    expect(typeof platformResults.getSkills).toBe('function')
    expect(typeof platformResults.searchSkills).toBe('function')
    expect(typeof platformResults.installSkill).toBe('function')
    expect(typeof platformResults.uninstallSkill).toBe('function')

    // Plugins
    expect(typeof platformResults.listPlugins).toBe('function')
    expect(typeof platformResults.setPluginEnabled).toBe('function')
    expect(typeof platformResults.installPlugin).toBe('function')
    expect(typeof platformResults.uninstallPlugin).toBe('function')

    // Agents
    expect(typeof platformResults.getAgents).toBe('function')
    expect(typeof platformResults.createAgent).toBe('function')
    expect(typeof platformResults.deleteAgent).toBe('function')

    // Bindings
    expect(typeof platformResults.getBindings).toBe('function')
    expect(typeof platformResults.upsertBinding).toBe('function')
    expect(typeof platformResults.deleteBinding).toBe('function')

    // Logs
    expect(typeof platformResults.getLogs).toBe('function')

    // ClawProbe
    expect(typeof platformResults.clawprobeStatus).toBe('function')
    expect(typeof platformResults.clawprobeCost).toBe('function')
    expect(typeof platformResults.clawprobeConfig).toBe('function')
    expect(typeof platformResults.clawprobeBootstrap).toBe('function')

    // Memory
    expect(typeof platformResults.openclawMemoryStatus).toBe('function')
    expect(typeof platformResults.openclawMemorySearchCapability).toBe('function')
    expect(typeof platformResults.openclawMemorySearch).toBe('function')
    expect(typeof platformResults.openclawMemoryFiles).toBe('function')
    expect(typeof platformResults.reindexOpenclawMemory).toBe('function')
    expect(typeof platformResults.deleteOpenclawMemoryFile).toBe('function')

    // Danger
    expect(typeof platformResults.resetOpenclawConfig).toBe('function')
    expect(typeof platformResults.uninstallOpenclawCli).toBe('function')

    // NPM
    expect(typeof platformResults.installOpenclawGlobal).toBe('function')
    expect(typeof platformResults.listOpenclawNpmVersions).toBe('function')
  })

  it('has consistent function naming', () => {
    const keys = Object.keys(platformResults)
    // Every key should be a string
    for (const key of keys) {
      expect(typeof key).toBe('string')
      // Every value should be a function
      expect(typeof (platformResults as any)[key]).toBe('function')
    }
  })

  it('exports at least 40 functions', () => {
    expect(Object.keys(platformResults).length).toBeGreaterThanOrEqual(40)
  })
})
