import { useCallback, useEffect, useState } from 'react'
import { platformResults } from '@/adapters'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import LoadingState from '@/shared/components/LoadingState'
import OpenClawUninstallWizard from '@/modules/settings/OpenClawUninstallWizard'

export default function Settings() {
  const fetcher = useCallback(async () => platformResults.detectSystem(), [])
  const { data: systemInfo, loading, error, refetch } = useAdapterCall(fetcher)
  const [uninstallWizardOpen, setUninstallWizardOpen] = useState(false)
  const [restorePath, setRestorePath] = useState('')
  const [snapshotFiles, setSnapshotFiles] = useState<string[]>([])
  const [restoreBusy, setRestoreBusy] = useState(false)

  const refreshBackups = useCallback(async () => {
    const r = await platformResults.listOpenclawBackups()
    if (r.success && r.data) setSnapshotFiles(r.data.files)
  }, [])

  useEffect(() => {
    if (!loading && systemInfo) void refreshBackups()
  }, [loading, systemInfo, refreshBackups])

  async function handleResetConfig() {
    if (
      !window.confirm(
        '将把 OpenClaw 主配置文件（openclaw.json）清空为默认空对象 {}，原有内容不可恢复。\n不会卸载 OpenClaw 程序，仅重置配置。确定吗？'
      )
    ) {
      return
    }
    if (!window.confirm('请再次确认：清空配置文件内容。')) return
    const r = await platformResults.resetOpenclawConfig()
    if (!r.success) {
      alert(`重置失败：${r.error ?? '未知错误'}`)
      return
    }
    alert(
      '已重置配置（openclaw.json 现为空白 {}）。\n\n多数版本下未填的项会用内置默认，网关仍可能正常启动；若启动失败或校验报错，请在终端执行 openclaw doctor 或 openclaw onboard 再配一遍。'
    )
    void refetch()
  }

  async function handleRestoreBackup() {
    const p = restorePath.trim()
    if (!p) {
      alert('请填写备份 .tar.gz 的完整路径')
      return
    }
    if (
      !window.confirm(
        '将把备份中的 openclaw_data 恢复到 ~/.openclaw；若目录已存在会先改名为 .bak.时间戳。确定？'
      )
    ) {
      return
    }
    setRestoreBusy(true)
    try {
      const r = await platformResults.restoreOpenclawBackup(p)
      if (!r.success) {
        alert(`恢复失败：${r.error ?? '未知错误'}`)
        return
      }
      alert('恢复完成。建议重启网关并检查 openclaw doctor。')
      await refreshBackups()
      void refetch()
    } finally {
      setRestoreBusy(false)
    }
  }

  if (loading) {
    return <LoadingState message="加载系统信息…" />
  }

  if (error || !systemInfo) {
    return (
      <div className="py-16 text-center text-sm text-red-500">加载失败：{error ?? '未知错误'}</div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">设置</h1>

      {/* Appearance */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">外观</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">主题:</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="theme" defaultChecked />
                <span className="text-sm">跟随系统</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="theme" />
                <span className="text-sm">浅色</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="theme" />
                <span className="text-sm">深色</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm text-muted-foreground">语言:</label>
            <select className="px-3 py-1.5 bg-muted rounded border border-border">
              <option>简体中文</option>
              <option>English</option>
            </select>
          </div>
        </div>
      </section>

      {/* System */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">系统</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">开机时启动</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">显示系统托盘图标</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked />
            <span className="text-sm">关闭时最小化到托盘</span>
          </label>
        </div>
      </section>

      {/* System info */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">系统信息</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">OpenClaw</span>
            <span className={systemInfo.openclaw.installed ? 'text-green-600' : 'text-red-500'}>
              {systemInfo.openclaw.installed ? `v${systemInfo.openclaw.version}` : '未安装'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Node.js</span>
            <span className={systemInfo.nodejs.installed ? 'text-green-600' : 'text-red-500'}>
              {systemInfo.nodejs.installed ? systemInfo.nodejs.version : '未安装'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">npm</span>
            <span className={systemInfo.npm.installed ? 'text-green-600' : 'text-red-500'}>
              {systemInfo.npm.installed ? systemInfo.npm.version : '未安装'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">配置路径</span>
            <span className="font-mono text-xs">{systemInfo.openclaw.configPath}</span>
          </div>
        </div>
      </section>

      {/* Updates */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">更新</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>龙虾管家</span>
            <span className="text-muted-foreground">v0.1.0 (开发中)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>OpenClaw CLI</span>
            <span className="text-muted-foreground">
              {systemInfo.openclaw.installed ? `v${systemInfo.openclaw.version}` : '未安装'}
            </span>
          </div>
          <button className="px-4 py-2 border border-border rounded hover:bg-accent">
            检查更新
          </button>
          <div className="flex items-center gap-4 mt-2">
            <label className="text-muted-foreground">更新通道:</label>
            <select className="px-3 py-1.5 bg-muted rounded border border-border">
              <option>Stable</option>
              <option>Beta</option>
              <option>Dev</option>
            </select>
          </div>
        </div>
      </section>

      {/* Restore from backup */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-3">从备份恢复</h3>
        <p className="text-xs text-muted-foreground mb-3">
          支持由本向导或 openclaw-uninstaller 生成的{' '}
          <code className="bg-muted px-1 rounded">openclaw_backup_*.tar.gz</code>（内含{' '}
          <code className="bg-muted px-1 rounded">openclaw_data</code> 与 snapshot.json）。
        </p>
        {snapshotFiles.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1">~/.openclaw_snapshots 中的备份：</p>
            <ul className="text-xs font-mono space-y-1 max-h-28 overflow-y-auto bg-muted/50 rounded p-2">
              {snapshotFiles.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    className="text-left hover:underline text-primary break-all"
                    onClick={() => setRestorePath(f)}
                  >
                    {f}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <label className="block text-xs text-muted-foreground mb-1">备份文件路径（.tar.gz）</label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-muted rounded border border-border font-mono text-xs mb-2"
          value={restorePath}
          onChange={(e) => setRestorePath(e.target.value)}
          placeholder="/path/to/openclaw_backup_xxx.tar.gz"
        />
        <button
          type="button"
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          disabled={restoreBusy}
          onClick={() => void handleRestoreBackup()}
        >
          {restoreBusy ? '恢复中…' : '恢复到 ~/.openclaw'}
        </button>
      </section>

      {/* Danger zone */}
      <section className="bg-card border border-red-500/50 rounded-lg p-4">
        <h3 className="font-medium text-red-500 mb-3">危险操作</h3>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            className="px-4 py-2 border border-border rounded hover:bg-accent"
            onClick={() => void handleResetConfig()}
          >
            重置配置
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            onClick={() => setUninstallWizardOpen(true)}
          >
            卸载 OpenClaw（引导）
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">⚠️ 这些操作不可逆，请谨慎操作</p>
      </section>

      <OpenClawUninstallWizard
        open={uninstallWizardOpen}
        onClose={() => setUninstallWizardOpen(false)}
        onFinished={() => {
          void refetch()
          void refreshBackups()
        }}
      />

      {/* About */}
      <section className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-medium mb-2">关于</h3>
        <p className="text-sm text-muted-foreground">龙虾管家 v0.1.0</p>
        <p className="text-sm text-muted-foreground">基于 Tauri + React 构建</p>
        <p className="text-sm text-muted-foreground">© 2026 OpenClaw Team</p>
        <div className="mt-3 flex gap-4">
          <a
            href="https://docs.openclaw.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            文档
          </a>
          <a
            href="https://github.com/openclaw/openclaw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub
          </a>
          <a
            href="https://clawhub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            ClawHub
          </a>
        </div>
      </section>
    </div>
  )
}
