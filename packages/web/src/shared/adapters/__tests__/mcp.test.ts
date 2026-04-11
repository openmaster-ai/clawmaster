import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addMcpServer,
  checkMcpPackage,
  getMcpServers,
  importMcpServers,
  listMcpImportCandidates,
  removeMcpServer,
  toggleMcpServer,
} from '../mcp'

vi.mock('../invoke', () => ({
  tauriInvoke: vi.fn(),
}))

vi.mock('../platform', () => ({
  execCommand: vi.fn(),
  getIsTauri: vi.fn(() => false),
}))

vi.mock('../system', () => ({
  detectSystemResult: vi.fn().mockResolvedValue({
    success: true,
    data: {
      nodejs: { installed: true, version: '20.0.0' },
      npm: { installed: true, version: '10.0.0' },
      openclaw: {
        installed: true,
        version: '2026.4.2',
        configPath: '~/.openclaw/openclaw.json',
        dataDir: '~/.openclaw',
      },
    },
    error: null,
  }),
}))

vi.mock('../openclaw', () => ({
  getConfigResult: vi.fn(),
  saveFullConfigResult: vi.fn(),
  setConfigResult: vi.fn().mockResolvedValue({
    success: true,
    data: undefined,
    error: null,
  }),
}))

vi.mock('../webHttp', () => ({
  webFetchJson: vi.fn(),
  webFetchVoid: vi.fn(),
}))

describe('mcp adapter', () => {
  async function execMock() {
    const { execCommand } = await import('../platform')
    return vi.mocked(execCommand)
  }

  async function tauriInvokeMock() {
    const { tauriInvoke } = await import('../invoke')
    return vi.mocked(tauriInvoke)
  }

  async function openclawMocks() {
    const { getConfigResult, saveFullConfigResult, setConfigResult } = await import('../openclaw')
    return {
      getConfigResult: vi.mocked(getConfigResult),
      saveFullConfigResult: vi.mocked(saveFullConfigResult),
      setConfigResult: vi.mocked(setConfigResult),
    }
  }

  async function webFetchJsonMock() {
    const { webFetchJson } = await import('../webHttp')
    return vi.mocked(webFetchJson)
  }

  async function webFetchVoidMock() {
    const { webFetchVoid } = await import('../webHttp')
    return vi.mocked(webFetchVoid)
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    ;(await execMock()).mockReset()
    ;(await tauriInvokeMock()).mockReset()
    ;(await webFetchJsonMock()).mockReset()
    ;(await webFetchVoidMock()).mockReset()
    const openclaw = await openclawMocks()
    openclaw.getConfigResult.mockReset()
    openclaw.saveFullConfigResult.mockReset()
    openclaw.setConfigResult.mockReset()
    openclaw.setConfigResult.mockResolvedValue({
      success: true,
      data: undefined,
      error: null,
    })
  })

  it('loads merged MCP servers through the dedicated backend route', async () => {
    const mock = await webFetchJsonMock()
    mock.mockResolvedValueOnce({
      success: true,
      data: {
        github: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test' },
          enabled: false,
        },
        context7: {
          transport: 'http',
          url: 'https://mcp.context7.com/mcp',
          headers: { Authorization: 'Bearer sk-test' },
          env: {},
          enabled: true,
        },
      },
      error: null,
    })

    const result = await getMcpServers()

    expect(result.success).toBe(true)
    expect(result.data?.context7.transport).toBe('http')
    expect(result.data?.github.transport).toBe('stdio')
    if (result.data?.github.transport !== 'stdio') {
      throw new Error('expected stdio transport')
    }
    expect(result.data.github.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_test')
    expect(result.data.github.enabled).toBe(false)
    expect(mock).toHaveBeenCalledWith('/api/mcp/servers')
  })

  it('lists import candidates via the backend route', async () => {
    const mock = await webFetchJsonMock()
    mock.mockResolvedValueOnce({
      success: true,
      data: [
        { id: 'project-mcp', format: 'json', path: '/repo/.mcp.json', exists: true },
        { id: 'codex-user', format: 'toml', path: '/Users/test/.codex/config.toml', exists: false },
      ],
      error: null,
    })

    const result = await listMcpImportCandidates()

    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      { id: 'project-mcp', format: 'json', path: '/repo/.mcp.json', exists: true },
      { id: 'codex-user', format: 'toml', path: '/Users/test/.codex/config.toml', exists: false },
    ])
    expect(mock).toHaveBeenCalledWith('/api/mcp/import-candidates')
  })

  it('imports servers and renames collisions before persisting through the backend route', async () => {
    const mock = await webFetchJsonMock()
    const writeMock = await webFetchVoidMock()
    mock
      .mockResolvedValueOnce({
        success: true,
        data: {
          path: '/repo/.mcp.json',
          content: JSON.stringify({
            mcpServers: {
              context7: { transport: 'http', url: 'https://remote/context7' },
            },
          }),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          context7: {
            transport: 'http',
            url: 'https://existing/context7',
            enabled: true,
            env: {},
            headers: {},
          },
        },
        error: null,
      })
    writeMock.mockResolvedValueOnce({ success: true, data: undefined, error: null })

    const result = await importMcpServers('/repo/.mcp.json')

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      path: '/repo/.mcp.json',
      importedIds: ['context7-2'],
    })
    expect(writeMock).toHaveBeenCalledWith('/api/mcp/servers', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('context7-2'),
    }))
  })

  it('adds stdio servers and optionally installs the package', async () => {
    const exec = await execMock()
    const jsonMock = await webFetchJsonMock()
    const writeMock = await webFetchVoidMock()
    exec.mockResolvedValueOnce('added 1 package')
    jsonMock.mockResolvedValueOnce({ success: true, data: {}, error: null })
    writeMock.mockResolvedValueOnce({ success: true, data: undefined, error: null })

    const result = await addMcpServer(
      'github',
      {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {},
        enabled: true,
      },
      '@modelcontextprotocol/server-github',
    )

    expect(result.success).toBe(true)
    expect(result.data).toBe('installed')
    expect(exec).toHaveBeenCalledWith('npm', ['install', '-g', '@modelcontextprotocol/server-github'])
    expect(writeMock).toHaveBeenCalledWith('/api/mcp/servers', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('"github"'),
    }))
  })

  it('removes servers and best-effort uninstalls managed packages', async () => {
    const exec = await execMock()
    const jsonMock = await webFetchJsonMock()
    const writeMock = await webFetchVoidMock()
    jsonMock.mockResolvedValueOnce({
      success: true,
      data: {
        github: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {},
          enabled: true,
        },
      },
      error: null,
    })
    writeMock.mockResolvedValueOnce({ success: true, data: undefined, error: null })
    exec.mockResolvedValueOnce('removed')

    const result = await removeMcpServer('github', '@modelcontextprotocol/server-github')

    expect(result.success).toBe(true)
    expect(result.data).toBe('removed')
    expect(exec).toHaveBeenCalledWith('npm', ['uninstall', '-g', '@modelcontextprotocol/server-github'])
  })

  it('toggles enabled state and handles missing ids', async () => {
    const jsonMock = await webFetchJsonMock()
    const writeMock = await webFetchVoidMock()
    jsonMock.mockResolvedValueOnce({
      success: true,
      data: {
        github: {
          command: 'npx',
          args: [],
          env: {},
          enabled: true,
        },
      },
      error: null,
    })
    writeMock.mockResolvedValueOnce({ success: true, data: undefined, error: null })

    const enabledResult = await toggleMcpServer('github', false)
    expect(enabledResult.success).toBe(true)
    expect(enabledResult.data).toBe('disabled')
    expect(writeMock).toHaveBeenCalledWith('/api/mcp/servers', expect.objectContaining({
      method: 'PUT',
    }))

    jsonMock.mockReset()
    jsonMock.mockResolvedValueOnce({ success: true, data: {}, error: null })

    const missingResult = await toggleMcpServer('missing', true)
    expect(missingResult.success).toBe(true)
    expect(missingResult.data).toBe('not found')
  })

  it('checks whether a package is globally installed', async () => {
    const exec = await execMock()
    exec.mockResolvedValueOnce('{}')

    const installed = await checkMcpPackage('@modelcontextprotocol/server-github')
    expect(installed.success).toBe(true)
    expect(installed.data).toBe(true)

    exec.mockReset()
    exec.mockRejectedValueOnce(new Error('not found'))

    const missing = await checkMcpPackage('missing-package')
    expect(missing.success).toBe(true)
    expect(missing.data).toBe(false)
  })

  it('uses tauri commands instead of node when loading MCP state on desktop', async () => {
    const { getIsTauri } = await import('../platform')
    const invoke = await tauriInvokeMock()
    const openclaw = await openclawMocks()
    getIsTauri.mockReturnValue(true)
    invoke.mockResolvedValueOnce({
      exists: true,
      content: JSON.stringify({
        mcpServers: {
          context7: {
            transport: 'http',
            url: 'https://mcp.context7.com/mcp',
            enabled: false,
            headers: {},
            env: {},
          },
        },
      }),
    })
    openclaw.getConfigResult.mockResolvedValueOnce({
      success: true,
      data: {
        mcp: {
          servers: {
            context7: {
              transport: 'streamable-http',
              url: 'https://mcp.context7.com/mcp',
            },
          },
        },
      },
      error: null,
    })

    const result = await getMcpServers()

    expect(result.success).toBe(true)
    expect(invoke).toHaveBeenCalledWith('read_runtime_text_file', {
      pathInput: '~/.openclaw/mcp.json',
    })
    expect((await execMock())).not.toHaveBeenCalledWith('node', expect.anything())
  })

  it('uses tauri commands instead of node when listing import candidates on desktop', async () => {
    const { getIsTauri } = await import('../platform')
    const invoke = await tauriInvokeMock()
    getIsTauri.mockReturnValue(true)
    invoke.mockResolvedValueOnce([
      { id: 'project-mcp', format: 'json', path: '/repo/.mcp.json', exists: true },
    ])

    const result = await listMcpImportCandidates()

    expect(result.success).toBe(true)
    expect(invoke).toHaveBeenCalledWith('list_mcp_import_candidates')
    expect((await execMock())).not.toHaveBeenCalledWith('node', expect.anything())
  })

  it('uses tauri commands instead of node when importing and saving MCP state on desktop', async () => {
    const { getIsTauri } = await import('../platform')
    const invoke = await tauriInvokeMock()
    const openclaw = await openclawMocks()
    getIsTauri.mockReturnValue(true)

    invoke
      .mockResolvedValueOnce({
        path: '/repo/.mcp.json',
        content: JSON.stringify({
          mcpServers: {
            context7: {
              transport: 'http',
              url: 'https://mcp.context7.com/mcp',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        exists: true,
        content: JSON.stringify({ mcpServers: {} }),
      })
    openclaw.getConfigResult.mockResolvedValueOnce({
      success: true,
      data: {},
      error: null,
    })
    openclaw.saveFullConfigResult.mockResolvedValueOnce({
      success: true,
      data: undefined,
      error: null,
    })

    const result = await importMcpServers('/repo/.mcp.json')

    expect(result.success).toBe(true)
    expect(invoke).toHaveBeenNthCalledWith(1, 'read_required_runtime_text_file', {
      pathInput: '/repo/.mcp.json',
    })
    expect(invoke).toHaveBeenCalledWith('read_runtime_text_file', {
      pathInput: '~/.openclaw/mcp.json',
    })
    expect(invoke).toHaveBeenCalledWith('write_runtime_text_file', {
      pathInput: '~/.openclaw/mcp.json',
      content: expect.stringContaining('"context7"'),
    })
    expect(openclaw.saveFullConfigResult).toHaveBeenCalled()
    expect((await execMock())).not.toHaveBeenCalledWith('node', expect.anything())
  })
})
