import type { PaddleOcrModuleId, PaddleOcrStatusPayload } from '@/lib/types'
import type { CapabilityId } from '@/modules/setup/types'

export const PADDLEOCR_TEXT_SKILL_ID = 'paddleocr-text-recognition' as const
export const PADDLEOCR_DOC_SKILL_ID = 'paddleocr-doc-parsing' as const
export const PADDLEOCR_TEXT_SKILL_NAME = 'PaddleOCR Text Recognition' as const
export const PADDLEOCR_DOC_SKILL_NAME = 'PaddleOCR Document Parsing' as const

export function capabilityToPaddleOcrModuleId(
  capabilityId: Extract<CapabilityId, 'ocr_text' | 'ocr_doc'>,
): PaddleOcrModuleId {
  return capabilityId === 'ocr_text'
    ? PADDLEOCR_TEXT_SKILL_ID
    : PADDLEOCR_DOC_SKILL_ID
}

export function getPaddleOcrModuleStatus(
  payload: PaddleOcrStatusPayload,
  moduleId: PaddleOcrModuleId,
) {
  return moduleId === PADDLEOCR_TEXT_SKILL_ID
    ? payload.textRecognition
    : payload.docParsing
}

export function getPaddleOcrModuleTitleKey(moduleId: PaddleOcrModuleId): string {
  return moduleId === PADDLEOCR_TEXT_SKILL_ID
    ? 'capability.ocrText'
    : 'capability.ocrDoc'
}

export function getPaddleOcrModuleDescriptionKey(moduleId: PaddleOcrModuleId): string {
  return moduleId === PADDLEOCR_TEXT_SKILL_ID
    ? 'capability.ocrText.desc'
    : 'capability.ocrDoc.desc'
}

export function getPaddleOcrModuleSkillName(moduleId: PaddleOcrModuleId): string {
  return moduleId === PADDLEOCR_TEXT_SKILL_ID
    ? PADDLEOCR_TEXT_SKILL_NAME
    : PADDLEOCR_DOC_SKILL_NAME
}

export function getPaddleOcrModuleEndpointSuffix(moduleId: PaddleOcrModuleId): string {
  return moduleId === PADDLEOCR_TEXT_SKILL_ID ? '/ocr' : '/layout-parsing'
}

export function getPaddleOcrModulePlaceholder(moduleId: PaddleOcrModuleId): string {
  return `https://your-service.paddleocr.com${getPaddleOcrModuleEndpointSuffix(moduleId)}`
}
