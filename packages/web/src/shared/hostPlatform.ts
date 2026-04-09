export function isWindowsHostPlatform(hostPlatform: string | null | undefined): boolean {
  return hostPlatform === 'win32' || hostPlatform === 'windows'
}
