/**
 * The idea canvas document: JSON Canvas 1.0 (jsoncanvas.org), the open format
 * Obsidian also reads, so the `idea-canvas` skill and other tools can edit the
 * same file. Parsing keeps every field it does not understand on each node and
 * edge and at the top level, so saving never drops data another tool wrote.
 */

/** Node kinds of JSON Canvas. */
export type CanvasNodeType = 'text' | 'file' | 'link' | 'group'

/** One node; unknown fields ride along in `extra`. */
export interface CanvasNode {
  readonly id: string
  readonly type: CanvasNodeType
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Preset `"1"`–`"6"` or a `#RRGGBB` hex. */
  readonly color?: string | undefined
  readonly text?: string | undefined
  /** Workspace-relative path for a file node. */
  readonly file?: string | undefined
  readonly url?: string | undefined
  readonly label?: string | undefined
  readonly extra?: Readonly<Record<string, unknown>> | undefined
}

/** One edge; unknown fields ride along in `extra`. */
export interface CanvasEdge {
  readonly id: string
  readonly fromNode: string
  readonly toNode: string
  readonly fromSide?: Side | undefined
  readonly toSide?: Side | undefined
  readonly toEnd?: 'none' | 'arrow' | undefined
  readonly color?: string | undefined
  readonly label?: string | undefined
  readonly extra?: Readonly<Record<string, unknown>> | undefined
}

/** A whole canvas. */
export interface CanvasDoc {
  readonly nodes: readonly CanvasNode[]
  readonly edges: readonly CanvasEdge[]
  readonly extra?: Readonly<Record<string, unknown>> | undefined
}

/** Node side an edge attaches to. */
export type Side = 'top' | 'right' | 'bottom' | 'left'

/** Axis-aligned box in canvas coordinates. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Point in canvas coordinates. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** The workspace-level canvas, relative to the workspace root. */
export const WORKSPACE_CANVAS = '灵感画布/灵感画布.canvas'

/** The project-level canvas file, at a project root. */
export const PROJECT_CANVAS = '灵感画布.canvas'

/** Contents of a new canvas file: no nodes, no edges. */
export const NEW_CANVAS_JSON = '{\n\t"nodes": [],\n\t"edges": []\n}\n'

/** Default sizes per node kind. */
export const DEFAULT_SIZE: Readonly<Record<CanvasNodeType, { readonly width: number; readonly height: number }>> = {
  text: { width: 260, height: 140 },
  link: { width: 320, height: 110 },
  file: { width: 320, height: 220 },
  group: { width: 560, height: 400 },
}

/** Smallest size a node can be resized to. */
export const MIN_SIZE = { width: 120, height: 60 } as const

/** The six JSON Canvas color presets. */
export const COLOR_PRESETS = ['1', '2', '3', '4', '5', '6'] as const

const NODE_TYPES: readonly CanvasNodeType[] = ['text', 'file', 'link', 'group']
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']
const NODE_KEYS = new Set(['id', 'type', 'x', 'y', 'width', 'height', 'color', 'text', 'file', 'url', 'label'])
const EDGE_KEYS = new Set(['id', 'fromNode', 'toNode', 'fromSide', 'toSide', 'toEnd', 'color', 'label'])

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function rest(source: Record<string, unknown>, known: ReadonlySet<string>): Record<string, unknown> | undefined {
  const entries = Object.entries(source).filter(([key]) => !known.has(key))
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

/**
 * Parse canvas file text. An empty file reads as an empty canvas.
 * @param raw - file contents.
 * @returns the document, or an error message for malformed JSON.
 */
export function parseCanvas(raw: string): CanvasDoc | { readonly error: string } {
  if (raw.trim() === '') return { nodes: [], edges: [] }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  const root = record(data)
  if (root === undefined) return { error: 'not a JSON object' }
  const nodes: CanvasNode[] = []
  const ids = new Set<string>()
  for (const item of Array.isArray(root.nodes) ? root.nodes : []) {
    const n = record(item)
    const id = str(n?.id)
    const type = str(n?.type) as CanvasNodeType | undefined
    if (n === undefined || id === undefined || ids.has(id) || type === undefined || !NODE_TYPES.includes(type)) continue
    ids.add(id)
    const size = DEFAULT_SIZE[type]
    nodes.push({
      id,
      type,
      x: finite(n.x, 0),
      y: finite(n.y, 0),
      width: Math.max(1, finite(n.width, size.width)),
      height: Math.max(1, finite(n.height, size.height)),
      color: str(n.color),
      text: str(n.text),
      file: str(n.file),
      url: str(n.url),
      label: str(n.label),
      extra: rest(n, NODE_KEYS),
    })
  }
  const edges: CanvasEdge[] = []
  for (const item of Array.isArray(root.edges) ? root.edges : []) {
    const e = record(item)
    const id = str(e?.id)
    const fromNode = str(e?.fromNode)
    const toNode = str(e?.toNode)
    if (e === undefined || id === undefined || fromNode === undefined || toNode === undefined) continue
    if (!ids.has(fromNode) || !ids.has(toNode)) continue
    const fromSide = str(e.fromSide) as Side | undefined
    const toSide = str(e.toSide) as Side | undefined
    edges.push({
      id,
      fromNode,
      toNode,
      fromSide: fromSide !== undefined && SIDES.includes(fromSide) ? fromSide : undefined,
      toSide: toSide !== undefined && SIDES.includes(toSide) ? toSide : undefined,
      toEnd: e.toEnd === 'none' ? 'none' : e.toEnd === 'arrow' ? 'arrow' : undefined,
      color: str(e.color),
      label: str(e.label),
      extra: rest(e, EDGE_KEYS),
    })
  }
  return { nodes, edges, extra: rest(root, new Set(['nodes', 'edges'])) }
}

function compact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

/**
 * Serialize a canvas the way Obsidian writes it: tab-indented JSON, integer
 * geometry, and a trailing newline.
 * @param doc - the document.
 * @returns file text.
 */
export function serializeCanvas(doc: CanvasDoc): string {
  const nodes = doc.nodes.map(n => compact({
    ...n.extra,
    id: n.id,
    type: n.type,
    text: n.type === 'text' ? n.text ?? '' : undefined,
    file: n.type === 'file' ? n.file : undefined,
    url: n.type === 'link' ? n.url : undefined,
    label: n.type === 'group' ? n.label : undefined,
    x: Math.round(n.x),
    y: Math.round(n.y),
    width: Math.round(n.width),
    height: Math.round(n.height),
    color: n.color,
  }))
  const edges = doc.edges.map(e => compact({
    ...e.extra,
    id: e.id,
    fromNode: e.fromNode,
    fromSide: e.fromSide,
    toNode: e.toNode,
    toSide: e.toSide,
    toEnd: e.toEnd,
    color: e.color,
    label: e.label,
  }))
  return `${JSON.stringify({ ...doc.extra, nodes, edges }, null, '\t')}\n`
}

/**
 * A new random id in the 16-hex-digit shape Obsidian uses.
 * @returns the id.
 */
export function newId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Whether box `inner` lies entirely inside box `outer`.
 * @param inner - the contained candidate.
 * @param outer - the container.
 * @returns true when fully inside.
 */
export function contains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

/**
 * Ids of the nodes a group holds: JSON Canvas membership is geometric.
 * @param group - the group node.
 * @param nodes - every node.
 * @returns ids of the other nodes fully inside it.
 */
export function groupMembers(group: CanvasNode, nodes: readonly CanvasNode[]): string[] {
  return nodes.filter(n => n.id !== group.id && contains(group, n)).map(n => n.id)
}

/**
 * The smallest box around boxes.
 * @param boxes - the boxes.
 * @returns their bounds, or `undefined` for none.
 */
export function boundsOf(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined
  const left = Math.min(...boxes.map(b => b.x))
  const top = Math.min(...boxes.map(b => b.y))
  const right = Math.max(...boxes.map(b => b.x + b.width))
  const bottom = Math.max(...boxes.map(b => b.y + b.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Viewport that fits a box into a frame, capped at 100%.
 * @param box - content bounds.
 * @param frame - frame width and height in screen pixels.
 * @param padding - screen pixels left free around the content.
 * @returns pan offset and zoom.
 */
export function fitView(
  box: Box, frame: { readonly width: number; readonly height: number }, padding = 48,
): { x: number; y: number; zoom: number } {
  const zoom = clampZoom(Math.min(
    (frame.width - padding * 2) / Math.max(box.width, 1),
    (frame.height - padding * 2) / Math.max(box.height, 1),
    1,
  ))
  return {
    x: frame.width / 2 - (box.x + box.width / 2) * zoom,
    y: frame.height / 2 - (box.y + box.height / 2) * zoom,
    zoom,
  }
}

/** Zoom limits. */
export const ZOOM = { min: 0.2, max: 2.5 } as const

/**
 * Keep a zoom factor inside the limits.
 * @param zoom - requested factor.
 * @returns the clamped factor.
 */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, zoom))
}

/**
 * The side of `from` facing `to`, by the larger axis distance between centers.
 * @param from - the box an edge leaves.
 * @param to - the box it enters.
 * @returns the side.
 */
export function facingSide(from: Box, to: Box): Side {
  const dx = (to.x + to.width / 2) - (from.x + from.width / 2)
  const dy = (to.y + to.height / 2) - (from.y + from.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

/**
 * The midpoint of a box side.
 * @param box - the box.
 * @param side - which side.
 * @returns the anchor point.
 */
export function anchor(box: Box, side: Side): Point {
  switch (side) {
    case 'top': return { x: box.x + box.width / 2, y: box.y }
    case 'bottom': return { x: box.x + box.width / 2, y: box.y + box.height }
    case 'left': return { x: box.x, y: box.y + box.height / 2 }
    case 'right': return { x: box.x + box.width, y: box.y + box.height / 2 }
  }
}

/**
 * SVG path of an edge: a cubic curve leaving and entering perpendicular to the sides.
 * @param from - start box.
 * @param to - end box.
 * @param fromSide - explicit start side, else the facing side.
 * @param toSide - explicit end side, else the facing side.
 * @returns the path data and the end point.
 */
export function edgePath(from: Box, to: Box, fromSide?: Side, toSide?: Side): { d: string; end: Point; mid: Point } {
  const a = anchor(from, fromSide ?? facingSide(from, to))
  const b = anchor(to, toSide ?? facingSide(to, from))
  const reach = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) / 3)
  const push = (point: Point, side: Side): Point => ({
    x: point.x + (side === 'left' ? -reach : side === 'right' ? reach : 0),
    y: point.y + (side === 'top' ? -reach : side === 'bottom' ? reach : 0),
  })
  const c1 = push(a, fromSide ?? facingSide(from, to))
  const c2 = push(b, toSide ?? facingSide(to, from))
  return {
    d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`,
    end: b,
    mid: { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 },
  }
}

/**
 * Whether pasted text is a single web address that should become a link node.
 * @param text - clipboard text.
 * @returns the trimmed URL, or `undefined`.
 */
export function pastedUrl(text: string): string | undefined {
  const trimmed = text.trim()
  if (/\s/u.test(trimmed)) return undefined
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : undefined
  } catch {
    return undefined
  }
}

/**
 * The host and path of a link node for display.
 * @param url - the node's address.
 * @returns host without `www.`, and the rest; the raw text when it does not parse.
 */
export function describeUrl(url: string): { readonly host: string; readonly rest: string } {
  try {
    const parsed = new URL(url)
    const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`
    return { host: parsed.hostname.replace(/^www\./u, ''), rest: decodeURI(rest) }
  } catch {
    return { host: url, rest: '' }
  }
}

/**
 * Join a workspace root and a workspace-relative path.
 * @param root - absolute workspace root.
 * @param relative - `/`-separated relative path.
 * @returns the absolute path.
 */
export function resolveIn(root: string, relative: string): string {
  return `${root.replace(/[/\\]+$/u, '')}/${relative.replace(/^[/\\]+/u, '')}`
}

/**
 * A path relative to the workspace root, the form file nodes store.
 * @param root - absolute workspace root.
 * @param absolute - absolute path inside it.
 * @returns the relative path, or the absolute path when it lies outside.
 */
export function relativeTo(root: string, absolute: string): string {
  const base = `${root.replace(/[/\\]+$/u, '')}/`
  return absolute.startsWith(base) ? absolute.slice(base.length) : absolute
}

/**
 * Where a new document node's Markdown file goes: `<canvas name>-文档/<title>.md`
 * beside the canvas, with characters a file name cannot hold replaced.
 * @param canvasPath - absolute canvas path.
 * @param title - the user's title.
 * @returns absolute file path.
 */
export function documentPathFor(canvasPath: string, title: string): string {
  const slash = canvasPath.lastIndexOf('/')
  const directory = canvasPath.slice(0, slash)
  const base = canvasPath.slice(slash + 1).replace(/\.canvas$/iu, '')
  const safe = title.trim().replace(/\s*[\\/:*?"<>|\n\r\t]+\s*/gu, '-').replace(/^\.+/u, '').slice(0, 60) || '未命名'
  return `${directory}/${base}-文档/${safe}.md`
}

/** Image extensions a file node renders inline. */
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif)$/iu

/**
 * How a file node renders.
 * @param file - the node's path.
 * @returns `image`, `markdown`, or `other`.
 */
export function fileKind(file: string): 'image' | 'markdown' | 'other' {
  if (IMAGE_EXT.test(file)) return 'image'
  if (/\.(?:md|markdown)$/iu.test(file)) return 'markdown'
  return 'other'
}

/**
 * Move nodes by an offset.
 * @param doc - the document.
 * @param ids - nodes to move.
 * @param dx - horizontal offset.
 * @param dy - vertical offset.
 * @returns the new document.
 */
export function moveNodes(doc: CanvasDoc, ids: ReadonlySet<string>, dx: number, dy: number): CanvasDoc {
  return { ...doc, nodes: doc.nodes.map(n => ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n) }
}

/**
 * Remove nodes and every edge touching them, plus edges by id.
 * @param doc - the document.
 * @param nodeIds - nodes to remove.
 * @param edgeIds - edges to remove.
 * @returns the new document.
 */
export function removeItems(doc: CanvasDoc, nodeIds: ReadonlySet<string>, edgeIds: ReadonlySet<string>): CanvasDoc {
  return {
    ...doc,
    nodes: doc.nodes.filter(n => !nodeIds.has(n.id)),
    edges: doc.edges.filter(e => !edgeIds.has(e.id) && !nodeIds.has(e.fromNode) && !nodeIds.has(e.toNode)),
  }
}

/**
 * Replace one node.
 * @param doc - the document.
 * @param id - node to change.
 * @param patch - fields to set.
 * @returns the new document.
 */
export function updateNode(doc: CanvasDoc, id: string, patch: Partial<Omit<CanvasNode, 'id' | 'type'>>): CanvasDoc {
  return { ...doc, nodes: doc.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }
}

/**
 * Add a node; groups go first so they stay underneath the nodes they hold.
 * @param doc - the document.
 * @param node - the new node.
 * @returns the new document.
 */
export function addNode(doc: CanvasDoc, node: CanvasNode): CanvasDoc {
  return { ...doc, nodes: node.type === 'group' ? [node, ...doc.nodes] : [...doc.nodes, node] }
}

/**
 * Add an edge unless the same pair is already connected.
 * @param doc - the document.
 * @param fromNode - start node.
 * @param toNode - end node.
 * @returns the new document, unchanged for a self-loop or a duplicate.
 */
export function connect(doc: CanvasDoc, fromNode: string, toNode: string): CanvasDoc {
  if (fromNode === toNode) return doc
  if (doc.edges.some(e => (e.fromNode === fromNode && e.toNode === toNode) || (e.fromNode === toNode && e.toNode === fromNode))) return doc
  return { ...doc, edges: [...doc.edges, { id: newId(), fromNode, toNode }] }
}

/**
 * Render-order nodes: groups first (larger first), then the rest in file order.
 * @param nodes - every node.
 * @returns the drawing order.
 */
export function drawOrder(nodes: readonly CanvasNode[]): CanvasNode[] {
  const groups = nodes.filter(n => n.type === 'group').sort((a, b) => b.width * b.height - a.width * a.height)
  return [...groups, ...nodes.filter(n => n.type !== 'group')]
}
