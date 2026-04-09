import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

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
        'logs.settingsTitle': 'Diagnostics',
        'logs.settingsDescription': 'Open recent system logs here when you need to troubleshoot runtime issues.',
        'logs.openRecent': 'View Recent Logs',
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
const mockGetLogsResult = vi.fn()

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    saveClawmasterRuntime: (...args: any[]) => mockSaveRuntime(...args),
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

vi.mock('@/adapters', () => ({
  platform: {
    detectSystem: vi.fn().mockResolvedValue({
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
      },
      runtime: {
        mode: 'native',
        hostPlatform: 'darwin',
        wslAvailable: false,
        selectedDistro: null,
        selectedDistroExists: null,
        distros: [],
      },
    }),
  },
}))

vi.mock('@/i18n', () => ({
  changeLanguage: vi.fn(),
}))

// Import after mocks
import Settings from '../SettingsPage'

describe('UpdateSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBootstrap.mockResolvedValue({ success: true })
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
    // Mock fetch to prevent real GitHub API calls in fetchReleaseNotes()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders current version and check button', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Update')).toBeInTheDocument()
    })
    expect(screen.getByText('Check for updates')).toBeInTheDocument()
    // Version appears in both system info and update section
    expect(screen.getAllByText(/v2026\.3\.28/).length).toBeGreaterThanOrEqual(1)
  })

  it('opens recent diagnostics logs from settings and keeps the full log stream', async () => {
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Diagnostics')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'View Recent Logs' }))

    expect(await screen.findByRole('dialog', { name: 'Diagnostics' })).toBeInTheDocument()
    expect(screen.getByText(/webchat disconnected code=1001/)).toBeInTheDocument()
    expect(screen.getByText(/\[gateway\] listening on ws:\/\/127\.0\.0\.1:18789/)).toBeInTheDocument()
  })

  it('shows checking state when button clicked', async () => {
    mockListVersions.mockImplementation(() => new Promise(() => {})) // never resolves
    render(<Settings />)
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
    render(<Settings />)
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
    render(<Settings />)
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

    render(<Settings />)

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
    render(<Settings />)
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
    render(<Settings />)
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
    render(<Settings />)
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
    render(<Settings />)
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
    render(<Settings />)
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
    render(<Settings />)
    await waitFor(() => screen.getByText('Check for updates'))
    fireEvent.click(screen.getByText('Check for updates'))
    await waitFor(() => {
      expect(screen.getByText('latest')).toBeInTheDocument()
      expect(screen.getByText('2026.4.1')).toBeInTheDocument()
    })
  })

  it('saves a named OpenClaw profile from settings', async () => {
    render(<Settings />)

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
    render(<Settings />)

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
