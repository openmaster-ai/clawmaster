import type { ReactNode } from 'react'

interface WorkflowModelSuggestionProps {
  title: string
  body: string
  examples: string[]
  examplesLabel: string
  footnote: string
  action?: ReactNode
}

export function WorkflowModelSuggestion({
  title,
  body,
  examples,
  examplesLabel,
  footnote,
  action,
}: WorkflowModelSuggestionProps) {
  return (
    <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
          {examples.length > 0 && (
            <div className="space-y-2">
              <p className="control-label">{examplesLabel}</p>
              <div className="flex flex-wrap gap-2">
                {examples.map((example) => (
                  <span
                    key={example}
                    className="inline-flex items-center rounded-full border border-violet-400/25 bg-background/80 px-3 py-1 text-xs font-medium text-foreground/90"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{footnote}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  )
}
