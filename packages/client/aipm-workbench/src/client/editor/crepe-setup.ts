/**
 * Milkdown Crepe assembly for the Markdown editor tab. It is bundled into the
 * plugin entry: any Milkdown import in a dynamic chunk makes the bundler hoist a
 * synchronous chunk require into the entry, which the client loader rejects.
 *
 * Pasted or dropped images are intercepted before ProseMirror sees them: they
 * are stored beside the document through `uploadImage` and inserted as a
 * relative Markdown image, so the file stays plain Markdown plus an `images/`
 * directory.
 *
 * Evidence tags (【用户原话】 and the rest) are highlighted through ProseMirror
 * decorations recomputed on each document change; they never enter the Markdown.
 */
import { CrepeBuilder } from '@milkdown/crepe/builder'
import { blockEdit } from '@milkdown/crepe/feature/block-edit'
import { cursor } from '@milkdown/crepe/feature/cursor'
import { imageBlock } from '@milkdown/crepe/feature/image-block'
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip'
import { listItem } from '@milkdown/crepe/feature/list-item'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { table } from '@milkdown/crepe/feature/table'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { $prose, insert } from '@milkdown/kit/utils'
import { findEvidence } from '../evidence.ts'
import type { EditorHandle, EditorOptions } from './editor-types.ts'
import blockEditCss from '@milkdown/crepe/theme/common/block-edit.css?inline'
import cursorCss from '@milkdown/crepe/theme/common/cursor.css?inline'
import imageBlockCss from '@milkdown/crepe/theme/common/image-block.css?inline'
import linkTooltipCss from '@milkdown/crepe/theme/common/link-tooltip.css?inline'
import listItemCss from '@milkdown/crepe/theme/common/list-item.css?inline'
import placeholderCss from '@milkdown/crepe/theme/common/placeholder.css?inline'
import prosemirrorCss from '@milkdown/crepe/theme/common/prosemirror.css?inline'
import resetCss from '@milkdown/crepe/theme/common/reset.css?inline'
import tableCss from '@milkdown/crepe/theme/common/table.css?inline'
import toolbarCss from '@milkdown/crepe/theme/common/toolbar.css?inline'

/** Crepe's structural stylesheets, scoped to the editor root by the body. */
export const editorStyles = [
  prosemirrorCss, resetCss, blockEditCss, cursorCss, imageBlockCss,
  linkTooltipCss, listItemCss, placeholderCss, toolbarCss, tableCss,
].join('\n')

const evidenceKey = new PluginKey<DecorationSet>('aipm-evidence')

/** Inline decorations over every evidence tag inside a single text node. */
function evidenceDecorations(doc: ProseNode, classes: EditorOptions['evidenceClass']): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.text === undefined) return
    for (const mark of findEvidence(node.text)) {
      decorations.push(Decoration.inline(pos + mark.from, pos + mark.to, { class: classes[mark.kind] }))
    }
  })
  return DecorationSet.create(doc, decorations)
}

/** Image files carried by a paste or drop, in order. */
function imageFiles(data: DataTransfer | null): File[] {
  if (data === null) return []
  return [...data.files].filter(file => file.type.startsWith('image/'))
}

/**
 * Create a Crepe editor inside `root`.
 * @param root - empty host element; the editor owns its children until destroyed.
 * @param markdown - initial document.
 * @param options - change, upload, and URL callbacks.
 * @returns the live editor handle.
 */
export async function createEditor(root: HTMLElement, markdown: string, options: EditorOptions): Promise<EditorHandle> {
  // Only the features product documents need are imported: the full Crepe entry
  // statically pulls CodeMirror's per-language chunks, which share code across
  // chunks and break the client loader's self-contained chunk rule.
  const crepe = new CrepeBuilder({ root, defaultValue: markdown })
    .addFeature(cursor)
    .addFeature(listItem)
    .addFeature(linkTooltip)
    .addFeature(imageBlock, { onUpload: options.uploadImage, proxyDomURL: options.proxyUrl })
    .addFeature(blockEdit)
    .addFeature(toolbar)
    .addFeature(placeholder, { text: options.placeholder })
    .addFeature(table)
  crepe.on(listener => listener.markdownUpdated((_ctx, next) => { options.onChange(next) }))
  // Keep `-` bullets, the form the studio's skills and Feishu imports use.
  crepe.editor.config((ctx) => { ctx.update(remarkStringifyOptionsCtx, prev => ({ ...prev, bullet: '-' as const })) })
  crepe.editor.use($prose(() => new Plugin<DecorationSet>({
    key: evidenceKey,
    state: {
      init: (_config, state) => evidenceDecorations(state.doc, options.evidenceClass),
      apply: (tr, set) => tr.docChanged ? evidenceDecorations(tr.doc, options.evidenceClass) : set,
    },
    props: { decorations: state => evidenceKey.getState(state) },
  })))
  await crepe.create()

  const insertMarkdown = (text: string): void => { crepe.editor.action(insert(text)) }
  // A pasted image becomes an image node at the selection; ProseMirror splits a
  // heading or paragraph around it, which a Markdown round trip would not.
  const insertImage = (src: string): void => {
    crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      const type = state.schema.nodes['image-block'] ?? state.schema.nodes.image
      /* v8 ignore next -- both image node types ship with the features registered above. */
      if (type === undefined) return
      view.dispatch(state.tr.replaceSelectionWith(type.create({ src })).scrollIntoView())
      view.focus()
    })
  }
  const onTransfer = (event: ClipboardEvent | DragEvent): void => {
    const files = imageFiles('clipboardData' in event ? event.clipboardData : event.dataTransfer)
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    void (async () => {
      for (const file of files) {
        try {
          const destination = await options.uploadImage(file)
          insertImage(encodeURI(destination))
        } catch (error) {
          options.onUploadError(error)
        }
      }
    })()
  }
  root.addEventListener('paste', onTransfer, true)
  root.addEventListener('drop', onTransfer, true)

  return {
    getMarkdown: () => crepe.getMarkdown(),
    insertMarkdown,
    destroy: async () => {
      root.removeEventListener('paste', onTransfer, true)
      root.removeEventListener('drop', onTransfer, true)
      await crepe.destroy()
    },
  }
}
