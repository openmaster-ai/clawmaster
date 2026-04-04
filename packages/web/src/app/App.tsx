import { useState, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import { AppProviders } from './providers'
import { getClawModules } from './moduleRegistry'
import { SetupWizard } from '@/modules/setup'
import { LoadingState } from '@/shared/components/LoadingState'

const APP_READY_STORAGE_KEY = 'clawmaster-app-ready'

function hasAnyDemoParam(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const demo = params.get('demo')
  return !!demo && demo !== 'install'
}

function getInitialAppReady(): boolean {
  if (hasAnyDemoParam()) return true
  if (typeof window === 'undefined') return false
  return localStorage.getItem(APP_READY_STORAGE_KEY) === '1'
}

function App() {
  const [appReady, setAppReady] = useState(getInitialAppReady)

  function handleSetupComplete() {
    localStorage.setItem(APP_READY_STORAGE_KEY, '1')
    setAppReady(true)
  }

  if (!appReady) {
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
