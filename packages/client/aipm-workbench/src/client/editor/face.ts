/**
 * What the Markdown editor body may do, bound in `apply` to the Client Remote
 * and the conversation input. Components receive plain callbacks only.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceAssetWrite, WorkspaceFileStat } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** A loaded document: full text and the stat it was read under. */
export interface LoadedDocument extends WorkspaceFileStat {
  readonly text: string
}

/** Outcome of handing an excerpt to the conversation composer. */
export type SendToAgentResult = 'sent' | 'busy' | 'unavailable'

/** The editor body's injected face. */
export interface MarkdownEditorInjected {
  /**
   * Read a whole UTF-8 document.
   * @param sessionId - authorizing Session.
   * @param path - path from the tab address.
   * @param signal - tab lifetime.
   * @returns the text with its version and absolute path.
   */
  readonly load: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<LoadedDocument>>
  /**
   * Current version of the document.
   * @param sessionId - authorizing Session.
   * @param path - path from the tab address.
   * @param signal - tab lifetime.
   * @returns the stat.
   */
  readonly stat: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileStat>>
  /**
   * Replace the document while it still has `expectedVersion`.
   * @param sessionId - authorizing Session.
   * @param path - path from the tab address.
   * @param content - complete new text.
   * @param expectedVersion - version the edit started from.
   * @param signal - tab lifetime.
   * @returns the new stat, or `workspace-file/stale` when the file moved on.
   */
  readonly save: (
    sessionId: SessionId, path: string, content: string, expectedVersion: string, signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceFileStat>>
  /**
   * Store an image beside the document.
   * @param sessionId - authorizing Session.
   * @param path - the document's path.
   * @param name - requested image file name.
   * @param base64 - image bytes.
   * @param signal - tab lifetime.
   * @returns the stored path relative to the document.
   */
  readonly saveImage: (
    sessionId: SessionId, path: string, name: string, base64: string, signal: AbortSignal,
  ) => Promise<RemoteResult<WorkspaceAssetWrite>>
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
   * @returns the authenticated media URL, or undefined when unsupported.
   */
  readonly mediaUrl: (absolutePath: string) => string | undefined
}
