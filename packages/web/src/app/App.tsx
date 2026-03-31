import { useState, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import StartupDetector from './startup/StartupDetector'
import { AppProviders } from './providers'
import { getClawModules } from './moduleRegistry'
import LoadingState from '@/shared/components/LoadingState'
import type { SystemInfo } from '@/lib/types'

function App() {
  const [startupState, setStartupState] = useState<'detecting' | 'ready'>('detecting')
  const [, setSystemInfo] = useState<SystemInfo | null>(null)

  const handleDetected = (info: SystemInfo) => {
    setSystemInfo(info)
    setStartupState('ready')
  }

  const handleNewInstall = () => {
    setStartupState('ready')
  }

  const handleError = (error: string) => {
    console.error('Startup detection error:', error)
  }

  if (startupState === 'detecting') {
    return (
      <StartupDetector
        onDetected={handleDetected}
        onNewInstall={handleNewInstall}
        onError={handleError}
      />
    )
  }

  const modules = getClawModules()

  return (
    <AppProviders>
      <Routes>
        <Route path="/" element={<Layout />}>
          {modules.map((m) => {
            const Page = m.route.LazyPage
            const el = (
              <Suspense fallback={<LoadingState />}>
                <Page />
              </Suspense>
            )
            if (m.route.path === '/') {
              return <Route key={m.id} index element={el} />
            }
            const childPath = m.route.path.replace(/^\//, '')
            return <Route key={m.id} path={childPath} element={el} />
          })}
        </Route>
      </Routes>
    </AppProviders>
  )
}

export default App
