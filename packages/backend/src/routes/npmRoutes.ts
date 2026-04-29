import type express from 'express'
import { bootstrapAfterInstall, getNpmClawmasterVersions, getNpmOpenclawVersions, installOpenclaw, reinstallBackupStep, reinstallOpenclaw, reinstallUninstallStep } from '../services/npmService.js'

export function registerNpmRoutes(app: express.Express): void {
  app.get('/api/npm/openclaw-versions', async (_req, res) => {
    try {
      res.json(await getNpmOpenclawVersions())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(502).type('text').send(msg)
    }
  })

  app.get('/api/npm/clawmaster-versions', async (_req, res) => {
    try {
      res.json(await getNpmClawmasterVersions())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(502).type('text').send(msg)
    }
  })

  app.post('/api/npm/install-openclaw', async (req, res) => {
    try {
      res.json(await installOpenclaw(req.body as { version?: unknown; localPath?: unknown }))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(400).type('text').send(msg)
    }
  })

  app.post('/api/npm/reinstall-step/backup', async (_req, res) => {
    try {
      res.json(await reinstallBackupStep())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/npm/reinstall-step/uninstall', async (_req, res) => {
    try {
      res.json(await reinstallUninstallStep())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/npm/reinstall-openclaw', async (req, res) => {
    try {
      res.json(await reinstallOpenclaw((req.body as { version?: unknown })?.version))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(400).type('text').send(msg)
    }
  })

  app.post('/api/openclaw/bootstrap-after-install', async (_req, res) => {
    try {
      res.json(await bootstrapAfterInstall())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
