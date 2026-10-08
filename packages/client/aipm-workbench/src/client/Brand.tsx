/** AIPM 工坊 brand occupants for the sidebar and conversation hero slots. */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import css from './workbench.module.css'

/** Props shared by every mark seat: a requested square edge and an optional host class. */
export interface MarkProps {
  readonly size: number
  readonly className?: string | undefined
}

/**
 * The studio mark: two stacked sheets and a spark on a rounded tile.
 * @param props - requested edge and host class.
 * @returns the mark as inline SVG.
 */
export function AipmMark({ size, className }: MarkProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#151a18" />
      <rect x="7" y="10" width="13" height="16" rx="2" fill="#2764f2" />
      <rect x="11" y="6" width="13" height="16" rx="2" fill="#fffef9" />
      <path d="M14 11h7M14 14h7M14 17h4" stroke="#151a18" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24 19.5l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2z" fill="#c8f04b" />
    </svg>
  )
}

/**
 * The studio name beside the expanded sidebar mark.
 * @param props - namespace-bound translate.
 * @returns the localized product name.
 */
export function AipmName({ t }: PropsLocale<'aipmWorkbench'>): ReactNode {
  return <span className={css.brandName}>{t('brand.name')}</span>
}
