export function createWebVitestTestConfig(platform: NodeJS.Platform = process.platform) {
  const windowsWorkerConfig =
    platform === 'win32'
      ? {
          pool: 'threads' as const,
          fileParallelism: false,
          maxWorkers: 1,
          minWorkers: 1,
        }
      : {}

  return {
    environment: 'jsdom' as const,
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    ...windowsWorkerConfig,
  }
}
