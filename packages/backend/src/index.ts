import express from 'express'
import { registerDomainRoutes, attachLogsStreamServer } from './routes/index'

const app = express()
app.use(express.json())

const PORT = Number.parseInt(process.env.BACKEND_PORT ?? process.env.PORT ?? '3001', 10)

registerDomainRoutes(app)

const server = app.listen(PORT, () => {
  console.log(`OpenClaw Manager Backend on http://localhost:${PORT}`)
})

attachLogsStreamServer(server)
