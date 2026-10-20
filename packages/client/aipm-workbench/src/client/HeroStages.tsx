/**
 * The blank-session Hero footer: the studio's six stages as starter cards.
 * Clicking a card puts that stage's hub command into the composer, so a new
 * user sees what the studio does and can start any stage in one step.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { STAGES } from './model.ts'
import type {} from './locales.ts'
import css from './hero.module.css'

/** Outcome of writing a starter into the composer. */
export type StarterResult = 'sent' | 'busy' | 'unavailable'

/** Browser services the Hero footer needs. */
export interface HeroInjected {
  /** Put `text` into the Session's composer draft and focus it. */
  start: (sessionId: SessionId, text: string) => StarterResult
}

/** The footer's composed props. */
export type HeroStagesProps =
  & PropsRuntime<'conversation.hero.footer'>
  & HeroInjected
  & PropsLocale<'aipmWorkbench'>

/** The six-stage starter grid under the Hero composer. */
export function HeroStages({ sessionId, disabled, start, t }: HeroStagesProps): ReactNode {
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const ready = sessionId !== undefined && !disabled

  return (
    <section className={css.hero} aria-label={t('hero.label')}>
      <div className={css.head}>
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
              onClick={() => {
                if (sessionId === undefined) return
                const result = start(sessionId, stage.starter)
                setNotice(result === 'sent' ? undefined : t(result === 'busy' ? 'hero.busy' : 'hero.unavailable'))
              }}
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
