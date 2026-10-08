/**
 * The Markdown editor tab: a WYSIWYG surface over one workspace `.md` file.
 *
 * Saving is explicit (⌘S or the button) and version-guarded, so an edit the
 * agent made in the meantime is never overwritten silently. Unsaved text is
 * mirrored to local storage, so closing the tab or the app loses nothing; the
 * next open restores it. While the body is mounted it polls the file's version
 * and reloads a clean document when it changes on disk.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isAbsoluteWorkspacePath, parseFileAddress, pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createEditor, editorStyles } from './crepe-setup.ts'
import type { EditorHandle } from './editor-types.ts'
import { base64Of, imageNameFor, joinFrontMatter, quoteForAgent, readDraft, splitFrontMatter, writeDraft } from './document.ts'
import type { MarkdownEditorInjected } from './face.ts'
import type {} from '../locales.ts'
import css from './editor.module.css'

/** The body's composed props. */
export type MarkdownEditorBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & MarkdownEditorInjected
  & PropsLocale<'aipmWorkbench'>

/** Disk version poll while the tab is mounted. */
const POLL_MS = 3000

type Conflict = 'stale' | 'external' | undefined

interface Notice {
  readonly text: string
  readonly tone: 'info' | 'error'
  readonly action?: { readonly label: string; readonly run: () => void }
}

/** The Markdown editor body. */
export function MarkdownEditorBody(props: MarkdownEditorBodyProps): ReactNode {
  const { useTabInfo, load, stat, save, saveImage, sendToAgent, mediaUrl, t } = props
  const { tab } = useTabInfo()
  const { signal } = tab
  const address = tab.navigation.address
  const file = parseFileAddress(address)
  const sessionId = (file?.scope === 'session' ? file.sessionId : '') as SessionId
  const path = file?.path ?? ''
  const fileName = pathPartsOf(path).name

  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorHandle | undefined>(undefined)
  const baseRef = useRef({ version: '', frontMatter: '', baseline: '', absolutePath: '' })
  const savingRef = useRef(false)
  /** Bumped by every save, so a version poll that started before it is ignored. */
  const saveCountRef = useRef(0)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<Conflict>(undefined)
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [styles, setStyles] = useState('')
  const [generation, setGeneration] = useState(0)

  const flash = useCallback((text: string, tone: Notice['tone'] = 'info') => { setNotice({ text, tone }) }, [])
  useEffect(() => {
    if (notice === undefined || notice.action !== undefined) return
    const timer = setTimeout(() => { setNotice(undefined) }, 4000)
    return () => { clearTimeout(timer) }
  }, [notice])

  const reload = useCallback(() => {
    writeDraft(baseRef.current.absolutePath, undefined)
    setConflict(undefined)
    setGeneration(value => value + 1)
  }, [])

  // Load the file and (re)create the editor. `generation` forces a fresh load.
  useEffect(() => {
    if (file?.scope !== 'session') {
      setPhase('error')
      setError(address)
      return
    }
    let cancelled = false
    let created: EditorHandle | undefined
    setPhase('loading')
    void (async () => {
      const result = await load(sessionId, path, signal)
      if (cancelled) return
      if (!result.ok) {
        setPhase('error')
        setError(result.error.message)
        return
      }
      setStyles(editorStyles)
      const { frontMatter, body } = splitFrontMatter(result.value.text)
      const draft = readDraft(result.value.absolutePath)
      const restore = draft !== undefined && draft.markdown !== body
      baseRef.current = { version: result.value.version, frontMatter, baseline: body, absolutePath: result.value.absolutePath }
      const host = hostRef.current
      /* v8 ignore next -- the host div renders before this effect resolves. */
      if (host === null) return
      host.replaceChildren()
      const documentDirectory = pathPartsOf(result.value.absolutePath).directory
      created = await createEditor(host, restore ? draft.markdown : body, {
        placeholder: t('editor.placeholder'),
        onChange: (markdown) => {
          const changed = markdown !== baseRef.current.baseline
          setDirty(changed)
          writeDraft(baseRef.current.absolutePath, changed
            ? { baseVersion: baseRef.current.version, markdown, savedAt: Date.now() }
            : undefined)
        },
        uploadImage: async (image) => {
          const name = imageNameFor(image, new Date())
          if (name === undefined) throw new Error(t('editor.imageUnsupported'))
          const stored = await saveImage(sessionId, path, name, await base64Of(image), signal)
          if (!stored.ok) throw new Error(stored.error.message)
          flash(t('editor.imageSaved', { path: stored.value.relativePath }))
          return stored.value.relativePath
        },
        proxyUrl: (url) => {
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(url) && !/^[a-z]:[/\\]/iu.test(url)) return url
          let decoded = url
          try { decoded = decodeURIComponent(url) } catch (_error) { /* Malformed escape: use the raw destination. */ }
          const absolute = isAbsoluteWorkspacePath(decoded) ? decoded : documentDirectory + decoded
          return mediaUrl(absolute) ?? url
        },
        onUploadError: (cause) => { flash(t('editor.imageFailed', { message: cause instanceof Error ? cause.message : String(cause) }), 'error') },
      })
      if (cancelled) {
        void created.destroy()
        return
      }
      editorRef.current = created
      // Crepe normalizes Markdown on load; compare later edits against that form.
      if (!restore) baseRef.current = { ...baseRef.current, baseline: created.getMarkdown() }
      setDirty(restore)
      setPhase('ready')
      if (restore) {
        setNotice({ text: t('editor.draftRestored'), tone: 'info', action: { label: t('editor.draftDiscard'), run: () => { setNotice(undefined); reload() } } })
      }
    })()
    return () => {
      cancelled = true
      editorRef.current = undefined
      if (created !== undefined) void created.destroy()
    }
    // `file` is derived from `address`; the address and generation decide a reload.
  }, [address, generation]) // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = useCallback(async (overwrite: boolean) => {
    const editor = editorRef.current
    if (editor === undefined || savingRef.current) return
    savingRef.current = true
    saveCountRef.current += 1
    setSaving(true)
    try {
      let expected = baseRef.current.version
      if (overwrite) {
        const current = await stat(sessionId, path, signal)
        if (!current.ok) throw new Error(current.error.message)
        expected = current.value.version
      }
      const markdown = editor.getMarkdown()
      const result = await save(sessionId, path, joinFrontMatter(baseRef.current.frontMatter, markdown), expected, signal)
      if (!result.ok) {
        if (result.error.code === 'workspace-file/stale') setConflict('stale')
        else flash(t('editor.saveFailed', { message: result.error.message }), 'error')
        return
      }
      baseRef.current = { ...baseRef.current, version: result.value.version, baseline: markdown }
      writeDraft(baseRef.current.absolutePath, undefined)
      setDirty(editor.getMarkdown() !== markdown)
      setConflict(undefined)
      flash(t('editor.saved'))
    } catch (cause) {
      flash(t('editor.saveFailed', { message: cause instanceof Error ? cause.message : String(cause) }), 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [sessionId, path, signal, save, stat, flash, t])

  // Follow the file on disk: reload a clean document, flag a dirty one.
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = setInterval(() => {
      if (savingRef.current) return
      const startedAt = saveCountRef.current
      void stat(sessionId, path, signal).then((result) => {
        if (!result.ok || savingRef.current || saveCountRef.current !== startedAt) return
        if (result.value.version === baseRef.current.version) return
        if (dirty) setConflict(current => current ?? 'external')
        else {
          reload()
          flash(t('editor.reloaded'))
        }
      })
    }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [phase, dirty, sessionId, path, signal, stat, reload, flash, t])

  // ⌘S / Ctrl+S: a native capture listener on the editor root, because a docking
  // ancestor stops keydown propagation before React's root delegation sees it.
  useEffect(() => {
    const root = rootRef.current
    /* v8 ignore next -- the root div renders whenever this effect runs. */
    if (root === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        void doSave(false)
      }
    }
    root.addEventListener('keydown', onKeyDown, true)
    return () => { root.removeEventListener('keydown', onKeyDown, true) }
  }, [doSave, phase])

  const onSendToAgent = (): void => {
    const selection = window.getSelection()
    const host = hostRef.current
    const text = selection?.toString() ?? ''
    const inside = host !== null && selection !== null && selection.rangeCount > 0
      && host.contains(selection.getRangeAt(0).commonAncestorContainer)
    if (!inside || text.trim() === '') {
      flash(t('editor.sendToAgentHint'))
      return
    }
    const outcome = sendToAgent(sessionId, quoteForAgent(t('editor.quoteLead', { name: fileName, path }), text))
    if (outcome === 'sent') flash(t('editor.sentToAgent'))
    else flash(t('editor.agentBusy'), 'error')
  }

  if (phase === 'error') return <div className={css.status}>{t('editor.error', { message: error })}</div>

  return (
    <div ref={rootRef} className={css.root} data-aipm-editor>
      <div className={css.toolbar}>
        <span className={css.fileName} title={path}>{fileName}</span>
        <span className={dirty ? css.dirty : css.clean}>{saving ? t('editor.saving') : dirty ? t('editor.unsaved') : t('editor.saved')}</span>
        <span className={css.spacer} />
        <button type="button" className={css.button} onMouseDown={(event) => { event.preventDefault() }} onClick={onSendToAgent}>{t('editor.sendToAgent')}</button>
        <button type="button" className={css.primary} disabled={!dirty || saving} title={t('editor.shortcut')} onClick={() => { void doSave(false) }}>{t('editor.save')}</button>
      </div>
      {conflict !== undefined && (
        <div className={css.conflict} role="alert">
          <span>{conflict === 'stale' ? t('editor.conflictStale') : t('editor.conflictExternal')}</span>
          <span className={css.conflictActions}>
            <button type="button" className={css.button} onClick={reload}>{t('editor.useDisk')}</button>
            <button type="button" className={css.danger} onClick={() => { void doSave(true) }}>{t('editor.keepMine')}</button>
          </span>
        </div>
      )}
      {notice !== undefined && (
        <div className={notice.tone === 'error' ? css.noticeError : css.notice} role="status">
          <span>{notice.text}</span>
          {notice.action !== undefined && <button type="button" className={css.link} onClick={notice.action.run}>{notice.action.label}</button>}
        </div>
      )}
      {phase === 'loading' && <div className={css.status}>{t('editor.loading')}</div>}
      {styles !== '' && <style>{`@scope ([data-aipm-editor]) { ${styles} }`}</style>}
      <div ref={hostRef} className={css.surface} hidden={phase !== 'ready'} />
    </div>
  )
}
