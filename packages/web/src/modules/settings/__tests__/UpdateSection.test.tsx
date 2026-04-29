import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock window.matchMedia for theme code
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock dependencies before import
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      const map: Record<string, string> = {
        'settings.update': 'Update',
        'settings.checkUpdate': 'Check for updates',
        'settings.checking': 'Checking...',
        'settings.upToDate': 'Up to date',
        'settings.updateChannel': 'Channel:',
        'settings.targetVersion': 'Version:',
        'settings.updateTo': `Update to ${opts?.version ?? ''}`,
        'settings.downgrade': `Downgrade to ${opts?.version ?? ''}`,
        'settings.updateFailed': 'Update failed',
        'settings.changelog': 'Release Notes',
        'settings.currentLabel': 'current',
        'settings.clawmasterReleases': 'ClawMaster Releases',
        'settings.clawmasterReleasesDesc': 'Review app releases and open the right installer for this device.',
        'settings.clawmasterLatest': 'Latest release',
        'settings.clawmasterUpdateAvailable': `ClawMaster v${opts?.version ?? ''} is ready to install.`,
        'settings.clawmasterUpToDate': 'ClawMaster is up to date',
        'settings.clawmasterSourceGithub': 'Release details loaded from GitHub Releases.',
        'settings.clawmasterSourceNpm': 'Version detected from npm fallback; GitHub release details are unavailable.',
        'settings.clawmasterNpmFallbackDesc': 'GitHub release notes could not be loaded. Open the releases page to download the installer and review details.',
        'settings.clawmasterOpenInstaller': 'Open Installer',
        'settings.clawmasterOpenReleases': 'Open Releases',
        'settings.acknowledgments': 'Acknowledgments',
        'settings.profileTitle': 'OpenClaw profile',
        'settings.profileDesc': 'Choose which OpenClaw runtime ClawMaster should read, configure, and launch.',
        'settings.profileDefault': 'Default',
        'settings.profileDefaultDesc': 'Auto-detect the main local install and keep the standard profile path.',
        'settings.profileDev': 'Dev',
        'settings.profileDevDesc': 'Use the isolated dev runtime with shifted ports and its own state directory.',
        'settings.profileNamed': 'Named',
        'settings.profileNamedDesc': 'Target a named OpenClaw profile for a separate workspace or environment.',
        'settings.profileName': 'Profile name',
        'settings.profileNamePlaceholder': 'team-a',
        'settings.profileNameHint': 'Allowed characters: letters, numbers, dot, underscore, and hyphen.',
        'settings.profileNameRequired': 'Enter a profile name before saving.',
        'settings.profileSeedTitle': 'Seed named profile',
        'settings.profileSeedDesc': 'Optionally start the named profile from the current resolved config or import another openclaw.json.',
        'settings.profileSeedEmpty': 'Start empty',
        'settings.profileSeedEmptyDesc': 'Create the named profile without copying any config first.',
        'settings.profileSeedClone': 'Clone current config',
        'settings.profileSeedCloneDesc': 'Copy the currently resolved OpenClaw config into the new named profile.',
        'settings.profileSeedImport': 'Import config path',
        'settings.profileSeedImportDesc': 'Use an existing openclaw.json from another location as the starting point.',
        'settings.profileSeedCloneSource': 'Current source config',
        'settings.profileSeedPath': 'Config file path',
        'settings.profileSeedPathPlaceholder': '~/existing/openclaw.json',
        'settings.profileSeedPathHint': 'Provide the full path to an existing openclaw.json file.',
        'settings.profileSeedPathRequired': 'Enter an OpenClaw config path before importing.',
        'settings.profileSeedCopiesConfigOnly': 'This seeds only openclaw.json. Skills, plugins, logs, and other runtime state stay isolated per profile.',
        'settings.profileSaved': 'OpenClaw profile updated.',
        'settings.profileResolved': 'Resolved target',
        'settings.profileCurrent': 'Current target',
        'settings.profileDataDir': 'Data directory',
        'settings.profileAutoDetect': 'Default profile detection',
        'settings.profileCandidateIdle': 'Not present',
        'settings.profileApply': 'Apply profile',
        'settings.runtimeTitle': 'Runtime',
        'settings.runtimeDesc': 'Choose whether ClawMaster should manage a native Windows install or a WSL2-hosted OpenClaw runtime.',
        'settings.runtimeNative': 'Native',
        'settings.runtimeNativeDesc': 'Run commands and manage files in the same Windows environment as ClawMaster.',
        'settings.runtimeWsl2': 'WSL2',
        'settings.runtimeWsl2Desc': 'Use a Linux runtime inside WSL2 for OpenClaw and related tooling.',
        'settings.runtimeDistro': 'WSL distro',
        'settings.runtimeDistroHint': 'Pick the distro that contains your OpenClaw install.',
        'settings.runtimeDistroPlaceholder': 'Choose a distro',
        'settings.runtimeDistroRequired': 'Choose a WSL distro before saving WSL2 mode.',
        'settings.runtimeSaved': 'Runtime updated.',
        'settings.runtimeResolved': 'Resolved runtime',
        'settings.runtimeCurrent': 'Current mode',
        'settings.runtimeWslAvailability': 'WSL2 available',
        'settings.runtimeDefaultTag': 'default',
        'settings.runtimeOpenclawInDistro': 'OpenClaw in distro',
        'settings.runtimeOpenclawMissing': 'Not found',
        'settings.localDataTitle': 'Local Data',
        'settings.localDataDesc': 'Prepare the profile-scoped storage foundation for Docs, Logs, and future hybrid search without adding Python dependencies.',
        'settings.localDataStateReady': 'Ready',
        'settings.localDataStateDegraded': 'Fallback',
        'settings.localDataStateBlocked': 'Blocked',
        'settings.localDataEngineEmbedded': 'seekdb',
        'settings.localDataEngineFallback': 'Fallback store',
        'settings.localDataEngineUnavailable': 'Unavailable',
        'settings.localDataReadySummary': 'seekdb can run for this runtime target.',
        'settings.localDataFallbackSummary': 'ClawMaster will keep working through a file-backed fallback until this target supports seekdb.',
        'settings.localDataBlockedSummary': 'Local data cannot pick a safe target yet.',
        'settings.localDataNoPythonHint': 'This foundation uses JavaScript/TypeScript runtime paths only; no Python package or Python-based skill is required.',
        'settings.localDataReasonNodeMissing': 'Node.js is missing in the selected runtime. seekdb requires Node 20 or newer, so the fallback store is selected.',
        'settings.localDataReasonNodeTooOld': 'The selected runtime uses Node.js below 20. Upgrade Node.js to enable seekdb where the platform supports it.',
        'settings.localDataReasonUnsupportedPlatform': 'seekdb bindings are not available on this target yet. Use WSL2, server mode later, or fallback storage.',
        'settings.localDataReasonWslDistroMissing': 'WSL2 mode is selected, but the saved distro is missing. Re-select the distro before Local Data can safely resolve a target.',
        'settings.localDataRuntime': 'Runtime',
        'settings.localDataProfile': 'Profile',
        'settings.localDataEmbeddedSupport': 'Embedded support',
        'settings.localDataSupported': 'Supported',
        'settings.localDataUnavailable': 'Unavailable',
        'settings.localDataResolved': 'Resolved storage',
        'settings.localDataEngine': 'Engine',
        'settings.localDataTarget': 'Target',
        'settings.localDataNodeRequirement': 'Node requirement',
        'settings.localDataRoot': 'Data root',
        'settings.localDataEngineRoot': 'Engine root',
        'settings.localDataDocuments': 'Documents',
        'settings.localDataDocsModule': 'Docs index',
        'settings.localDataUpdatedAt': 'Updated',
        'settings.localDataRebuild': 'Rebuild Index',
        'settings.localDataReset': 'Reset Store',
        'settings.localDataRebuildSuccess': 'Local Data index rebuilt.',
        'settings.localDataResetSuccess': 'Local Data store reset.',
        'settings.localDataResetConfirm': 'Reset Local Data fallback store? Indexed data will be rebuilt by modules as they load.',
        'settings.localDataDesktopPending': 'Desktop Local Data management is read-only until the Node storage worker is available.',
        'logs.settingsTitle': 'Diagnostics',
        'logs.settingsDescription': 'Use this hub when you need a broader diagnostics view after checking contextual module logs.',
        'logs.openRecent': 'View Recent Logs',
        'logs.gatewayTitle': 'Recent Gateway Logs',
        'logs.gatewayDescription': 'Use this when the gateway fails to start, restart, bind, or authenticate correctly.',
        'logs.channelsTitle': 'Channel Troubleshooting Logs',
        'logs.channelsDescription': 'Check recent logs when channel verification, login, or account setup fails.',
        'logs.hubDescription': 'Open scoped logs first, then jump back into the module that owns the fix.',
        'logs.systemCardTitle': 'System runtime',
        'logs.systemCardDescription': 'Review install, CLI, and runtime level logs before changing environment-wide settings.',
        'logs.gatewayCardTitle': 'Gateway diagnostics',
        'logs.gatewayCardDescription': 'Inspect gateway startup, auth, and binding failures, then return to the gateway module.',
        'logs.channelsCardTitle': 'Channel diagnostics',
        'logs.channelsCardDescription': 'Check recent login, verification, and account-binding errors before editing channel setup.',
        'logs.openSystemLogs': 'Open System Logs',
        'logs.openGatewayLogs': 'Open Gateway Diagnostics',
        'logs.openChannelLogs': 'Open Channel Diagnostics',
        'logs.gotoSystemInfo': 'Open System Info',
        'logs.gotoGatewayPage': 'Go to Gateway',
        'logs.gotoChannelsPage': 'Go to Channels',
        'logs.searchPlaceholder': 'Search logs',
        'logs.allLevels': 'All Levels',
        'logs.recentLines': `Last ${opts?.count ?? 0} lines`,
        'logs.copyVisible': 'Copy Visible',
        'logs.copied': 'Copied',
        'logs.loadingRecent': 'Loading recent logs...',
        'logs.loadFailed': 'Failed to load logs',
        'logs.noLogs': 'No recent logs',
        'logs.noScopedLogs': `No matching logs found in the last ${opts?.count ?? 0} lines`,
        'common.close': 'Close',
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'common.notInstalled': 'Not installed',
        'common.unknownError': 'Unknown error',
        'common.save': 'Save',
        'common.saving': 'Saving...',
        'common.refresh': 'Refresh',
        'common.installed': 'Installed',
        'install.running': 'Installing...',
        'install.done': 'Done',
        'install.failed': 'Failed',
        'install.retry': 'Retry',
      }
      return map[key] ?? key
    },
    i18n: { language: 'en' },
  }),
}))

const mockListVersions = vi.fn()
const mockReinstall = vi.fn()
const mockInstall = vi.fn()
const mockBootstrap = vi.fn()
const mockSaveProfile = vi.fn()
const mockClearProfile = vi.fn()
const mockSaveRuntime = vi.fn()
const mockGetNpmProxy = vi.fn()
const mockSaveNpmProxy = vi.fn()
const mockGetLogsResult = vi.fn()
const mockGetLocalDataStats = vi.fn()
const mockRebuildLocalData = vi.fn()
const mockResetLocalData = vi.fn()
const mockIsTauri = vi.fn()
const mockCheckClawmasterRelease = vi.fn()
const mockSelectInstallerAsset = vi.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function makeSystemInfo(overrides: any = {}) {
  return {
    nodejs: { installed: true, version: '20.0.0' },
    npm: { installed: true, version: '10.0.0' },
    openclaw: {
      installed: true,
      version: '2026.3.28',
      configPath: '/home/.openclaw/openclaw.json',
      dataDir: '/home/.openclaw',
      profileMode: 'default',
      profileName: null,
      overrideActive: false,
      configPathCandidates: ['/home/.openclaw/openclaw.json'],
      existingConfigPaths: ['/home/.openclaw/openclaw.json'],
      ...overrides.openclaw,
    },
    storage: {
      state: 'ready',
      engine: 'fallback',
      runtimeTarget: 'native',
      profileKey: 'default',
      dataRoot: '/home/.clawmaster/data/default',
      engineRoot: '/home/.clawmaster/data/default/fallback',
      nodeRequirement: '>=20',
      supportsEmbedded: true,
      targetPlatform: 'darwin',
      targetArch: 'arm64',
      reasonCode: null,
      ...overrides.storage,
    },
    runtime: {
      mode: 'native',
      hostPlatform: 'darwin',
      wslAvailable: false,
      selectedDistro: null,
      selectedDistroExists: null,
      distros: [],
      ...overrides.runtime,
    },
  }
}

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    getClawmasterNpmProxy: (...args: any[]) => mockGetNpmProxy(...args),
    saveClawmasterRuntime: (...args: any[]) => mockSaveRuntime(...args),
    saveClawmasterNpmProxy: (...args: any[]) => mockSaveNpmProxy(...args),
    saveOpenclawProfile: (...args: any[]) => mockSaveProfile(...args),
    clearOpenclawProfile: (...args: any[]) => mockClearProfile(...args),
    listOpenclawNpmVersions: (...args: any[]) => mockListVersions(...args),
    reinstallOpenclawGlobal: (...args: any[]) => mockReinstall(...args),
    installOpenclawGlobal: (...args: any[]) => mockInstall(...args),
    bootstrapAfterInstall: (...args: any[]) => mockBootstrap(...args),
  },
}))

vi.mock('@/shared/adapters/logs', () => ({
  getLogsResult: (...args: any[]) => mockGetLogsResult(...args),
}))

vi.mock('@/shared/adapters/storage', () => ({
  getLocalDataStatsResult: (...args: any[]) => mockGetLocalDataStats(...args),
  rebuildLocalDataResult: (...args: any[]) => mockRebuildLocalData(...args),
  resetLocalDataResult: (...args: any[]) => mockResetLocalData(...args),
}))

vi.mock('@/shared/adapters/platform', () => ({
  isTauri: (...args: any[]) => mockIsTauri(...args),
}))

vi.mock('@/shared/adapters/clawmasterReleases', () => ({
  checkClawmasterReleaseResult: (...args: any[]) => mockCheckClawmasterRelease(...args),
  selectInstallerAsset: (...args: any[]) => mockSelectInstallerAsset(...args),
}))

vi.mock('@/adapters', () => ({
  platform: {
    detectSystem: vi.fn().mockResolvedValue(makeSystemInfo()),
  },
}))

vi.mock('@/i18n', () => ({
  changeLanguage: vi.fn(),
}))

vi.mock('@/modules/setup/adapters', () => ({
  getSetupAdapter: () => ({
    detectCapabilities: async () => [],
    installCapabilities: async () => {},
    onboarding: {},
    gateway: {},
    channel: {},
  }),
}))

// Import after mocks
import Settings from '../SettingsPage'
import { platform } from '@/adapters'

function renderSettings(initialEntries?: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Settings />
    </MemoryRouter>,
  )
}

describe('UpdateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(platform.detectSystem).mockResolvedValue(makeSystemInfo())
    mockIsTauri.mockReturnValue(false)
    mockBootstrap.mockResolvedValue({ success: true })
    mockSelectInstallerAsset.mockReturnValue({
      name: 'ClawMaster_0.3.1_x64.msi',
      url: 'https://example.com/clawmaster.msi',
    })
    mockCheckClawmasterRelease.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '0.3.0',
        latestVersion: '0.3.1',
        hasUpdate: true,
        source: 'github',
        latestRelease: {
          version: '0.3.1',
          tagName: 'v0.3.1',
          name: 'v0.3.1',
          body: '## Install\n\n### CLI + Web Console\n\n```bash\nnpm install -g clawmaster\nclawmaster\n```',
          publishedAt: '2026-04-24T00:00:00.000Z',
          htmlUrl: 'https://github.com/openmaster-ai/clawmaster/releases/tag/v0.3.1',
          assets: [],
        },
        releases: [],
      },
    })
    mockGetNpmProxy.mockResolvedValue({
      success: true,
      data: { enabled: false, registryUrl: null },
      error: null,
    })
    mockSaveNpmProxy.mockResolvedValue({
      success: true,
      data: { enabled: false, registryUrl: null },
      error: null,
    })
    mockSaveProfile.mockResolvedValue({ success: true, data: undefined, error: null })
    mockClearProfile.mockResolvedValue({ success: true, data: undefined, error: null })
    mockSaveRuntime.mockResolvedValue({ success: true, data: undefined, error: null })
    mockGetLogsResult.mockResolvedValue({
      success: true,
      data: [
        {
          timestamp: '2026-04-07T15:51:05.010Z',
          level: 'INFO',
          message: '2026-04-05T20:19:43.900+08:00 [ws] webchat disconnected code=1001',
        },
        {
          timestamp: '2026-04-07T15:51:05.010Z',
          level: 'INFO',
          message: '2026-04-06T12:16:01.997+08:00 [gateway] listening on ws://127.0.0.1:18789',
        },
      ],
    })
    mockGetLocalDataStats.mockResolvedValue({
      success: true,
      data: {
        engine: 'fallback',
        state: 'ready',
        profileKey: 'default',
        dataRoot: '/home/.clawmaster/data/default',
        engineRoot: '/home/.clawmaster/data/default/fallback',
        documentCount: 12,
        moduleCounts: { docs: 12 },
        schemaVersion: 1,
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
      error: null,
    })
    mockRebuildLocalData.mockResolvedValue({
      success: true,
      data: {
        engine: 'fallback',
        state: 'ready',
        profileKey: 'default',
        dataRoot: '/home/.clawmaster/data/default',
        engineRoot: '/home/.clawmaster/data/default/fallback',
        documentCount: 12,
        moduleCounts: { docs: 12 },
        schemaVersion: 1,
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
      error: null,
    })
    mockResetLocalData.mockResolvedValue({
      success: true,
      data: {
        engine: 'fallback',
        state: 'ready',
        profileKey: 'default',
        dataRoot: '/home/.clawmaster/data/default',
        engineRoot: '/home/.clawmaster/data/default/fallback',
        documentCount: 0,
        moduleCounts: {},
        schemaVersion: 1,
        updatedAt: '2026-04-10T00:00:00.000Z',
      },
      error: null,
    })
    // Mock fetch to prevent real GitHub API calls in fetchReleaseNotes()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders current version and check button', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Update')).toBeInTheDocument()
    })
    expect(screen.getByText('Check for updates')).toBeInTheDocument()
    // Version appears in both system info and update section
    expect(screen.getAllByText(/v2026\.3\.28/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows ClawMaster release details and opens the selected installer', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderSettings()

    expect(await screen.findByText('ClawMaster Releases')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockCheckClawmasterRelease).toHaveBeenCalled()
    })
    expect(await screen.findByText('Install')).toBeInTheDocument()
    expect(screen.getByText('CLI + Web Console')).toBeInTheDocument()
    expect(screen.getByText(/npm install -g clawmaster/)).toBeInTheDocument()
    expect(screen.queryByText('## Install')).not.toBeInTheDocument()
    expect(screen.queryByText('bash')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Open Installer' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/clawmaster.msi',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('auto-checks updates when opened from the update banner hash', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        distTags: { latest: '2026.4.23', beta: '2026.4.24-beta.1', dev: '2026.4.25-dev.1' },
        versions: ['2026.4.23', '2026.4.22'],
      },
      error: null,
    })

    renderSettings(['/settings#settings-update'])

    expect(await screen.findByText('Version:')).toBeInTheDocument()
    expect(mockListVersions).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Update to 2026.4.23' })).toBeInTheDocument()
  })

  it('opens recent diagnostics logs from settings and keeps the full log stream', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open System Logs' }))

    expect(await screen.findByRole('dialog', { name: 'Diagnostics' })).toBeInTheDocument()
    expect(screen.getByText(/webchat disconnected code=1001/)).toBeInTheDocument()
    expect(screen.getByText(/\[gateway\] listening on ws:\/\/127\.0\.0\.1:18789/)).toBeInTheDocument()
  })

  it('opens gateway-scoped diagnostics from the settings hub', async () => {
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: 'Go to Gateway' })).toHaveAttribute(
      'href',
      '/gateway#gateway-runtime',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Gateway Diagnostics' }))

    expect(await screen.findByRole('dialog', { name: 'Recent Gateway Logs' })).toBeInTheDocument()
    expect(screen.getByText(/\[gateway\] listening on ws:\/\/127\.0\.0\.1:18789/)).toBeInTheDocument()
    expect(screen.queryByText(/webchat disconnected code=1001/)).not.toBeInTheDocument()
  })

  it('links channel diagnostics back to the stable channels page anchor', async () => {
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: 'Go to Channels' })).toHaveAttribute(
      'href',
      '/channels#channels-page',
    )
  })

  it('shows the local data storage foundation status', async () => {
    renderSettings()

    const heading = await screen.findByText('Local Data')
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const localData = within(section!)

    expect(localData.getByText('Ready')).toBeInTheDocument()
    expect(localData.getAllByText('Fallback store').length).toBeGreaterThan(0)
    expect(localData.getByText('ClawMaster will keep working through a file-backed fallback until this target supports seekdb.')).toBeInTheDocument()
    expect(localData.getByText('This foundation uses JavaScript/TypeScript runtime paths only; no Python package or Python-based skill is required.')).toBeInTheDocument()
    expect(localData.getByText('/home/.clawmaster/data/default/fallback')).toBeInTheDocument()
    expect(localData.getAllByText('12')).toHaveLength(2)
    expect(localData.queryByText('seekdb can run for this runtime target.')).not.toBeInTheDocument()
  })

  it('shows fallback summary and unsupported target guidance when embedded support is unavailable', async () => {
    vi.mocked(platform.detectSystem).mockResolvedValueOnce(makeSystemInfo({
      storage: {
        state: 'ready',
        engine: 'fallback',
        profileKey: 'default',
        dataRoot: 'C:\\Users\\alice\\.clawmaster\\data\\default',
        engineRoot: 'C:\\Users\\alice\\.clawmaster\\data\\default\\fallback',
        supportsEmbedded: false,
        targetPlatform: 'win32',
        targetArch: 'x64',
        reasonCode: null,
      },
      runtime: {
        hostPlatform: 'win32',
      },
    }))

    renderSettings()

    const heading = await screen.findByText('Local Data')
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const localData = within(section!)

    expect(localData.getByText('ClawMaster will keep working through a file-backed fallback until this target supports seekdb.')).toBeInTheDocument()
    expect(localData.getByText('seekdb bindings are not available on this target yet. Use WSL2, server mode later, or fallback storage.')).toBeInTheDocument()
    expect(localData.queryByText('seekdb can run for this runtime target.')).not.toBeInTheDocument()
  })

  it('clears stale local data stats when a refresh fails', async () => {
    mockGetLocalDataStats
      .mockResolvedValueOnce({
        success: true,
        data: {
          engine: 'fallback',
          state: 'ready',
          profileKey: 'default',
          dataRoot: '/home/.clawmaster/data/default',
          engineRoot: '/home/.clawmaster/data/default/fallback',
          documentCount: 12,
          moduleCounts: { docs: 12 },
          schemaVersion: 1,
          updatedAt: '2026-04-10T00:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'WSL2 runtime is unavailable',
      })

    renderSettings()

    const heading = await screen.findByText('Local Data')
    let section = heading.closest('section')
    expect(section).not.toBeNull()
    expect(within(section!).getAllByText('12')).toHaveLength(2)

    const profileSection = screen.getByText('OpenClaw profile').closest('section')
    expect(profileSection).not.toBeNull()
    const profile = within(profileSection!)
    fireEvent.click(profile.getByRole('button', { name: /Dev/ }))
    fireEvent.click(profile.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockGetLocalDataStats).toHaveBeenCalledTimes(2)
    })
    section = screen.getByText('Local Data').closest('section')
    expect(section).not.toBeNull()
    expect(within(section!).queryByText('12')).not.toBeInTheDocument()
  })

  it('ignores out-of-order local data stats responses after switching profile', async () => {
    const firstStats = deferred<any>()
    mockGetLocalDataStats
      .mockReturnValueOnce(firstStats.promise)
      .mockResolvedValueOnce({
        success: true,
        data: {
          engine: 'fallback',
          state: 'ready',
          profileKey: 'dev',
          dataRoot: '/home/.clawmaster/data/dev',
          engineRoot: '/home/.clawmaster/data/dev/fallback',
          documentCount: 3,
          moduleCounts: { docs: 3 },
          schemaVersion: 1,
          updatedAt: '2026-04-10T01:00:00.000Z',
        },
        error: null,
      })

    vi.mocked(platform.detectSystem)
      .mockResolvedValueOnce(makeSystemInfo())
      .mockResolvedValueOnce(makeSystemInfo({
        openclaw: {
          dataDir: '/home/.openclaw-dev',
          profileMode: 'dev',
          overrideActive: true,
        },
        storage: {
          profileKey: 'dev',
          dataRoot: '/home/.clawmaster/data/dev',
          engineRoot: '/home/.clawmaster/data/dev/fallback',
        },
      }))

    renderSettings()

    const heading = await screen.findByText('Local Data')
    let section = heading.closest('section')
    expect(section).not.toBeNull()

    const profileSection = screen.getByText('OpenClaw profile').closest('section')
    expect(profileSection).not.toBeNull()
    const profile = within(profileSection!)
    fireEvent.click(profile.getByRole('button', { name: /Dev/ }))
    fireEvent.click(profile.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockGetLocalDataStats).toHaveBeenCalledTimes(2)
    })
    section = screen.getByText('Local Data').closest('section')
    expect(section).not.toBeNull()
    expect(within(section!).getAllByText('3')).toHaveLength(2)

    await act(async () => {
      firstStats.resolve({
        success: true,
        data: {
          engine: 'fallback',
          state: 'ready',
          profileKey: 'default',
          dataRoot: '/home/.clawmaster/data/default',
          engineRoot: '/home/.clawmaster/data/default/fallback',
          documentCount: 12,
          moduleCounts: { docs: 12 },
          schemaVersion: 1,
          updatedAt: '2026-04-10T00:00:00.000Z',
        },
        error: null,
      })
    })

    section = screen.getByText('Local Data').closest('section')
    expect(section).not.toBeNull()
    expect(within(section!).getAllByText('3')).toHaveLength(2)
    expect(within(section!).queryByText('12')).not.toBeInTheDocument()
  })

  it('renders local data management as read-only in Tauri desktop mode', async () => {
    mockIsTauri.mockReturnValue(true)
    renderSettings()

    const heading = await screen.findByText('Local Data')
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const localData = within(section!)

    expect(localData.getByRole('button', { name: 'Rebuild Index' })).toBeDisabled()
    expect(localData.getByRole('button', { name: 'Reset Store' })).toBeDisabled()
    expect(localData.getByText('Desktop Local Data management is read-only until the Node storage worker is available.')).toBeInTheDocument()

    fireEvent.click(localData.getByRole('button', { name: 'Rebuild Index' }))
    expect(mockRebuildLocalData).not.toHaveBeenCalled()
  })

  it('rebuilds the local data fallback index from settings', async () => {
    renderSettings()

    const heading = await screen.findByText('Local Data')
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const localData = within(section!)

    fireEvent.click(localData.getByRole('button', { name: 'Rebuild Index' }))

    await waitFor(() => {
      expect(mockRebuildLocalData).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Local Data index rebuilt.')).toBeInTheDocument()
  })

  it('resets the local data fallback store after confirmation', async () => {
    renderSettings()

    const heading = await screen.findByText('Local Data')
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    const localData = within(section!)

    fireEvent.click(localData.getByRole('button', { name: 'Reset Store' }))
    expect(await screen.findByRole('dialog', { name: 'Reset Local Data fallback store? Indexed data will be rebuilt by modules as they load.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockResetLocalData).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText('Local Data store reset.')).toBeInTheDocument()
  })

  it('shows checking state when button clicked', async () => {
    mockListVersions.mockImplementation(() => new Promise(() => {})) // never resolves
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    expect(screen.getByText('Checking...')).toBeInTheDocument()
  })

  it('shows up-to-date when version matches latest', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.3.28', '2026.3.20', '2026.3.10'],
        distTags: { latest: '2026.3.28' },
      },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('Up to date')).toBeInTheDocument()
    })
  })

  it('shows update available when newer version exists', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.1', '2026.3.28', '2026.3.20'],
        distTags: { latest: '2026.4.1' },
      },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('Update to 2026.4.1')).toBeInTheDocument()
    })
  })

  it('renders runtime controls for Windows hosts and saves the selected WSL distro', async () => {
    const { platform } = await import('@/adapters')
    vi.mocked(platform.detectSystem).mockResolvedValueOnce({
      nodejs: { installed: true, version: '20.0.0' },
      npm: { installed: true, version: '10.0.0' },
      openclaw: {
        installed: false,
        version: '',
        configPath: '/home/dev/.openclaw/openclaw.json',
        dataDir: '/home/dev/.openclaw',
        profileMode: 'default',
        profileName: null,
        overrideActive: false,
        configPathCandidates: ['/home/dev/.openclaw/openclaw.json'],
        existingConfigPaths: [],
      },
      runtime: {
        mode: 'native',
        hostPlatform: 'windows',
        wslAvailable: true,
        selectedDistro: 'Ubuntu-24.04',
        selectedDistroExists: true,
        distros: [
          { name: 'Ubuntu-24.04', state: 'Running', version: 2, isDefault: true, hasOpenclaw: true, openclawVersion: '2026.4.1' },
        ],
      },
    })

    renderSettings()

    const runtimeHeading = await screen.findByText('Runtime')
    expect(runtimeHeading).toBeInTheDocument()
    const runtimeSection = runtimeHeading.closest('section')
    expect(runtimeSection).not.toBeNull()
    const runtime = within(runtimeSection!)

    fireEvent.click(runtime.getByRole('button', { name: /WSL2/ }))
    fireEvent.change(runtime.getByRole('combobox', { name: 'WSL distro' }), {
      target: { value: 'Ubuntu-24.04' },
    })
    fireEvent.click(runtime.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockSaveRuntime).toHaveBeenCalledWith({
        mode: 'wsl2',
        wslDistro: 'Ubuntu-24.04',
      })
    })
  })

  it('shows version dropdown with recent versions', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.1', '2026.3.28', '2026.3.20', '2026.3.10'],
        distTags: { latest: '2026.4.1' },
      },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('Version:')).toBeInTheDocument()
    })
    // Version dropdown should have options
    const selects = screen.getAllByRole('combobox')
    const versionSelect = selects.find((s) => s.querySelector('option[value="2026.4.1"]'))
    expect(versionSelect).toBeTruthy()
  })

  it('shows channel selector', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.1', '2026.3.28'],
        distTags: { latest: '2026.4.1', beta: '2026.5.0-beta.1' },
      },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('Channel:')).toBeInTheDocument()
    })
    expect(screen.getByText('Stable')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getAllByText('Dev').length).toBeGreaterThan(0)
  })

  it('handles version fetch error', async () => {
    mockListVersions.mockResolvedValue({
      success: false,
      error: 'network timeout',
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('network timeout')).toBeInTheDocument()
    })
  })

  it('calls reinstallOpenclawGlobal when update clicked', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.1', '2026.3.28'],
        distTags: { latest: '2026.4.1' },
      },
    })
    mockReinstall.mockResolvedValue({
      success: true,
      data: { ok: true, steps: [] },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => screen.getByText('Update to 2026.4.1'))
    fireEvent.click(screen.getByText('Update to 2026.4.1'))
    await waitFor(() => {
      expect(mockReinstall).toHaveBeenCalledWith('2026.4.1')
    })
  })

  it('shows downgrade label for older version', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.1', '2026.3.28', '2026.3.20'],
        distTags: { latest: '2026.4.1' },
      },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => screen.getByText('Version:'))

    // Select older version
    const selects = screen.getAllByRole('combobox')
    const versionSelect = selects.find((s) => s.querySelector('option[value="2026.3.20"]'))
    if (versionSelect) {
      fireEvent.change(versionSelect, { target: { value: '2026.3.20' } })
      await waitFor(() => {
        expect(screen.getByText('Downgrade to 2026.3.20')).toBeInTheDocument()
      })
    }
  })

  it('shows dist-tags info', async () => {
    mockListVersions.mockResolvedValue({
      success: true,
      data: {
        versions: ['2026.4.1'],
        distTags: { latest: '2026.4.1', beta: '2026.5.0-beta.1' },
      },
    })
    renderSettings()
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('latest')).toBeInTheDocument()
      expect(screen.getByText('2026.4.1')).toBeInTheDocument()
    })
  })

  it('saves a named OpenClaw profile from settings', async () => {
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('OpenClaw profile')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Named Target a named OpenClaw profile for a separate workspace or environment.',
      }),
    )
    fireEvent.change(screen.getByPlaceholderText('team-a'), { target: { value: 'workspace-a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        {
          kind: 'named',
          name: 'workspace-a',
        },
        {
          mode: 'empty',
          sourcePath: undefined,
        },
      )
    })
  })

  it('imports a named OpenClaw profile from a config path in settings', async () => {
    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('OpenClaw profile')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Named/ }))
    fireEvent.change(screen.getByPlaceholderText('team-a'), { target: { value: 'workspace-b' } })
    fireEvent.click(screen.getByRole('button', { name: /Import config path/ }))
    fireEvent.change(screen.getByPlaceholderText('~/existing/openclaw.json'), {
      target: { value: '/tmp/shared/openclaw.json' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        {
          kind: 'named',
          name: 'workspace-b',
        },
        {
          mode: 'import-config',
          sourcePath: '/tmp/shared/openclaw.json',
        },
      )
    })
  })
})
