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

/** Six steps from idea to launch, blue to teal, left to right. */
const STEPS = [
  { x: 6.2, h: 4, fill: '#2764f2' },
  { x: 9.6, h: 6.2, fill: '#1f71de' },
  { x: 13, h: 8.4, fill: '#177eca' },
  { x: 16.4, h: 10.6, fill: '#108ab7' },
  { x: 19.8, h: 12.8, fill: '#0897a3' },
  { x: 23.2, h: 15, fill: '#00a48f' },
] as const

/**
 * The studio mark: six rising steps on an ink tile, with a spark over the last
 * step — the six stages from an idea to a launched product.
 * @param props - requested edge and host class.
 * @returns the mark as inline SVG.
 */
export function AipmMark({ size, className }: MarkProps): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#151a18" />
      {STEPS.map(step => (
        <rect key={step.x} x={step.x} y={25 - step.h} width="2.6" height={step.h} rx="1.1" fill={step.fill} />
      ))}
      <path d="M24.5 2.6l0.95 2.05 2.05 0.95-2.05 0.95-0.95 2.05-0.95-2.05-2.05-0.95 2.05-0.95z" fill="#c8f04b" />
    </svg>
  )
}

/**
 * The studio name beside the expanded sidebar mark, with its one-line role.
 * @param props - namespace-bound translate.
 * @returns the localized product name and subtitle.
 */
export function AipmName({ t }: PropsLocale<'aipmWorkbench'>): ReactNode {
  return (
    <span className={css.brandName}>
      {t('brand.name')}
      <span className={css.brandSub}>{t('brand.sub')}</span>
    </span>
  )
}
