/**
 * The blank-session Hero footer. Projects already in the workspace come first,
 * each with what waits for the user, so a returning user resumes work instead
 * of starting a stage. Below them the six stages are starter cards: clicking
 * one puts that stage's hub command into the composer.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { discoverProjects } from './files.ts'
import type { ProjectFiles } from './files.ts'
import { PENDING_GROUPS, STAGES, openItems, pendingGroupOf } from './model.ts'
import type { PendingGroup, Project } from './model.ts'
import type {} from './locales.ts'
import css from './hero.module.css'

/** Outcome of writing a starter into the composer. */
export type StarterResult = 'sent' | 'busy' | 'unavailable'

/** Browser services the Hero footer needs. */
export interface HeroInjected extends ProjectFiles {
  /** Put `text` into the Session's composer draft and focus it. */
  start: (sessionId: SessionId, text: string) => StarterResult
  /** Open the project tab in the right Sidebar of the on-screen Session. */
  openProjects: () => void
}

/** The footer's composed props. */
export type HeroStagesProps =
  & PropsRuntime<'conversation.hero.footer'>
  & HeroInjected
  & PropsLocale<'aipmWorkbench'>

/** Projects listed above the stage cards. */
const RECENT_PROJECTS = 3

/** Open items of a project counted per group. */
function pendingCounts(project: Project): Record<PendingGroup, number> {
  const counts: Record<PendingGroup, number> = { decision: 0, blocked: 0, verify: 0 }
  for (const item of openItems(project)) counts[pendingGroupOf(item.kind)] += 1
  return counts
}

/** The Hero footer: recent projects with their open items, then the six-stage starter grid. */
export function HeroStages({ sessionId, disabled, start, openProjects, readText, list, useSessions, t }: HeroStagesProps): ReactNode {
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [projects, setProjects] = useState<readonly Project[]>([])
  const cwd = useSessions(sessions => sessionId === undefined ? undefined : sessions.byId[sessionId]?.cwd)
  const ready = sessionId !== undefined && !disabled

  useEffect(() => {
    if (sessionId === undefined || cwd === undefined) {
      setProjects([])
      return
    }
    const controller = new AbortController()
    void discoverProjects({ readText, list }, sessionId, cwd, controller.signal).then((found) => {
      if (controller.signal.aborted) return
      setProjects(found.flatMap(entry => entry.project === undefined ? [] : [entry.project]).slice(0, RECENT_PROJECTS))
    })
    return () => { controller.abort() }
  }, [sessionId, cwd, readText, list])

  const put = (text: string): void => {
    if (sessionId === undefined) return
    const result = start(sessionId, text)
    setNotice(result === 'sent' ? undefined : t(result === 'busy' ? 'hero.busy' : 'hero.unavailable'))
  }

  return (
    <section className={css.hero} aria-label={t('hero.label')}>
      {projects.length > 0 && (
        <>
          <div className={css.head}>
            <span className={css.kicker}>{t('hero.continue')}</span>
            <span className={css.hint}>{t('hero.continueHint')}</span>
            <button type="button" className={css.link} onClick={openProjects}>{t('hero.openProjects')}</button>
          </div>
          <ul className={css.projects}>
            {projects.map((project) => {
              const counts = pendingCounts(project)
              const stage = STAGES.find(definition => definition.id === project.currentStage)
              return (
                <li key={project.name}>
                  <button
                    type="button"
                    className={css.project}
                    disabled={!ready}
                    onClick={() => { put(t('hero.continueStarter', { project: project.name })) }}
                  >
                    <span className={css.projectName}>{project.name}</span>
                    {stage !== undefined && <span className={css.projectStage}>{t('summary.current', { stage: stage.name })}</span>}
                    <span className={css.counts}>
                      {PENDING_GROUPS.filter(group => counts[group] > 0).map(group => (
                        <span key={group} className={`${css.count} ${css[`count_${group}`] ?? ''}`}>
                          {t(`hero.count.${group}`, { count: String(counts[group]) })}
                        </span>
                      ))}
                      {PENDING_GROUPS.every(group => counts[group] === 0) && <span className={css.count}>{t('hero.count.none')}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className={`${css.head} ${projects.length > 0 ? css.headSpaced : ''}`}>
        <span className={css.kicker}>{t('hero.kicker')}</span>
        <span className={css.hint}>{notice ?? (ready ? t('hero.hint') : t('hero.needWorkspace'))}</span>
      </div>
      <ol className={css.grid}>
        {STAGES.map((stage, index) => (
          <li key={stage.id}>
            <button
              type="button"
              className={css.card}
              disabled={!ready}
              title={stage.starter}
              onClick={() => { put(stage.starter) }}
            >
              <span className={css.top}>
                <span className={css.num}>{String(index + 1).padStart(2, '0')}</span>
                <span className={css.name}>{stage.name}</span>
              </span>
              <span className={css.output}>{stage.output}</span>
              <span className={css.skill}>{stage.skills[0]}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
