/** A handed-off project's dev-folder progress: status lines, gate table, verify summary, and the combined read. */
import { describe, expect, it } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { parseBuildStatus, parseGate, parseVerify, readBuild } from '../src/client/build.ts'
import type { ProjectFiles } from '../src/client/files.ts'
import { parseProject } from '../src/client/model.ts'

const SESSION = 'session-a' as SessionId
const PRODUCT = '/dev/projects/微醺指南'

const STATUS = `# 项目状态

## 当前阶段
- 阶段：2 后端 MVP（第 1 阶段）
- 最近更新：2026-10-26
- 上次停在：2-1 证据包已交，真实冒烟待 Key
- 最新证据包：docs/evidence/阶段2-1/

## 阶段历史
- 2026-10-26：阶段 0 在拾阶完成，证据包在 docs/evidence/阶段0/
`

const GATE = `# 阶段 2-1 是否表

| # | 检查项 | 是 / 否 |
| --- | --- | --- |
| 1 | 本阶段范围内的功能已实现 | 是 |
| 2 | mock 自动化测试 | 见 verify-输出.txt |
| 3 | 真实模型冒烟 | 待验（没有 Key） |
| 4 | 前端构建 | N/A（临时验收页） |
| 7 | 桌面与移动端 | 否 |
`

const VERIFY = `================ 汇总（抄进是否表的就是这五行） ================
是否表第 2 项  mock 测试：      通过（9/9）
是否表第 4 项  前端检查与构建： N/A（本阶段无正式前端）
是否表第 5 项  密钥排除：       不通过（1 处问题，见输出）
是否表第 6 项  重启后数据恢复： 未配置
是否表第 10 项 文件齐全与位置： 通过
总判定：有不通过或未配置项，对应是否表只能填"否"。
`

function memory(files: Record<string, string>): ProjectFiles {
  return {
    readText: async (_session, path) => (path in files
      ? { ok: true, value: files[path] ?? '' }
      : { ok: false, error: { code: 'workspace-file/not-found', message: `not found: ${path}` } }) as RemoteResult<string>,
    list: async () => ({ ok: true, value: [] }),
  }
}

describe('parseBuildStatus', () => {
  it('reads the four current-stage lines and the stage number', () => {
    expect(parseBuildStatus(STATUS)).toEqual({
      stage: '2 后端 MVP（第 1 阶段）',
      stageIndex: 2,
      updated: '2026-10-26',
      stoppedAt: '2-1 证据包已交，真实冒烟待 Key',
      evidenceDir: 'docs/evidence/阶段2-1',
    })
  })

  it('falls back to the last evidence folder mentioned when the evidence line names none', () => {
    const text = STATUS.replace('- 最新证据包：docs/evidence/阶段2-1/', '- 最新证据包：无')
    expect(parseBuildStatus(text).evidenceDir).toBe('docs/evidence/阶段0')
  })

  it('ignores a template placeholder and a stage without a valid number', () => {
    const status = parseBuildStatus('- 阶段：技术适配\n- 最新证据包：docs/evidence/<阶段名>/（还没有就写「无」）\n')
    expect(status.stageIndex).toBeUndefined()
    expect(status.evidenceDir).toBeUndefined()
    expect(parseBuildStatus('- 阶段：7 运营\n').stageIndex).toBeUndefined()
  })
})

describe('parseGate', () => {
  it('classifies each numbered row by its last cell', () => {
    expect(parseGate(GATE).map(row => [row.no, row.mark])).toEqual([
      [1, 'yes'], [2, 'see'], [3, 'pending'], [4, 'na'], [7, 'no'],
    ])
    expect(parseGate(GATE)[2]?.item).toBe('真实模型冒烟')
  })
})

describe('parseVerify', () => {
  it('lists failing and unconfigured items and reads the verdict', () => {
    expect(parseVerify(VERIFY)).toEqual({ passed: false, failures: ['密钥排除', '重启后数据恢复'] })
  })

  it('passes when the verdict reports every item passed or not applicable', () => {
    expect(parseVerify('是否表第 2 项  mock 测试：      通过（9/9）\n总判定：五项全部通过或不适用。\n')).toEqual({ passed: true, failures: [] })
  })

  it('returns undefined without a verdict line', () => {
    expect(parseVerify('verify.sh 自检\n')).toBeUndefined()
  })
})

describe('readBuild', () => {
  it('reads the status file and the latest evidence package by fixed names', async () => {
    const view = await readBuild(memory({
      [`${PRODUCT}/docs/项目状态.md`]: STATUS,
      [`${PRODUCT}/docs/evidence/阶段2-1/是否表.md`]: GATE,
      [`${PRODUCT}/docs/evidence/阶段2-1/verify-输出.txt`]: VERIFY,
    }), SESSION, PRODUCT, new AbortController().signal)
    expect(view.status?.stageIndex).toBe(2)
    expect(view.gate).toHaveLength(5)
    expect(view.verify?.failures).toEqual(['密钥排除', '重启后数据恢复'])
  })

  it('reports an unreadable status file and leaves missing evidence unset', async () => {
    const missing = await readBuild(memory({}), SESSION, PRODUCT, new AbortController().signal)
    expect(missing).toEqual({ error: `not found: ${PRODUCT}/docs/项目状态.md` })
    const noEvidence = await readBuild(memory({ [`${PRODUCT}/docs/项目状态.md`]: STATUS }), SESSION, PRODUCT, new AbortController().signal)
    expect(noEvidence).toMatchObject({ gate: undefined, verify: undefined })
    expect(noEvidence.status?.evidenceDir).toBe('docs/evidence/阶段2-1')
  })

  it('stops after the status file when it names no evidence folder', async () => {
    const view = await readBuild(memory({ [`${PRODUCT}/docs/项目状态.md`]: '- 阶段：1 技术适配\n' }), SESSION, PRODUCT, new AbortController().signal)
    expect(view).toEqual({ status: { stage: '1 技术适配', stageIndex: 1, updated: undefined, stoppedAt: undefined, evidenceDir: undefined } })
  })
})

describe('parseProject build', () => {
  it('keeps a build entry with a path and drops one without', () => {
    const parsed = parseProject(JSON.stringify({
      version: 2,
      project: '微醺指南',
      build: { path: PRODUCT, tool: 'Claude Code', stage: '1 后端 MVP', checked: '2026-10-26', extra: 1 },
    }), '微醺指南')
    expect('error' in parsed ? undefined : parsed.build).toEqual({
      path: PRODUCT, tool: 'Claude Code', handoff: undefined, synced: undefined, stage: '1 后端 MVP', checked: '2026-10-26', legacy: false,
    })
    const withoutPath = parseProject(JSON.stringify({ project: '微醺指南', build: { tool: 'Codex' } }), '微醺指南')
    expect('error' in withoutPath ? 'error' : withoutPath.build).toBeUndefined()
  })
})
