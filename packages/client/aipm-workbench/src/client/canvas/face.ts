/**
 * What the canvas body may do, bound in `apply` to the Client Remote and the
 * conversation input. Components receive plain callbacks only.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceAssetWrite, WorkspaceFileStat } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LoadedDocument, SendToAgentResult } from '../editor/face.ts'

/** The canvas body's injected face. */
export interface CanvasInjected {
  /**
   * Read a whole UTF-8 file with its version.
   * @param sessionId - authorizing Session.
   * @param path - path from the tab address.
   * @param signal - tab lifetime.
   * @returns the text, version, and absolute path.
   */
  readonly load: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<LoadedDocument>>
  /**
   * Current version of a file.
   * @param sessionId - authorizing Session.
   * @param path - path from the tab address.
   * @param signal - tab lifetime.
   * @returns the stat.
   */
  readonly stat: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileStat>>
  /**
   * Replace a file while it still has `expectedVersion`.
   * @param sessionId - authorizing Session.
   * @param path - the file.
   * @param content - complete new text.
   * @param expectedVersion - version the edit started from.
   * @param signal - tab lifetime.
   * @returns the new stat, or `workspace-file/stale` when the file moved on.
   */
  readonly save: (
    sessionId: SessionId, path: string, content: string, expectedVersion: string, signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceFileStat>>
  /**
   * Create a file that does not exist yet.
   * @param sessionId - authorizing Session.
   * @param path - absolute path inside the workspace.
   * @param content - initial text.
   * @param signal - tab lifetime.
   * @returns the stat, or `workspace-file/exists` when something is already there.
   */
  readonly create: (sessionId: SessionId, path: string, content: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileStat>>
  /**
   * Store an image in the `images/` folder beside the canvas.
   * @param sessionId - authorizing Session.
   * @param path - the canvas path.
   * @param name - requested file name.
   * @param base64 - image bytes.
   * @param signal - tab lifetime.
   * @returns the stored paths.
   */
  readonly saveImage: (
    sessionId: SessionId, path: string, name: string, base64: string, signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceAssetWrite>>
  /**
   * Read a whole small text file, for document node previews.
   * @param sessionId - authorizing Session.
   * @param path - absolute path.
   * @param signal - tab lifetime.
   * @returns the text.
   */
  readonly readText: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<string>>
  /**
   * Append text to the Session's composer draft and focus it.
   * @param sessionId - the Session whose composer receives the text.
   * @param text - the fragment to append.
   * @returns whether the composer took it.
   */
  readonly sendToAgent: (sessionId: SessionId, text: string) => SendToAgentResult
  /**
   * A loadable URL for a local image.
   * @param absolutePath - the image's absolute path.
   * @returns the media URL, or undefined when unsupported.
   */
  readonly mediaUrl: (absolutePath: string) => string | undefined
  /**
   * Open a web address outside the app.
   * @param url - an http(s) address.
   */
  readonly openExternal: (url: string) => void
}
