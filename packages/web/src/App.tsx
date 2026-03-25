import { Suspense, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import { SetupWizard } from './modules/setup'
import { LoadingState } from './shared/components/LoadingState'
import Dashboard from './pages/Dashboard'
import Gateway from './pages/Gateway'
import Channels from './pages/Channels'
import Models from './pages/Models'
import Skills from './pages/Skills'
import Agents from './pages/Agents'
import Config from './pages/Config'
import Docs from './pages/Docs'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import observeModule from './modules/observe'
import memoryModule from './modules/memory'

const ObservePage = observeModule.route.component
const MemoryPage = memoryModule.route.component

function App() {
  const [appReady, setAppReady] = useState(false)

  if (!appReady) {
    return <SetupWizard onComplete={() => setAppReady(true)} />
  }

  return (
    <Layout>
      <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/observe" element={<ObservePage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/gateway" element={<Gateway />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/models" element={<Models />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/config" element={<Config />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
