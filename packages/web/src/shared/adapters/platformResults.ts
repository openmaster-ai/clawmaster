/**
 * Unified AdapterResult helpers for pages using useAdapterCall.
 */
import {
  addChannelResult,
  createAgentResult,
  deleteAgentResult,
  getAgentsResult,
  getChannelsResult,
  getConfigResult,
  getModelsResult,
  getBindingsResult,
  removeChannelResult,
  saveFullConfigResult,
  setConfigResult,
  setDefaultModelResult,
  testModelProviderResult,
  verifyChannelAccountResult,
  upsertBindingResult,
  deleteBindingResult,
} from '@/shared/adapters/openclaw'
import {
  getSkillsResult,
  installSkillResult,
  searchSkillsResult,
  uninstallSkillResult,
} from '@/shared/adapters/clawhub'
import {
  getGatewayStatusResult,
  restartGatewayResult,
  startGatewayResult,
  stopGatewayResult,
  startWhatsAppLoginResult,
  getWhatsAppLoginStatusResult,
  cancelWhatsAppLoginResult,
} from '@/shared/adapters/gateway'
import { getLogsResult } from '@/shared/adapters/logs'
import { probeMirrorResult } from '@/shared/adapters/mirror'
import { readPanelConfigResult, writePanelConfigResult } from '@/shared/adapters/panel'
import {
  createOpenclawBackupResult,
  getBackupDefaultsResult,
  listOpenclawBackupsResult,
  removeOpenclawDataResult,
  resetOpenclawConfigResult,
  restoreOpenclawBackupResult,
  uninstallOpenclawCliResult,
} from '@/shared/adapters/dangerSettings'
import {
  clearOpenclawProfileResult,
  detectSystemResult,
  saveOpenclawProfileResult,
} from '@/shared/adapters/system'
import {
  installOpenclawFromLocalFileResult,
  installOpenclawGlobalResult,
  listOpenclawNpmVersionsResult,
  reinstallBackupStepResult,
  reinstallOpenclawGlobalResult,
  reinstallUninstallStepResult,
} from '@/shared/adapters/npmOpenclaw'
import { bootstrapAfterInstallResult } from '@/shared/adapters/openclawBootstrap'
import {
  installPluginResult,
  listPluginsResult,
  setPluginEnabledResult,
  uninstallPluginResult,
} from '@/shared/adapters/plugins'
import {
  clawprobeBootstrapResult,
  clawprobeConfigResult,
  clawprobeCostResult,
  clawprobeStatusResult,
} from '@/shared/adapters/clawprobeClient'
import {
  deleteOpenclawMemoryFileResult,
  openclawMemoryFilesResult,
  openclawMemorySearchCapabilityResult,
  openclawMemorySearchResult,
  openclawMemoryStatusResult,
  reindexOpenclawMemoryResult,
} from '@/shared/adapters/memory'

export const platformResults = {
  detectSystem: detectSystemResult,
  saveOpenclawProfile: saveOpenclawProfileResult,
  clearOpenclawProfile: clearOpenclawProfileResult,
  resetOpenclawConfig: resetOpenclawConfigResult,
  uninstallOpenclawCli: uninstallOpenclawCliResult,
  getBackupDefaults: getBackupDefaultsResult,
  createOpenclawBackup: createOpenclawBackupResult,
  listOpenclawBackups: listOpenclawBackupsResult,
  restoreOpenclawBackup: restoreOpenclawBackupResult,
  removeOpenclawData: removeOpenclawDataResult,
  getGatewayStatus: getGatewayStatusResult,
  startGateway: startGatewayResult,
  stopGateway: stopGatewayResult,
  restartGateway: restartGatewayResult,
  startWhatsAppLogin: startWhatsAppLoginResult,
  getWhatsAppLoginStatus: getWhatsAppLoginStatusResult,
  cancelWhatsAppLogin: cancelWhatsAppLoginResult,
  getConfig: getConfigResult,
  setConfig: setConfigResult,
  verifyChannelAccount: verifyChannelAccountResult,
  saveFullConfig: saveFullConfigResult,
  getChannels: getChannelsResult,
  addChannel: addChannelResult,
  removeChannel: removeChannelResult,
  getModels: getModelsResult,
  setDefaultModel: setDefaultModelResult,
  testModelProvider: testModelProviderResult,
  getSkills: getSkillsResult,
  searchSkills: searchSkillsResult,
  installSkill: installSkillResult,
  uninstallSkill: uninstallSkillResult,
  listPlugins: listPluginsResult,
  setPluginEnabled: setPluginEnabledResult,
  installPlugin: installPluginResult,
  uninstallPlugin: uninstallPluginResult,
  getBindings: getBindingsResult,
  upsertBinding: upsertBindingResult,
  deleteBinding: deleteBindingResult,
  getAgents: getAgentsResult,
  createAgent: createAgentResult,
  deleteAgent: deleteAgentResult,
  getLogs: getLogsResult,
  probeMirror: probeMirrorResult,
  readPanelConfig: readPanelConfigResult,
  writePanelConfig: writePanelConfigResult,
  listOpenclawNpmVersions: listOpenclawNpmVersionsResult,
  installOpenclawGlobal: installOpenclawGlobalResult,
  installOpenclawFromLocalFile: installOpenclawFromLocalFileResult,
  reinstallOpenclawGlobal: reinstallOpenclawGlobalResult,
  reinstallBackupStep: reinstallBackupStepResult,
  reinstallUninstallStep: reinstallUninstallStepResult,
  bootstrapAfterInstall: bootstrapAfterInstallResult,
  clawprobeStatus: clawprobeStatusResult,
  clawprobeCost: clawprobeCostResult,
  clawprobeConfig: clawprobeConfigResult,
  clawprobeBootstrap: clawprobeBootstrapResult,
  openclawMemoryStatus: openclawMemoryStatusResult,
  openclawMemorySearchCapability: openclawMemorySearchCapabilityResult,
  openclawMemorySearch: openclawMemorySearchResult,
  openclawMemoryFiles: openclawMemoryFilesResult,
  reindexOpenclawMemory: reindexOpenclawMemoryResult,
  deleteOpenclawMemoryFile: deleteOpenclawMemoryFileResult,
} as const

export type PlatformResults = typeof platformResults
