import type express from 'express'
import type { Server } from 'http'
import { registerSystemRoutes } from './systemRoutes'
import { registerNpmRoutes } from './npmRoutes'
import { registerGatewayRoutes } from './gatewayRoutes'
import { registerConfigRoutes } from './configRoutes'
import { registerChannelsRoutes } from './channelsRoutes'
import { registerPluginsRoutes } from './pluginsRoutes'
import { registerBindingsAndWhatsAppRoutes } from './bindingsRoutes'
import { registerSettingsRoutes } from './settingsRoutes'
import { registerClawprobeRoutes } from './clawprobeRoutes'
import { registerLogsRoutes, attachLogsStreamServer as attachWs } from './logsRoutes'
import { registerMemoryRoutes } from './memoryRoutes'
import { registerPaddleOcrRoutes } from './paddleocrRoutes'
import { registerExecRoutes } from './execRoutes'

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
  registerPaddleOcrRoutes(app)
  registerExecRoutes(app)
}

export function attachLogsStreamServer(server: Server): void {
  attachWs(server)
}
