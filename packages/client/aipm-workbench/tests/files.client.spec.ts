/** Workspace project discovery shared by the project tab and the Hero footer. */
import { describe, expect, it } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { discoverProjects } from '../src/client/files.ts'
import type { ProjectFiles } from '../src/client/files.ts'
import { pendingGroupOf } from '../src/client/model.ts'

const SESSION = 'session-a' as SessionId

/** Reads over an in-memory tree: `files` maps absolute paths to contents, `dirs` to child entries. */
function memory(files: Record<string, string>, dirs: Record<string, WorkspaceDirectoryEntry[]>): ProjectFiles {
  return {
    readText: async (_session, path) => (path in files
      ? { ok: true, value: files[path] ?? '' }
      : { ok: false, error: { code: 'workspace-file/not-found', message: path } }) as RemoteResult<string>,
    list: async (_session, path) => ({ ok: true, value: dirs[path] ?? [] }),
  }
}

describe('discoverProjects', () => {
  it('lists child projects newest first and skips folders without aipm.json', async () => {
    const reads = memory({
      '/ws/a/aipm.json': JSON.stringify({ project: 'A', updated: '2026-10-01 10:00' }),
      '/ws/b/aipm.json': JSON.stringify({ project: 'B', updated: '2026-10-20 09:00' }),
      '/ws/broken/aipm.json': '{',
    }, {
      '/ws': [
        { name: 'a', type: 'directory' }, { name: 'b', type: 'directory' }, { name: 'broken', type: 'directory' },
        { name: 'plain', type: 'directory' }, { name: '.dsh', type: 'directory' }, { name: 'notes.md', type: 'file' },
      ],
    })
    const found = await discoverProjects(reads, SESSION, '/ws', new AbortController().signal)
    expect(found.map(entry => [entry.folder, entry.project?.name, entry.error === undefined])).toEqual([
      ['b', 'B', true],
      ['a', 'A', true],
      ['broken', undefined, false],
    ])
  })

  it('treats a workspace that holds aipm.json as the single project', async () => {
    const reads = memory({ '/one/aipm.json': JSON.stringify({ project: 'One' }) }, {})
    const found = await discoverProjects(reads, SESSION, '/one', new AbortController().signal)
    expect(found.map(entry => entry.project?.name)).toEqual(['One'])
  })
})

describe('pendingGroupOf', () => {
  it('lists assumptions and evidence gaps under verify', () => {
    expect(['decision', 'blocked', 'assumption', 'gap'].map(kind => pendingGroupOf(kind as 'decision'))).toEqual(['decision', 'blocked', 'verify', 'verify'])
  })
})
