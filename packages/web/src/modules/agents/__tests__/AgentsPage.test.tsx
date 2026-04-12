import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { changeLanguage } from '@/i18n'
import AgentsPage from '../AgentsPage'

const mockGetConfig = vi.fn()
const mockCreateAgent = vi.fn()
const mockDeleteAgent = vi.fn()

vi.mock('@/adapters', () => ({
  platform: {
    getConfig: (...args: any[]) => mockGetConfig(...args),
  },
}))

vi.mock('@/shared/adapters/platformResults', () => ({
  platformResults: {
    createAgent: (...args: any[]) => mockCreateAgent(...args),
    deleteAgent: (...args: any[]) => mockDeleteAgent(...args),
  },
}))

describe('AgentsPage', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    await changeLanguage('en')
    mockCreateAgent.mockResolvedValue({ success: true, data: undefined, error: null })
    mockDeleteAgent.mockResolvedValue({ success: true, data: undefined, error: null })
  })

  it('shows empty agent and route binding states when config has no agents', async () => {
    mockGetConfig.mockResolvedValue({
      agents: {
        defaults: {
          model: { primary: 'openai/gpt-4.1-mini' },
          workspace: '',
          maxConcurrent: 2,
        },
        list: [],
      },
      bindings: [],
    })

    render(<AgentsPage />)

    expect(await screen.findByRole('heading', { name: 'Agent Management' })).toBeInTheDocument()
    expect(screen.getByText('No agents configured')).toBeInTheDocument()
    expect(screen.getByText('No route bindings')).toBeInTheDocument()
  })

  it('creates an agent from the dialog using the default model', async () => {
    mockGetConfig
      .mockResolvedValueOnce({
        agents: {
          defaults: {
            model: { primary: 'openai/gpt-4.1-mini' },
            workspace: '/tmp/openclaw',
            maxConcurrent: 2,
          },
          list: [{ id: 'main', name: 'Main', model: 'openai/gpt-4.1-mini' }],
        },
        bindings: [],
      })
      .mockResolvedValueOnce({
        agents: {
          defaults: {
            model: { primary: 'openai/gpt-4.1-mini' },
            workspace: '/tmp/openclaw',
            maxConcurrent: 2,
          },
          list: [
            { id: 'main', name: 'Main', model: 'openai/gpt-4.1-mini' },
            { id: 'reviewer', name: 'reviewer', model: 'openai/gpt-4.1-mini' },
          ],
        },
        bindings: [],
      })

    render(<AgentsPage />)

    expect(await screen.findByRole('heading', { name: 'Agent Management' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Create Agent' }))
    expect(await screen.findByRole('dialog', { name: '+ Create Agent' })).toBeInTheDocument()

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'reviewer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith({
        id: 'reviewer',
        name: 'reviewer',
        model: 'openai/gpt-4.1-mini',
      })
    })

    expect(await screen.findByText('reviewer')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '+ Create Agent' })).not.toBeInTheDocument()
  })

  it('confirms and deletes a non-main agent', async () => {
    mockGetConfig
      .mockResolvedValueOnce({
        agents: {
          defaults: {
            model: { primary: 'openai/gpt-4.1-mini' },
            workspace: '/tmp/openclaw',
            maxConcurrent: 2,
          },
          list: [
            { id: 'main', name: 'Main', model: 'openai/gpt-4.1-mini' },
            { id: 'reviewer', name: 'Reviewer', model: 'anthropic/claude-sonnet-4-6' },
          ],
        },
        bindings: [{ match: { channel: 'slack' }, agentId: 'reviewer' }],
      })
      .mockResolvedValueOnce({
        agents: {
          defaults: {
            model: { primary: 'openai/gpt-4.1-mini' },
            workspace: '/tmp/openclaw',
            maxConcurrent: 2,
          },
          list: [{ id: 'main', name: 'Main', model: 'openai/gpt-4.1-mini' }],
        },
        bindings: [],
      })

    render(<AgentsPage />)

    expect(await screen.findByRole('heading', { name: 'Agent Management' })).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('slack')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('dialog', { name: 'Delete agent "reviewer"? This cannot be undone.' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockDeleteAgent).toHaveBeenCalledWith('reviewer')
    })

    await waitFor(() => {
      expect(screen.queryByText('Reviewer')).not.toBeInTheDocument()
    })
  })
})
