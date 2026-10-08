/** The project tab's chip title: the studio mark before the tab's label. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AipmMark } from './Brand.tsx'
import css from './workbench.module.css'

/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the mark followed by the tab's title text.
 */
export function ProjectTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <AipmMark size={16} className={css.titleIcon} />
      {tab.title}
    </>
  )
}
