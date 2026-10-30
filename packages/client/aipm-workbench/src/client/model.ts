/**
 * The project file contract the AIPM skills write and the project tab reads.
 *
 * `aipm.json` sits at a project's root; the format is owned by the `aipm-hub`
 * skill (references/aipm-json.md). Version 2 files use the current six stages;
 * older files keep the earlier six until the hub upgrades them. Parsing here is
 * forgiving: unknown fields are dropped, missing stages fall back to the fixed
 * stage map, so a half-written file still draws a sensible panel.
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

const INITIATION: StageDefinition = {
  id: 'initiation', name: '立项', dir: '01-立项',
  skills: ['project-initiation'],
  output: '立项报告：做不做、先做多小',
  starter: '/aipm-hub 新建项目。我想做的产品是：',
}

const PRD: StageDefinition = {
  id: 'prd', name: 'PRD', dir: '02-PRD',
  skills: ['prd'],
  output: 'PRD：功能、交互、提示词、评测需求',
  starter: '/aipm-hub 继续项目，进入 PRD',
}

const PROTOTYPE: StageDefinition = {
  id: 'prototype', name: '原型交互', dir: '03-原型交互',
  skills: ['prototype'],
  output: '线框图和可点击原型',
  starter: '/aipm-hub 继续项目，进入原型交互',
}

/** The six stages of the current flow (`aipm.json` version 2), in flow order. */
export const STAGES: readonly StageDefinition[] = [
  INITIATION,
  PRD,
  PROTOTYPE,
  {
    id: 'tech', name: '技术方案', dir: '04-技术方案',
    skills: ['tech-solution'],
    output: 'PRD 体检、技术选型、架构方案',
    starter: '/aipm-hub 继续项目，进入技术方案',
  },
  {
    id: 'model-eval', name: '模型评测', dir: '05-模型评测',
    skills: ['model-eval'],
    output: '候选模型、评测集、选型结论',
    starter: '/aipm-hub 继续项目，进入模型选型与评测',
  },
  {
    id: 'mvp', name: 'MVP', dir: '06-MVP',
    skills: ['mvp-build'],
    output: '能跑的 MVP 和验收报告',
    starter: '/aipm-hub 继续项目，开始做 MVP',
  },
]

/**
 * The six stages of the earlier flow, for `aipm.json` files without version 2.
 * The hub offers to upgrade such projects; until then they keep their stages.
 */
export const LEGACY_STAGES: readonly StageDefinition[] = [
  INITIATION,
  PRD,
  PROTOTYPE,
  {
    id: 'ai-design', name: 'AI 方案设计', dir: '04-AI方案设计',
    skills: ['aipm-hub'],
    output: '旧流程：架构方案、系统提示词',
    starter: '/aipm-hub 继续项目',
  },
  {
    id: 'evaluation', name: '评测', dir: '05-评测',
    skills: ['aipm-hub'],
    output: '旧流程：可行性小样、评测',
    starter: '/aipm-hub 继续项目',
  },
  {
    id: 'launch-review', name: '上线复盘', dir: '06-上线复盘',
    skills: ['aipm-hub'],
    output: '旧流程：上线检查、复盘',
    starter: '/aipm-hub 继续项目',
  },
]

/** The `aipm.json` version written by the current skills. */
export const CURRENT_VERSION = 2

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

/** What an open item asks of the user: a decision, an assumption or evidence gap to check, or a blocker. */
export type PendingKind = 'decision' | 'assumption' | 'gap' | 'blocked'

/**
 * One open item. Items written by the skills come from `aipm.json` `pending`;
 * derived items come from a `passed_pending` or `blocked` station or a skipped
 * stage, so older files without `pending` still list what is open.
 */
export interface PendingItem {
  /** Stable React key: the file's item id, or `stage:station` for a derived item. */
  readonly key: string
  /** Id the skills use to refer to the item (`D1`, `A3`); absent for derived items. */
  readonly id?: string | undefined
  readonly kind: PendingKind
  /** What is open; for a derived item the station or stage note, when written. */
  readonly text?: string | undefined
  /** Stage id the item belongs to. */
  readonly stage?: string | undefined
  /** Station label (`02 写清价值`) for an item derived from a station. */
  readonly station?: string | undefined
  /** Deliverable path relative to the project root where the item is discussed. */
  readonly source?: string | undefined
  /** Recommended answer for a decision. */
  readonly recommend?: string | undefined
  readonly derived: boolean
}

/** Open-item groups the user sees: a decision to make, a blocker, or something to verify. */
export type PendingGroup = 'decision' | 'blocked' | 'verify'

/** Groups in display order. */
export const PENDING_GROUPS: readonly PendingGroup[] = ['decision', 'blocked', 'verify']

/**
 * The group an item is listed under.
 * @param kind - item kind.
 * @returns `verify` for assumptions and evidence gaps, otherwise the kind itself.
 */
export function pendingGroupOf(kind: PendingKind): PendingGroup {
  return kind === 'assumption' || kind === 'gap' ? 'verify' : kind
}

/**
 * Where a handed-off project's code lives: `aipm.json` `build`, written by the
 * `build-launch` skill and refreshed by `aipm-hub` (references/aipm-json.md).
 */
export interface BuildInfo {
  /** Absolute product folder inside the dev folder. */
  readonly path: string
  /** Who writes the code: a coding agent's name or a team. */
  readonly tool?: string | undefined
  readonly handoff?: string | undefined
  readonly synced?: string | undefined
  /** Stage line the hub last read; shown when the folder cannot be read. */
  readonly stage?: string | undefined
  /** Date of that read. */
  readonly checked?: string | undefined
  /**
   * Whether the folder follows the earlier dev-folder stages (0 PRD check through
   * 5 wrap-up) rather than the MVP stages (0 setup through 5 launch).
   */
  readonly legacy: boolean
}

/** A parsed project. */
export interface Project {
  readonly name: string
  /** Whether the file predates version 2 and uses {@link LEGACY_STAGES}. */
  readonly legacy: boolean
  readonly type?: string | undefined
  readonly updated?: string | undefined
  readonly currentStage?: string | undefined
  readonly stages: readonly Stage[]
  /** Open items written by the skills; resolved ones are dropped. */
  readonly pending: readonly PendingItem[]
  /** Present once the project is handed off to a dev folder. */
  readonly build?: BuildInfo | undefined
}

const STAGE_STATUSES: readonly StageStatus[] = ['unavailable', 'not_started', 'in_progress', 'done', 'skipped']
const STATION_STATUSES: readonly StationStatus[] = ['not_started', 'in_progress', 'passed', 'passed_pending', 'blocked']
const PENDING_KINDS: readonly PendingKind[] = ['decision', 'assumption', 'gap', 'blocked']

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
  const legacy = root.version !== CURRENT_VERSION
  const listed = Array.isArray(root.stages) ? root.stages.map(record).filter(s => s !== undefined) : []
  const stages = (legacy ? LEGACY_STAGES : STAGES).map((definition): Stage => {
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
  const pending = (Array.isArray(root.pending) ? root.pending.map(record).filter(p => p !== undefined) : [])
    .filter(p => p.status !== 'resolved' && text(p.text) !== undefined)
    .map((p, index): PendingItem => ({
      key: `pending:${text(p.id) ?? index}`,
      id: text(p.id),
      kind: oneOf(p.kind, PENDING_KINDS, 'decision'),
      text: text(p.text),
      stage: text(p.stage),
      source: text(p.source),
      recommend: text(p.recommend),
      derived: false,
    }))
  const build = record(root.build)
  const buildPath = text(build?.path)
  return {
    name: text(root.project) ?? folder,
    legacy,
    ...(text(root.type) === undefined ? {} : { type: text(root.type) }),
    ...(text(root.updated) === undefined ? {} : { updated: text(root.updated) }),
    ...(text(root.currentStage) === undefined ? {} : { currentStage: text(root.currentStage) }),
    stages,
    pending,
    ...(buildPath === undefined
      ? {}
      : {
        build: {
          path: buildPath,
          tool: text(build?.tool),
          handoff: text(build?.handoff),
          synced: text(build?.synced),
          stage: text(build?.stage),
          checked: text(build?.checked),
          legacy: legacy || build?.legacy === true,
        },
      }),
  }
}

/**
 * Every open item of a project: the skills' own items, then items derived from
 * blocked or conditionally passed stations and skipped stages, in stage order.
 * @param project - parsed project.
 * @returns open items; empty when nothing is open.
 */
export function openItems(project: Project): PendingItem[] {
  const derived: PendingItem[] = []
  for (const stage of project.stages) {
    if (stage.status === 'skipped') {
      derived.push({ key: `stage:${stage.id}`, kind: 'assumption', text: stage.note, stage: stage.id, derived: true })
    }
    for (const station of stage.stations) {
      if (station.status !== 'blocked' && station.status !== 'passed_pending') continue
      derived.push({
        key: `station:${stage.id}:${station.id}`,
        kind: station.status === 'blocked' ? 'blocked' : 'assumption',
        text: station.note,
        stage: stage.id,
        station: `${station.id} ${station.name}`,
        derived: true,
      })
    }
  }
  return [...project.pending, ...derived]
}

/**
 * The name of a stage id in a project's own stage map.
 * @param project - parsed project.
 * @param id - stage id, as `currentStage` or a pending item's `stage` records it.
 * @returns the stage name, or `undefined` for an unknown id.
 */
export function stageNameIn(project: Project, id: string | undefined): string | undefined {
  return project.stages.find(stage => stage.id === id)?.name
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
