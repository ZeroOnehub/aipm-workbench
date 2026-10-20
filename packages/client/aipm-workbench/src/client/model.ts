/**
 * The project file contract the AIPM skills write and the project tab reads.
 *
 * `aipm.json` sits at a project's root; the format is owned by the `aipm-hub`
 * skill (references/aipm-json.md). Parsing here is forgiving: unknown fields are
 * dropped, missing stages fall back to the fixed six-stage map, so a half-written
 * file still draws a sensible panel.
 */

/** Stage status as the skills record it. */
export type StageStatus = 'unavailable' | 'not_started' | 'in_progress' | 'done' | 'skipped'

/** Station status inside one stage. */
export type StationStatus = 'not_started' | 'in_progress' | 'passed' | 'passed_pending' | 'blocked'

/** One fixed stage of the studio's flow. */
export interface StageDefinition {
  readonly id: string
  readonly name: string
  /** Directory under the project root holding this stage's deliverables. */
  readonly dir: string
  /** Skills that do this stage's work, the leading one first. */
  readonly skills: readonly string[]
  /** What the stage hands to the next one. */
  readonly output: string
  /** Composer text that starts this stage through the studio hub. */
  readonly starter: string
}

/** The six stages, in flow order. */
export const STAGES: readonly StageDefinition[] = [
  {
    id: 'initiation', name: '立项', dir: '01-立项',
    skills: ['project-initiation', 'interview-script', 'research-synthesis'],
    output: '立项报告：做不做、先做多小',
    starter: '/aipm-hub 新建项目。我想做的产品是：',
  },
  {
    id: 'prd', name: 'PRD', dir: '02-PRD',
    skills: ['prd', 'prd-review'],
    output: 'PRD：功能、验收标准、AI 能力边界',
    starter: '/aipm-hub 继续项目，进入 PRD 阶段',
  },
  {
    id: 'prototype', name: '原型交互', dir: '03-原型交互',
    skills: ['html-wireframe', 'html-prototype'],
    output: '线框图和可交互原型',
    starter: '/aipm-hub 继续项目，进入原型交互阶段',
  },
  {
    id: 'ai-design', name: 'AI 方案设计', dir: '04-AI方案设计',
    skills: ['system-prompt-design', 'harness-patterns'],
    output: '系统提示词和 Agent 方案',
    starter: '/aipm-hub 继续项目，进入 AI 方案设计阶段',
  },
  {
    id: 'evaluation', name: '评测', dir: '05-评测',
    skills: ['eval-error-analysis', 'eval-judge-prompt', 'eval-validate-judge'],
    output: '错误分析、评委和校准结果',
    starter: '/aipm-hub 继续项目，进入评测阶段',
  },
  {
    id: 'launch-review', name: '上线复盘', dir: '06-上线复盘',
    skills: ['metrics-review', 'retro'],
    output: '指标复盘和复盘结论',
    starter: '/aipm-hub 继续项目，进入上线复盘阶段',
  },
]

/** One station row. */
export interface Station {
  readonly id: string
  readonly name: string
  readonly status: StationStatus
  readonly note?: string | undefined
}

/** One stage merged from the fixed map and the file. */
export interface Stage extends StageDefinition {
  readonly status: StageStatus
  readonly note?: string | undefined
  readonly stations: readonly Station[]
}

/** A parsed project. */
export interface Project {
  readonly name: string
  readonly type?: string | undefined
  readonly updated?: string | undefined
  readonly currentStage?: string | undefined
  readonly stages: readonly Stage[]
}

const STAGE_STATUSES: readonly StageStatus[] = ['unavailable', 'not_started', 'in_progress', 'done', 'skipped']
const STATION_STATUSES: readonly StationStatus[] = ['not_started', 'in_progress', 'passed', 'passed_pending', 'blocked']

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

/**
 * Parse `aipm.json` text.
 * @param raw - file contents.
 * @param folder - project folder name, used when the file omits `project`.
 * @returns the project, or an error message for an unreadable file.
 */
export function parseProject(raw: string, folder: string): Project | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return { error: `aipm.json 不是合法的 JSON：${error instanceof Error ? error.message : String(error)}` }
  }
  const root = record(data)
  if (root === undefined) return { error: 'aipm.json 顶层应当是一个对象' }
  const listed = Array.isArray(root.stages) ? root.stages.map(record).filter(s => s !== undefined) : []
  const stages = STAGES.map((definition): Stage => {
    const found = listed.find(s => s.id === definition.id)
    const stations = Array.isArray(found?.stations)
      ? found.stations.map(record).filter(s => s !== undefined).map((s, index): Station => ({
        id: text(s.id) ?? String(index + 1).padStart(2, '0'),
        name: text(s.name) ?? `第 ${index + 1} 站`,
        status: oneOf(s.status, STATION_STATUSES, 'not_started'),
        ...(text(s.note) === undefined ? {} : { note: text(s.note) }),
      }))
      : []
    return {
      ...definition,
      status: oneOf(found?.status, STAGE_STATUSES, found === undefined ? 'unavailable' : 'not_started'),
      ...(text(found?.note) === undefined ? {} : { note: text(found?.note) }),
      stations,
    }
  })
  return {
    name: text(root.project) ?? folder,
    ...(text(root.type) === undefined ? {} : { type: text(root.type) }),
    ...(text(root.updated) === undefined ? {} : { updated: text(root.updated) }),
    ...(text(root.currentStage) === undefined ? {} : { currentStage: text(root.currentStage) }),
    stages,
  }
}

/**
 * Join path segments with `/`, the separator the workspace endpoints accept on every platform.
 * @param parts - leading absolute root then relative segments.
 * @returns the joined path.
 */
export function joinPath(...parts: string[]): string {
  return parts
    .map((part, index) => index === 0 ? part.replace(/[/\\]+$/, '') : part.replace(/^[/\\]+|[/\\]+$/g, ''))
    .filter(part => part !== '')
    .join('/')
}

/** Files worth listing as deliverables: skip dotfiles and editor leftovers. */
export function isDeliverable(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('~$') && name !== 'Thumbs.db'
}
