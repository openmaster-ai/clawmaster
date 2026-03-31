import type { Server } from 'node:http'
import type express from 'express'
import type { WebSocketServer } from 'ws'
import { attachLogsWebSocket, getLogEntries } from '../services/logsService.js'

export function registerLogsRoutes(app: express.Express): void {
  app.get('/api/logs', (req, res) => {
    const lines = Math.min(parseInt(String(req.query.lines), 10) || 100, 5000)
    res.json(getLogEntries(lines))
  })
}

export function attachLogsStreamServer(server: Server): WebSocketServer {
  return attachLogsWebSocket(server)
}
