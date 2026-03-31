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
  removeChannelResult,
  saveFullConfigResult,
  setConfigResult,
  setDefaultModelResult,
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
import { detectSystemResult } from '@/shared/adapters/system'
import {
  installOpenclawFromLocalFileResult,
  installOpenclawGlobalResult,
  listOpenclawNpmVersionsResult,
  reinstallBackupStepResult,
  reinstallOpenclawGlobalResult,
  reinstallUninstallStepResult,
} from '@/shared/adapters/npmOpenclaw'
import { bootstrapAfterInstallResult } from '@/shared/adapters/openclawBootstrap'
import { listPluginsResult, setPluginEnabledResult } from '@/shared/adapters/plugins'
import {
  clawprobeConfigResult,
  clawprobeCostResult,
  clawprobeStatusResult,
} from '@/shared/adapters/clawprobeClient'

export const platformResults = {
  detectSystem: detectSystemResult,
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
  getConfig: getConfigResult,
  setConfig: setConfigResult,
  saveFullConfig: saveFullConfigResult,
  getChannels: getChannelsResult,
  addChannel: addChannelResult,
  removeChannel: removeChannelResult,
  getModels: getModelsResult,
  setDefaultModel: setDefaultModelResult,
  getSkills: getSkillsResult,
  searchSkills: searchSkillsResult,
  installSkill: installSkillResult,
  uninstallSkill: uninstallSkillResult,
  listPlugins: listPluginsResult,
  setPluginEnabled: setPluginEnabledResult,
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
} as const

export type PlatformResults = typeof platformResults
