/**
 * The project tab's build card: where a handed-off project's code stands in its
 * dev folder — build stage, last stop, and the latest evidence package's gate
 * table and verify.sh verdict — with a button that asks the hub about it.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { BuildView, GateMark } from './build.ts'
import type { StarterResult } from './HeroStages.tsx'
import type { BuildInfo } from './model.ts'
import type { AipmWorkbenchKey } from './locales.ts'
import css from './workbench.module.css'

/** Problems listed under the gate line before the rest is cut. */
const PROBLEM_LIMIT = 4

/** Build stage names in stage-number order, one bar segment each. */
const STAGE_KEYS = [
  'build.stage.0', 'build.stage.1', 'build.stage.2', 'build.stage.3', 'build.stage.4', 'build.stage.5',
] as const satisfies readonly AipmWorkbenchKey[]

/** The card's props. */
export interface BuildCardProps extends PropsLocale<'aipmWorkbench'> {
  readonly build: BuildInfo
  /** The dev folder read; `undefined` until the first read settles. */
  readonly view: BuildView | undefined
  readonly projectName: string
  /** Put text into the composer. */
  readonly onAsk: (text: string) => StarterResult
  /** Open the status file in the document tab. */
  readonly onOpenStatus: () => void
}

function folderName(path: string): string {
  return path.replace(/[/\\]+$/u, '').split(/[/\\]/u).pop() ?? path
}

function count(view: BuildView, mark: GateMark): number {
  return view.gate?.filter(row => row.mark === mark).length ?? 0
}

/**
 * Render the build card.
 * @param props - the build entry, its read, and the composer and file actions.
 * @returns the card section.
 */
export function BuildCard({ build, view, projectName, onAsk, onOpenStatus, t }: BuildCardProps): ReactNode {
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const status = view?.status
  const ask = (): void => {
    const result = onAsk(t('build.starter', { project: projectName }))
    setNotice(result === 'sent' ? t('pending.sent') : t(result === 'busy' ? 'hero.busy' : 'hero.unavailable'))
  }
  const problems = view === undefined
    ? []
    : [
      ...(view.verify?.failures ?? []).map(item => t('build.problem.verify', { item })),
      ...(view.gate ?? []).filter(row => row.mark === 'no').map(row => t('build.problem.no', { item: row.item })),
      ...(view.gate ?? []).filter(row => row.mark === 'pending').map(row => t('build.problem.pending', { item: row.item })),
    ]

  return (
    <section className={css.build} aria-label={t('build.title')}>
      <div className={css.buildHead}>
        <span className={css.buildTitle}>{t('build.title')}</span>
        {build.tool !== undefined && <span className={css.buildTool}>{build.tool}</span>}
        {status?.updated !== undefined && <span className={css.buildUpdated}>{t('project.updated', { time: status.updated })}</span>}
      </div>

      {view === undefined && <div className={css.buildMuted}>{t('build.loading')}</div>}

      {view?.error !== undefined && (
        <div className={css.buildMissing}>
          <div>{t('build.unreadable', { path: build.path })}</div>
          <div className={css.buildMuted}>{t('build.unreadableHint')}</div>
          {build.stage !== undefined && (
            <div className={css.buildMuted}>{t('build.cached', { time: build.checked ?? '', stage: build.stage })}</div>
          )}
        </div>
      )}

      {status !== undefined && (
        <>
          <div className={css.pipeline} aria-hidden="true">
            {STAGE_KEYS.map((key, index) => {
              const current = status.stageIndex
              const state = current === undefined ? '' : index < current ? css.pipe_done : index === current ? `${css.pipe_in_progress} ${css.pipeCurrent}` : ''
              return <span key={key} className={`${css.pipeSeg} ${state ?? ''}`} title={t(key)} />
            })}
          </div>
          <div className={css.buildStage}>{t('build.current', { stage: status.stage ?? t('build.unknownStage') })}</div>
          {status.stoppedAt !== undefined && <div className={css.buildStopped}>{t('build.stopped', { text: status.stoppedAt })}</div>}
          <div className={css.buildGate}>
            {status.evidenceDir === undefined
              ? <span className={css.buildMuted}>{t('build.noEvidence')}</span>
              : <span className={css.buildMuted}>{t('build.evidence', { name: folderName(status.evidenceDir) })}</span>}
            {view?.verify !== undefined && (
              <span className={`${css.buildChip} ${view.verify.passed ? css.buildChip_ok : css.buildChip_no}`}>
                {view.verify.passed ? t('build.verifyPass') : t('build.verifyFail', { count: String(view.verify.failures.length) })}
              </span>
            )}
            {view?.gate !== undefined && count(view, 'no') > 0 && (
              <span className={`${css.buildChip} ${css.buildChip_no}`}>{t('build.gateNo', { count: String(count(view, 'no')) })}</span>
            )}
            {view?.gate !== undefined && count(view, 'pending') > 0 && (
              <span className={`${css.buildChip} ${css.buildChip_pending}`}>{t('build.gatePending', { count: String(count(view, 'pending')) })}</span>
            )}
            {view?.gate !== undefined && count(view, 'no') === 0 && count(view, 'pending') === 0 && (
              <span className={`${css.buildChip} ${css.buildChip_ok}`}>{t('build.gateClear')}</span>
            )}
          </div>
          {problems.length > 0 && (
            <ul className={css.buildProblems}>
              {problems.slice(0, PROBLEM_LIMIT).map(problem => <li key={problem}>{problem}</li>)}
              {problems.length > PROBLEM_LIMIT && <li className={css.buildMuted}>{t('build.moreProblems', { count: String(problems.length - PROBLEM_LIMIT) })}</li>}
            </ul>
          )}
        </>
      )}

      <div className={css.buildActions}>
        <button type="button" className={css.pendingAct} title={t('build.askHint')} onClick={ask}>{t('build.ask')}</button>
        {status !== undefined && (
          <button type="button" className={css.pendingAct} title={build.path} onClick={onOpenStatus}>{t('build.openStatus')}</button>
        )}
        {notice !== undefined && <span className={css.pendingNotice}>{notice}</span>}
      </div>
    </section>
  )
}
