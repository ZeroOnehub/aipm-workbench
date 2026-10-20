/** AIPM 工坊 brand occupants for the sidebar and conversation hero slots. */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './locales.ts'
import { brandImage } from './brand-image.ts'
import css from './workbench.module.css'

/** Props shared by every mark seat: a requested square edge and an optional host class. */
export interface MarkProps {
  readonly size: number
  readonly className?: string | undefined
}

/**
 * The Shijie mark shares the desktop icon's staircase and spark artwork.
 * @param props - requested edge and host class.
 * @returns a decorative image beside the localized brand name.
 */
export function AipmMark({ size, className }: MarkProps): ReactNode {
  return (
    <img src={brandImage} width={size} height={size} className={className} alt="" aria-hidden="true" draggable={false} />
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
