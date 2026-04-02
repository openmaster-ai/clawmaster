// ─── Types ───

export type SkillCategory = 'ocr' | 'writing' | 'coding' | 'productivity' | 'agent'

export interface CatalogSkill {
  /** ClawHub slug (e.g. "paddleocr-doc-parsing") or github slug ("author/repo") */
  slug: string
  name: string
  descriptionKey: string
  category: SkillCategory
  /** GitHub repo URL for docs/source link */
  sourceUrl?: string
}

export interface SceneBundle {
  id: string
  titleKey: string
  descKey: string
  /** Slugs of skills in this bundle */
  skills: string[]
  /** Lucide icon name */
  icon: string
  color: string
}

// ─── Curated Catalog ───

export const SKILL_CATALOG: CatalogSkill[] = [
  // OCR & Document
  {
    slug: 'paddleocr-doc-parsing',
    name: 'PaddleOCR Doc Parsing',
    descriptionKey: 'skills.catalog.paddleocrDoc.desc',
    category: 'ocr',
    sourceUrl: 'https://github.com/PaddlePaddle/PaddleOCR',
  },
  {
    slug: 'paddleocr-text-recognition',
    name: 'PaddleOCR Text Recognition',
    descriptionKey: 'skills.catalog.paddleocrText.desc',
    category: 'ocr',
    sourceUrl: 'https://github.com/PaddlePaddle/PaddleOCR',
  },

  // Writing & Style
  {
    slug: 'jzOcb/writing-style-skill',
    name: 'Writing Style',
    descriptionKey: 'skills.catalog.writingStyle.desc',
    category: 'writing',
    sourceUrl: 'https://github.com/jzOcb/writing-style-skill',
  },

  // Coding & Engineering
  {
    slug: 'pskoett/self-improving-agent',
    name: 'Self-Improving Agent',
    descriptionKey: 'skills.catalog.selfImproving.desc',
    category: 'coding',
    sourceUrl: 'https://github.com/peterskoett/self-improving-agent',
  },
  {
    slug: 'Dev-Dennis-040/openclaw-agency-skills',
    name: 'Agency Skills Pack',
    descriptionKey: 'skills.catalog.agencyPack.desc',
    category: 'coding',
    sourceUrl: 'https://github.com/Dev-Dennis-040/openclaw-agency-skills',
  },
  {
    slug: 'mxyhi/ok-skills',
    name: 'OK Skills',
    descriptionKey: 'skills.catalog.okSkills.desc',
    category: 'coding',
    sourceUrl: 'https://github.com/mxyhi/ok-skills',
  },

  // Productivity
  {
    slug: 'FluffyAIcode/openclaw-memory-pro-system',
    name: 'Memory Pro System',
    descriptionKey: 'skills.catalog.memoryPro.desc',
    category: 'productivity',
    sourceUrl: 'https://github.com/FluffyAIcode/openclaw-memory-pro-system',
  },
  {
    slug: 'luna-prompts/skillnote',
    name: 'SkillNote',
    descriptionKey: 'skills.catalog.skillnote.desc',
    category: 'productivity',
    sourceUrl: 'https://github.com/luna-prompts/skillnote',
  },

  // Agent & Meta
  {
    slug: 'MohibShaikh/clawvet',
    name: 'ClawVet',
    descriptionKey: 'skills.catalog.clawvet.desc',
    category: 'agent',
    sourceUrl: 'https://github.com/MohibShaikh/clawvet',
  },
  {
    slug: 'mareasw/ontoskills',
    name: 'OntoSkills',
    descriptionKey: 'skills.catalog.ontoskills.desc',
    category: 'agent',
    sourceUrl: 'https://github.com/mareasw/ontoskills',
  },
  {
    slug: 'fangkelvin/find-skills-skill',
    name: 'Find Skills',
    descriptionKey: 'skills.catalog.findSkills.desc',
    category: 'agent',
    sourceUrl: 'https://clawhub.ai/fangkelvin/find-skills-skill',
  },
]

// ─── Scene Bundles ───

export const SCENE_BUNDLES: SceneBundle[] = [
  {
    id: 'photo-qa',
    titleKey: 'skills.photoQa',
    descKey: 'skills.photoQaDesc',
    skills: ['paddleocr-doc-parsing', 'paddleocr-text-recognition'],
    icon: 'camera',
    color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/40',
  },
  {
    id: 'invoice',
    titleKey: 'skills.invoice',
    descKey: 'skills.invoiceDesc',
    skills: ['paddleocr-doc-parsing'],
    icon: 'receipt',
    color: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/40',
  },
  {
    id: 'mistakes',
    titleKey: 'skills.mistakes',
    descKey: 'skills.mistakesDesc',
    skills: ['paddleocr-text-recognition'],
    icon: 'book-open',
    color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/40',
  },
  {
    id: 'coding-boost',
    titleKey: 'skills.codingBoost',
    descKey: 'skills.codingBoostDesc',
    skills: ['pskoett/self-improving-agent', 'mxyhi/ok-skills'],
    icon: 'code',
    color: 'text-violet-500 bg-violet-100 dark:bg-violet-900/40',
  },
]

// ─── Category Config ───

export const CATEGORY_ORDER: SkillCategory[] = ['ocr', 'writing', 'coding', 'productivity', 'agent']

export const CATEGORY_COLORS: Record<SkillCategory, string> = {
  ocr: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  writing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  coding: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  productivity: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  agent: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
}
