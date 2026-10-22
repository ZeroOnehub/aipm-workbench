/** `aipm.json` open items: written by the skills, or derived from station and stage status. */
import { describe, expect, it } from 'vitest'
import { openItems, parseProject } from '../src/client/model.ts'
import type { Project } from '../src/client/model.ts'

function parse(data: object): Project {
  const parsed = parseProject(JSON.stringify(data), '示例')
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed
}

describe('parseProject pending', () => {
  it('keeps open items with text and drops resolved ones', () => {
    const project = parse({
      version: 1,
      project: '示例',
      pending: [
        { id: 'D1', kind: 'decision', stage: 'prd', text: '首城选哪个', recommend: '杭州', source: '02-PRD/PRD.md' },
        { id: 'D2', kind: 'decision', text: '已经定了', status: 'resolved' },
        { id: 'A1', kind: 'assumption', status: 'open' },
        { id: 'G1', kind: 'unknown-kind', text: '缺访谈' },
      ],
    })
    expect(project.pending).toEqual([
      { key: 'pending:D1', id: 'D1', kind: 'decision', text: '首城选哪个', stage: 'prd', source: '02-PRD/PRD.md', recommend: '杭州', derived: false },
      { key: 'pending:G1', id: 'G1', kind: 'decision', text: '缺访谈', stage: undefined, source: undefined, recommend: undefined, derived: false },
    ])
  })

  it('reads a file without pending as no items', () => {
    expect(parse({ version: 1, project: '示例' }).pending).toEqual([])
  })
})

describe('openItems', () => {
  it('derives items from skipped stages and blocked or conditionally passed stations', () => {
    const project = parse({
      version: 1,
      project: '示例',
      pending: [{ id: 'D1', kind: 'decision', text: '首城选哪个' }],
      stages: [
        { id: 'initiation', status: 'skipped', note: '直接写 PRD' },
        {
          id: 'prd',
          status: 'in_progress',
          stations: [
            { id: '01', name: '对齐输入', status: 'passed' },
            { id: '02', name: '写清价值', status: 'passed_pending', note: '用户未确认' },
            { id: '03', name: '拆功能和故事', status: 'blocked' },
          ],
        },
      ],
    })
    expect(openItems(project).map(item => [item.key, item.kind, item.text, item.station])).toEqual([
      ['pending:D1', 'decision', '首城选哪个', undefined],
      ['stage:initiation', 'assumption', '直接写 PRD', undefined],
      ['station:prd:02', 'assumption', '用户未确认', '02 写清价值'],
      ['station:prd:03', 'blocked', undefined, '03 拆功能和故事'],
    ])
  })
})
