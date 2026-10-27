/**
 * A handed-off project's progress in its dev folder, as the build card reads it.
 *
 * The coding agent keeps `docs/项目状态.md` and one evidence folder per build
 * stage (`docs/evidence/<阶段名>/` holding `是否表.md` and `verify-输出.txt`);
 * the line and table formats are fixed by the dev folder's rule card
 * (`AGENTS.md` sections 4, 5 and 8, written by the `build-launch` skill).
 * The workspace read endpoint reads absolute paths outside the Session's
 * workspace, so the card reads the files by their fixed names without listing
 * directories.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProjectFiles } from './files.ts'
import { joinPath } from './model.ts'

/** Number of build stages: 0 PRD check through 5 wrap-up. */
export const BUILD_STAGE_COUNT = 6

/** The current-stage lines of `docs/项目状态.md`. */
export interface BuildStatus {
  /** Text after `- 阶段：`, e.g. `2 后端 MVP（第 1 阶段）`. */
  readonly stage?: string | undefined
  /** Leading stage number of `stage`, 0–5. */
  readonly stageIndex?: number | undefined
  readonly updated?: string | undefined
  readonly stoppedAt?: string | undefined
  /** Latest evidence folder relative to the product folder, without a trailing slash. */
  readonly evidenceDir?: string | undefined
}

/** One gate-table answer: yes, no, awaiting verification, not applicable, or a pointer to the verify output. */
export type GateMark = 'yes' | 'no' | 'pending' | 'na' | 'see'

/** One row of `是否表.md`. */
export interface GateRow {
  readonly no: number
  readonly item: string
  readonly mark: GateMark
}

/** The summary lines of `verify-输出.txt`. */
export interface VerifySummary {
  /** Whether the overall verdict line reports no failing or unconfigured item. */
  readonly passed: boolean
  /** Labels of the items reported as failing or unconfigured. */
  readonly failures: readonly string[]
}

/** What the card shows: the status file, or why it could not be read, plus the latest evidence. */
export interface BuildView {
  readonly status?: BuildStatus | undefined
  /** Read failure of the status file. */
  readonly error?: string | undefined
  readonly gate?: readonly GateRow[] | undefined
  readonly verify?: VerifySummary | undefined
}

const EVIDENCE_DIR = /docs\/evidence\/[^\s/（(，,「」<>]+/gu

function line(text: string, label: string): string | undefined {
  const match = new RegExp(`^\\s*-\\s*${label}\\s*[：:]\\s*(.+?)\\s*$`, 'mu').exec(text)
  return match?.[1]
}

/**
 * Parse the current-stage lines of `docs/项目状态.md`.
 * @param text - file contents.
 * @returns the fields found; an evidence line saying `无` or naming no folder falls back to the last evidence folder the file mentions.
 */
export function parseBuildStatus(text: string): BuildStatus {
  const stage = line(text, '阶段')
  const digit = stage === undefined ? undefined : /^(\d)/u.exec(stage)?.[1]
  const index = digit === undefined ? undefined : Number(digit)
  const named = line(text, '最新证据包')?.match(EVIDENCE_DIR)?.[0]
  const mentioned = text.match(EVIDENCE_DIR)
  const evidenceDir = named ?? mentioned?.[mentioned.length - 1]
  return {
    stage,
    stageIndex: index !== undefined && index < BUILD_STAGE_COUNT ? index : undefined,
    updated: line(text, '最近更新'),
    stoppedAt: line(text, '上次停在'),
    evidenceDir,
  }
}

function markOf(answer: string): GateMark {
  const value = answer.trim()
  if (value.startsWith('否')) return 'no'
  if (value.startsWith('待验')) return 'pending'
  if (value.startsWith('是')) return 'yes'
  if (/^(?:N\/A|不适用)/iu.test(value)) return 'na'
  return 'see'
}

/**
 * Parse the rows of a stage gate table (`是否表.md`).
 * @param text - file contents.
 * @returns rows whose first cell is a row number, in file order; the answer is the last cell.
 */
export function parseGate(text: string): GateRow[] {
  const rows: GateRow[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trimStart().startsWith('|')) continue
    const cells = raw.trim().replace(/^\||\|$/gu, '').split('|').map(cell => cell.trim())
    const no = /^\d+$/u.test(cells[0] ?? '') ? Number(cells[0]) : undefined
    if (no === undefined || cells.length < 3) continue
    rows.push({ no, item: cells[1] ?? '', mark: markOf(cells[cells.length - 1] ?? '') })
  }
  return rows
}

/**
 * Parse the summary of a `verify.sh` output.
 * @param text - file contents.
 * @returns the verdict, or `undefined` when the output has no verdict line.
 */
export function parseVerify(text: string): VerifySummary | undefined {
  const verdict = /^总判定[：:](.*)$/mu.exec(text)?.[1]
  if (verdict === undefined) return undefined
  const failures = [...text.matchAll(/^是否表第\s*\d+\s*项\s+(.+?)[：:]\s*(不通过|未配置)/gmu)].map(match => match[1]?.trim() ?? '')
  return { passed: failures.length === 0 && !/不通过|未配置/u.test(verdict), failures }
}

async function readOptional(
  files: ProjectFiles, sessionId: SessionId, path: string, signal: AbortSignal,
): Promise<string | undefined> {
  const result: RemoteResult<string> = await files.readText(sessionId, path, signal)
  return result.ok ? result.value : undefined
}

/**
 * Path of a product folder's status file.
 * @param productPath - the `build.path` product folder.
 * @returns the absolute path of `docs/项目状态.md`.
 */
export function statusFilePath(productPath: string): string {
  return joinPath(productPath, 'docs', '项目状态.md')
}

/**
 * Read a handed-off project's status file and latest evidence.
 * @param files - the injected reads.
 * @param sessionId - authorizing Session.
 * @param productPath - the `build.path` product folder.
 * @param signal - caller lifetime.
 * @returns the view; `error` carries the status file's read failure, and missing evidence files leave their fields unset.
 */
export async function readBuild(
  files: ProjectFiles, sessionId: SessionId, productPath: string, signal: AbortSignal,
): Promise<BuildView> {
  const statusFile = await files.readText(sessionId, statusFilePath(productPath), signal)
  if (!statusFile.ok) return { error: statusFile.error.message }
  const status = parseBuildStatus(statusFile.value)
  if (status.evidenceDir === undefined) return { status }
  const dir = joinPath(productPath, status.evidenceDir)
  const [gate, verify] = await Promise.all([
    readOptional(files, sessionId, joinPath(dir, '是否表.md'), signal),
    readOptional(files, sessionId, joinPath(dir, 'verify-输出.txt'), signal),
  ])
  return {
    status,
    gate: gate === undefined ? undefined : parseGate(gate),
    verify: verify === undefined ? undefined : parseVerify(verify),
  }
}
