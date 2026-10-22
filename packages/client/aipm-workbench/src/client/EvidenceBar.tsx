/**
 * Evidence composition of one document as a stacked bar: `mini` sits at the end
 * of a deliverable row in the project tab, `full` sits under the editor toolbar
 * with a legend. Renders nothing for a document without evidence tags.
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { EVIDENCE_KINDS, totalEvidence } from './evidence.ts'
import type { EvidenceCounts } from './evidence.ts'
import type {} from './locales.ts'
import css from './evidence.module.css'

/** Bar props. */
export interface EvidenceBarProps extends PropsLocale<'aipmWorkbench'> {
  readonly counts: EvidenceCounts
  readonly variant: 'mini' | 'full'
}

/**
 * One-line summary of the counts, used as the bar's tooltip.
 * @param counts - per-kind counts.
 * @param t - namespace translator.
 * @returns localized summary.
 */
export function evidenceSummary(counts: EvidenceCounts, t: PropsLocale<'aipmWorkbench'>['t']): string {
  return t('evidence.summary', {
    hard: String(counts.hard), lead: String(counts.lead), conflict: String(counts.conflict), unverified: String(counts.unverified),
  })
}

/** The stacked evidence bar. */
export function EvidenceBar({ counts, variant, t }: EvidenceBarProps): ReactNode {
  const total = totalEvidence(counts)
  if (total === 0) return null
  const segments = EVIDENCE_KINDS.filter(kind => counts[kind] > 0).map(kind => (
    <span key={kind} className={css[`seg_${kind}`]} style={{ flexGrow: counts[kind] }} />
  ))
  if (variant === 'mini') {
    return <span className={`${css.root} ${css.mini}`} title={evidenceSummary(counts, t)} aria-label={evidenceSummary(counts, t)}>{segments}</span>
  }
  return (
    <div className={`${css.root} ${css.full}`}>
      <div className={css.fullBar} aria-hidden="true">{segments}</div>
      <div className={css.legend}>
        <span className={css.caption}>{t('evidence.caption')}</span>
        {EVIDENCE_KINDS.map(kind => (
          <span key={kind} className={css.item}>
            <span className={`${css.dot} ${css[`seg_${kind}`]}`} />
            {t(`evidence.${kind}`)} {counts[kind]}
          </span>
        ))}
        <span className={css.hint}>{t('evidence.hint')}</span>
      </div>
    </div>
  )
}
