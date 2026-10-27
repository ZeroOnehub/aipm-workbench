---
description: "Shijie brand occupants and the right-Sidebar project tab that shows a project's build progress, open items, six stages, checkpoints, and deliverables with their evidence."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-aipm-workbench

Client plugin for 拾阶 (Shijie), the AI product workbench. It fills the sidebar and conversation-hero brand slots with the studio mark and name, and registers the `aipm-project` right-Sidebar tab type.

The sidebar and hero share a bundled 256 px PNG derived from the desktop icon. Run `apps/desktop/scripts/set-aipm-icon.sh <logo.png> --no-mask` from the repository root for artwork with transparent rounded corners, then rebuild. The script updates the desktop PNG and ICNS, `src/client/brand-image.ts`, the welcome-page PNG, and both web favicons together. Internal package, preset, skill, and storage identifiers retain the `aipm` prefix so existing projects and sessions remain compatible.

## Hero footer

Under the blank-session composer, the footer lists up to three projects of the Session's workspace, most recently `updated` first, with the current stage and open-item counts per group (decisions, blockers, items to verify). Clicking a project appends `/aipm-hub` with that project to the composer draft; "All open items" opens the project tab. Below them, six stage cards put each stage's hub starter into the composer.

## Project tab

The tab reads the Session's workspace. A project is a folder that holds `aipm.json`; when the workspace root holds one, the workspace is that single project, otherwise every direct child folder with `aipm.json` is listed and the most recently `updated` one is selected. The `aipm-hub` skill owns the file format (`references/aipm-json.md` in that skill).

For the selected project the tab shows the six fixed stages (`01-立项` … `06-上线复盘`), each stage's stations from `aipm.json`, and the regular files in each stage directory. Clicking a file opens it through `openResource`, so the document preview tab renders Markdown and HTML. The tab rereads every 4 seconds while mounted and on the refresh button.

Above the stages, an open-items list groups what waits for the user: decisions, blockers, and items to verify. Items come from the `pending` array in `aipm.json` (entries with `status: resolved` are dropped) plus items derived from `blocked` and `passed_pending` stations and `skipped` stages, so files written before `pending` existed still list their open work. "Handle" appends a `/aipm-hub` starter naming the project and the item to the Session's composer draft; an item's `source` path opens that deliverable.

Once the `build-launch` skill hands a project off, `aipm.json` carries a `build` entry whose `path` is the product folder in the dev folder, outside the workspace. A build card above the open items then reads that folder's `docs/项目状态.md` (the `- 阶段：`, `- 最近更新：`, `- 上次停在：`, and `- 最新证据包：` lines the dev folder's `AGENTS.md` fixes) and, from the named evidence folder, `是否表.md` and `verify-输出.txt`. It shows the build stage on a six-segment bar (0 PRD check through 5 wrap-up), the last stop, the verify.sh verdict, and the gate rows answered 否 or 待验. "Ask the hub" appends a `/aipm-hub` progress question to the composer draft; "Open status file" opens the status file. When the status file cannot be read, the card names the path and falls back to the `build.stage` line the hub last recorded.

Each Markdown deliverable shows a stacked bar of its evidence tags (【用户原话】, 【测算】, …) sorted into hard evidence, leads, conflicts, and tags that are not evidence yet, following the evidence table of the `project-initiation` skill. A file is read again only when its listed size changes or the refresh button is pressed.

Directory listing is limited to the Session workspace by `dsh-api-workspace-files`, so the workspace must be the studio workspace (the folder that holds the project folders) or a single project folder. Text reads accept absolute paths outside the workspace, which is why the build card reads the dev folder by fixed file names and never lists it.

## Markdown editor tab

The `aipm-markdown-editor` tab type claims workspace `*.md` / `*.markdown` addresses in the `extension` band, so Markdown files open in a WYSIWYG editor (Milkdown Crepe) instead of the read-only preview. A leading YAML front-matter block is kept out of the editing surface and re-attached on save.

- **Saving** is explicit: ⌘S / Ctrl+S or the toolbar button. Each save calls `workspaceFiles.write` with the version the edit started from; a `workspace-file/stale` refusal shows a conflict bar offering to load the disk version or overwrite with the edit.
- **Unsaved drafts** are mirrored to `localStorage` per absolute path and restored on the next open, so closing the tab or the app loses nothing.
- **External changes** are detected by polling `stat` every 3 seconds: a clean document reloads; a dirty one shows the conflict bar.
- **Images** pasted or dropped into the editor are stored through `workspaceFiles.writeAsset` in `images/` beside the document and inserted as image nodes with a relative path.
- **Send to AI** appends the selected passage, quoted with the file name and path, to the Session's composer draft.
- **Evidence tags** are highlighted by kind through ProseMirror decorations, and a bar under the toolbar counts them as the document changes. Decorations are display only; saved Markdown is unchanged. A tag split by inline formatting inside its brackets is not recognized.

Milkdown is bundled into `lib/client.js` (about 2.9 MB) rather than a lazy chunk: any Milkdown import in a dynamic chunk makes the bundler hoist a synchronous chunk require into the entry, which the client loader rejects. Only the Crepe features documents need are imported; CodeMirror code highlighting is left out because its per-language chunks share code.

## Model Experience

None, as this package only renders browser UI.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Polling instead of watching** — the project tab and the editor reread on a fixed interval instead of following `workspaceFiles.changes`, so updates appear a few seconds late.
- **Build card trusts the status file** — the card shows what the coding agent wrote in `docs/项目状态.md` and the latest evidence package; it does not run `verify.sh` or check that the evidence matches the code. The `code-check` skill does that comparison on request.
- **Evidence counts are per file** — the project tab shows no project-wide total, because the project record (`00-项目档案.md`) repeats tags from the other deliverables. A tag legend table inside a document is counted like any other tag.
- **Markdown normalization** — saving rewrites the file in Milkdown's Markdown form (table padding, escaping); content is unchanged but diffs can show formatting churn.
- **No close guard** — the tab system cannot veto closing a dirty tab; the local-storage draft is the safety net.
