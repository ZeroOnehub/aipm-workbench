/**
 * Browser half of AIPM 工坊: the brand occupants for the sidebar and the
 * conversation hero, the Hero footer with recent projects, the idea canvas
 * entry, and stage starters, the `aipm-project` right-Sidebar tab type, the
 * `aipm-markdown-editor` tab type that opens workspace `.md` files for editing,
 * and the `aipm-canvas` tab type that opens workspace `.canvas` files.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { fileAddressFor, fileMediaUrl, parseFileAddress, pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import { AipmMark, AipmName } from './Brand.tsx'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CanvasBody } from './canvas/CanvasBody.tsx'
import type { CanvasInjected } from './canvas/face.ts'
import { NEW_CANVAS_JSON, WORKSPACE_CANVAS, resolveIn } from './canvas/model.ts'
import type { LoadedDocument, MarkdownEditorInjected } from './editor/face.ts'
import { MarkdownEditorBody } from './editor/MarkdownEditorBody.tsx'
import { projectFiles } from './files.ts'
import type { ProjectFiles } from './files.ts'
import { HeroStages } from './HeroStages.tsx'
import type { HeroInjected, StarterResult } from './HeroStages.tsx'
import { en, zh } from './locales.ts'
import { ProjectBody } from './ProjectBody.tsx'
import type { ProjectActions } from './ProjectBody.tsx'
import { ProjectTitle } from './ProjectTitle.tsx'

export type { AipmWorkbenchKey } from './locales.ts'

/** This package's copy namespace. */
const NS = 'aipmWorkbench'

/** The tab implementation's identity, and the key its body and title register under. */
const PROJECT_ID = '@deepseek-ai/dsh-client-aipm-workbench'

/** The Markdown editor's identity, and the key its body registers under. */
const EDITOR_ID = '@deepseek-ai/dsh-client-aipm-workbench/markdown-editor'

/** The idea canvas's identity, and the key its body registers under. */
const CANVAS_ID = '@deepseek-ai/dsh-client-aipm-workbench/canvas'

/** Required browser services. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'sessions']

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

  const remote = ctx.remote
  const sessions = ctx.sessions

  /** Append `text` to a Session's composer draft and focus it. */
  const writeComposer = (sessionId: SessionId, text: string): StarterResult => {
    const actx = sessions.scope(sessionId)
    const input = actx?.get('conversation')?.input.for(actx)
    if (input === undefined) return 'unavailable'
    const state = input.state.getSnapshot()
    if (state.phase !== 'plain') return 'busy'
    input.setDraft(state.draft.trim() === '' ? text : `${state.draft.replace(/\s+$/, '')}\n${text}`)
    input.focus()
    return 'sent'
  }

  const files = projectFiles(ctx.remote)

  /** Write an empty canvas unless the file already exists; returns an error message on failure. */
  const ensureCanvas = async (sessionId: SessionId, path: string): Promise<string | undefined> => {
    const result = await remote.workspaceFiles.write(sessionId, path, NEW_CANVAS_JSON, {}, new AbortController().signal)
    return result.ok || result.error.code === 'workspace-file/exists' ? undefined : result.error.message
  }

  const project: ProjectFiles & ProjectActions = { ...files, ask: writeComposer, ensureCanvas }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: PROJECT_ID, locale: NS, inject: () => project },
    ProjectBody,
  )), 'aipm-workbench: project tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: PROJECT_ID },
    ProjectTitle,
  )), 'aipm-workbench: project tab title')

  // Markdown files open in the editor: the `extension` band outranks the builtin preview.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: EDITOR_ID,
    kind: 'aipm-markdown-editor',
    priority: 'extension',
    patterns: ['*.md', '*.markdown'],
    keepMounted: true,
    canOpen: address => parseFileAddress(address)?.scope === 'session',
    title: address => pathPartsOf(parseFileAddress(address)?.path ?? address).name,
  }), 'aipm-workbench: markdown editor type')

  // Canvas files open on the idea canvas in the same `extension` band.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: CANVAS_ID,
    kind: 'aipm-canvas',
    priority: 'extension',
    patterns: ['*.canvas'],
    keepMounted: true,
    canOpen: address => parseFileAddress(address)?.scope === 'session',
    title: address => pathPartsOf(parseFileAddress(address)?.path ?? address).name,
  }), 'aipm-workbench: canvas type')

  // The blank-session Hero lists recent projects, the idea canvas entry, then the six stages as starter cards.
  const hero: HeroInjected = {
    ...files,
    start: writeComposer,
    openProjects: () => { ctx.sidebarRight.openTab('aipm-project') },
    openCanvas: async (sessionId, cwd) => {
      const path = resolveIn(cwd, WORKSPACE_CANVAS)
      const error = await ensureCanvas(sessionId, path)
      if (error === undefined) ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, path))
      return error
    },
  }
  ctx.effect(() => ctx.slots.inject('conversation.hero.footer', () => ctx.slots.register(
    { name: 'conversation.hero.footer', locale: NS, inject: () => hero },
    HeroStages,
  )), 'aipm-workbench: hero stages')

  /** Read a whole text file with the stat its first page was read under. */
  const loadDocument = async (sessionId: SessionId, path: string, signal: AbortSignal): Promise<RemoteResult<LoadedDocument>> => {
    const first = await remote.workspaceFiles.read(sessionId, path, {}, signal)
    if (!first.ok) return first
    const text = await files.readText(sessionId, path, signal)
    if (!text.ok) return text
    const { absolutePath, version, bytes } = first.value
    return { ok: true, value: { absolutePath, version, ...bytes === undefined ? {} : { bytes }, text: text.value } }
  }

  const editor: MarkdownEditorInjected = {
    load: loadDocument,
    stat: (sessionId, path, signal) => remote.workspaceFiles.stat(sessionId, path, signal),
    save: (sessionId, path, content, expectedVersion, signal) =>
      remote.workspaceFiles.write(sessionId, path, content, { expectedVersion }, signal),
    saveImage: (sessionId, path, name, base64, signal) => remote.workspaceFiles.writeAsset(sessionId, path, name, base64, signal),
    sendToAgent: writeComposer,
    mediaUrl: absolutePath => fileMediaUrl(document.baseURI, absolutePath),
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: EDITOR_ID, locale: NS, inject: () => editor },
    MarkdownEditorBody,
  )), 'aipm-workbench: markdown editor body')

  const canvas: CanvasInjected = {
    load: loadDocument,
    stat: (sessionId, path, signal) => remote.workspaceFiles.stat(sessionId, path, signal),
    save: (sessionId, path, content, expectedVersion, signal) =>
      remote.workspaceFiles.write(sessionId, path, content, { expectedVersion }, signal),
    create: (sessionId, path, content, signal) => remote.workspaceFiles.write(sessionId, path, content, {}, signal),
    saveImage: (sessionId, path, name, base64, signal) => remote.workspaceFiles.writeAsset(sessionId, path, name, base64, signal),
    readText: files.readText,
    sendToAgent: writeComposer,
    mediaUrl: absolutePath => fileMediaUrl(document.baseURI, absolutePath),
    openExternal: (url) => { window.open(url, '_blank', 'noopener,noreferrer') },
  }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: CANVAS_ID, locale: NS, inject: () => canvas },
    CanvasBody,
  )), 'aipm-workbench: canvas body')
}
