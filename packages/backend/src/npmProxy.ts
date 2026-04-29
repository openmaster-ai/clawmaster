import { getClawmasterNpmProxyRegistryUrl } from './clawmasterSettings.js'

const NPM_PROXY_COMMANDS = new Set(['install', 'i', 'view'])

function hasRegistryOverride(args: string[]): boolean {
  return args.some((arg) => arg === '--registry' || arg.startsWith('--registry='))
}

function shouldApplyRegistryProxy(args: string[]): boolean {
  const subcommand = args[0]?.trim().toLowerCase()
  return Boolean(subcommand && NPM_PROXY_COMMANDS.has(subcommand) && !hasRegistryOverride(args))
}

export function applyConfiguredNpmRegistryArgs(args: string[]): string[] {
  const registryUrl = getClawmasterNpmProxyRegistryUrl()
  if (!registryUrl || !shouldApplyRegistryProxy(args)) {
    return [...args]
  }
  return [...args, '--registry', registryUrl]
}
