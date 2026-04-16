import type {
  PaddleOcrParseRequest,
  PaddleOcrParseResult,
  PaddleOcrTestRequest,
  PaddleOcrTestResult,
} from '@/lib/types'
import { tauriInvoke } from '@/shared/adapters/invoke'
import { getIsTauri } from '@/shared/adapters/platform'
import { fromPromise } from '@/shared/adapters/resultHelpers'
import type { AdapterResult } from '@/shared/adapters/types'
import { webFetchJson } from '@/shared/adapters/webHttp'

export async function testPaddleOcrResult(
  input: PaddleOcrTestRequest,
): Promise<AdapterResult<PaddleOcrTestResult>> {
  if (getIsTauri()) {
    return fromPromise(async () =>
      tauriInvoke<PaddleOcrTestResult>('paddleocr_test_connection', { payload: input }),
    )
  }

  return webFetchJson<PaddleOcrTestResult>('/api/ocr/paddleocr/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function parsePaddleOcrResult(
  input: PaddleOcrParseRequest,
): Promise<AdapterResult<PaddleOcrParseResult>> {
  if (getIsTauri()) {
    return fromPromise(async () =>
      tauriInvoke<PaddleOcrParseResult>('paddleocr_parse_document', { payload: input }),
    )
  }

  return webFetchJson<PaddleOcrParseResult>('/api/ocr/paddleocr/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
