/**
 * Pure helpers for the Markdown editor: front matter is kept out of the
 * WYSIWYG surface and re-attached on save, unsaved drafts survive a closed tab
 * in local storage, and pasted images get readable unique names.
 */

/** A file split into the raw front-matter block and the editable body. */
export interface SplitDocument {
  /** The `---` block with its trailing newline, or empty when the file has none. */
  readonly frontMatter: string
  readonly body: string
}

/**
 * Separate a leading YAML front-matter block.
 * @param text - complete file text.
 * @returns the raw block and the remaining Markdown.
 */
export function splitFrontMatter(text: string): SplitDocument {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (match === null) return { frontMatter: '', body: text }
  return { frontMatter: match[0], body: text.slice(match[0].length).replace(/^\r?\n/, '') }
}

/**
 * Re-attach front matter to an edited body.
 * @param frontMatter - the block kept from load.
 * @param body - the editor's Markdown.
 * @returns complete file text ending in one newline.
 */
export function joinFrontMatter(frontMatter: string, body: string): string {
  const text = frontMatter === '' ? body : `${frontMatter}\n${body}`
  return text.endsWith('\n') ? text : `${text}\n`
}

/** One unsaved draft kept for a file. */
export interface StoredDraft {
  /** Version of the file the draft started from. */
  readonly baseVersion: string
  readonly markdown: string
  readonly savedAt: number
}

const DRAFT_PREFIX = 'aipm.markdown-draft.v1:'

/**
 * Read the unsaved draft for a file, if any.
 * @param absolutePath - the file's absolute path.
 * @returns the draft, or undefined when none or storage is unavailable.
 */
export function readDraft(absolutePath: string): StoredDraft | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + absolutePath)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined
    const { baseVersion, markdown, savedAt } = value as Record<string, unknown>
    if (typeof baseVersion !== 'string' || typeof markdown !== 'string' || typeof savedAt !== 'number') return undefined
    return { baseVersion, markdown, savedAt }
  } catch (_error) {
    // Storage disabled or a corrupt entry: there is no draft to restore.
    return undefined
  }
}

/**
 * Keep or clear the unsaved draft for a file.
 * @param absolutePath - the file's absolute path.
 * @param draft - the draft, or undefined to clear it.
 */
export function writeDraft(absolutePath: string, draft: StoredDraft | undefined): void {
  try {
    if (draft === undefined) localStorage.removeItem(DRAFT_PREFIX + absolutePath)
    else localStorage.setItem(DRAFT_PREFIX + absolutePath, JSON.stringify(draft))
  } catch (_error) {
    // Storage full or disabled: the in-memory document is still intact.
  }
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
}

/**
 * Name a pasted image: keep a real file name, otherwise date-stamp it.
 * @param file - the pasted or dropped image.
 * @param now - the clock.
 * @returns a file name with an accepted image extension, or undefined for an unsupported type.
 */
export function imageNameFor(file: File, now: Date): string | undefined {
  const extension = EXTENSIONS[file.type]
  if (extension === undefined) return undefined
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const stem = file.name.replace(/\.[^.]*$/, '').replace(/[/\\:*?"<>|\s]+/g, '-').replace(/^[-.]+/, '').slice(0, 60)
  const generic = stem === '' || /^image(-\d+)?$/i.test(stem)
  return `${generic ? `image-${stamp}` : stem}.${extension}`
}

/**
 * Encode a file for the Remote.
 * @param file - the image.
 * @returns its bytes as base64.
 */
export async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Quote an excerpt for the conversation composer.
 * @param lead - localized line naming the document.
 * @param excerpt - the selected text.
 * @returns the draft fragment.
 */
export function quoteForAgent(lead: string, excerpt: string): string {
  const quoted = excerpt.trim().split(/\r?\n/).map(line => `> ${line}`).join('\n')
  return `${lead}\n${quoted}\n`
}
