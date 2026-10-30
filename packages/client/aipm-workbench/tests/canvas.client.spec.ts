/** The idea canvas document: JSON Canvas parsing and writing, geometry, and edits. */
import { describe, expect, it } from 'vitest'
import {
  addNode, boundsOf, connect, describeUrl, documentPathFor, drawOrder, edgePath, fileKind, fitView, groupMembers,
  moveNodes, parseCanvas, pastedUrl, relativeTo, removeItems, serializeCanvas,
} from '../src/client/canvas/model.ts'
import type { CanvasDoc, CanvasNode } from '../src/client/canvas/model.ts'

function doc(raw: object | string): CanvasDoc {
  const parsed = parseCanvas(typeof raw === 'string' ? raw : JSON.stringify(raw))
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed
}

const note = (id: string, x: number, y: number): CanvasNode => ({ id, type: 'text', text: id, x, y, width: 100, height: 50 })

describe('parseCanvas', () => {
  it('reads an empty file as an empty canvas and rejects malformed JSON', () => {
    expect(doc('')).toEqual({ nodes: [], edges: [] })
    expect('error' in parseCanvas('{"nodes": [')).toBe(true)
    expect('error' in parseCanvas('[]')).toBe(true)
  })

  it('drops invalid nodes, duplicate ids, and edges to missing nodes; defaults sizes', () => {
    const parsed = doc({
      nodes: [
        { id: 'a', type: 'text', text: 'hi', x: 1, y: 2 },
        { id: 'a', type: 'text', text: 'dup', x: 0, y: 0 },
        { id: 'b', type: 'video', x: 0, y: 0 },
        { type: 'text' },
        { id: 'c', type: 'link', url: 'https://example.com', x: 'bad', y: 0, width: 300, height: 100 },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'c', fromSide: 'right', toSide: 'diagonal' },
        { id: 'e2', fromNode: 'a', toNode: 'b' },
      ],
    })
    expect(parsed.nodes.map(n => [n.id, n.x, n.width, n.height])).toEqual([['a', 1, 260, 140], ['c', 0, 300, 100]])
    expect(parsed.edges).toEqual([{
      id: 'e1', fromNode: 'a', toNode: 'c', fromSide: 'right', toSide: undefined, toEnd: undefined,
      color: undefined, label: undefined, extra: undefined,
    }])
  })

  it('keeps fields it does not know through a write', () => {
    const raw = {
      nodes: [{ id: 'g', type: 'group', label: '问题', x: 0, y: 0, width: 400, height: 300, background: 'bg.png' }],
      edges: [],
      meta: { author: 'obsidian' },
    }
    const written = JSON.parse(serializeCanvas(doc(raw))) as Record<string, unknown>
    expect(written).toEqual({
      meta: { author: 'obsidian' },
      nodes: [{ background: 'bg.png', id: 'g', type: 'group', label: '问题', x: 0, y: 0, width: 400, height: 300 }],
      edges: [],
    })
  })
})

describe('serializeCanvas', () => {
  it('writes tab-indented JSON with integer geometry and only the fields of each kind', () => {
    const text = serializeCanvas({
      nodes: [{ id: 'n', type: 'file', file: 'a.md', text: 'stray', x: 1.6, y: -2.4, width: 99.5, height: 50, color: '4' }],
      edges: [{ id: 'e', fromNode: 'n', toNode: 'n', label: '原因' }],
    })
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n\t"nodes"')
    expect(JSON.parse(text)).toEqual({
      nodes: [{ id: 'n', type: 'file', file: 'a.md', x: 2, y: -2, width: 100, height: 50, color: '4' }],
      edges: [{ id: 'e', fromNode: 'n', toNode: 'n', label: '原因' }],
    })
  })
})

describe('canvas geometry', () => {
  it('finds group members by containment', () => {
    const group: CanvasNode = { id: 'g', type: 'group', x: 0, y: 0, width: 300, height: 200 }
    expect(groupMembers(group, [group, note('in', 10, 10), note('edge', 250, 10), note('out', 400, 10)])).toEqual(['in'])
  })

  it('bounds boxes and fits them into a frame without zooming past 100%', () => {
    expect(boundsOf([])).toBeUndefined()
    const bounds = boundsOf([note('a', 0, 0), note('b', 200, 100)])
    expect(bounds).toEqual({ x: 0, y: 0, width: 300, height: 150 })
    expect(fitView(bounds ?? { x: 0, y: 0, width: 1, height: 1 }, { width: 1000, height: 800 })).toEqual({ x: 350, y: 325, zoom: 1 })
    expect(fitView({ x: 0, y: 0, width: 4000, height: 100 }, { width: 1000, height: 800 }, 0).zoom).toBe(0.25)
  })

  it('draws an edge from the facing sides', () => {
    const path = edgePath(note('a', 0, 0), note('b', 300, 0))
    expect(path.d.startsWith('M 100 25 ')).toBe(true)
    expect(path.end).toEqual({ x: 300, y: 25 })
  })

  it('draws groups first, largest first', () => {
    const small: CanvasNode = { id: 's', type: 'group', x: 0, y: 0, width: 10, height: 10 }
    const large: CanvasNode = { id: 'l', type: 'group', x: 0, y: 0, width: 100, height: 100 }
    expect(drawOrder([note('a', 0, 0), small, large]).map(n => n.id)).toEqual(['l', 's', 'a'])
  })
})

describe('canvas edits', () => {
  const base: CanvasDoc = { nodes: [note('a', 0, 0), note('b', 200, 0)], edges: [] }

  it('connects two nodes once, in either direction, and never to itself', () => {
    const once = connect(base, 'a', 'b')
    expect(once.edges).toHaveLength(1)
    expect(connect(once, 'b', 'a')).toBe(once)
    expect(connect(base, 'a', 'a')).toBe(base)
  })

  it('removes nodes with their edges, and moves only the named nodes', () => {
    const linked = connect(base, 'a', 'b')
    expect(removeItems(linked, new Set(['a']), new Set())).toEqual({ nodes: [note('b', 200, 0)], edges: [] })
    expect(moveNodes(base, new Set(['b']), 10, -5).nodes.map(n => [n.x, n.y])).toEqual([[0, 0], [210, -5]])
  })

  it('adds a group underneath the other nodes', () => {
    const group: CanvasNode = { id: 'g', type: 'group', x: 0, y: 0, width: 10, height: 10 }
    expect(addNode(base, group).nodes[0]?.id).toBe('g')
    expect(addNode(base, note('c', 0, 0)).nodes.at(-1)?.id).toBe('c')
  })
})

describe('canvas paths and links', () => {
  it('turns a pasted http(s) address into a link and leaves other text alone', () => {
    expect(pastedUrl('  https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
    expect(pastedUrl('see https://example.com')).toBeUndefined()
    expect(pastedUrl('javascript:alert(1)')).toBeUndefined()
    expect(pastedUrl('not a url')).toBeUndefined()
  })

  it('describes a link by host and path', () => {
    expect(describeUrl('https://www.example.com/%E6%96%87%E7%AB%A0')).toEqual({ host: 'example.com', rest: '/文章' })
    expect(describeUrl('https://example.com/')).toEqual({ host: 'example.com', rest: '' })
    expect(describeUrl('nonsense')).toEqual({ host: 'nonsense', rest: '' })
  })

  it('places a new document beside the canvas with a safe file name', () => {
    expect(documentPathFor('/w/灵感画布/灵感画布.canvas', ' 脑暴: 第一版/草稿 ')).toBe('/w/灵感画布/灵感画布-文档/脑暴-第一版-草稿.md')
    expect(documentPathFor('/w/p/灵感画布.canvas', '...')).toBe('/w/p/灵感画布-文档/未命名.md')
  })

  it('stores paths relative to the workspace and classifies files', () => {
    expect(relativeTo('/w/', '/w/灵感画布/images/a.png')).toBe('灵感画布/images/a.png')
    expect(relativeTo('/w', '/elsewhere/a.png')).toBe('/elsewhere/a.png')
    expect([fileKind('a.PNG'), fileKind('b.md'), fileKind('c.pdf')]).toEqual(['image', 'markdown', 'other'])
  })
})
