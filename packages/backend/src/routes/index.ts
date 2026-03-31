import type express from 'express'
import { registerChannelsRoutes } from './channelsRoutes.js'
import { registerPluginsRoutes } from './pluginsRoutes.js'
import { registerBindingsAndWhatsAppRoutes } from './bindingsRoutes.js'
import { registerSystemRoutes } from './systemRoutes.js'
import { registerNpmRoutes } from './npmRoutes.js'
import { registerGatewayRoutes } from './gatewayRoutes.js'
import { registerConfigRoutes } from './configRoutes.js'
import { registerSettingsRoutes } from './settingsRoutes.js'
import { registerClawprobeRoutes } from './clawprobeRoutes.js'
import { registerLogsRoutes } from './logsRoutes.js'

export { attachLogsStreamServer } from './logsRoutes.js'

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
}
