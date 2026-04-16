import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileText, Image as ImageIcon, Link as LinkIcon, ScanSearch, Sparkles, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import type {
  OpenClawConfig,
  PaddleOcrParseResult,
  PaddleOcrRequestOptions,
  PaddleOcrSampleAsset,
} from '@/lib/types'
import { WorkflowModelSuggestion } from '@/shared/components/WorkflowModelSuggestion'
import { getSkillsResult, installSkillResult, setSkillEnabledResult } from '@/shared/adapters/clawhub'
import { getConfigResult, saveFullConfigResult } from '@/shared/adapters/openclaw'
import { parsePaddleOcrResult, testPaddleOcrResult } from '@/shared/adapters/ocr'
import { useAdapterCall } from '@/shared/hooks/useAdapterCall'
import { getToolModelRecommendations } from '@/modules/setup/toolModelRecommendations'
import {
  DEFAULT_PADDLEOCR_OPTIONS,
  PADDLEOCR_DOCS_URL,
  PADDLEOCR_PRESETS,
  PADDLEOCR_PROVIDER_ID,
  PADDLEOCR_SAMPLE_ASSETS,
  PADDLEOCR_SKILL_ID,
  PADDLEOCR_SKILL_KEY,
  PADDLEOCR_TASK_URL,
} from './catalog'

type OcrFormState = Required<PaddleOcrRequestOptions> & {
  endpoint: string
  accessToken: string
}

type LocalSource = {
  name: string
  fileType: 0 | 1
  payload: string
  sizeLabel: string
}

function getSharedBaiduToken(config: OpenClawConfig | null): string {
  const baiduProvider = config?.models?.providers?.['baidu-aistudio'] as
    | { apiKey?: string; api_key?: string }
    | undefined
  return baiduProvider?.apiKey?.trim() || baiduProvider?.api_key?.trim() || ''
}

function buildInitialForm(config: OpenClawConfig | null): OcrFormState {
  const provider = config?.ocr?.providers?.[PADDLEOCR_PROVIDER_ID]
  const sharedBaiduToken = getSharedBaiduToken(config)
  return {
    endpoint: provider?.endpoint ?? '',
    accessToken: provider?.accessToken ?? sharedBaiduToken,
    fileType: provider?.defaultFileType ?? DEFAULT_PADDLEOCR_OPTIONS.fileType,
    useDocOrientationClassify: provider?.useDocOrientationClassify ?? DEFAULT_PADDLEOCR_OPTIONS.useDocOrientationClassify,
    useDocUnwarping: provider?.useDocUnwarping ?? DEFAULT_PADDLEOCR_OPTIONS.useDocUnwarping,
    useLayoutDetection: provider?.useLayoutDetection ?? DEFAULT_PADDLEOCR_OPTIONS.useLayoutDetection,
    useChartRecognition: provider?.useChartRecognition ?? DEFAULT_PADDLEOCR_OPTIONS.useChartRecognition,
    restructurePages: provider?.restructurePages ?? DEFAULT_PADDLEOCR_OPTIONS.restructurePages,
    mergeTables: provider?.mergeTables ?? DEFAULT_PADDLEOCR_OPTIONS.mergeTables,
    relevelTitles: provider?.relevelTitles ?? DEFAULT_PADDLEOCR_OPTIONS.relevelTitles,
    prettifyMarkdown: provider?.prettifyMarkdown ?? DEFAULT_PADDLEOCR_OPTIONS.prettifyMarkdown,
    visualize: provider?.visualize ?? DEFAULT_PADDLEOCR_OPTIONS.visualize,
  }
}

function hasSavedPaddleOcrConfig(config: OpenClawConfig | null): boolean {
  const provider = config?.ocr?.providers?.[PADDLEOCR_PROVIDER_ID]
  return Boolean(provider?.endpoint?.trim() && (provider?.accessToken?.trim() || getSharedBaiduToken(config)))
}

function isSkillInstalled(skills: Awaited<ReturnType<typeof getSkillsResult>>['data'] | null | undefined) {
  return Boolean(
    skills?.some((skill) =>
      [skill.slug, skill.skillKey, skill.name]
        .some((value) => value?.trim().toLowerCase() === PADDLEOCR_SKILL_ID),
    ),
  )
}

function toSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function mimeFromName(fileName: string) {
  const lowered = fileName.toLowerCase()
  if (lowered.endsWith('.png')) return 'image/png'
  if (lowered.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function buildDataUrl(base64: string, mimeType: string) {
  return `data:${mimeType};base64,${base64}`
}

function ResultImages({
  label,
  items,
  mimeType,
}: {
  label: string
  items: Record<string, string> | null | undefined
  mimeType: string
}) {
  const entries = Object.entries(items ?? {})
  if (entries.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map(([name, value]) => (
          <figure key={name} className="surface-card-muted overflow-hidden">
            <img src={buildDataUrl(value, mimeType)} alt={name} className="h-44 w-full object-cover" />
            <figcaption className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">{name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

export default function OcrPage() {
  const { t, i18n } = useTranslation()
  const { data: config, loading, error, refetch } = useAdapterCall(getConfigResult)
  const { data: installedSkills, refetch: refetchSkills } = useAdapterCall(getSkillsResult)
  const [form, setForm] = useState<OcrFormState>(buildInitialForm(null))
  const [activeSampleId, setActiveSampleId] = useState(PADDLEOCR_SAMPLE_ASSETS[0]?.id ?? '')
  const [sourceMode, setSourceMode] = useState<'sample' | 'upload'>('sample')
  const [localSource, setLocalSource] = useState<LocalSource | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<PaddleOcrParseResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false)

  useEffect(() => {
    setForm(buildInitialForm(config))
  }, [config])

  const skillReady =
    config?.skills?.entries?.[PADDLEOCR_SKILL_KEY]?.enabled === true ||
    isSkillInstalled(installedSkills)

  useEffect(() => {
    if (!hasSavedPaddleOcrConfig(config) || skillReady) {
      setAutoSyncAttempted(false)
      return
    }
    if (autoSyncAttempted) return

    let cancelled = false
    setAutoSyncAttempted(true)

    ;(async () => {
      // successMessage is set only after both install and enable succeed.
      // It is read outside the cancelled guard so the message still shows
      // even when refetch() triggers a dep-change effect cleanup mid-flight
      // (cancelled=true due to config update, not unmount).
      let successMessage: string | null = null
      try {
        const installResult = await installSkillResult(PADDLEOCR_SKILL_ID)
        if (!installResult.success) {
          throw new Error(installResult.error ?? t('ocr.skillInstallFailed'))
        }

        const enableResult = await setSkillEnabledResult(PADDLEOCR_SKILL_KEY, true)
        if (!enableResult.success) {
          throw new Error(enableResult.error ?? t('ocr.skillInstallFailed'))
        }

        successMessage = t('ocr.skillAutoEnabled')
        if (!cancelled) {
          await Promise.all([refetch(), refetchSkills()])
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setSaveError(error instanceof Error ? error.message : String(error))
        }
        return
      }

      if (successMessage !== null) {
        setSaveMessage(successMessage)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [autoSyncAttempted, config, refetch, refetchSkills, skillReady, t])
  const activeSample = useMemo(
    () => PADDLEOCR_SAMPLE_ASSETS.find((asset) => asset.id === activeSampleId) ?? PADDLEOCR_SAMPLE_ASSETS[0],
    [activeSampleId],
  )
  const toolModelExamples = getToolModelRecommendations(config, i18n.language)
    .map((example) => `${example.providerLabel} / ${example.modelLabel}`)
  const canSubmit = form.endpoint.trim().length > 0 && form.accessToken.trim().length > 0
  const resultPages = parseResult?.layoutParsingResults ?? []
  const mergedMarkdown = resultPages
    .map((page, index) => {
      const content = page.markdown?.text?.trim() || ''
      return content ? `<!-- ${t('ocr.result.pageLabel', { page: index + 1 })} -->\n${content}` : ''
    })
    .filter(Boolean)
    .join('\n\n')

  function buildSkillEnabledConfig(nextConfig: OpenClawConfig) {
    const updatedConfig: OpenClawConfig = {
      ...nextConfig,
      skills: {
        ...(nextConfig.skills ?? {}),
        entries: {
          ...((nextConfig.skills?.entries as Record<string, unknown> | undefined) ?? {}),
          [PADDLEOCR_SKILL_KEY]: {
            ...((nextConfig.skills?.entries?.[PADDLEOCR_SKILL_KEY] as Record<string, unknown> | undefined) ?? {}),
            enabled: true,
          },
        },
      },
    }
    return updatedConfig
  }

  async function installAndEnableSkillAfterSave() {
    const installResult = await installSkillResult(PADDLEOCR_SKILL_ID)
    if (!installResult.success) {
      throw new Error(installResult.error ?? t('ocr.skillInstallFailed'))
    }
  }

  function updateOption<K extends keyof OcrFormState>(key: K, value: OcrFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function applyPreset(presetId: string) {
    const preset = PADDLEOCR_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setForm((current) => ({
      ...current,
      ...preset.options,
    }))
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const detectedType: 0 | 1 = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 0 : 1
    const payload = await readFileAsBase64(file)
    setLocalSource({
      name: file.name,
      fileType: detectedType,
      payload,
      sizeLabel: toSizeLabel(file.size),
    })
    setSourceMode('upload')
    setForm((current) => ({
      ...current,
      fileType: detectedType,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const currentConfig = config ?? {}
      const nextConfig = buildSkillEnabledConfig({
        ...currentConfig,
        ocr: {
          ...(currentConfig.ocr ?? {}),
          defaults: {
            ...(currentConfig.ocr?.defaults ?? {}),
            provider: PADDLEOCR_PROVIDER_ID,
          },
          providers: {
            ...(currentConfig.ocr?.providers ?? {}),
            [PADDLEOCR_PROVIDER_ID]: {
              endpoint: form.endpoint.trim(),
              accessToken: form.accessToken.trim(),
              defaultFileType: form.fileType,
              useDocOrientationClassify: form.useDocOrientationClassify,
              useDocUnwarping: form.useDocUnwarping,
              useLayoutDetection: form.useLayoutDetection,
              useChartRecognition: form.useChartRecognition,
              restructurePages: form.restructurePages,
              mergeTables: form.mergeTables,
              relevelTitles: form.relevelTitles,
              prettifyMarkdown: form.prettifyMarkdown,
              visualize: form.visualize,
            },
          },
        },
      })
      const saveResult = await saveFullConfigResult(nextConfig)
      if (!saveResult.success) {
        throw new Error(saveResult.error ?? t('ocr.saveFailedFallback'))
      }
      await installAndEnableSkillAfterSave()
      await Promise.all([refetch(), refetchSkills()])
      setSaveMessage(t('ocr.saveSuccess'))
    } catch (saveErr: unknown) {
      setSaveError(saveErr instanceof Error ? saveErr.message : String(saveErr))
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestError(null)
    setTestMessage(null)
    try {
      const result = await testPaddleOcrResult({
        endpoint: form.endpoint.trim(),
        accessToken: form.accessToken.trim(),
        file: activeSample?.url,
        fileType: activeSample?.type === 'pdf' ? 0 : 1,
      })
      if (!result.success) {
        throw new Error(result.error ?? t('ocr.testFailedFallback'))
      }
      setTestMessage(t('ocr.testSuccess', { pages: result.data?.pageCount ?? 0 }))
    } catch (testErr: unknown) {
      setTestError(testErr instanceof Error ? testErr.message : String(testErr))
    } finally {
      setTesting(false)
    }
  }

  async function handleParse() {
    setParsing(true)
    setParseError(null)
    setParseResult(null)
    try {
      const file = sourceMode === 'upload' ? localSource?.payload : activeSample?.url
      const fileType = sourceMode === 'upload'
        ? localSource?.fileType ?? form.fileType
        : activeSample?.type === 'pdf' ? 0 : 1
      if (!file) {
        throw new Error(t('ocr.fileRequired'))
      }
      const result = await parsePaddleOcrResult({
        endpoint: form.endpoint.trim(),
        accessToken: form.accessToken.trim(),
        file,
        fileType,
        useDocOrientationClassify: form.useDocOrientationClassify,
        useDocUnwarping: form.useDocUnwarping,
        useLayoutDetection: form.useLayoutDetection,
        useChartRecognition: form.useChartRecognition,
        restructurePages: form.restructurePages,
        mergeTables: form.mergeTables,
        relevelTitles: form.relevelTitles,
        prettifyMarkdown: form.prettifyMarkdown,
        visualize: form.visualize,
      })
      if (!result.success) {
        throw new Error(result.error ?? t('ocr.parseFailedFallback'))
      }
      setParseResult(result.data ?? null)
    } catch (parseErr: unknown) {
      setParseError(parseErr instanceof Error ? parseErr.message : String(parseErr))
    } finally {
      setParsing(false)
    }
  }

  if (loading) {
    return <div className="state-panel text-muted-foreground">{t('common.loading')}</div>
  }

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-header-meta">
            <span>{t('ocr.meta.provider')}</span>
            <span>{skillReady ? t('ocr.meta.skillReady') : t('ocr.meta.skillPending')}</span>
          </div>
          <h1 className="page-title">{t('ocr.title')}</h1>
          <p className="page-subtitle">{t('ocr.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={PADDLEOCR_TASK_URL} target="_blank" rel="noreferrer" className="button-secondary">
            {t('ocr.getToken')}
          </a>
          <a href={PADDLEOCR_DOCS_URL} target="_blank" rel="noreferrer" className="button-secondary">
            {t('ocr.openDocs')}
          </a>
        </div>
      </div>

      {error ? (
        <div role="alert" className="surface-card border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className="surface-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t('ocr.skillBannerTitle')}
            </div>
            <h2 className="text-lg font-semibold text-foreground">{t('ocr.skillTitle')}</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{t('ocr.skillBannerBody')}</p>
          </div>
          <Link to="/skills" className="button-secondary">
            {t('ocr.openSkills')}
          </Link>
        </div>
        <WorkflowModelSuggestion
          title={t('workflowModel.title')}
          body={t('workflowModel.ocrBody')}
          examples={toolModelExamples}
          examplesLabel={t('workflowModel.examples')}
          footnote={t('workflowModel.examplesOnly')}
          action={<Link to="/models" className="button-secondary">{t('workflowModel.openModels')}</Link>}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="surface-card space-y-5">
          <div className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5 text-sky-500" />
            <h2 className="text-lg font-semibold text-foreground">{t('ocr.connectionTitle')}</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">{t('ocr.endpointLabel')}</span>
              <input
                value={form.endpoint}
                onChange={(event) => updateOption('endpoint', event.target.value)}
                placeholder={t('ocr.endpointPlaceholder')}
                className="input w-full"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">{t('ocr.tokenLabel')}</span>
              <input
                type="password"
                value={form.accessToken}
                onChange={(event) => updateOption('accessToken', event.target.value)}
                placeholder={t('ocr.tokenPlaceholder')}
                className="input w-full"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{t('ocr.defaultFileType')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateOption('fileType', 1)}
                className={form.fileType === 1 ? 'button-primary' : 'button-secondary'}
              >
                {t('ocr.fileType.image')}
              </button>
              <button
                type="button"
                onClick={() => updateOption('fileType', 0)}
                className={form.fileType === 0 ? 'button-primary' : 'button-secondary'}
              >
                {t('ocr.fileType.pdf')}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ToggleField label={t('ocr.option.orientation')} checked={form.useDocOrientationClassify} onChange={(checked) => updateOption('useDocOrientationClassify', checked)} />
            <ToggleField label={t('ocr.option.unwarp')} checked={form.useDocUnwarping} onChange={(checked) => updateOption('useDocUnwarping', checked)} />
            <ToggleField label={t('ocr.option.layout')} checked={form.useLayoutDetection} onChange={(checked) => updateOption('useLayoutDetection', checked)} />
            <ToggleField label={t('ocr.option.chart')} checked={form.useChartRecognition} onChange={(checked) => updateOption('useChartRecognition', checked)} />
            <ToggleField label={t('ocr.option.restructure')} checked={form.restructurePages} onChange={(checked) => updateOption('restructurePages', checked)} />
            <ToggleField label={t('ocr.option.mergeTables')} checked={form.mergeTables} onChange={(checked) => updateOption('mergeTables', checked)} />
            <ToggleField label={t('ocr.option.relevelTitles')} checked={form.relevelTitles} onChange={(checked) => updateOption('relevelTitles', checked)} />
            <ToggleField label={t('ocr.option.prettify')} checked={form.prettifyMarkdown} onChange={(checked) => updateOption('prettifyMarkdown', checked)} />
            <ToggleField label={t('ocr.option.visualize')} checked={form.visualize} onChange={(checked) => updateOption('visualize', checked)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleSave} disabled={!canSubmit || saving} className="button-primary">
              {saving ? t('common.saving') : t('ocr.saveAction')}
            </button>
            <button onClick={handleTest} disabled={!canSubmit || testing} className="button-secondary">
              {testing ? t('ocr.testing') : t('ocr.testAction')}
            </button>
          </div>

          {saveMessage ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{saveMessage}</p> : null}
          {saveError ? <p className="text-sm text-red-600 dark:text-red-300">{saveError}</p> : null}
          {testMessage ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{testMessage}</p> : null}
          {testError ? <p className="text-sm text-red-600 dark:text-red-300">{testError}</p> : null}
        </section>

        <section className="surface-card space-y-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-foreground">{t('ocr.presetsTitle')}</h2>
          </div>

          <div className="grid gap-3">
            {PADDLEOCR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="surface-card-muted text-left transition hover:border-sky-500/40"
              >
                <p className="font-medium text-foreground">{t(preset.labelKey)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t(preset.descriptionKey)}</p>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t('ocr.tipTitle')}</p>
            <p className="mt-2">{t('ocr.tipBody')}</p>
          </div>

          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
            <p className="text-sm font-medium text-foreground">{t('ocr.promptTitle')}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t('ocr.promptBody')}</p>
            <textarea
              readOnly
              value={t('ocr.promptExample')}
              className="mt-3 min-h-28 w-full rounded-2xl border border-border/70 bg-background/80 p-4 font-mono text-sm text-foreground"
            />
          </div>
        </section>
      </div>

      <section className="surface-card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('ocr.sourceTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('ocr.sourceSubtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSourceMode('sample')}
              className={sourceMode === 'sample' ? 'button-primary' : 'button-secondary'}
            >
              {t('ocr.source.sample')}
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('upload')}
              className={sourceMode === 'upload' ? 'button-primary' : 'button-secondary'}
            >
              {t('ocr.source.upload')}
            </button>
          </div>
        </div>

        {sourceMode === 'sample' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {PADDLEOCR_SAMPLE_ASSETS.map((asset) => (
              <SampleCard
                key={asset.id}
                asset={asset}
                selected={asset.id === activeSample?.id}
                onSelect={() => {
                  setActiveSampleId(asset.id)
                  setForm((current) => ({ ...current, fileType: asset.type === 'pdf' ? 0 : 1 }))
                }}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="surface-card-muted flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-6 text-center">
              <Upload className="h-6 w-6 text-sky-500" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{t('ocr.uploadTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('ocr.uploadBody')}</p>
              </div>
              <input type="file" accept="image/*,.pdf,application/pdf" onChange={handleFileChange} className="hidden" />
            </label>

            <div className="surface-card-muted space-y-3">
              <p className="font-medium text-foreground">{t('ocr.uploadSummary')}</p>
              {localSource ? (
                <>
                  <p className="text-sm text-muted-foreground">{localSource.name}</p>
                  <p className="text-sm text-muted-foreground">{localSource.sizeLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('ocr.uploadDetectedType', {
                      type: localSource.fileType === 0 ? t('ocr.fileType.pdf') : t('ocr.fileType.image'),
                    })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('ocr.uploadEmpty')}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={handleParse} disabled={!canSubmit || parsing || (sourceMode === 'upload' && !localSource)} className="button-primary">
            {parsing ? t('ocr.parsing') : t('ocr.parseAction')}
          </button>
        </div>
        {parseError ? <p className="text-sm text-red-600 dark:text-red-300">{parseError}</p> : null}
      </section>

      <section className="surface-card space-y-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-foreground">{t('ocr.resultTitle')}</h2>
        </div>

        {parseResult ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label={t('ocr.result.pages')} value={String(resultPages.length)} />
              <MetricCard label={t('ocr.result.images')} value={String(resultPages.reduce((count, page) => count + Object.keys(page.markdown?.images ?? {}).length, 0))} />
              <MetricCard label={t('ocr.result.outputImages')} value={String(resultPages.reduce((count, page) => count + Object.keys(page.outputImages ?? {}).length, 0))} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{t('ocr.result.markdown')}</p>
              <textarea value={mergedMarkdown} readOnly className="min-h-72 w-full rounded-2xl border border-border/70 bg-muted/20 p-4 font-mono text-sm" />
            </div>

            {resultPages.map((page, index) => (
              <div key={`page-${index}`} className="space-y-4 rounded-2xl border border-border/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{t('ocr.result.pageLabel', { page: index + 1 })}</p>
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">
                    {page.markdown?.text?.trim().length || 0} {t('ocr.result.characters')}
                  </span>
                </div>
                {page.inputImage ? (
                  <img src={buildDataUrl(page.inputImage, 'image/jpeg')} alt={t('ocr.result.inputImage')} className="max-h-80 rounded-2xl border border-border/70 object-contain" />
                ) : null}
                <ResultImages label={t('ocr.result.markdownImages')} items={page.markdown?.images} mimeType={mimeFromName('preview.png')} />
                <ResultImages label={t('ocr.result.outputImageLabel')} items={page.outputImages} mimeType="image/jpeg" />
              </div>
            ))}

            {parseResult.dataInfo ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{t('ocr.result.dataInfo')}</p>
                <pre className="overflow-x-auto rounded-2xl border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground">
                  {JSON.stringify(parseResult.dataInfo, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 px-5 py-10 text-center text-sm text-muted-foreground">
            {t('ocr.resultEmpty')}
          </div>
        )}
      </section>
    </div>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="surface-card-muted flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-border" />
    </label>
  )
}

function SampleCard({
  asset,
  selected,
  onSelect,
}: {
  asset: PaddleOcrSampleAsset
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`overflow-hidden rounded-[24px] border text-left transition ${selected ? 'border-sky-500/60 bg-sky-500/5' : 'border-border/70 bg-card hover:border-sky-500/30'}`}
    >
      <div className="aspect-[4/3] w-full bg-muted/30">
        {asset.previewUrl ? (
          <img src={asset.previewUrl} alt={t(asset.name)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {asset.type === 'pdf' ? <FileText className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-foreground">{t(asset.name)}</p>
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">
            {asset.type === 'pdf' ? t('ocr.fileType.pdf') : t('ocr.fileType.image')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{t(asset.description)}</p>
        <div className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-300">
          <LinkIcon className="h-3.5 w-3.5" />
          {asset.url}
        </div>
      </div>
    </button>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card-muted space-y-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </div>
  )
}
