// ─── Types ───

export type SkillCategory = 'ocr' | 'writing' | 'coding' | 'productivity' | 'agent'

export interface CatalogSkill {
  /** Installable skill slug accepted by `openclaw skills install` / `/api/skills/install`. */
  slug: string
  name: string
  descriptionKey: string
  category: SkillCategory
  /** Local OpenClaw `skills.entries.<skillKey>` id when it differs from the install slug. */
  skillKey?: string
  installSource?: 'registry' | 'bundled'
  featured?: boolean
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
    skillKey: 'paddleocr-doc-parsing',
    installSource: 'bundled',
    sourceUrl: 'https://github.com/PaddlePaddle/PaddleOCR',
  },

  // Writing & Style
  {
    slug: 'writing-style-skill',
    name: 'Writing Style',
    descriptionKey: 'skills.catalog.writingStyle.desc',
    category: 'writing',
    skillKey: 'writing-style-skill',
    sourceUrl: 'https://github.com/jzOcb/writing-style-skill',
  },

  // Coding & Engineering
  {
    slug: 'self-improving-agent',
    name: 'Self-Improving Agent',
    descriptionKey: 'skills.catalog.selfImproving.desc',
    category: 'coding',
    skillKey: 'self-improving-agent',
    featured: true,
    sourceUrl: 'https://github.com/peterskoett/self-improving-agent',
  },
  {
    slug: 'openclaw-agency-skills',
    name: 'Agency Skills Pack',
    descriptionKey: 'skills.catalog.agencyPack.desc',
    category: 'coding',
    skillKey: 'openclaw-agency-skills',
    sourceUrl: 'https://github.com/Dev-Dennis-040/openclaw-agency-skills',
  },
  {
    slug: 'ok-skills',
    name: 'OK Skills',
    descriptionKey: 'skills.catalog.okSkills.desc',
    category: 'coding',
    skillKey: 'ok-skills',
    sourceUrl: 'https://github.com/mxyhi/ok-skills',
  },

  // Productivity
  {
    slug: 'openclaw-memory-pro-system',
    name: 'Memory Pro System',
    descriptionKey: 'skills.catalog.memoryPro.desc',
    category: 'productivity',
    skillKey: 'openclaw-memory-pro-system',
    featured: true,
    sourceUrl: 'https://github.com/FluffyAIcode/openclaw-memory-pro-system',
  },
  {
    slug: 'luna-prompts/skillnote',
    name: 'SkillNote',
    descriptionKey: 'skills.catalog.skillnote.desc',
    category: 'productivity',
    skillKey: 'skillnote',
    sourceUrl: 'https://github.com/luna-prompts/skillnote',
  },
  {
    slug: 'content-draft',
    name: 'Content Draft',
    descriptionKey: 'skills.catalog.contentDraft.desc',
    category: 'productivity',
    skillKey: 'content-draft',
    installSource: 'bundled',
    featured: true,
    sourceUrl: 'https://github.com/openmaster-ai/clawmaster/issues/52',
  },
  {
    slug: 'ernie-image',
    name: 'ERNIE-Image Guide',
    descriptionKey: 'skills.catalog.ernieImage.desc',
    category: 'productivity',
    skillKey: 'ernie-image',
    installSource: 'bundled',
    featured: true,
    sourceUrl: 'https://github.com/openmaster-ai/clawmaster',
  },
  {
    slug: 'models-dev',
    name: 'models.dev',
    descriptionKey: 'skills.catalog.modelsDev.desc',
    category: 'productivity',
    skillKey: 'models-dev',
    installSource: 'bundled',
    sourceUrl: 'https://models.dev',
  },
  {
    slug: 'clawprobe-cost-digest',
    name: 'ClawProbe Cost Digest',
    descriptionKey: 'skills.catalog.clawprobeCostDigest.desc',
    category: 'productivity',
    skillKey: 'clawprobe-cost-digest',
    installSource: 'bundled',
    sourceUrl: 'https://github.com/openmaster-ai/clawmaster',
  },
  {
    slug: 'package-download-tracker',
    name: 'Package Download Tracker',
    descriptionKey: 'skills.catalog.packageDownloadTracker.desc',
    category: 'productivity',
    skillKey: 'package-download-tracker',
    installSource: 'bundled',
    sourceUrl: 'https://github.com/openmaster-ai/clawmaster/issues/111',
  },
  {
    slug: 'image-generate',
    name: 'Image Generate',
    descriptionKey: 'skills.catalog.imageGenerate.desc',
    category: 'productivity',
    skillKey: 'image-generate',
    sourceUrl: 'https://clawhub.ai/image-generate',
  },

  // Agent & Meta
  {
    slug: 'clawvet',
    name: 'ClawVet',
    descriptionKey: 'skills.catalog.clawvet.desc',
    category: 'agent',
    skillKey: 'clawvet',
    featured: true,
    sourceUrl: 'https://github.com/MohibShaikh/clawvet',
  },
  {
    slug: 'ontoskills',
    name: 'OntoSkills',
    descriptionKey: 'skills.catalog.ontoskills.desc',
    category: 'agent',
    skillKey: 'ontoskills',
    sourceUrl: 'https://github.com/mareasw/ontoskills',
  },
  {
    slug: 'find-skills-skill',
    name: 'Find Skills',
    descriptionKey: 'skills.catalog.findSkills.desc',
    category: 'agent',
    skillKey: 'find-skills',
    featured: true,
    sourceUrl: 'https://clawhub.ai/fangkelvin/find-skills-skill',
  },
]

export const FEATURED_SKILLS = SKILL_CATALOG.filter((skill) => skill.featured)

// ─── Scene Bundles ───

export const SCENE_BUNDLES: SceneBundle[] = [
  {
    id: 'photo-qa',
    titleKey: 'skills.photoQa',
    descKey: 'skills.photoQaDesc',
    skills: ['paddleocr-doc-parsing'],
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
    id: 'coding-boost',
    titleKey: 'skills.codingBoost',
    descKey: 'skills.codingBoostDesc',
    skills: ['self-improving-agent', 'ok-skills'],
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
