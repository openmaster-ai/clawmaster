import { beforeEach, describe, it, expect } from 'vitest'
import { demoSetupAdapter, resetDemoSetupAdapterState } from '../adapters'
import type { CapabilityStatus, InstallProgress } from '../types'
import {
  PADDLEOCR_DOC_SKILL_ID,
  PADDLEOCR_TEXT_SKILL_ID,
} from '@/shared/paddleocr'

describe('demoSetupAdapter', () => {
  beforeEach(() => {
    resetDemoSetupAdapterState()
  })

  describe('detectCapabilities', () => {
    it('reports all setup capabilities', async () => {
      const updates: CapabilityStatus[] = []
      const results = await demoSetupAdapter.detectCapabilities((s) => updates.push({ ...s }))

      expect(results).toHaveLength(6)
      expect(results.map((r) => r.id)).toEqual([
        'engine',
        'memory',
        'observe',
        'ocr_text',
        'ocr_doc',
        'agent',
      ])
    })

    it('shows checking state for each before final state', async () => {
      const updates: CapabilityStatus[] = []
      await demoSetupAdapter.detectCapabilities((s) => updates.push({ ...s }))

      // Each capability should have a 'checking' update followed by a final state
      const checkingUpdates = updates.filter((u) => u.status === 'checking')
      expect(checkingUpdates).toHaveLength(6)
    })

    it('reports engine as installed with version', async () => {
      const updates: CapabilityStatus[] = []
      const results = await demoSetupAdapter.detectCapabilities((s) => updates.push({ ...s }))

      const engine = results.find((r) => r.id === 'engine')
      expect(engine?.status).toBe('installed')
      expect(engine?.version).toBe('2026.3.13')
    })

    it('reports observe as not_installed and PaddleOCR cards as needs_setup', async () => {
      const results = await demoSetupAdapter.detectCapabilities(() => {})

      const observe = results.find((r) => r.id === 'observe')
      expect(observe?.status).toBe('not_installed')

      const ocrText = results.find((r) => r.id === 'ocr_text')
      const ocrDoc = results.find((r) => r.id === 'ocr_doc')
      expect(ocrText?.status).toBe('needs_setup')
      expect(ocrDoc?.status).toBe('needs_setup')
    })
  })

  describe('installCapabilities', () => {
    it('installs missing capabilities with progress updates', { timeout: 15000 }, async () => {
      const progress: InstallProgress[] = []
      await demoSetupAdapter.installCapabilities(['observe'], (p) =>
        progress.push({ ...p }),
      )

      const observeUpdates = progress.filter((p) => p.id === 'observe')
      expect(observeUpdates.length).toBeGreaterThan(1)
      expect(observeUpdates[0].status).toBe('installing')
      expect(observeUpdates[observeUpdates.length - 1].status).toBe('done')

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

  describe('onboarding', () => {
    it('initConfig resolves without error', async () => {
      await expect(demoSetupAdapter.onboarding.initConfig()).resolves.toBeUndefined()
    })

    it('testApiKey returns true', async () => {
      const result = await demoSetupAdapter.onboarding.testApiKey('openai', 'sk-test')
      expect(result).toBe(true)
    })

    it('setApiKey resolves without error', async () => {
      await expect(demoSetupAdapter.onboarding.setApiKey('openai', 'sk-test')).resolves.toBeUndefined()
    })

    it('setDefaultModel resolves without error', async () => {
      await expect(demoSetupAdapter.onboarding.setDefaultModel('gpt-4o')).resolves.toBeUndefined()
    })

    it('startGateway resolves without error', async () => {
      await expect(demoSetupAdapter.onboarding.startGateway(18789)).resolves.toBeUndefined()
    })

    it('checkGateway returns true', async () => {
      const result = await demoSetupAdapter.onboarding.checkGateway(18789)
      expect(result).toBe(true)
    })

    it('addChannel resolves without error', async () => {
      await expect(demoSetupAdapter.onboarding.addChannel('discord', { token: 'test-token' })).resolves.toBeUndefined()
    })

    it('addChannel with multiple tokens resolves without error', async () => {
      await expect(
        demoSetupAdapter.onboarding.addChannel('slack', { 'bot-token': 'xoxb-test', 'app-token': 'xapp-test' }),
      ).resolves.toBeUndefined()
    })
  })

  describe('paddleocr', () => {
    it('starts in needs_setup state', async () => {
      const status = await demoSetupAdapter.paddleocr.getStatus()
      expect(status.configured).toBe(false)
      expect(status.enabledModules).toEqual([])
      expect(status.missingModules).toEqual([])
      expect(status.textRecognition.configured).toBe(false)
      expect(status.docParsing.configured).toBe(false)
    })

    it('configures one module at a time', async () => {
      const status = await demoSetupAdapter.paddleocr.setup({
        moduleId: PADDLEOCR_TEXT_SKILL_ID,
        apiUrl: 'https://demo.paddleocr.com/ocr',
        accessToken: 'tok_test',
      })
      expect(status.configured).toBe(false)
      expect(status.enabledModules).toEqual([PADDLEOCR_TEXT_SKILL_ID])
      expect(status.textRecognition.configured).toBe(true)
      expect(status.docParsing.configured).toBe(false)

      const ready = await demoSetupAdapter.paddleocr.setup({
        moduleId: PADDLEOCR_DOC_SKILL_ID,
        apiUrl: 'https://demo.paddleocr.com/layout-parsing',
        accessToken: 'tok_test_doc',
      })
      expect(ready.configured).toBe(true)
      expect(ready.enabledModules).toEqual([
        PADDLEOCR_TEXT_SKILL_ID,
        PADDLEOCR_DOC_SKILL_ID,
      ])
    })
  })
})
