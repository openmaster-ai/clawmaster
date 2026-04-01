import type express from 'express'
import { readConfigJsonOrEmpty, updateConfigJson } from '../configJson.js'
import { agentsFromConfig, channelsFromConfig, modelsFromConfig } from '../derive.js'
import { verifyChannelAccount } from '../services/channelVerify.js'
import { probeOpenclawModelProvider, assertSafeProviderId } from '../services/modelProbe.js'
import { isRecord } from '../serverUtils.js'

export function registerChannelsRoutes(app: express.Express): void {
  app.get('/api/channels', (_req, res) => {
    res.json(channelsFromConfig(readConfigJsonOrEmpty()))
  })

  app.post('/api/channels', async (req, res) => {
    const body = req.body as { type?: string; name?: string; config?: Record<string, unknown> }
    if (!body?.type) {
      return res.status(400).type('text').send('Missing type')
    }
    const channelType = body.type
    await updateConfigJson((config) => {
      const channels = isRecord(config.channels) ? { ...config.channels } : {}
      channels[channelType] = { enabled: true, ...(body.config ?? {}) }
      config.channels = channels
    })
    res.status(204).end()
  })

  app.delete('/api/channels/:id', async (req, res) => {
    const id = req.params.id
    const removed = await updateConfigJson((config) => {
      if (!isRecord(config.channels) || !config.channels[id]) {
        return false
      }
      delete config.channels[id]
      return true
    })
    if (!removed) {
      return res.status(404).type('text').send('Channel not found')
    }
    res.status(204).end()
  })

  app.post('/api/channels/:type/verify', async (req, res) => {
    const type = String(req.params.type ?? '').trim().toLowerCase()
    const body = req.body as { account?: unknown }
    if (!isRecord(body.account)) {
      return res.status(400).type('text').send('Body must contain account object')
    }
    try {
      const out = await verifyChannelAccount(type, body.account)
      res.json(out)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      res.status(400).json({ ok: false, message: msg })
    }
  })

  app.get('/api/models', (_req, res) => {
    res.json(modelsFromConfig(readConfigJsonOrEmpty()))
  })

  app.post('/api/models/probe', async (req, res) => {
    const raw = (req.body as { providerId?: string })?.providerId
    if (typeof raw !== 'string') {
      return res.status(400).type('text').send('Missing providerId')
    }
    try {
      assertSafeProviderId(raw)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return res.status(400).type('text').send(msg)
    }
    const out = await probeOpenclawModelProvider(raw)
    res.json(out)
  })

  app.post('/api/models/default', async (req, res) => {
    const modelId = (req.body as { modelId?: string })?.modelId
    if (typeof modelId !== 'string') {
      return res.status(400).type('text').send('Missing modelId')
    }
    await updateConfigJson((config) => {
      const agents = isRecord(config.agents) ? { ...config.agents } : {}
      const defaults = isRecord(agents.defaults) ? { ...agents.defaults } : {}
      const model = isRecord(defaults.model) ? { ...defaults.model } : {}
      model.primary = modelId
      defaults.model = model
      agents.defaults = defaults
      config.agents = agents
    })
    res.status(204).end()
  })

  app.get('/api/agents', (_req, res) => {
    res.json(agentsFromConfig(readConfigJsonOrEmpty()))
  })

  app.post('/api/agents', async (req, res) => {
    const body = req.body as { id?: string; name?: string; model?: string }
    if (!body?.id || !body.name || !body.model) {
      return res.status(400).type('text').send('Missing id, name or model')
    }
    await updateConfigJson((config) => {
      const agents = isRecord(config.agents) ? { ...config.agents } : {}
      const list = Array.isArray(agents.list) ? [...agents.list] : []
      list.push({ id: body.id, name: body.name, model: body.model })
      agents.list = list
      config.agents = agents
    })
    res.status(204).end()
  })

  app.delete('/api/agents/:id', async (req, res) => {
    const id = req.params.id
    const state = await updateConfigJson((config) => {
      const agentBlock = isRecord(config.agents) ? config.agents : null
      if (!agentBlock || !Array.isArray(agentBlock.list)) {
        return 'agents-not-found' as const
      }
      const prevLen = agentBlock.list.length
      const list = agentBlock.list.filter((a) => (isRecord(a) ? a.id !== id : true))
      if (list.length === prevLen) {
        return 'agent-not-found' as const
      }
      config.agents = { ...agentBlock, list }
      return 'ok' as const
    })
    if (state === 'agents-not-found') {
      return res.status(404).type('text').send('Agents not found')
    }
    if (state === 'agent-not-found') {
      return res.status(404).type('text').send('Agent not found')
    }
    res.status(204).end()
  })
}
