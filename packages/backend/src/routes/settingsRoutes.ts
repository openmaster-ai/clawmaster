import type express from 'express'
import { backupOpenclaw, getBackupDefaults, listOpenclawBackups, removeOpenclawData, resetConfig, restoreOpenclawBackup, uninstallOpenclaw } from '../services/settingsService.js'

export function registerSettingsRoutes(app: express.Express): void {
  app.get('/api/settings/backup-defaults', (_req, res) => {
    res.json(getBackupDefaults())
  })

  app.post('/api/settings/openclaw-backup', async (req, res) => {
    try {
      const body = req.body as { mode?: string; exportDir?: string }
      res.json(await backupOpenclaw(body.mode, body.exportDir))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('mode 须为')) {
        res.status(400).type('text').send(msg)
      } else {
        res.status(500).type('text').send(msg)
      }
    }
  })

  app.get('/api/settings/openclaw-backups', (_req, res) => {
    try {
      res.json(listOpenclawBackups())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/settings/openclaw-restore', async (req, res) => {
    try {
      const tarPath = typeof (req.body as { tarPath?: string })?.tarPath === 'string' ? (req.body as { tarPath: string }).tarPath : ''
      await restoreOpenclawBackup(tarPath)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg === '缺少 tarPath') res.status(400).type('text').send(msg)
      else res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/settings/remove-openclaw-data', (req, res) => {
    try {
      removeOpenclawData((req.body as { confirm?: string })?.confirm)
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('confirm')) res.status(400).type('text').send(msg)
      else res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/settings/reset-config', (_req, res) => {
    try {
      resetConfig()
      res.status(204).end()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })

  app.post('/api/settings/uninstall-openclaw', async (_req, res) => {
    try {
      res.json(await uninstallOpenclaw())
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(500).type('text').send(msg)
    }
  })
}
