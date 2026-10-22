/**
 * Evidence tags the studio's skills write into deliverables as 【标签】, with an
 * optional qualifier after `·` (【行为数据·单案】). Each tag is sorted into the
 * weight it can carry in a decision, per the evidence table in the
 * `project-initiation` skill. Bracketed words outside that table are not
 * evidence and are skipped.
 */

/** How much a tag can carry: a basis, a lead to check, a conflict, or not yet evidence. */
export type EvidenceKind = 'hard' | 'lead' | 'conflict' | 'unverified'

/** Kinds in display order. */
export const EVIDENCE_KINDS: readonly EvidenceKind[] = ['hard', 'lead', 'conflict', 'unverified']

/** Tag name, spaces removed, to its kind. */
const TAG_KINDS: Readonly<Record<string, EvidenceKind>> = {
  用户原话: 'hard',
  行为数据: 'hard',
  实测: 'hard',
  公开资料: 'hard',
  业务方表达: 'lead',
  文档声称: 'lead',
  冲突: 'conflict',
  测算: 'unverified',
  模拟: 'unverified',
  AI推断: 'unverified',
}

const TAG = /【([^】\n]{1,40})】/gu

/** One tag's span inside a text and its kind. */
export interface EvidenceMark {
  readonly from: number
  readonly to: number
  readonly kind: EvidenceKind
}

/** Tag counts by kind. */
export type EvidenceCounts = Readonly<Record<EvidenceKind, number>>

/**
 * Sort a tag label into its kind.
 * @param label - text between 【 and 】.
 * @returns the kind, or undefined for a bracketed word that is not an evidence tag.
 */
export function classifyTag(label: string): EvidenceKind | undefined {
  const head = label.split(/[·・:：，,（(]/u)[0] ?? ''
  return TAG_KINDS[head.replace(/\s+/gu, '')]
}

/**
 * Find every evidence tag in a text.
 * @param text - Markdown or plain text.
 * @returns spans in text order, brackets included.
 */
export function findEvidence(text: string): EvidenceMark[] {
  const marks: EvidenceMark[] = []
  for (const match of text.matchAll(TAG)) {
    const kind = classifyTag(match[1] ?? '')
    if (kind !== undefined) marks.push({ from: match.index, to: match.index + match[0].length, kind })
  }
  return marks
}

/**
 * Count evidence tags by kind.
 * @param text - Markdown or plain text.
 * @returns a count for every kind, zero when absent.
 */
export function countEvidence(text: string): EvidenceCounts {
  const counts: Record<EvidenceKind, number> = { hard: 0, lead: 0, conflict: 0, unverified: 0 }
  for (const mark of findEvidence(text)) counts[mark.kind] += 1
  return counts
}

/**
 * Sum of all kinds.
 * @param counts - per-kind counts.
 * @returns total tags.
 */
export function totalEvidence(counts: EvidenceCounts): number {
  return EVIDENCE_KINDS.reduce((sum, kind) => sum + counts[kind], 0)
}
