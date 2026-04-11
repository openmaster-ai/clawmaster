import type express from 'express'
import type { Server } from 'http'
import { registerSystemRoutes } from './systemRoutes.js'
import { registerNpmRoutes } from './npmRoutes.js'
import { registerGatewayRoutes } from './gatewayRoutes.js'
import { registerConfigRoutes } from './configRoutes.js'
import { registerChannelsRoutes } from './channelsRoutes.js'
import { registerPluginsRoutes } from './pluginsRoutes.js'
import { registerBindingsAndWhatsAppRoutes } from './bindingsRoutes.js'
import { registerSettingsRoutes } from './settingsRoutes.js'
import { registerClawprobeRoutes } from './clawprobeRoutes.js'
import { registerLogsRoutes, attachLogsStreamServer as attachWs } from './logsRoutes.js'
import { registerMemoryRoutes } from './memoryRoutes.js'
import { registerExecRoutes } from './execRoutes.js'
import { registerStorageRoutes } from './storageRoutes.js'
import { registerMcpRoutes } from './mcpRoutes.js'
import { registerOllamaRoutes } from './ollamaRoutes.js'

export function registerDomainRoutes(app: express.Express): void {
  registerSystemRoutes(app)
  registerNpmRoutes(app)
  registerGatewayRoutes(app)
  registerConfigRoutes(app)
  registerChannelsRoutes(app)
  registerPluginsRoutes(app)
  registerBindingsAndWhatsAppRoutes(app)
  registerSettingsRoutes(app)
  registerClawprobeRoutes(app)
  registerLogsRoutes(app)
  registerMemoryRoutes(app)
  registerMcpRoutes(app)
  registerOllamaRoutes(app)
  registerExecRoutes(app)
  registerStorageRoutes(app)
}

export function attachLogsStreamServer(server: Server): void {
  attachWs(server)
}
