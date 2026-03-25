import { useLocation, Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { registeredModules } from '@/modules/registry'

interface LayoutProps {
  children: React.ReactNode
}

// 固定导航项（概览 + 旧页面，第二周迁移到模块后移除 legacyNavItems）
const homeNav = { path: '/', label: '概览', icon: '📊' }

// 自动注册的模块导航（从 modules/registry 动态获取）
const moduleNavItems = registeredModules.map((m) => ({
  path: m.route.path,
  label: m.name,
  icon: m.icon,
}))

// 旧页面导航（第二周迁移后删除）
const legacyNavItems = [
  { path: '/gateway', label: '网关', icon: '🔌' },
  { path: '/channels', label: '通道', icon: '📡' },
  { path: '/models', label: '模型', icon: '🤖' },
  { path: '/skills', label: '技能', icon: '⚡' },
  { path: '/agents', label: '代理', icon: '🎭' },
  { path: '/config', label: '配置', icon: '⚙️' },
  { path: '/docs', label: '文档', icon: '📚' },
  { path: '/logs', label: '日志', icon: '📝' },
  { path: '/settings', label: '设置', icon: '🔧' },
]

const navItems = [homeNav, ...moduleNavItems, ...legacyNavItems]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const currentPath = location.pathname

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white text-lg">
              🦞
            </div>
            <div>
              <h1 className="font-semibold text-sm">龙虾管理大师</h1>
              <p className="text-xs text-muted-foreground">ClawMaster</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Instance Selector */}
        <div className="p-3 border-t border-border">
          <label className="text-xs text-muted-foreground mb-1 block">实例</label>
          <select className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border">
            <option>默认实例</option>
          </select>
        </div>
        
        {/* 主题切换 */}
        <div className="p-3 border-t border-border">
          <label className="text-xs text-muted-foreground mb-1 block">主题</label>
          <select 
            className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border"
            onChange={(e) => {
              const html = document.documentElement
              html.classList.remove('dark', 'theme-ocean')
              if (e.target.value === 'ocean') {
                html.classList.add('theme-ocean')
              } else if (e.target.value === 'dark') {
                html.classList.add('dark')
              }
            }}
          >
            <option value="default">龙虾橙</option>
            <option value="ocean">海洋蓝</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-12 border-b border-border flex items-center px-4">
          <h2 className="font-medium">
            {navItems.find(item => item.path === currentPath)?.label || '龙虾管家'}
          </h2>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>

        {/* Status Bar */}
        <footer className="h-8 border-t border-border flex items-center px-4 text-xs text-muted-foreground gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Gateway 运行中
          </span>
          <span>|</span>
          <span>模型: GLM-5</span>
          <span>|</span>
          <span>v2026.3.8</span>
        </footer>
      </div>
    </div>
  )
}
