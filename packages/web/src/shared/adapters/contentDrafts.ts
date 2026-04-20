import type {
  ContentDraftDeleteResult,
  ContentDraftImageFile,
  ContentDraftTextFile,
  ContentDraftVariantSummary,
} from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { getIsTauri } from '@/shared/adapters/platform'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { webFetchJson } from '@/shared/adapters/webHttp'

export async function getContentDraftVariantsResult(): Promise<AdapterResult<ContentDraftVariantSummary[]>> {
  if (!getIsTauri()) {
    return webFetchJson<ContentDraftVariantSummary[]>('/api/content-drafts')
  }
  return fromPromise(() => tauriInvoke<ContentDraftVariantSummary[]>('list_content_draft_variants'))
}

export async function readContentDraftTextResult(pathInput: string): Promise<AdapterResult<ContentDraftTextFile>> {
  if (!getIsTauri()) {
    return webFetchJson<ContentDraftTextFile>('/api/content-drafts/read-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathInput }),
    })
  }
  return fromPromise(() =>
    tauriInvoke<ContentDraftTextFile>('read_content_draft_text_file', {
      pathInput,
    }))
}

export async function readContentDraftImageResult(pathInput: string): Promise<AdapterResult<ContentDraftImageFile>> {
  if (!getIsTauri()) {
    return webFetchJson<ContentDraftImageFile>('/api/content-drafts/read-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathInput }),
    })
  }
  return fromPromise(() =>
    tauriInvoke<ContentDraftImageFile>('read_content_draft_image_file', {
      pathInput,
    }))
}

export async function deleteContentDraftVariantResult(pathInput: string): Promise<AdapterResult<ContentDraftDeleteResult>> {
  if (!getIsTauri()) {
    return webFetchJson<ContentDraftDeleteResult>('/api/content-drafts/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathInput }),
    })
  }
  return fromPromise(() =>
    tauriInvoke<ContentDraftDeleteResult>('delete_content_draft_variant', {
      pathInput,
    }))
}
