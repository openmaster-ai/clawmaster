import type express from 'express'
import {
  installOpenclawPlugin,
  listOpenclawPlugins,
  setOpenclawPluginEnabled,
  uninstallOpenclawPlugin,
} from '../services/openclawPlugins.js'
import { installSkillWithClawhub, searchClawhubSkills } from '../clawhubRegistry.js'
import { runOpenclawSkillsChecked, runOpenclawSkillsUninstall } from '../skillsCli.js'
import { mapSkillJson } from '../skillsParse.js'
import { isRecord, sendOpenclawFailure } from '../serverUtils.js'

export function registerPluginsRoutes(app: express.Express): void {
  app.get('/api/plugins', async (_req, res) => {
    try {
      const out = await listOpenclawPlugins()
      res.json({
        plugins: out.rows,
        rawCliOutput:
          out.rows.length === 0 && out.fallbackText ? out.fallbackText : null,
      })
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/plugins/set-enabled', async (req, res) => {
    try {
      const body = req.body
      if (
        !isRecord(body) ||
        typeof body.id !== 'string' ||
        typeof body.enabled !== 'boolean'
      ) {
        return res.status(400).type('text').send('Body must be JSON: { "id": string, "enabled": boolean }')
      }
      await setOpenclawPluginEnabled(body.id, body.enabled)
      res.status(204).end()
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/plugins/install', async (req, res) => {
    try {
      const body = req.body
      if (!isRecord(body) || typeof body.id !== 'string') {
        return res.status(400).type('text').send('Body must be JSON: { "id": string }')
      }
      await installOpenclawPlugin(body.id)
      res.json({ ok: true, installedId: body.id.trim() })
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/plugins/uninstall', async (req, res) => {
    try {
      const body = req.body
      if (!isRecord(body) || typeof body.id !== 'string') {
        return res
          .status(400)
          .type('text')
          .send('Body must be JSON: { "id": string, "keepFiles"?: boolean, "disableLoadedFirst"?: boolean }')
      }
      const keepFiles = body.keepFiles === true
      const disableLoadedFirst = body.disableLoadedFirst === true
      await uninstallOpenclawPlugin(body.id, keepFiles, { disableLoadedFirst })
      res.status(204).end()
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.get('/api/skills', async (_req, res) => {
    try {
      const out = await runOpenclawSkillsChecked(['list', '--json'])
      res.json(mapSkillJson(out, true))
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.get('/api/skills/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : ''
    if (!q.trim()) {
      return res.json([])
    }
    try {
      res.json(await searchClawhubSkills(q))
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/skills/install', async (req, res) => {
    const slug = (req.body as { slug?: string })?.slug
    if (!slug) {
      return res.status(400).type('text').send('Missing slug')
    }
    try {
      try {
        await installSkillWithClawhub(slug)
      } catch {
        await runOpenclawSkillsChecked(['install', slug])
      }
      res.status(204).end()
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })

  app.post('/api/skills/uninstall', async (req, res) => {
    const slug = (req.body as { slug?: string })?.slug
    if (!slug) {
      return res.status(400).type('text').send('Missing slug')
    }
    try {
      await runOpenclawSkillsUninstall(slug)
      res.status(204).end()
    } catch (error: unknown) {
      sendOpenclawFailure(res, error)
    }
  })
}
