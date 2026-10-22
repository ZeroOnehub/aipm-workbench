/** Evidence tags in deliverables are sorted by the weight they can carry. */
import { describe, expect, it } from 'vitest'
import { classifyTag, countEvidence, findEvidence, totalEvidence } from '../src/client/evidence.ts'

describe('classifyTag', () => {
  it('sorts the skill table tags into four kinds', () => {
    expect(classifyTag('用户原话')).toBe('hard')
    expect(classifyTag('公开资料')).toBe('hard')
    expect(classifyTag('业务方表达')).toBe('lead')
    expect(classifyTag('文档声称')).toBe('lead')
    expect(classifyTag('冲突')).toBe('conflict')
    expect(classifyTag('测算')).toBe('unverified')
    expect(classifyTag('模拟')).toBe('unverified')
  })

  it('reads the tag before a qualifier and ignores spaces', () => {
    expect(classifyTag('行为数据·单案')).toBe('hard')
    expect(classifyTag('公开资料·二手，口径待核')).toBe('hard')
    expect(classifyTag('AI 推断')).toBe('unverified')
    expect(classifyTag('AI推断')).toBe('unverified')
  })

  it('skips bracketed words outside the table', () => {
    expect(classifyTag('相机')).toBeUndefined()
    expect(classifyTag('待填：竞品调研进行中')).toBeUndefined()
  })
})

describe('findEvidence', () => {
  it('returns spans that cover the brackets', () => {
    const text = '用户说太贵了【用户原话·张三】，另有【相机】和【测算】'
    const marks = findEvidence(text)
    expect(marks.map(mark => [text.slice(mark.from, mark.to), mark.kind])).toEqual([
      ['【用户原话·张三】', 'hard'],
      ['【测算】', 'unverified'],
    ])
  })

  it('does not match across a line break', () => {
    expect(findEvidence('【用户\n原话】')).toEqual([])
  })
})

describe('countEvidence', () => {
  it('counts every kind and totals them', () => {
    const counts = countEvidence('【用户原话】【实测】【业务方表达】【冲突】【模拟】【AI 推断】【语气】')
    expect(counts).toEqual({ hard: 2, lead: 1, conflict: 1, unverified: 2 })
    expect(totalEvidence(counts)).toBe(6)
  })

  it('reports zero for text without tags', () => {
    expect(totalEvidence(countEvidence('# 标题\n正文'))).toBe(0)
  })
})
