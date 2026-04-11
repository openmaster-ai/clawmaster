import { useEffect, useState, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from './Layout'
import { AppProviders } from './providers'
import { getClawModules } from './moduleRegistry'
import { isOnboardingEnvironmentReady } from './onboardingReadiness'
import { SetupWizard } from '@/modules/setup'
import { platformResults } from '@/shared/adapters/platformResults'
import { LoadingState } from '@/shared/components/LoadingState'
import {
  SERVICE_AUTH_REQUIRED_EVENT,
  clearStoredServiceToken,
  consumeServiceTokenFromUrl,
  isServiceAuthError,
  setStoredServiceToken,
} from '@/shared/adapters/webHttp'

const APP_READY_STORAGE_KEY = 'clawmaster-app-ready'
type AppBootState = 'checking' | 'auth-required' | 'ready' | 'needs-setup'

function hasAnyDemoParam(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const demo = params.get('demo')
  return !!demo && demo !== 'install'
}

function getInitialBootState(): AppBootState {
  return hasAnyDemoParam() ? 'ready' : 'checking'
}

function ServiceAuthGate({
  errorKey,
  onClear,
  onSubmit,
}: {
  errorKey: 'invalid' | null
  onClear: () => void
  onSubmit: (token: string) => void
}) {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <div className="fullscreen-shell">
      <div className="fullscreen-panel w-full max-w-lg space-y-5">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">{t('serviceAuth.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('serviceAuth.description')}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="service-token" className="text-sm font-medium">
            {t('serviceAuth.tokenLabel')}
          </label>
          <input
            id="service-token"
            type="password"
            autoFocus
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t('serviceAuth.tokenPlaceholder')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2"
          />
          <p className="text-xs text-muted-foreground">{t('serviceAuth.hint')}</p>
        </div>
        {errorKey || localError ? (
          <p className="text-sm text-red-500">{localError || t(`serviceAuth.${errorKey}`)}</p>
        ) : null}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-2 text-sm"
            onClick={() => {
              clearStoredServiceToken()
              setToken('')
              setLocalError(null)
              onClear()
            }}
          >
            {t('serviceAuth.clear')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm text-white"
            onClick={() => {
              if (!token.trim()) {
                setLocalError(t('serviceAuth.required'))
                return
              }
              setLocalError(null)
              onSubmit(token)
            }}
          >
            {t('serviceAuth.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [bootState, setBootState] = useState<AppBootState>(getInitialBootState)
  const [authErrorKey, setAuthErrorKey] = useState<'invalid' | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)

  useEffect(() => {
    consumeServiceTokenFromUrl()
  }, [])

  useEffect(() => {
    if (hasAnyDemoParam()) return

    const handleAuthRequired = () => {
      setBootState('auth-required')
    }

    window.addEventListener(SERVICE_AUTH_REQUIRED_EVENT, handleAuthRequired)
    return () => {
      window.removeEventListener(SERVICE_AUTH_REQUIRED_EVENT, handleAuthRequired)
    }
  }, [])

  useEffect(() => {
    if (hasAnyDemoParam()) return

    let cancelled = false

    async function resolveBootState() {
      const [systemResult, configResult] = await Promise.all([
        platformResults.detectSystem(),
        platformResults.getConfig(),
      ])

      if (cancelled) return

      if (isServiceAuthError(systemResult.error) || isServiceAuthError(configResult.error)) {
        setAuthErrorKey(bootAttempt > 0 ? 'invalid' : null)
        setBootState('auth-required')
        return
      }

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
  }, [bootAttempt])

  function handleSetupComplete() {
    localStorage.setItem(APP_READY_STORAGE_KEY, '1')
    setBootState('ready')
  }

  function handleAuthSubmit(token: string) {
    setStoredServiceToken(token)
    setAuthErrorKey(null)
    setBootState('checking')
    setBootAttempt((value) => value + 1)
  }

  if (bootState === 'checking') {
    return <LoadingState />
  }

  if (bootState === 'auth-required') {
    return (
      <AppProviders>
        <ServiceAuthGate
          errorKey={authErrorKey}
          onClear={() => setAuthErrorKey(null)}
          onSubmit={handleAuthSubmit}
        />
      </AppProviders>
    )
  }

  if (bootState === 'needs-setup') {
    return (
      <AppProviders>
        <SetupWizard onComplete={handleSetupComplete} />
      </AppProviders>
    )
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
