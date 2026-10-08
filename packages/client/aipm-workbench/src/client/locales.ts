/**
 * `aipmWorkbench` namespace dictionaries, and the namespace's declaration.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** AIPM 工坊 brand name, project tab chrome, and status labels. */
    aipmWorkbench: AipmWorkbenchKey
  }
}

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'brand.name': 'AIPM 工坊',
  'tab.title': '项目',
  'guide.title': '项目进度',
  'guide.description': '六个阶段走到哪了，每一站过没过关，产出物都在这里。',
  'project.label': '项目',
  'project.updated': '更新于 {time}',
  'project.type': '类型 {type}',
  refresh: '刷新',
  loading: '正在读取项目…',
  noWorkspace: '这个会话没有工作区。',
  'empty.title': '还没有项目',
  'empty.body': '在对话里说「新建项目」，或者输入 /aipm-hub，工坊会在当前工作区里建好项目文件夹。',
  'empty.hint': '项目面板只看当前工作区：工作区要选 ~/Documents/AIPM工坊，或者直接选某个项目文件夹。',
  'error.read': '读不到 {path}：{message}',
  current: '当前',
  deliverables: '产出物',
  'deliverables.none': '还没有产出物',
  stations: '各站进度',
  'stage.unavailable': '未接入',
  'stage.not_started': '未开始',
  'stage.in_progress': '进行中',
  'stage.done': '已完成',
  'stage.skipped': '已跳过',
  'station.not_started': '未开始',
  'station.in_progress': '进行中',
  'station.passed': '已过关',
  'station.passed_pending': '带待验证项通过',
  'station.blocked': '卡住了',
  'stage.unavailableHint': '这个阶段的 skill 还没接入工坊',
}

/** Namespace key union, derived from the source-of-truth dictionary. */
export type AipmWorkbenchKey = keyof typeof zh

/** English dictionary. */
export const en = {
  'brand.name': 'AIPM Studio',
  'tab.title': 'Project',
  'guide.title': 'Project progress',
  'guide.description': 'Where each of the six stages stands, which checkpoints passed, and every deliverable.',
  'project.label': 'Project',
  'project.updated': 'Updated {time}',
  'project.type': 'Type {type}',
  refresh: 'Refresh',
  loading: 'Reading projects…',
  noWorkspace: 'This session has no workspace directory.',
  'empty.title': 'No projects yet',
  'empty.body': 'Say "new project" in the chat or run /aipm-hub to create a project folder in this workspace.',
  'empty.hint': 'The panel reads the current workspace only: choose ~/Documents/AIPM工坊 or a single project folder as the workspace.',
  'error.read': 'Cannot read {path}: {message}',
  current: 'Current',
  deliverables: 'Deliverables',
  'deliverables.none': 'No deliverables yet',
  stations: 'Checkpoints',
  'stage.unavailable': 'Not connected',
  'stage.not_started': 'Not started',
  'stage.in_progress': 'In progress',
  'stage.done': 'Done',
  'stage.skipped': 'Skipped',
  'station.not_started': 'Not started',
  'station.in_progress': 'In progress',
  'station.passed': 'Passed',
  'station.passed_pending': 'Passed with open items',
  'station.blocked': 'Blocked',
  'stage.unavailableHint': 'No skill is connected for this stage yet',
} satisfies Record<AipmWorkbenchKey, string>
