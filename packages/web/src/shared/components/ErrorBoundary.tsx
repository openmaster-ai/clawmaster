import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '@/i18n'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset)
      }
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">{i18n.t('errorBoundary.title')}</p>
          <p className="mt-2 text-muted-foreground break-all">{error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs"
          >
            {i18n.t('errorBoundary.retry')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
