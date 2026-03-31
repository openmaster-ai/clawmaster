import express from 'express'
import cors from 'cors'
import { attachLogsStreamServer, registerDomainRoutes } from './routes/index.js'

const app = express()
app.use(cors())
app.use(express.json())

const DEFAULT_PORT = 3001
const PORT = Number.parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? `${DEFAULT_PORT}`, 10)

registerDomainRoutes(app)

const server = app.listen(PORT, () => {
  console.log(`🦞 OpenClaw Manager Backend (Tauri-parity) on http://localhost:${PORT}`)
})

attachLogsStreamServer(server)
