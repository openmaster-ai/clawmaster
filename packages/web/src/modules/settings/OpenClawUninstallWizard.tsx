import { useCallback, useEffect, useState } from 'react'
import { platformResults } from '@/adapters'
import type { BackupDefaults, CreateBackupResponse } from '@/shared/adapters/dangerSettings'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

type BackupChoice = 'desktop' | 'snapshots' | 'custom' | 'skip' | null

type Step =
  | 'intro'
  | 'backup'
  | 'skip-confirm'
  | 'npm'
  | 'remove-data'
  | 'done'

export default function OpenClawUninstallWizard(props: {
  open: boolean
  onClose: () => void
  onFinished: () => void
}) {
  const { open, onClose, onFinished } = props
  const [step, setStep] = useState<Step>('intro')
  const [defaults, setDefaults] = useState<BackupDefaults | null>(null)
  const [defaultsErr, setDefaultsErr] = useState<string | null>(null)
  const [choice, setChoice] = useState<BackupChoice>(null)
  const [customDir, setCustomDir] = useState('')
  const [skipInput, setSkipInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [backupResult, setBackupResult] = useState<CreateBackupResponse | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState('')

  const loadDefaults = useCallback(async () => {
    setDefaultsErr(null)
    const r = await platformResults.getBackupDefaults()
    if (!r.success || !r.data) {
      setDefaultsErr(r.error ?? '无法读取默认路径')
      return
    }
    setDefaults(r.data)
    setCustomDir(r.data.desktopDir)
    setChoice('snapshots')
  }, [])

  useEffect(() => {
    if (!open) return
    void loadDefaults()
    setStep('intro')
    setChoice(null)
    setSkipInput('')
    setErr(null)
    setBackupResult(null)
    setRemoveConfirm('')
    setBusy(false)
  }, [open, loadDefaults])

  if (!open) return null

  async function runBackup() {
    setBusy(true)
    setErr(null)
    try {
      if (choice === 'skip') {
        setBackupResult(null)
        setStep('npm')
        return
      }
      const mode = choice === 'custom' ? 'custom' : choice === 'snapshots' ? 'snapshots' : 'desktop'
      const exportDir = choice === 'custom' ? customDir.trim() : undefined
      const r = await platformResults.createOpenclawBackup({
        mode,
        exportDir: mode === 'custom' ? exportDir : undefined,
      })
      if (!r.success || !r.data) {
        setErr(r.error ?? '备份失败')
        return
      }
      setBackupResult(r.data)
      setStep('npm')
    } finally {
      setBusy(false)
    }
  }

  async function runNpm() {
    setBusy(true)
    setErr(null)
    try {
      const r = await platformResults.uninstallOpenclawCli()
      if (!r.success || r.data == null) {
        setErr(r.error ?? 'npm 卸载失败')
        return
      }
      const { ok, code, stdout, stderr } = r.data
      const log = [stdout, stderr].filter(Boolean).join('\n')
      if (!ok) {
        setErr(`npm 退出码 ${code}\n${log}`)
        return
      }
      setStep('remove-data')
    } finally {
      setBusy(false)
    }
  }

  async function runRemoveData() {
    setBusy(true)
    setErr(null)
    try {
      const r = await platformResults.removeOpenclawData()
      if (!r.success) {
        setErr(r.error ?? '删除数据目录失败')
        return
      }
      setStep('done')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-lg">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">卸载 OpenClaw（引导）</h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xl leading-none px-2"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {err && (
            <div className="rounded border border-red-500/50 bg-red-500/10 text-red-600 px-3 py-2 whitespace-pre-wrap">
              {err}
            </div>
          )}

          {step === 'intro' && (
            <>
              <p>
                流程参考{' '}
                <span className="font-medium">openclaw-uninstaller</span>：先决定是否备份{' '}
                <code className="bg-muted px-1 rounded">~/.openclaw</code>，再执行{' '}
                <code className="bg-muted px-1 rounded">npm uninstall -g openclaw clawhub</code>
                ，最后可选择是否删除本地数据目录。
              </p>
              <p className="text-muted-foreground">
                恢复：将备份的 <code className="bg-muted px-1 rounded">.tar.gz</code>{' '}
                在下方「从备份恢复」中使用；亦可安装 openclaw-snapshot 后执行{' '}
                <code className="bg-muted px-1 rounded">ocs import / ocs restore</code>（见卸载虾文档）。
              </p>
              <button
                type="button"
                className="w-full py-2 bg-primary text-primary-foreground rounded"
                onClick={() => setStep('backup')}
              >
                下一步：备份选项
              </button>
            </>
          )}

          {step === 'backup' && (
            <>
              <p className="font-medium">步骤 1：备份（强烈建议）</p>
              {defaultsErr && <p className="text-red-500">{defaultsErr}</p>}
              {defaults && (
                <>
                  <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-sm space-y-1">
                    <p className="font-medium text-foreground">默认备份路径（已预选下方「快照目录」）</p>
                    <code className="block break-all text-xs bg-background/80 px-2 py-1.5 rounded border border-border">
                      {defaults.defaultBackupPath ?? defaults.snapshotsDir}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      与 openclaw-uninstaller 选项 2 相同；生成的{' '}
                      <code className="bg-muted px-1 rounded">openclaw_backup_*.tar.gz</code>{' '}
                      会出现在该目录，设置页「从备份恢复」也会列出这里的文件。
                    </p>
                  </div>
                  <ul className="text-muted-foreground text-xs space-y-1">
                    <li>
                      数据目录：<code className="bg-muted px-1 rounded break-all">{defaults.dataDir}</code>
                    </li>
                    <li>
                      桌面导出：<code className="bg-muted px-1 rounded break-all">{defaults.desktopDir}</code>
                    </li>
                  </ul>
                </>
              )}
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bk"
                    checked={choice === 'desktop'}
                    onChange={() => setChoice('desktop')}
                  />
                  <span>
                    <span className="font-medium">保存为 tar.gz 到桌面</span>（推荐，便于拷贝）
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bk"
                    checked={choice === 'snapshots'}
                    onChange={() => setChoice('snapshots')}
                  />
                  <span>
                    <span className="font-medium">保存到快照目录</span> <code>~/.openclaw_snapshots</code>
                    ，可与 ocs 等工具配合
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bk"
                    checked={choice === 'custom'}
                    onChange={() => setChoice('custom')}
                  />
                  <span className="font-medium">自定义目录</span>
                </label>
                {choice === 'custom' && (
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-muted rounded border border-border font-mono text-xs"
                    value={customDir}
                    onChange={(e) => setCustomDir(e.target.value)}
                    placeholder="绝对路径，例如 /Volumes/Backup"
                  />
                )}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="bk"
                    checked={choice === 'skip'}
                    onChange={() => setChoice('skip')}
                  />
                  <span className="text-red-600 font-medium">跳过备份（配置将难以恢复）</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" className="flex-1 py-2 border rounded" onClick={() => setStep('intro')}>
                  上一步
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
                  disabled={!choice || busy}
                  onClick={() => {
                    if (choice === 'skip') {
                      setStep('skip-confirm')
                      return
                    }
                    void runBackup()
                  }}
                >
                  {choice === 'skip' ? '下一步' : busy ? '正在打包…' : '创建备份并继续'}
                </button>
              </div>
            </>
          )}

          {step === 'skip-confirm' && (
            <>
              <p className="text-red-600">跳过备份后，~/.openclaw 内的内容若随后被删除将无法从此向导恢复。</p>
              <p>请输入大写 <strong>SKIP</strong> 确认：</p>
              <input
                type="text"
                className="w-full px-3 py-2 bg-muted rounded border border-border"
                value={skipInput}
                onChange={(e) => setSkipInput(e.target.value)}
                placeholder="SKIP"
              />
              <div className="flex gap-2">
                <button type="button" className="flex-1 py-2 border rounded" onClick={() => setStep('backup')}>
                  返回
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded"
                  disabled={skipInput !== 'SKIP' || busy}
                  onClick={() => void runBackup()}
                >
                  确认跳过
                </button>
              </div>
            </>
          )}

          {step === 'npm' && (
            <>
              <p className="font-medium">步骤 2：卸载全局 npm 包</p>
              {backupResult && (
                <div className="rounded bg-muted/50 p-3 text-xs space-y-1">
                  <p className="font-medium text-green-600">备份已保存</p>
                  <p className="break-all font-mono">{backupResult.path}</p>
                  <p>
                    大小 {formatBytes(backupResult.size)} · 校验 {backupResult.checksum}
                  </p>
                  <p className="text-muted-foreground mt-2">
                    恢复：使用本页下方「从备份恢复」，或终端{' '}
                    <code className="bg-muted px-1 rounded">tar -xzf 文件.tar.gz -C ~</code> 后按包内说明合并到
                    ~/.openclaw（本应用提供一键恢复）。
                  </p>
                </div>
              )}
              {!backupResult && choice === 'skip' && (
                <p className="text-yellow-600 text-xs">你已跳过快照，请自行承担数据丢失风险。</p>
              )}
              <p>将执行：</p>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                npm uninstall -g openclaw{'\n'}npm uninstall -g clawhub
              </pre>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2 border rounded"
                  onClick={() => setStep(backupResult ? 'backup' : 'skip-confirm')}
                >
                  上一步
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 bg-red-500 text-white rounded disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void runNpm()}
                >
                  {busy ? '执行中…' : '执行卸载'}
                </button>
              </div>
            </>
          )}

          {step === 'remove-data' && (
            <>
              <p className="font-medium text-green-600">npm 步骤已完成。</p>
              <p>是否删除本机数据目录（含配置、日志、技能缓存等）？</p>
              <p className="text-muted-foreground text-xs break-all">{defaults?.dataDir}</p>
              <p className="text-xs text-muted-foreground">
                若仍需保留配置供其它工具读取，可点「跳过」。
              </p>
              <input
                type="text"
                className="w-full px-3 py-2 bg-muted rounded border border-border"
                value={removeConfirm}
                onChange={(e) => setRemoveConfirm(e.target.value)}
                placeholder="删除请输入大写 DELETE"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2 border rounded"
                  onClick={() => setStep('done')}
                >
                  跳过，保留数据目录
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 bg-red-600 text-white rounded disabled:opacity-50"
                  disabled={removeConfirm !== 'DELETE' || busy}
                  onClick={() => void runRemoveData()}
                >
                  {busy ? '删除中…' : '删除数据目录'}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <p className="font-medium">流程结束</p>
              <p className="text-muted-foreground">
                若曾创建备份，请妥善保存 <code className="bg-muted px-1 rounded">.tar.gz</code> 文件路径。
              </p>
              <button
                type="button"
                className="w-full py-2 bg-primary text-primary-foreground rounded"
                onClick={() => {
                  onFinished()
                  onClose()
                }}
              >
                关闭
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
