/**
 * The idea canvas tab: an infinite board over one workspace `.canvas` file
 * (JSON Canvas). Notes, links, Markdown documents, images, and groups can be
 * placed anywhere, connected, colored, and moved; pasting a web address makes
 * a link card and pasting an image stores it beside the canvas.
 *
 * Changes save automatically after a short pause, guarded by the file version
 * so an edit the agent made in the meantime is never overwritten silently.
 * While mounted the body polls the file's version and reloads a clean canvas
 * when it changes on disk, which is how the `idea-canvas` skill's organizing
 * shows up. "AI organize" saves first, then puts the skill's starter into the
 * Session's composer.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { fileAddressFor, parseFileAddress, pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { base64Of, imageNameFor } from '../editor/document.ts'
import type { CanvasInjected } from './face.ts'
import {
  COLOR_PRESETS, DEFAULT_SIZE, MIN_SIZE, addNode, boundsOf, clampZoom, connect, contains, describeUrl,
  documentPathFor, drawOrder, edgePath, fileKind, fitView, groupMembers, moveNodes, newId, parseCanvas,
  pastedUrl, relativeTo, removeItems, resolveIn, serializeCanvas, updateNode,
} from './model.ts'
import type { Box, CanvasDoc, CanvasNode, CanvasNodeType, Point } from './model.ts'
import type {} from '../locales.ts'
import css from './canvas.module.css'

/** The body's composed props. */
export type CanvasBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & CanvasInjected
  & PropsLocale<'aipmWorkbench'>

/** Pause after the last change before saving. */
const SAVE_DELAY_MS = 800
/** Disk version poll while the tab is mounted. */
const POLL_MS = 3000
/** Document node preview refresh. */
const PREVIEW_MS = 6000
/** Characters of a Markdown file shown on its node. */
const PREVIEW_CHARS = 600
/** Undo steps kept. */
const HISTORY_LIMIT = 50
/** Screen pixels a press must travel before it counts as a drag. */
const DRAG_SLOP = 3
/** Canvas units kept free around a node placed from the toolbar. */
const PLACE_GAP = 16

interface View { readonly x: number; readonly y: number; readonly zoom: number }

type Gesture =
  | { readonly kind: 'pan'; readonly startX: number; readonly startY: number; readonly origin: View }
  | { readonly kind: 'move'; readonly startX: number; readonly startY: number; readonly ids: ReadonlySet<string>; readonly base: CanvasDoc; moved: boolean }
  | { readonly kind: 'resize'; readonly startX: number; readonly startY: number; readonly node: CanvasNode; readonly base: CanvasDoc }
  | { readonly kind: 'connect'; readonly from: string }

interface Editing { readonly id: string; readonly field: 'text' | 'label'; readonly value: string; readonly fresh: boolean }

interface Notice { readonly text: string; readonly tone: 'info' | 'error' }

type Conflict = 'stale' | 'external' | undefined

const HEX = /^#[0-9a-f]{6}$/iu

/** CSS custom property carrying a node's color. */
function colorStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined
  const value = (COLOR_PRESETS as readonly string[]).includes(color) ? `var(--canvas-c${color})` : HEX.test(color) ? color : undefined
  return value === undefined ? undefined : { ['--node-color']: value } as CSSProperties
}

/** A note's Markdown, lightly formatted: headings and bullets, text kept verbatim. */
function NoteText({ text }: { readonly text: string }): ReactNode {
  return (
    <>
      {text.split('\n').map((line, index) => {
        const heading = /^#{1,6}\s+/u.exec(line)
        if (heading !== null) return <div key={index} className={css.noteHeading}>{line.slice(heading[0].length)}</div>
        const bullet = /^\s*[-*]\s+/u.exec(line)
        if (bullet !== null) return <div key={index} className={css.noteBullet}>{line.slice(bullet[0].length)}</div>
        return <div key={index} className={line.trim() === '' ? css.noteBlank : undefined}>{line}</div>
      })}
    </>
  )
}

/** The canvas tab body. */
export function CanvasBody(props: CanvasBodyProps): ReactNode {
  const { useTabInfo, useSessions, load, stat, save, create, saveImage, readText, sendToAgent, mediaUrl, openExternal, t } = props
  const { tab } = useTabInfo()
  const { signal } = tab
  const address = tab.navigation.address
  const file = parseFileAddress(address)
  const sessionId = (file?.scope === 'session' ? file.sessionId : '') as SessionId
  const path = file?.path ?? ''
  const fileName = pathPartsOf(path).name
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const markerId = useId()

  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<CanvasDoc>({ nodes: [], edges: [] })
  const viewRef = useRef<View>({ x: 0, y: 0, zoom: 1 })
  const versionRef = useRef('')
  const savedTextRef = useRef('')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const saveCountRef = useRef(0)
  const historyRef = useRef<CanvasDoc[]>([])
  const futureRef = useRef<CanvasDoc[]>([])
  const gestureRef = useRef<Gesture | undefined>(undefined)
  const placedRef = useRef(0)
  const editingRef = useRef<Editing | undefined>(undefined)

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'invalid'>('loading')
  const [error, setError] = useState('')
  const [doc, setDoc] = useState<CanvasDoc>({ nodes: [], edges: [] })
  const [view, setViewState] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [selectedEdge, setSelectedEdge] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState<Editing | undefined>(undefined)
  const [linkDraft, setLinkDraft] = useState<string | undefined>(undefined)
  const [docDraft, setDocDraft] = useState<string | undefined>(undefined)
  const [connectTo, setConnectTo] = useState<Point | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<Conflict>(undefined)
  const [notice, setNotice] = useState<Notice | undefined>(undefined)
  const [previews, setPreviews] = useState<Readonly<Record<string, string>>>({})
  const [previewTick, setPreviewTick] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [absolutePath, setAbsolutePath] = useState('')

  const canvasPath = absolutePath === '' ? path : absolutePath
  const root = cwd ?? pathPartsOf(canvasPath).directory.replace(/[/\\]+$/u, '')
  const absoluteOf = useCallback((relative: string): string => relative.startsWith('/') ? relative : resolveIn(root, relative), [root])

  const flash = useCallback((text: string, tone: Notice['tone'] = 'info') => { setNotice({ text, tone }) }, [])
  useEffect(() => {
    if (notice === undefined) return
    const timer = setTimeout(() => { setNotice(undefined) }, 4000)
    return () => { clearTimeout(timer) }
  }, [notice])

  const setView = useCallback((next: View) => {
    viewRef.current = next
    setViewState(next)
  }, [])

  /** Show a document without recording history or scheduling a save (drag previews, loads). */
  const show = useCallback((next: CanvasDoc) => {
    docRef.current = next
    setDoc(next)
  }, [])

  /** Record `before` for undo and schedule a save of the current document. */
  const changed = useCallback((before: CanvasDoc) => {
    historyRef.current = [...historyRef.current, before].slice(-HISTORY_LIMIT)
    futureRef.current = []
    dirtyRef.current = true
    setDirty(true)
    setRevision(value => value + 1)
  }, [])

  const commit = useCallback((next: CanvasDoc) => {
    if (next === docRef.current) return
    const before = docRef.current
    show(next)
    changed(before)
  }, [show, changed])

  // Load the file. `generation` forces a fresh read; the first load fits the view.
  useEffect(() => {
    if (file?.scope !== 'session') {
      setPhase('error')
      setError(address)
      return
    }
    const run = { cancelled: false }
    void (async () => {
      const result = await load(sessionId, path, signal)
      if (run.cancelled) return
      if (!result.ok) {
        setPhase('error')
        setError(result.error.message)
        return
      }
      const parsed = parseCanvas(result.value.text)
      if ('error' in parsed) {
        setPhase('invalid')
        setError(parsed.error)
        return
      }
      versionRef.current = result.value.version
      setAbsolutePath(result.value.absolutePath)
      savedTextRef.current = serializeCanvas(parsed)
      dirtyRef.current = false
      setDirty(false)
      setConflict(undefined)
      show(parsed)
      setSelected(current => new Set([...current].filter(id => parsed.nodes.some(n => n.id === id))))
      setPreviewTick(value => value + 1)
      if (generation === 0) {
        const frame = viewportRef.current?.getBoundingClientRect()
        const bounds = boundsOf(parsed.nodes)
        if (frame !== undefined && bounds !== undefined) setView(fitView(bounds, frame))
        else if (frame !== undefined) setView({ x: frame.width / 2 - DEFAULT_SIZE.text.width / 2, y: frame.height / 3, zoom: 1 })
      }
      setPhase('ready')
    })()
    return () => { run.cancelled = true }
    // `file` is derived from `address`; the address and generation decide a reload.
  }, [address, generation])

  const reload = useCallback(() => { setGeneration(value => value + 1) }, [])

  const doSave = useCallback(async (overwrite: boolean) => {
    if (savingRef.current || versionRef.current === '') return
    const text = serializeCanvas(docRef.current)
    if (!overwrite && text === savedTextRef.current) {
      dirtyRef.current = false
      setDirty(false)
      return
    }
    savingRef.current = true
    saveCountRef.current += 1
    setSaving(true)
    try {
      let expected = versionRef.current
      if (overwrite) {
        const current = await stat(sessionId, path, signal)
        if (!current.ok) throw new Error(current.error.message)
        expected = current.value.version
      }
      const result = await save(sessionId, path, text, expected, signal)
      if (!result.ok) {
        if (result.error.code === 'workspace-file/stale') setConflict('stale')
        else flash(t('canvas.saveFailed', { message: result.error.message }), 'error')
        return
      }
      versionRef.current = result.value.version
      savedTextRef.current = text
      const still = serializeCanvas(docRef.current) !== text
      dirtyRef.current = still
      setDirty(still)
      setConflict(undefined)
    } catch (cause) {
      flash(t('canvas.saveFailed', { message: cause instanceof Error ? cause.message : String(cause) }), 'error')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [sessionId, path, signal, save, stat, flash, t])

  // Autosave after a pause; a pending conflict waits for the user's choice.
  useEffect(() => {
    if (revision === 0 || conflict !== undefined) return
    const timer = setTimeout(() => { void doSave(false) }, SAVE_DELAY_MS)
    return () => { clearTimeout(timer) }
  }, [revision, conflict, doSave])

  // Follow the file on disk: reload a clean canvas, flag a dirty one.
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = setInterval(() => {
      if (savingRef.current) return
      const startedAt = saveCountRef.current
      void stat(sessionId, path, signal).then((result) => {
        if (!result.ok || savingRef.current || saveCountRef.current !== startedAt) return
        if (result.value.version === versionRef.current) return
        if (dirtyRef.current) setConflict(current => current ?? 'external')
        else {
          reload()
          flash(t('canvas.reloaded'))
        }
      })
    }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [phase, sessionId, path, signal, stat, reload, flash, t])

  // Document node previews: the first lines of each Markdown file.
  const markdownFiles = useMemo(
    () => doc.nodes.filter(n => n.type === 'file' && n.file !== undefined && fileKind(n.file) === 'markdown').map(n => n.file ?? ''),
    [doc.nodes],
  )
  const markdownKey = markdownFiles.join('\n')
  useEffect(() => {
    if (phase !== 'ready' || markdownFiles.length === 0) return
    let cancelled = false
    void Promise.all(markdownFiles.map(async (relative) => {
      const result = await readText(sessionId, absoluteOf(relative), signal)
      return [relative, result.ok ? result.value.slice(0, PREVIEW_CHARS) : undefined] as const
    })).then((entries) => {
      if (cancelled) return
      setPreviews(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry[1] !== undefined)))
    })
    return () => { cancelled = true }
    // `markdownKey` stands in for the file list.
  }, [phase, markdownKey, previewTick, sessionId, signal, readText, absoluteOf])
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = setInterval(() => { setPreviewTick(value => value + 1) }, PREVIEW_MS)
    return () => { clearInterval(timer) }
  }, [phase])

  // ---------- geometry ----------

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const { x, y, zoom } = viewRef.current
    return { x: (clientX - (rect?.left ?? 0) - x) / zoom, y: (clientY - (rect?.top ?? 0) - y) / zoom }
  }, [])

  /** Where the next toolbar-created node goes: near the viewport center, moved down until it overlaps no other node. */
  const nextSpot = useCallback((type: CanvasNodeType): Point => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const center = toCanvas((rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2)
    const step = (placedRef.current++ % 6) * 24
    const size = DEFAULT_SIZE[type]
    const spot = { x: center.x - size.width / 2 + step, y: center.y - size.height / 2 + step }
    const others = docRef.current.nodes.filter(n => n.type !== 'group')
    const overlaps = (y: number): boolean => others.some(n =>
      spot.x < n.x + n.width + PLACE_GAP && n.x < spot.x + size.width + PLACE_GAP
      && y < n.y + n.height + PLACE_GAP && n.y < y + size.height + PLACE_GAP)
    let y = spot.y
    for (let tries = 0; tries < 40 && overlaps(y); tries++) y += size.height / 2
    return { x: spot.x, y }
  }, [toCanvas])

  const zoomAt = useCallback((factor: number, screenX: number, screenY: number) => {
    const current = viewRef.current
    const zoom = clampZoom(current.zoom * factor)
    const ratio = zoom / current.zoom
    setView({ x: screenX - (screenX - current.x) * ratio, y: screenY - (screenY - current.y) * ratio, zoom })
  }, [setView])

  const zoomCenter = (factor: number): void => {
    const rect = viewportRef.current?.getBoundingClientRect()
    zoomAt(factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2)
  }

  const fit = (): void => {
    const frame = viewportRef.current?.getBoundingClientRect()
    const bounds = boundsOf(docRef.current.nodes)
    if (frame !== undefined && bounds !== undefined) setView(fitView(bounds, frame))
  }

  // Wheel: pinch or Ctrl/⌘ zooms around the pointer, plain scrolling pans. A native
  // listener, because React's wheel handlers are passive and cannot cancel page zoom.
  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return
    const onWheel = (event: WheelEvent): void => {
      if ((event.target as Element).closest('textarea, input') !== null) return
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top)
      else setView({ ...viewRef.current, x: viewRef.current.x - event.deltaX, y: viewRef.current.y - event.deltaY })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => { viewport.removeEventListener('wheel', onWheel) }
  }, [phase, zoomAt, setView])

  /** The topmost node under a canvas point, preferring non-group nodes. */
  const nodeAt = useCallback((point: Point, except?: string): CanvasNode | undefined => {
    const hit = (n: CanvasNode): boolean => n.id !== except && contains(n, { ...point, width: 0, height: 0 })
    const order = drawOrder(docRef.current.nodes).reverse()
    return order.find(n => n.type !== 'group' && hit(n)) ?? order.find(n => n.type === 'group' && hit(n))
  }, [])

  // ---------- editing ----------

  const beginEditing = useCallback((next: Editing | undefined) => {
    editingRef.current = next
    setEditing(next)
  }, [])

  /** Leave the inline editor, writing its text; a new note left empty is removed. */
  const finishEditing = useCallback(() => {
    const current = editingRef.current
    beginEditing(undefined)
    if (current === undefined) return
    const node = docRef.current.nodes.find(n => n.id === current.id)
    if (node === undefined) return
    if (current.field === 'text' && current.fresh && current.value.trim() === '') {
      commit(removeItems(docRef.current, new Set([node.id]), new Set()))
    } else if (current.field === 'text' && current.value !== (node.text ?? '')) {
      commit(updateNode(docRef.current, node.id, { text: current.value }))
    } else if (current.field === 'label' && current.value !== (node.label ?? '')) {
      commit(updateNode(docRef.current, node.id, { label: current.value }))
    }
  }, [beginEditing, commit])

  const createNote = useCallback((at: Point, centered: boolean) => {
    const size = DEFAULT_SIZE.text
    const node: CanvasNode = {
      id: newId(), type: 'text', text: '',
      x: centered ? at.x - size.width / 2 : at.x, y: centered ? at.y - size.height / 2 : at.y, ...size,
    }
    commit(addNode(docRef.current, node))
    setSelected(new Set([node.id]))
    setSelectedEdge(undefined)
    beginEditing({ id: node.id, field: 'text', value: '', fresh: true })
  }, [commit, beginEditing])

  const addLink = useCallback((raw: string): boolean => {
    const url = pastedUrl(raw) ?? pastedUrl(`https://${raw.trim()}`)
    if (url === undefined || !/\./u.test(raw)) {
      flash(t('canvas.badUrl'), 'error')
      return false
    }
    const node: CanvasNode = { id: newId(), type: 'link', url, ...nextSpot('link'), ...DEFAULT_SIZE.link }
    commit(addNode(docRef.current, node))
    setSelected(new Set([node.id]))
    return true
  }, [commit, flash, nextSpot, t])

  const openDocument = useCallback((absolute: string) => {
    if (cwd === undefined) return
    tab.actions.openResource(fileAddressFor(sessionId, cwd, absolute))
  }, [cwd, sessionId, tab.actions])

  const addDocument = useCallback(async (title: string) => {
    const absolute = documentPathFor(canvasPath, title)
    const created = await create(sessionId, absolute, `# ${title.trim()}\n\n`, signal)
    if (!created.ok && created.error.code !== 'workspace-file/exists') {
      flash(t('canvas.docFailed', { message: created.error.message }), 'error')
      return
    }
    const node: CanvasNode = { id: newId(), type: 'file', file: relativeTo(root, absolute), ...nextSpot('file'), ...DEFAULT_SIZE.file }
    commit(addNode(docRef.current, node))
    setSelected(new Set([node.id]))
    openDocument(absolute)
  }, [create, sessionId, canvasPath, signal, flash, t, root, nextSpot, commit, openDocument])

  const addImage = useCallback(async (image: File) => {
    const name = imageNameFor(image, new Date())
    if (name === undefined) {
      flash(t('canvas.imageUnsupported'), 'error')
      return
    }
    const stored = await saveImage(sessionId, path, name, await base64Of(image), signal)
    if (!stored.ok) {
      flash(t('canvas.imageFailed', { message: stored.error.message }), 'error')
      return
    }
    const node: CanvasNode = { id: newId(), type: 'file', file: relativeTo(root, stored.value.absolutePath), ...nextSpot('file'), ...DEFAULT_SIZE.file }
    commit(addNode(docRef.current, node))
    setSelected(new Set([node.id]))
  }, [saveImage, sessionId, path, signal, flash, t, root, nextSpot, commit])

  const addGroup = (): void => {
    const picked = docRef.current.nodes.filter(n => selected.has(n.id))
    const bounds = boundsOf(picked)
    const box: Box = bounds === undefined
      ? { ...nextSpot('group'), ...DEFAULT_SIZE.group }
      : { x: bounds.x - 40, y: bounds.y - 70, width: bounds.width + 80, height: bounds.height + 110 }
    const node: CanvasNode = { id: newId(), type: 'group', label: t('canvas.newGroup'), ...box }
    commit(addNode(docRef.current, node))
    setSelected(new Set([node.id]))
    beginEditing({ id: node.id, field: 'label', value: node.label ?? '', fresh: false })
  }

  const connectSelected = (): void => {
    const [from, to] = [...selected]
    if (from !== undefined && to !== undefined) commit(connect(docRef.current, from, to))
  }

  const deleteSelection = useCallback(() => {
    if (selected.size === 0 && selectedEdge === undefined) return
    commit(removeItems(docRef.current, selected, new Set(selectedEdge === undefined ? [] : [selectedEdge])))
    setSelected(new Set())
    setSelectedEdge(undefined)
  }, [commit, selected, selectedEdge])

  const paint = (color: string | undefined): void => {
    let next = docRef.current
    for (const id of selected) next = updateNode(next, id, { color })
    commit(next)
  }

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1)
    if (previous === undefined) return
    historyRef.current = historyRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, docRef.current]
    show(previous)
    dirtyRef.current = true
    setDirty(true)
    setRevision(value => value + 1)
  }, [show])

  const redo = useCallback(() => {
    const next = futureRef.current.at(-1)
    if (next === undefined) return
    futureRef.current = futureRef.current.slice(0, -1)
    historyRef.current = [...historyRef.current, docRef.current]
    show(next)
    dirtyRef.current = true
    setDirty(true)
    setRevision(value => value + 1)
  }, [show])

  const organize = async (): Promise<void> => {
    if (dirtyRef.current) await doSave(false)
    const outcome = sendToAgent(sessionId, t('canvas.organizeStarter', { path: relativeTo(root, canvasPath) }))
    flash(outcome === 'sent' ? t('canvas.organizeSent') : t('editor.agentBusy'), outcome === 'sent' ? 'info' : 'error')
  }

  // ---------- keyboard and paste ----------

  useEffect(() => {
    const element = rootRef.current
    if (element === null) return
    const typing = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('input, textarea, [contenteditable="true"]') !== null
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && key === 's') {
        event.preventDefault()
        event.stopPropagation()
        void doSave(false)
        return
      }
      if (typing(event.target)) return
      if (mod && key === 'z') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) redo()
        else undo()
      } else if (mod && key === 'a') {
        event.preventDefault()
        setSelected(new Set(docRef.current.nodes.map(n => n.id)))
      } else if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        event.stopPropagation()
        deleteSelection()
      } else if (key === 'escape') {
        setSelected(new Set())
        setSelectedEdge(undefined)
      }
    }
    const onPaste = (event: ClipboardEvent): void => {
      if (typing(event.target) || event.clipboardData === null) return
      const image = [...event.clipboardData.files].find(f => f.type.startsWith('image/'))
      if (image !== undefined) {
        event.preventDefault()
        void addImage(image)
        return
      }
      const text = event.clipboardData.getData('text/plain')
      if (text.trim() === '') return
      event.preventDefault()
      const url = pastedUrl(text)
      if (url !== undefined) {
        addLink(url)
        return
      }
      const node: CanvasNode = { id: newId(), type: 'text', text: text.trim(), ...nextSpot('text'), ...DEFAULT_SIZE.text }
      commit(addNode(docRef.current, node))
      setSelected(new Set([node.id]))
    }
    element.addEventListener('keydown', onKeyDown, true)
    element.addEventListener('paste', onPaste)
    return () => {
      element.removeEventListener('keydown', onKeyDown, true)
      element.removeEventListener('paste', onPaste)
    }
  }, [phase, doSave, undo, redo, deleteSelection, addImage, addLink, nextSpot, commit])

  // ---------- pointer ----------

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as Element
    if (target.closest('textarea, input, button, a') !== null) return
    rootRef.current?.focus({ preventScroll: true })
    if (editingRef.current !== undefined) finishEditing()
    const handle = target.closest<HTMLElement>('[data-handle]')
    const nodeElement = target.closest<HTMLElement>('[data-node-id]')
    const edgeElement = target.closest('[data-edge-id]')
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.button === 1 || (handle === null && nodeElement === null && edgeElement === null)) {
      if (event.button === 0 && !event.shiftKey) {
        setSelected(new Set())
        setSelectedEdge(undefined)
      }
      gestureRef.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, origin: viewRef.current }
      return
    }
    if (handle !== null) {
      const node = docRef.current.nodes.find(n => n.id === handle.dataset.for)
      if (node === undefined) return
      if (handle.dataset.handle === 'resize') {
        gestureRef.current = { kind: 'resize', startX: event.clientX, startY: event.clientY, node, base: docRef.current }
      } else {
        gestureRef.current = { kind: 'connect', from: node.id }
        setConnectTo(toCanvas(event.clientX, event.clientY))
      }
      return
    }
    if (edgeElement !== null) {
      setSelected(new Set())
      setSelectedEdge(edgeElement.getAttribute('data-edge-id') ?? undefined)
      return
    }
    const id = nodeElement?.dataset.nodeId
    if (id === undefined) return
    let next: Set<string>
    if (event.shiftKey || event.metaKey) {
      next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
    } else {
      next = selected.has(id) ? new Set(selected) : new Set([id])
    }
    setSelected(next)
    setSelectedEdge(undefined)
    const moving = new Set(next)
    for (const node of docRef.current.nodes) {
      if (node.type === 'group' && next.has(node.id)) for (const member of groupMembers(node, docRef.current.nodes)) moving.add(member)
    }
    gestureRef.current = { kind: 'move', startX: event.clientX, startY: event.clientY, ids: moving, base: docRef.current, moved: false }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current
    if (gesture === undefined) return
    const zoom = viewRef.current.zoom
    switch (gesture.kind) {
      case 'pan':
        setView({
          ...gesture.origin,
          x: gesture.origin.x + event.clientX - gesture.startX,
          y: gesture.origin.y + event.clientY - gesture.startY,
        })
        break
      case 'move': {
        const dx = event.clientX - gesture.startX
        const dy = event.clientY - gesture.startY
        if (!gesture.moved && Math.hypot(dx, dy) < DRAG_SLOP) return
        gesture.moved = true
        show(moveNodes(gesture.base, gesture.ids, dx / zoom, dy / zoom))
        break
      }
      case 'resize':
        show(updateNode(gesture.base, gesture.node.id, {
          width: Math.max(MIN_SIZE.width, gesture.node.width + (event.clientX - gesture.startX) / zoom),
          height: Math.max(MIN_SIZE.height, gesture.node.height + (event.clientY - gesture.startY) / zoom),
        }))
        break
      case 'connect':
        setConnectTo(toCanvas(event.clientX, event.clientY))
        break
    }
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current
    gestureRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (gesture === undefined) return
    switch (gesture.kind) {
      case 'pan':
        break
      case 'move':
        if (gesture.moved) changed(gesture.base)
        break
      case 'resize':
        if (docRef.current !== gesture.base) changed(gesture.base)
        break
      case 'connect': {
        setConnectTo(undefined)
        const target = nodeAt(toCanvas(event.clientX, event.clientY), gesture.from)
        if (target !== undefined) commit(connect(docRef.current, gesture.from, target.id))
        break
      }
    }
  }

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    // Pointer capture retargets the click to the viewport, so hit-test the point instead.
    const target = document.elementFromPoint(event.clientX, event.clientY) ?? (event.target as Element)
    if (target.closest('textarea, input, button, a') !== null) return
    const nodeElement = target.closest<HTMLElement>('[data-node-id]')
    const node = docRef.current.nodes.find(n => n.id === nodeElement?.dataset.nodeId)
    if (node === undefined) {
      createNote(toCanvas(event.clientX, event.clientY), true)
      return
    }
    switch (node.type) {
      case 'text':
        beginEditing({ id: node.id, field: 'text', value: node.text ?? '', fresh: false })
        break
      case 'group':
        beginEditing({ id: node.id, field: 'label', value: node.label ?? '', fresh: false })
        break
      case 'link':
        if (node.url !== undefined) openExternal(node.url)
        break
      case 'file':
        if (node.file !== undefined) openDocument(absoluteOf(node.file))
        break
    }
  }

  // ---------- render ----------

  if (phase === 'error') return <div className={css.status}>{t('canvas.error', { message: error })}</div>

  const boxes = new Map(doc.nodes.map(n => [n.id, n]))
  const ordered = drawOrder(doc.nodes)
  const groups = ordered.filter(n => n.type === 'group')
  const items = ordered.filter(n => n.type !== 'group')
  const single = selected.size === 1 ? doc.nodes.find(n => selected.has(n.id)) : undefined
  const gridSize = 24 * view.zoom
  const viewportStyle: CSSProperties = {
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: `${view.x}px ${view.y}px`,
  }

  const editor = (node: CanvasNode): ReactNode => editing?.id === node.id && (
    <textarea
      className={editing.field === 'label' ? css.labelInput : css.textInput}
      value={editing.value}
      placeholder={t('canvas.notePlaceholder')}
      autoFocus
      onChange={(event) => { beginEditing({ ...editing, value: event.target.value }) }}
      onBlur={finishEditing}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey || editing.field === 'label'))) {
          event.preventDefault()
          finishEditing()
        }
      }}
    />
  )

  const nodeBody = (node: CanvasNode): ReactNode => {
    switch (node.type) {
      case 'text':
        return editing?.id === node.id ? editor(node) : <div className={css.noteBody}>{node.text === undefined || node.text === '' ? <span className={css.muted}>{t('canvas.emptyNote')}</span> : <NoteText text={node.text} />}</div>
      case 'link': {
        const { host, rest } = describeUrl(node.url ?? '')
        return (
          <div className={css.linkBody}>
            <div className={css.linkHost}>{host}</div>
            {rest !== '' && <div className={css.linkRest}>{rest}</div>}
            <button type="button" className={css.linkOpen} title={t('canvas.openLink')} onClick={() => { if (node.url !== undefined) openExternal(node.url) }}>↗</button>
          </div>
        )
      }
      case 'file': {
        const relative = node.file ?? ''
        const kind = fileKind(relative)
        if (kind === 'image') {
          const src = mediaUrl(absoluteOf(relative))
          return src === undefined
            ? <div className={css.muted}>{relative}</div>
            : <img className={css.image} src={src} alt={pathPartsOf(relative).name} draggable={false} />
        }
        const preview = previews[relative]
        return (
          <div className={css.docBody}>
            <div className={css.docTitle}>{pathPartsOf(relative).name.replace(/\.(?:md|markdown)$/iu, '')}</div>
            {kind === 'markdown' && preview !== undefined && <div className={css.docPreview}><NoteText text={preview.replace(/^#\s+.*\n?/u, '')} /></div>}
            <div className={css.docHint}>{kind === 'markdown' ? t('canvas.docHint') : relative}</div>
          </div>
        )
      }
      case 'group':
        return null
    }
  }

  const kindClass = (type: CanvasNodeType): string => css[`node_${type}`] ?? ''

  return (
    <div ref={rootRef} className={css.root} tabIndex={-1} data-aipm-canvas>
      <div className={css.toolbar}>
        <span className={css.fileName} title={path}>{fileName}</span>
        <span className={dirty ? css.dirty : css.clean}>{saving ? t('canvas.saving') : dirty ? t('canvas.unsaved') : t('canvas.saved')}</span>
        <span className={css.divider} />
        <button type="button" className={css.tool} title={t('canvas.addNoteHint')} onClick={() => { createNote(nextSpot('text'), false) }}>{t('canvas.addNote')}</button>
        <button type="button" className={css.tool} title={t('canvas.addLinkHint')} onClick={() => { setDocDraft(undefined); setLinkDraft(linkDraft === undefined ? '' : undefined) }}>{t('canvas.addLink')}</button>
        <button type="button" className={css.tool} title={t('canvas.addDocHint')} onClick={() => { setLinkDraft(undefined); setDocDraft(docDraft === undefined ? '' : undefined) }}>{t('canvas.addDoc')}</button>
        <button type="button" className={css.tool} title={t('canvas.addGroupHint')} onClick={addGroup}>{t('canvas.addGroup')}</button>
        <button type="button" className={css.tool} title={t('canvas.connectHint')} disabled={selected.size !== 2} onClick={connectSelected}>{t('canvas.connect')}</button>
        {(selected.size > 0 || selectedEdge !== undefined) && (
          <>
            {selected.size > 0 && (
              <span className={css.swatches} aria-label={t('canvas.color')}>
                <button type="button" className={`${css.swatch} ${css.swatchNone}`} title={t('canvas.noColor')} onClick={() => { paint(undefined) }} />
                {COLOR_PRESETS.map(color => (
                  <button key={color} type="button" className={css.swatch} style={colorStyle(color)} title={t(`canvas.color.${color}`)} onClick={() => { paint(color) }} />
                ))}
              </span>
            )}
            <button type="button" className={css.tool} onClick={deleteSelection}>{t('canvas.delete')}</button>
          </>
        )}
        <span className={css.spacer} />
        <span className={css.zoom}>
          <button type="button" className={css.tool} title={t('canvas.zoomOut')} onClick={() => { zoomCenter(1 / 1.2) }}>−</button>
          <button type="button" className={css.zoomValue} title={t('canvas.zoomReset')} onClick={() => { zoomCenter(1 / view.zoom) }}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" className={css.tool} title={t('canvas.zoomIn')} onClick={() => { zoomCenter(1.2) }}>+</button>
          <button type="button" className={css.tool} title={t('canvas.fitHint')} onClick={fit}>{t('canvas.fit')}</button>
        </span>
        <button type="button" className={css.primary} title={t('canvas.organizeHint')} disabled={phase !== 'ready' || doc.nodes.length === 0} onClick={() => { void organize() }}>{t('canvas.organize')}</button>
      </div>

      {(linkDraft !== undefined || docDraft !== undefined) && (
        <form
          className={css.draft}
          onSubmit={(event) => {
            event.preventDefault()
            if (linkDraft !== undefined) {
              if (addLink(linkDraft)) setLinkDraft(undefined)
            } else if (docDraft !== undefined && docDraft.trim() !== '') {
              void addDocument(docDraft)
              setDocDraft(undefined)
            }
          }}
        >
          <input
            className={css.draftInput}
            autoFocus
            value={linkDraft ?? docDraft ?? ''}
            placeholder={linkDraft !== undefined ? t('canvas.linkPlaceholder') : t('canvas.docPlaceholder')}
            onChange={(event) => { if (linkDraft !== undefined) setLinkDraft(event.target.value); else setDocDraft(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Escape') { setLinkDraft(undefined); setDocDraft(undefined) } }}
          />
          <button type="submit" className={css.tool}>{t('canvas.add')}</button>
          <button type="button" className={css.tool} onClick={() => { setLinkDraft(undefined); setDocDraft(undefined) }}>{t('canvas.cancel')}</button>
        </form>
      )}

      {conflict !== undefined && (
        <div className={css.conflict} role="alert">
          <span>{conflict === 'stale' ? t('canvas.conflictStale') : t('canvas.conflictExternal')}</span>
          <span className={css.conflictActions}>
            <button type="button" className={css.tool} onClick={reload}>{t('canvas.useDisk')}</button>
            <button type="button" className={css.danger} onClick={() => { void doSave(true) }}>{t('canvas.keepMine')}</button>
          </span>
        </div>
      )}
      {notice !== undefined && <div className={notice.tone === 'error' ? css.noticeError : css.notice} role="status">{notice.text}</div>}
      {phase === 'invalid' && (
        <div className={css.conflict} role="alert">
          <span>{t('canvas.invalid', { message: error })}</span>
          <button type="button" className={css.tool} onClick={reload}>{t('canvas.reload')}</button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={css.viewport}
        style={viewportStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div className={css.world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {groups.map(node => (
            <div
              key={node.id}
              className={`${css.group} ${selected.has(node.id) ? css.selected : ''}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height, ...colorStyle(node.color) }}
            >
              <div className={css.groupLabel} data-node-id={node.id}>
                {editing?.id === node.id ? editor(node) : (node.label === undefined || node.label === '' ? t('canvas.untitledGroup') : node.label)}
              </div>
            </div>
          ))}
          <svg className={css.edges} aria-hidden="true">
            <defs>
              <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path className={css.arrow} d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {doc.edges.map((edge) => {
              const from = boxes.get(edge.fromNode)
              const to = boxes.get(edge.toNode)
              if (from === undefined || to === undefined) return null
              const { d, mid } = edgePath(from, to, edge.fromSide, edge.toSide)
              return (
                <g
                  key={edge.id}
                  className={`${edge.color === undefined ? '' : css.edgeColored} ${selectedEdge === edge.id ? css.edgeSelected : ''}`}
                  style={colorStyle(edge.color)}
                >
                  <path className={css.edgeHit} d={d} data-edge-id={edge.id} />
                  <path className={css.edgeLine} d={d} markerEnd={edge.toEnd === 'none' ? undefined : `url(#${markerId})`} />
                  {edge.label !== undefined && edge.label !== '' && <text className={css.edgeLabel} x={mid.x} y={mid.y}>{edge.label}</text>}
                </g>
              )
            })}
            {connectTo !== undefined && single !== undefined && (
              <path className={css.edgeDraft} d={`M ${single.x + single.width} ${single.y + single.height / 2} L ${connectTo.x} ${connectTo.y}`} />
            )}
          </svg>
          {items.map(node => (
            <div
              key={node.id}
              data-node-id={node.id}
              className={`${css.node} ${kindClass(node.type)} ${selected.has(node.id) ? css.selected : ''} ${node.color === undefined ? '' : css.colored}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height, ...colorStyle(node.color) }}
            >
              {nodeBody(node)}
            </div>
          ))}
          {single !== undefined && editing === undefined && (
            <>
              <div className={css.resizeHandle} data-handle="resize" data-for={single.id} title={t('canvas.resize')} style={{ left: single.x + single.width, top: single.y + single.height }} />
              {single.type !== 'group' && (
                <div className={css.connectHandle} data-handle="connect" data-for={single.id} title={t('canvas.connectDrag')} style={{ left: single.x + single.width, top: single.y + single.height / 2 }} />
              )}
            </>
          )}
        </div>
        {phase === 'ready' && doc.nodes.length === 0 && (
          <div className={css.empty}>
            <p className={css.emptyTitle}>{t('canvas.emptyTitle')}</p>
            <p>{t('canvas.emptyBody')}</p>
          </div>
        )}
        {phase === 'loading' && <div className={css.empty}>{t('canvas.loading')}</div>}
      </div>
    </div>
  )
}
