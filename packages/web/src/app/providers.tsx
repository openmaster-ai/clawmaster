import type { ReactNode } from 'react'
import ErrorBoundary from '@/shared/components/ErrorBoundary'

export function AppProviders({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>
}
