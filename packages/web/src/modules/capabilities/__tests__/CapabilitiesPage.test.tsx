import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { changeLanguage } from '@/i18n'
import CapabilitiesPage from '../CapabilitiesPage'

const mockListPlugins = vi.fn()
const mockGetSkills = vi.fn()
const mockGetMcpServers = vi.fn()

vi.mock('@/adapters', () => ({
  platformResults: {
    listPlugins: (...args: any[]) => mockListPlugins(...args),
    getSkills: (...args: any[]) => mockGetSkills(...args),
  },
}))

vi.mock('@/shared/adapters/mcp', () => ({
  getMcpServers: (...args: any[]) => mockGetMcpServers(...args),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <CapabilitiesPage />
    </MemoryRouter>,
  )
}

describe('CapabilitiesPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await changeLanguage('en')

    mockListPlugins.mockResolvedValue({
      success: true,
      data: {
        plugins: [
          { id: 'tavily', name: 'Tavily', status: 'loaded' },
          { id: 'browser', name: 'Browser Tool', status: 'enabled' },
          { id: 'discord', name: 'Discord', status: 'disabled' },
        ],
      },
    })

    mockGetSkills.mockResolvedValue({
      success: true,
      data: [
        {
          slug: 'find-skills-skill',
          skillKey: 'find-skills',
          name: 'Find Skills',
          description: '',
          version: '1.0.0',
          disabled: false,
          eligible: true,
        },
        {
          slug: 'clawvet',
          skillKey: 'clawvet',
          name: 'ClawVet',
          description: '',
          version: '1.0.0',
          disabled: true,
          eligible: true,
        },
      ],
    })

    mockGetMcpServers.mockResolvedValue({
      success: true,
      data: {
        context7: {
          enabled: true,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          env: {},
        },
        deepwiki: {
          enabled: false,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'deepwiki-mcp'],
          env: {},
        },
      },
    })
  })

  it('renders scenario-first capability summaries and links into the detail pages', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Assistant Capabilities' })).toBeInTheDocument()
    const connectCard = screen.getByRole('heading', { level: 3, name: 'Connect external data' }).closest('section')
    const automationCard = screen.getByRole('heading', { level: 3, name: 'Add automation actions' }).closest('section')
    const enhanceCard = screen.getByRole('heading', { level: 3, name: 'Enhance model capability' }).closest('section')
    const verifyCard = screen.getByRole('heading', { level: 3, name: 'Verify active capabilities' }).closest('section')

    expect(connectCard).not.toBeNull()
    expect(automationCard).not.toBeNull()
    expect(enhanceCard).not.toBeNull()
    expect(verifyCard).not.toBeNull()

    expect(screen.getAllByText('1 active · 2 configured').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2 live · 3 installed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1 enabled · 1 ready').length).toBeGreaterThan(0)
    expect(screen.getByText('4 active entries across 3 configured systems')).toBeInTheDocument()

    expect(within(connectCard!).getByRole('link', { name: 'Open MCP setup' })).toHaveAttribute('href', '/mcp#mcp-import')
    expect(within(automationCard!).getByRole('link', { name: 'Review plugin groups' })).toHaveAttribute('href', '/plugins#plugins-groups')
    expect(within(enhanceCard!).getByRole('link', { name: 'Browse featured skills' })).toHaveAttribute('href', '/skills#skills-featured')
    expect(within(verifyCard!).getByRole('link', { name: 'Open active inventory' })).toHaveAttribute('href', '/capabilities#capability-runtime')

    expect(within(connectCard!).getByRole('link', { name: 'Open MCP detail' })).toHaveAttribute('href', '/mcp')
    expect(within(automationCard!).getByRole('link', { name: 'Open plugin detail' })).toHaveAttribute('href', '/plugins')
    expect(within(enhanceCard!).getByRole('link', { name: 'Open skill detail' })).toHaveAttribute('href', '/skills')
  })

  it('marks failed capability sources as unknown instead of treating them as empty', async () => {
    mockGetMcpServers.mockRejectedValueOnce(new Error('mcp unavailable'))

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Assistant Capabilities' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('1 capability sources failed to load')
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)

    const connectCard = screen.getByRole('heading', { level: 3, name: 'Connect external data' }).closest('section')
    const verifyCard = screen.getByRole('heading', { level: 3, name: 'Verify active capabilities' }).closest('section')

    expect(connectCard).not.toBeNull()
    expect(verifyCard).not.toBeNull()
    expect(within(connectCard!).getByText('To confirm')).toBeInTheDocument()
    expect(within(connectCard!).getByText('— active · — configured')).toBeInTheDocument()
    expect(within(verifyCard!).getByText('To confirm')).toBeInTheDocument()
    expect(within(verifyCard!).getByText('— active entries across — configured systems')).toBeInTheDocument()
    expect(screen.getByText('—', { selector: '.metric-value' })).toBeInTheDocument()
    expect(screen.getAllByText('— active · — configured').length).toBeGreaterThan(0)
  })

  it('counts the verify card in the attention metric when no capability is active', async () => {
    mockListPlugins.mockResolvedValueOnce({
      success: true,
      data: {
        plugins: [{ id: 'discord', name: 'Discord', status: 'disabled' }],
      },
    })
    mockGetSkills.mockResolvedValueOnce({
      success: true,
      data: [
        {
          slug: 'clawvet',
          skillKey: 'clawvet',
          name: 'ClawVet',
          description: '',
          version: '1.0.0',
          disabled: true,
          eligible: true,
        },
      ],
    })
    mockGetMcpServers.mockResolvedValueOnce({
      success: true,
      data: {
        deepwiki: {
          enabled: false,
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'deepwiki-mcp'],
          env: {},
        },
      },
    })

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Assistant Capabilities' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('0 active entries across 3 configured systems')).toBeInTheDocument()
      expect(screen.getByText('4 areas need review')).toBeInTheDocument()
    })
  })

  it('keeps last successful summaries visible after a refresh error', async () => {
    mockGetMcpServers
      .mockResolvedValueOnce({
        success: true,
        data: {
          context7: {
            enabled: true,
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
            env: {},
          },
        },
      })
      .mockRejectedValueOnce(new Error('mcp refresh failed'))

    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Assistant Capabilities' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('1 active · 1 configured').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('1 capability sources failed to load')
    })

    expect(screen.getAllByText('1 active · 1 configured').length).toBeGreaterThan(0)
    const connectCard = screen.getByRole('heading', { level: 3, name: 'Connect external data' }).closest('section')
    expect(connectCard).not.toBeNull()
    expect(within(connectCard!).queryByText('To confirm')).not.toBeInTheDocument()
  })
})
