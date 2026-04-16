import type { PaddleOcrRequestOptions, PaddleOcrSampleAsset } from '@/lib/types'

export const PADDLEOCR_PROVIDER_ID = 'paddleocr'
export const PADDLEOCR_SKILL_ID = 'paddleocr-doc-parsing'
export const PADDLEOCR_SKILL_KEY = 'paddleocr-doc-parsing'
export const PADDLEOCR_DOCS_URL = 'https://aistudio.baidu.com/paddleocr'
export const PADDLEOCR_TASK_URL = 'https://aistudio.baidu.com/paddleocr/task'

export const PADDLEOCR_SAMPLE_ASSETS: PaddleOcrSampleAsset[] = [
  {
    id: 'sample-doc-cn',
    name: 'ocr.sample.chineseDoc',
    description: 'ocr.sample.chineseDocDesc',
    type: 'image',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/ch_doc1.jpg',
    previewUrl: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/ch_doc1.jpg',
  },
  {
    id: 'sample-table',
    name: 'ocr.sample.tablePage',
    description: 'ocr.sample.tablePageDesc',
    type: 'image',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/table_tal_demo/1.jpg',
    previewUrl: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/table_tal_demo/1.jpg',
  },
  {
    id: 'sample-layout',
    name: 'ocr.sample.scientificLayout',
    description: 'ocr.sample.scientificLayoutDesc',
    type: 'image',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/publaynet_demo/gt_PMC3724501_00006.jpg',
    previewUrl: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/3.3/docs/datasets/images/publaynet_demo/gt_PMC3724501_00006.jpg',
  },
]

export const DEFAULT_PADDLEOCR_OPTIONS: Required<PaddleOcrRequestOptions> = {
  fileType: 1,
  useDocOrientationClassify: true,
  useDocUnwarping: false,
  useLayoutDetection: true,
  useChartRecognition: false,
  restructurePages: false,
  mergeTables: true,
  relevelTitles: true,
  prettifyMarkdown: true,
  visualize: false,
}

export const PADDLEOCR_PRESETS: Array<{
  id: string
  labelKey: string
  descriptionKey: string
  options: Partial<Required<PaddleOcrRequestOptions>>
}> = [
  {
    id: 'clean-pdf',
    labelKey: 'ocr.preset.cleanPdf',
    descriptionKey: 'ocr.preset.cleanPdfDesc',
    options: {
      fileType: 0,
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useLayoutDetection: false,
      restructurePages: true,
      mergeTables: true,
      relevelTitles: true,
      prettifyMarkdown: true,
      visualize: false,
    },
  },
  {
    id: 'mobile-scan',
    labelKey: 'ocr.preset.mobileScan',
    descriptionKey: 'ocr.preset.mobileScanDesc',
    options: {
      fileType: 1,
      useDocOrientationClassify: true,
      useDocUnwarping: true,
      useLayoutDetection: true,
      useChartRecognition: false,
      restructurePages: false,
      prettifyMarkdown: true,
      visualize: false,
    },
  },
  {
    id: 'layout-debug',
    labelKey: 'ocr.preset.layoutDebug',
    descriptionKey: 'ocr.preset.layoutDebugDesc',
    options: {
      useLayoutDetection: true,
      visualize: true,
    },
  },
]
