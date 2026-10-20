---
description: "AIPM 工坊 brand occupants and the right-Sidebar project tab that shows a project's six stages, checkpoints, and deliverables."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-aipm-workbench

Client plugin for the AIPM 工坊 build. It fills the sidebar and conversation-hero brand slots with the studio mark and name, and registers the `aipm-project` right-Sidebar tab type.

## Project tab

The tab reads the Session's workspace. A project is a folder that holds `aipm.json`; when the workspace root holds one, the workspace is that single project, otherwise every direct child folder with `aipm.json` is listed and the most recently `updated` one is selected. The `aipm-hub` skill owns the file format (`references/aipm-json.md` in that skill).

For the selected project the tab shows the six fixed stages (`01-立项` … `06-上线复盘`), each stage's stations from `aipm.json`, and the regular files in each stage directory. Clicking a file opens it through `openResource`, so the document preview tab renders Markdown and HTML. The tab rereads every 4 seconds while mounted and on the refresh button.

Directory listing is limited to the Session workspace by `dsh-api-workspace-files`, so the workspace must be the studio workspace (the folder that holds the project folders) or a single project folder.

## Markdown editor tab

The `aipm-markdown-editor` tab type claims workspace `*.md` / `*.markdown` addresses in the `extension` band, so Markdown files open in a WYSIWYG editor (Milkdown Crepe) instead of the read-only preview. A leading YAML front-matter block is kept out of the editing surface and re-attached on save.

- **Saving** is explicit: ⌘S / Ctrl+S or the toolbar button. Each save calls `workspaceFiles.write` with the version the edit started from; a `workspace-file/stale` refusal shows a conflict bar offering to load the disk version or overwrite with the edit.
- **Unsaved drafts** are mirrored to `localStorage` per absolute path and restored on the next open, so closing the tab or the app loses nothing.
- **External changes** are detected by polling `stat` every 3 seconds: a clean document reloads; a dirty one shows the conflict bar.
- **Images** pasted or dropped into the editor are stored through `workspaceFiles.writeAsset` in `images/` beside the document and inserted as image nodes with a relative path.
- **Send to AI** appends the selected passage, quoted with the file name and path, to the Session's composer draft.

Milkdown is bundled into `lib/client.js` (about 2.9 MB) rather than a lazy chunk: any Milkdown import in a dynamic chunk makes the bundler hoist a synchronous chunk require into the entry, which the client loader rejects. Only the Crepe features documents need are imported; CodeMirror code highlighting is left out because its per-language chunks share code.

## Model Experience

None, as this package only renders browser UI.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Polling instead of watching** — the project tab and the editor reread on a fixed interval instead of following `workspaceFiles.changes`, so updates appear a few seconds late.
- **Markdown normalization** — saving rewrites the file in Milkdown's Markdown form (table padding, escaping); content is unchanged but diffs can show formatting churn.
- **No close guard** — the tab system cannot veto closing a dirty tab; the local-storage draft is the safety net.
