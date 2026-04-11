import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { URL } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { parseLogLine, readLogTailStrings } from '../logs.js'
import { isServiceAuthEnabled, isServiceRequestAuthorized } from '../serviceAuth.js'

export type LogEntry = {
  timestamp: string
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR'
  message: string
}

export function getLogEntries(linesRequested: number): LogEntry[] {
  const lines = Math.min(Number.isFinite(linesRequested) ? linesRequested : 100, 5000)
  const raw = readLogTailStrings(lines)
  return raw.map(parseLogLine)
}

/** Attach WS at `/api/logs/stream` (same path as before). */
export function attachLogsWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const pathname = (() => {
      try {
        return new URL(request.url ?? '/', 'http://clawmaster.local').pathname
      } catch {
        return null
      }
    })()
    if (pathname !== '/api/logs/stream') {
      return
    }

    if (isServiceAuthEnabled() && !isServiceRequestAuthorized(request)) {
      rejectUnauthorizedSocket(socket)
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', (ws: WebSocket) => {
    let lastLine = ''
    const tick = () => {
      try {
        const tail = readLogTailStrings(1)
        const line = tail[tail.length - 1] ?? ''
        if (line && line !== lastLine) {
          lastLine = line
          ws.send(JSON.stringify(parseLogLine(line)))
        }
      } catch {
        /* ignore */
      }
    }
    tick()
    const interval = setInterval(tick, 2000)
    ws.on('close', () => clearInterval(interval))
  })
  return wss
}

function rejectUnauthorizedSocket(socket: Duplex) {
  socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
  socket.destroy()
}
