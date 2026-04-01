import { Component, type ReactNode } from 'react'
import i18next from 'i18next'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * 页面级错误边界
 *
 * 包裹在每个模块页面外层，防止单页崩溃导致全应用白屏
 *
 * @example
 * <ErrorBoundary>
 *   <ObservePage />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-semibold mb-2">{i18next.t('error.pageError')}</h2>
          <p className="text-muted-foreground mb-4 max-w-md">
            {this.state.error?.message ?? i18next.t('error.unknownError')}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            {i18next.t('common.retry')}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
