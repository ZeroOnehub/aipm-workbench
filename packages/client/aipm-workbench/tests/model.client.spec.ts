/** `aipm.json`: stage maps by version, and open items written by the skills or derived from station and stage status. */
import { describe, expect, it } from 'vitest'
import { LEGACY_STAGES, STAGES, openItems, parseProject, stageNameIn } from '../src/client/model.ts'
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

describe('parseProject stages', () => {
  it('uses the current six stages for a version 2 file', () => {
    const project = parse({
      version: 2,
      project: '示例',
      currentStage: 'model-eval',
      stages: [{ id: 'tech', status: 'done' }, { id: 'model-eval', status: 'in_progress' }],
    })
    expect(project.legacy).toBe(false)
    expect(project.stages.map(stage => [stage.id, stage.dir, stage.status])).toEqual([
      ['initiation', '01-立项', 'unavailable'],
      ['prd', '02-PRD', 'unavailable'],
      ['prototype', '03-原型交互', 'unavailable'],
      ['tech', '04-技术方案', 'done'],
      ['model-eval', '05-模型评测', 'in_progress'],
      ['mvp', '06-MVP', 'unavailable'],
    ])
    expect(stageNameIn(project, project.currentStage)).toBe('模型评测')
  })

  it('keeps the earlier six stages for a file without version 2', () => {
    const project = parse({ version: 1, project: '示例', currentStage: 'ai-design', stages: [{ id: 'ai-design', status: 'done' }] })
    expect(project.legacy).toBe(true)
    expect(project.stages.map(stage => stage.id)).toEqual(LEGACY_STAGES.map(stage => stage.id))
    expect(project.stages.find(stage => stage.id === 'ai-design')?.status).toBe('done')
    expect(stageNameIn(project, 'ai-design')).toBe('AI 方案设计')
    expect(stageNameIn(project, 'tech')).toBeUndefined()
  })

  it('shares the first three stages between the two maps', () => {
    expect(LEGACY_STAGES.slice(0, 3)).toEqual(STAGES.slice(0, 3))
  })

  it('marks a build legacy in an old file or when the upgrade flagged it', () => {
    const build = { path: '/w/示例/06-MVP/app' }
    expect(parse({ version: 2, project: '示例', build }).build?.legacy).toBe(false)
    expect(parse({ version: 1, project: '示例', build }).build?.legacy).toBe(true)
    expect(parse({ version: 2, project: '示例', build: { ...build, legacy: true } }).build?.legacy).toBe(true)
  })
})
