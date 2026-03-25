import { describe, it, expect } from 'vitest'
import { demoSetupAdapter } from '../adapters'
import type { CapabilityStatus, InstallProgress } from '../types'

describe('demoSetupAdapter', () => {
  describe('detectCapabilities', () => {
    it('reports all 5 capabilities', async () => {
      const updates: CapabilityStatus[] = []
      const results = await demoSetupAdapter.detectCapabilities((s) => updates.push({ ...s }))

      expect(results).toHaveLength(5)
      expect(results.map((r) => r.id)).toEqual(['engine', 'memory', 'observe', 'ocr', 'agent'])
    })

    it('shows checking state for each before final state', async () => {
      const updates: CapabilityStatus[] = []
      await demoSetupAdapter.detectCapabilities((s) => updates.push({ ...s }))

      // Each capability should have a 'checking' update followed by a final state
      const checkingUpdates = updates.filter((u) => u.status === 'checking')
      expect(checkingUpdates).toHaveLength(5)
    })

    it('reports engine as installed with version', async () => {
      const updates: CapabilityStatus[] = []
      const results = await demoSetupAdapter.detectCapabilities((s) => updates.push({ ...s }))

      const engine = results.find((r) => r.id === 'engine')
      expect(engine?.status).toBe('installed')
      expect(engine?.version).toBe('2026.3.13')
    })

    it('reports observe and ocr as not_installed', async () => {
      const results = await demoSetupAdapter.detectCapabilities(() => {})

      const observe = results.find((r) => r.id === 'observe')
      expect(observe?.status).toBe('not_installed')

      const ocr = results.find((r) => r.id === 'ocr')
      expect(ocr?.status).toBe('not_installed')
    })
  })

  describe('installCapabilities', () => {
    it('installs missing capabilities with progress updates', { timeout: 15000 }, async () => {
      const progress: InstallProgress[] = []
      await demoSetupAdapter.installCapabilities(['observe', 'ocr'], (p) =>
        progress.push({ ...p }),
      )

      const observeUpdates = progress.filter((p) => p.id === 'observe')
      expect(observeUpdates.length).toBeGreaterThan(1)
      expect(observeUpdates[0].status).toBe('installing')
      expect(observeUpdates[observeUpdates.length - 1].status).toBe('done')

      const ocrUpdates = progress.filter((p) => p.id === 'ocr')
      expect(ocrUpdates.length).toBeGreaterThan(1)
      expect(ocrUpdates[ocrUpdates.length - 1].status).toBe('done')
    })

    it('reports progress percentages from 0 to 100', { timeout: 10000 }, async () => {
      const progress: InstallProgress[] = []
      await demoSetupAdapter.installCapabilities(['observe'], (p) => progress.push({ ...p }))

      const percentages = progress
        .filter((p) => p.id === 'observe' && p.progress !== undefined)
        .map((p) => p.progress!)

      expect(percentages[0]).toBeLessThanOrEqual(50)
      expect(percentages[percentages.length - 1]).toBe(100)
    })

    it('includes log messages during install', { timeout: 10000 }, async () => {
      const progress: InstallProgress[] = []
      await demoSetupAdapter.installCapabilities(['observe'], (p) => progress.push({ ...p }))

      const withLogs = progress.filter((p) => p.log)
      expect(withLogs.length).toBeGreaterThan(0)
    })

    it('handles empty install list gracefully', async () => {
      const progress: InstallProgress[] = []
      await demoSetupAdapter.installCapabilities([], (p) => progress.push({ ...p }))
      expect(progress).toHaveLength(0)
    })
  })
})
