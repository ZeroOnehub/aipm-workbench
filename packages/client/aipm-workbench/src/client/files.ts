/**
 * The project tab's reads, bound to the Client Remote `workspaceFiles` namespace.
 *
 * `readText` reads a whole small file (aipm.json) by paging until `eof`;
 * `list` returns one directory's direct children. Both carry the Session so the
 * Host resolves paths and permissions against that Session's workspace.
 * `discoverProjects` finds the project folders the project tab and the Hero list.
 */
import type { ClientRemote, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { joinPath, parseProject } from './model.ts'
import type { Project } from './model.ts'

/** Upper bound on pages read for one file; aipm.json is a few dozen lines. */
const MAX_PAGES = 20

/** The injected face the body receives. */
export interface ProjectFiles {
  /**
   * Read a UTF-8 file in full.
   * @param sessionId - authorizing Session.
   * @param path - absolute path.
   * @param signal - tab lifetime.
   * @returns the text, or the Remote failure.
   */
  readonly readText: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<string>>
  /**
   * List a workspace directory.
   * @param sessionId - authorizing Session.
   * @param path - absolute path.
   * @param signal - tab lifetime.
   * @returns direct children, or the Remote failure.
   */
  readonly list: (
    sessionId: SessionId, path: string, signal: AbortSignal,
  ) => Promise<RemoteResult<readonly WorkspaceDirectoryEntry[]>>
}

/** One project folder found in a workspace. */
export interface FoundProject {
  readonly root: string
  readonly folder: string
  readonly project?: Project
  readonly error?: string
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function basename(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
}

/**
 * Find the projects of a workspace: the workspace root itself when it holds
 * `aipm.json`, otherwise every direct child folder that holds one, most
 * recently `updated` first.
 * @param files - the injected reads.
 * @param sessionId - authorizing Session.
 * @param cwd - the Session's workspace directory.
 * @param signal - caller lifetime.
 * @returns found projects; an unreadable or invalid `aipm.json` is listed with its error.
 */
export async function discoverProjects(
  files: ProjectFiles, sessionId: SessionId, cwd: string, signal: AbortSignal,
): Promise<FoundProject[]> {
  const load = async (root: string): Promise<FoundProject | undefined> => {
    const result = await files.readText(sessionId, joinPath(root, 'aipm.json'), signal)
    if (!result.ok) return result.error.code === 'workspace-file/not-found' ? undefined : { root, folder: basename(root), error: result.error.message }
    const parsed = parseProject(result.value, basename(root))
    return 'error' in parsed ? { root, folder: basename(root), error: parsed.error } : { root, folder: basename(root), project: parsed }
  }
  const own = await load(cwd)
  if (own !== undefined) return [own]
  const listing = await files.list(sessionId, cwd, signal)
  if (!listing.ok) return []
  const folders = listing.value.filter(entry => entry.type === 'directory' && !entry.name.startsWith('.'))
  return (await Promise.all(folders.map(entry => load(joinPath(cwd, entry.name)))))
    .filter((value): value is FoundProject => value !== undefined)
    .sort((a, b) => (b.project?.updated ?? '').localeCompare(a.project?.updated ?? '') || byName.compare(a.folder, b.folder))
}

/**
 * Bind the reads to one Remote face.
 * @param remote - Client Remote carrying `workspaceFiles`.
 * @returns the face shared by every project tab.
 */
export function projectFiles(remote: { readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'read' | 'list'> }): ProjectFiles {
  return {
    async readText(sessionId, path, signal) {
      const parts: string[] = []
      let offset = 1
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await remote.workspaceFiles.read(sessionId, path, { offset }, signal)
        if (!result.ok) return result
        if (result.value.lines > 0) parts.push(result.value.text)
        if (result.value.eof || result.value.lines === 0) break
        offset += result.value.lines
      }
      return { ok: true, value: parts.join('\n') }
    },
    async list(sessionId, path, signal) {
      const result = await remote.workspaceFiles.list(sessionId, path, signal)
      return result.ok ? { ok: true, value: result.value.entries } : result
    },
  }
}
