import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveIcon } from './iconRegistry'
import type { CommandDescriptor } from './commandRegistry'

export interface CommandEntry {
  id: string
  kind: CommandDescriptor['kind']
  icon: string
  title: string
  description: string
  keywords: string[]
  badge: string
  shortcutHint?: string
  execute: () => void
}

interface CommandPaletteProps {
  open: boolean
  commands: CommandEntry[]
  onClose: () => void
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function scoreCommand(query: string, command: CommandEntry, index: number): number {
  if (!query) return 1_000 - index

  const title = normalize(command.title)
  const description = normalize(command.description)
  const keywords = command.keywords.map(normalize)

  let score = 0
  if (title === query) score += 120
  if (title.startsWith(query)) score += 80
  if (title.includes(query)) score += 48
  if (description.includes(query)) score += 20
  if (keywords.some((keyword) => keyword.startsWith(query))) score += 28
  if (keywords.some((keyword) => keyword.includes(query))) score += 12

  return score
}

function getDefaultCommands(commands: CommandEntry[]): CommandEntry[] {
  const actions = commands.filter((command) => command.kind === 'action')
  const sections = commands.filter((command) => command.kind === 'section')
  const pages = commands.filter((command) => command.kind === 'page')
  const preferred = [...actions.slice(0, 1), ...sections.slice(0, 6), ...pages.slice(0, 5)]
  const seen = new Set(preferred.map((command) => command.id))
  const remainder = commands.filter((command) => !seen.has(command.id))

  return [...preferred, ...remainder].slice(0, 12)
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return
    }

    const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  const filteredCommands = useMemo(() => {
    const normalizedQuery = normalize(query)
    if (!normalizedQuery) {
      return getDefaultCommands(commands)
    }

    return commands
      .map((command, index) => ({
        command,
        score: scoreCommand(normalizedQuery, command, index),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.command.title.localeCompare(right.command.title))
      .map((entry) => entry.command)
      .slice(0, 12)
  }, [commands, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    setActiveIndex((current) => {
      if (filteredCommands.length === 0) return 0
      return Math.min(current, filteredCommands.length - 1)
    })
  }, [filteredCommands])

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => (filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => {
          if (filteredCommands.length === 0) return 0
          return current === 0 ? filteredCommands.length - 1 : current - 1
        })
        return
      }

      if (event.key === 'Enter') {
        const activeCommand = filteredCommands[activeIndex]
        if (!activeCommand) return
        event.preventDefault()
        activeCommand.execute()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, filteredCommands, onClose, open])

  if (!open) return null

  return (
    <div className="command-palette-shell">
      <div className="command-palette-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('command.dialogLabel')}
        className="command-palette-panel"
      >
        <div className="command-palette-search">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="command-palette-input"
            placeholder={t('command.searchPlaceholder')}
          />
          <span className="command-palette-shortcut">ESC</span>
        </div>

        <div className="command-palette-meta">
          <span>{t('command.resultsCount', { count: filteredCommands.length })}</span>
          <span className="command-palette-meta-hint">
            <CornerDownLeft className="h-3.5 w-3.5" />
            {t('command.enterHint')}
          </span>
        </div>

        <div className="command-palette-list" role="listbox" aria-label={t('command.listLabel')}>
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              <p className="command-palette-empty-title">{t('command.emptyTitle')}</p>
              <p className="command-palette-empty-copy">{t('command.emptyDesc')}</p>
            </div>
          ) : (
            filteredCommands.map((command, index) => {
              const Icon = resolveIcon(command.icon)
              const active = index === activeIndex
              return (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn('command-palette-item', active && 'command-palette-item-active')}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    command.execute()
                    onClose()
                  }}
                >
                  <div className="command-palette-item-icon">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="command-palette-item-copy">
                    <div className="command-palette-item-row">
                      <p className="command-palette-item-title">{command.title}</p>
                      <span className="command-palette-item-badge">{command.badge}</span>
                    </div>
                    <p className="command-palette-item-desc">{command.description}</p>
                  </div>
                  <div className="command-palette-item-trail">
                    {command.shortcutHint ? (
                      <span className="command-palette-item-shortcut">{command.shortcutHint}</span>
                    ) : null}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
