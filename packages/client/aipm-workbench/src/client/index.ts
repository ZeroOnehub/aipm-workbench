/**
 * Browser half of AIPM 工坊: the brand occupants for the sidebar and the
 * conversation hero, and the `aipm-project` right-Sidebar tab type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { AipmMark, AipmName } from './Brand.tsx'
import { projectFiles } from './files.ts'
import { en, zh } from './locales.ts'
import { ProjectBody } from './ProjectBody.tsx'
import { ProjectTitle } from './ProjectTitle.tsx'

export type { AipmWorkbenchKey } from './locales.ts'

/** This package's copy namespace. */
const NS = 'aipmWorkbench'

/** The tab implementation's identity, and the key its body and title register under. */
const PROJECT_ID = '@deepseek-ai/dsh-client-aipm-workbench'

/** Required browser services. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register copy, the brand occupants, and the project tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'aipm-workbench: dictionaries')

  ctx.effect(() => ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({ name: 'sidebar.brand.mark' }, AipmMark)), 'aipm-workbench: sidebar mark')
  ctx.effect(() => ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({ name: 'sidebar.brand.name', locale: NS }, AipmName)), 'aipm-workbench: sidebar name')
  ctx.effect(() => ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, AipmMark)), 'aipm-workbench: hero mark')

  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PROJECT_ID,
    kind: 'aipm-project',
    priority: 'builtin',
    title: () => t('tab.title'),
    guide: [{ id: 'project', order: 1, title: () => t('guide.title'), description: () => t('guide.description') }],
  }), 'aipm-workbench: project tab type')

  const files = projectFiles(ctx.remote)
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: PROJECT_ID, locale: NS, inject: () => files },
    ProjectBody,
  )), 'aipm-workbench: project tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: PROJECT_ID },
    ProjectTitle,
  )), 'aipm-workbench: project tab title')
}
