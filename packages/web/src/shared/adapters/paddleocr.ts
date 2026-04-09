import type {
  PaddleOcrClearInput,
  PaddleOcrPreviewPayload,
  PaddleOcrSetupInput,
  PaddleOcrStatusPayload,
} from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { getIsTauri } from '@/shared/adapters/platform'
import { webFetchJson } from '@/shared/adapters/webHttp'

export async function getPaddleOcrStatusResult(): Promise<
  AdapterResult<PaddleOcrStatusPayload>
> {
  if (getIsTauri()) {
    return fromPromise(() => tauriInvoke<PaddleOcrStatusPayload>('get_paddleocr_status'))
  }
  return webFetchJson<PaddleOcrStatusPayload>('/api/paddleocr/status')
}

export async function setupPaddleOcrResult(
  input: PaddleOcrSetupInput,
): Promise<AdapterResult<PaddleOcrStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<PaddleOcrStatusPayload>('setup_paddleocr', { payload: input }),
    )
  }
  return webFetchJson<PaddleOcrStatusPayload>('/api/paddleocr/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function previewPaddleOcrResult(
  input: PaddleOcrSetupInput,
): Promise<AdapterResult<PaddleOcrPreviewPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<PaddleOcrPreviewPayload>('preview_paddleocr', { payload: input }),
    )
  }
  return webFetchJson<PaddleOcrPreviewPayload>('/api/paddleocr/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function clearPaddleOcrResult(
  input: PaddleOcrClearInput,
): Promise<AdapterResult<PaddleOcrStatusPayload>> {
  if (getIsTauri()) {
    return fromPromise(() =>
      tauriInvoke<PaddleOcrStatusPayload>('clear_paddleocr', { payload: input }),
    )
  }
  return webFetchJson<PaddleOcrStatusPayload>('/api/paddleocr/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
