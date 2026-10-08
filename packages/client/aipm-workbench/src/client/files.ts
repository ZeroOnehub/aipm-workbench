/**
 * The project tab's reads, bound to the Client Remote `workspaceFiles` namespace.
 *
 * `readText` reads a whole small file (aipm.json) by paging until `eof`;
 * `list` returns one directory's direct children. Both carry the Session so the
 * Host resolves paths and permissions against that Session's workspace.
 */
import type { ClientRemote, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

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
