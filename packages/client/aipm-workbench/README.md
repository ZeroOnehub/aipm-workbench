---
description: "AIPM 工坊 brand occupants and the right-Sidebar project tab that shows a project's six stages, checkpoints, and deliverables."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-aipm-workbench

Client plugin for the AIPM 工坊 build. It fills the sidebar and conversation-hero brand slots with the studio mark and name, and registers the `aipm-project` right-Sidebar tab type.

## Project tab

The tab reads the Session's workspace. A project is a folder that holds `aipm.json`; when the workspace root holds one, the workspace is that single project, otherwise every direct child folder with `aipm.json` is listed and the most recently `updated` one is selected. The `aipm-hub` skill owns the file format (`references/aipm-json.md` in that skill).

For the selected project the tab shows the six fixed stages (`01-立项` … `06-上线复盘`), each stage's stations from `aipm.json`, and the regular files in each stage directory. Clicking a file opens it through `openResource`, so the document preview tab renders Markdown and HTML. The tab rereads every 4 seconds while mounted and on the refresh button.

Directory listing is limited to the Session workspace by `dsh-api-workspace-files`, so the workspace must be `~/Documents/AIPM工坊` or a project folder.

## Model Experience

None, as this package only renders browser UI.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Polling instead of watching** — the tab rereads on a fixed interval instead of following `workspaceFiles.changes`, so updates appear up to 4 seconds late.
