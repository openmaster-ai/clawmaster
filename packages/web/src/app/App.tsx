import { useEffect, useState, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import { AppProviders } from './providers'
import { getClawModules } from './moduleRegistry'
import { isOnboardingEnvironmentReady } from './onboardingReadiness'
import { SetupWizard } from '@/modules/setup'
import { platformResults } from '@/shared/adapters/platformResults'
import { LoadingState } from '@/shared/components/LoadingState'

const APP_READY_STORAGE_KEY = 'clawmaster-app-ready'
type AppBootState = 'checking' | 'ready' | 'needs-setup'

function hasAnyDemoParam(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const demo = params.get('demo')
  return !!demo && demo !== 'install'
}

function getInitialBootState(): AppBootState {
  return hasAnyDemoParam() ? 'ready' : 'checking'
}

function App() {
  const [bootState, setBootState] = useState<AppBootState>(getInitialBootState)

  useEffect(() => {
    if (hasAnyDemoParam()) return

    let cancelled = false

    async function resolveBootState() {
      const [systemResult, configResult] = await Promise.all([
        platformResults.detectSystem(),
        platformResults.getConfig(),
      ])

      if (cancelled) return

      const nextState = isOnboardingEnvironmentReady(
        systemResult.success ? systemResult.data : null,
        configResult.success ? configResult.data : null,
      )
        ? 'ready'
        : 'needs-setup'

      setBootState(nextState)
    }

    resolveBootState().catch(() => {
      if (!cancelled) {
        setBootState('needs-setup')
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  function handleSetupComplete() {
    localStorage.setItem(APP_READY_STORAGE_KEY, '1')
    setBootState('ready')
  }

  if (bootState === 'checking') {
    return <LoadingState />
  }

  if (bootState === 'needs-setup') {
    return <SetupWizard onComplete={handleSetupComplete} />
  }

  const modules = getClawModules()

  return (
    <AppProviders>
      <Layout>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            {modules.map((m) => {
              const Page = m.route.LazyPage
              return m.route.path === '/' ? (
                <Route key={m.id} index element={<Page />} />
              ) : (
                <Route key={m.id} path={m.route.path.replace(/^\//, '')} element={<Page />} />
              )
            })}
          </Routes>
        </Suspense>
      </Layout>
    </AppProviders>
  )
}

export default App
