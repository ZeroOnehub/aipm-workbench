/** Types shared by the editor body and the lazily loaded Crepe assembly. */
import type { EvidenceKind } from '../evidence.ts'

/** What the body needs from a live editor. */
export interface EditorHandle {
  /** @returns the document as Markdown. */
  getMarkdown(): string
  /** Insert Markdown at the selection. @param markdown - text to parse and insert. */
  insertMarkdown(markdown: string): void
  /** Tear the editor down and release its DOM. */
  destroy(): Promise<void>
}

/** Callbacks the body supplies. */
export interface EditorOptions {
  /** Placeholder shown in an empty document. */
  readonly placeholder: string
  /** Called after every document change. @param markdown - the new document. */
  readonly onChange: (markdown: string) => void
  /**
   * Store an image beside the document.
   * @param file - the image.
   * @returns the Markdown link destination for it.
   */
  readonly uploadImage: (file: File) => Promise<string>
  /** Turn a Markdown image destination into a URL the browser can load. @param url - the destination. @returns a loadable URL. */
  readonly proxyUrl: (url: string) => string
  /** Report an upload failure. @param error - what went wrong. */
  readonly onUploadError: (error: unknown) => void
  /** Class applied to each evidence tag in the document, by kind. Display only; the Markdown is unchanged. */
  readonly evidenceClass: Readonly<Record<EvidenceKind, string>>
}
