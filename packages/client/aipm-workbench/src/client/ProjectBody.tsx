/**
 * The project tab body: pick a project in the session's workspace, show its
 * six stages as a pipeline with their stations, owning skills, and each stage
 * directory's files.
 *
 * Projects are folders holding `aipm.json`. When the workspace root itself
 * holds one, the workspace is that single project. Files open through the tab's
 * `openResource` so the document preview tab renders Markdown and HTML.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTypeIcon, IconRefreshOutlineRegular, Tooltip, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { ProjectFiles } from './files.ts'
import { STAGES, isDeliverable, joinPath, parseProject } from './model.ts'
import type { Project, Stage, StageDefinition } from './model.ts'
import type {} from './locales.ts'
import css from './workbench.module.css'

/** The body's composed props. */
export type ProjectBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & ProjectFiles
  & PropsLocale<'aipmWorkbench'>

/** Reread interval while the tab is mounted; skills write files mid-turn. */
const POLL_MS = 4000

/** One project folder found in the workspace. */
interface FoundProject {
  readonly root: string
  readonly folder: string
  readonly project?: Project
  readonly error?: string
}

/** Files per stage directory, keyed by stage id. */
type StageFiles = Record<string, readonly WorkspaceDirectoryEntry[]>

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function basename(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
}

function stageNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/** Owning skills as small monospace chips. */
function SkillChips({ stage }: { readonly stage: StageDefinition }): ReactNode {
  return (
    <span className={css.skills}>
      {stage.skills.slice(0, 2).map(skill => <span key={skill} className={css.skill}>{skill}</span>)}
      {stage.skills.length > 2 && <span className={css.skillMore}>+{stage.skills.length - 2}</span>}
    </span>
  )
}

/** The project tab body. */
export function ProjectBody({ useTabInfo, sessionId, useSessions, readText, list, t }: ProjectBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const { signal } = tab
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const [projects, setProjects] = useState<readonly FoundProject[] | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [files, setFiles] = useState<StageFiles>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => { setTick(value => value + 1) }, [])
  useEffect(() => tab.actions.bindCommands({ refresh }), [tab.actions, refresh])
  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS)
    return () => { clearInterval(timer) }
  }, [refresh])

  // Discover projects: the workspace root itself, else its direct child folders.
  useEffect(() => {
    if (cwd === undefined || signal.aborted) return
    let cancelled = false
    const load = async (root: string): Promise<FoundProject | undefined> => {
      const result = await readText(sessionId, joinPath(root, 'aipm.json'), signal)
      if (!result.ok) return result.error.code === 'workspace-file/not-found' ? undefined : { root, folder: basename(root), error: result.error.message }
      const parsed = parseProject(result.value, basename(root))
      return 'error' in parsed ? { root, folder: basename(root), error: parsed.error } : { root, folder: basename(root), project: parsed }
    }
    void (async () => {
      const own = await load(cwd)
      if (own !== undefined) {
        if (!cancelled) setProjects([own])
        return
      }
      const listing = await list(sessionId, cwd, signal)
      if (!listing.ok) {
        if (!cancelled) setProjects([])
        return
      }
      const folders = listing.value.filter(entry => entry.type === 'directory' && !entry.name.startsWith('.'))
      const found = (await Promise.all(folders.map(entry => load(joinPath(cwd, entry.name)))))
        .filter((value): value is FoundProject => value !== undefined)
        .sort((a, b) => (b.project?.updated ?? '').localeCompare(a.project?.updated ?? '') || byName.compare(a.folder, b.folder))
      if (!cancelled) setProjects(found)
    })()
    return () => { cancelled = true }
  }, [cwd, sessionId, signal, readText, list, tick])

  const current = useMemo(() => {
    if (projects === undefined || projects.length === 0) return undefined
    return projects.find(p => p.root === selected) ?? projects[0]
  }, [projects, selected])

  // List each stage directory of the current project.
  useEffect(() => {
    if (current?.project === undefined || signal.aborted) return
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(STAGES.map(async (stage) => {
        const result = await list(sessionId, joinPath(current.root, stage.dir), signal)
        const visible = result.ok
          ? result.value.filter(entry => entry.type === 'file' && isDeliverable(entry.name)).sort((a, b) => byName.compare(a.name, b.name))
          : []
        return [stage.id, visible] as const
      }))
      if (!cancelled) setFiles(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [current?.root, current?.project, sessionId, signal, list, tick])

  if (cwd === undefined) return <div className={css.status}>{t('noWorkspace')}</div>
  if (projects === undefined) return <div className={css.status}>{t('loading')}</div>
  if (current === undefined) {
    return (
      <div className={css.root}>
        <div className={css.empty}>
          <p className={css.emptyTitle}>{t('empty.title')}</p>
          <p>{t('empty.body')}</p>
        </div>
        <ol className={css.preview} aria-label={t('empty.pipeline')}>
          {STAGES.map((stage, index) => (
            <li key={stage.id} className={css.previewItem}>
              <span className={css.previewNum}>{stageNumber(index)}</span>
              <span className={css.previewText}>
                <span className={css.previewName}>{stage.name}</span>
                <span className={css.previewOutput}>{stage.output}</span>
              </span>
              <SkillChips stage={stage} />
            </li>
          ))}
        </ol>
        <p className={css.emptyHint}>{t('empty.hint')}</p>
      </div>
    )
  }

  const openFile = (path: string): void => { tab.actions.openResource(fileAddressFor(sessionId, cwd, path)) }
  const project = current.project
  const isOpen = (stage: Stage): boolean => open[stage.id] ?? (stage.id === project?.currentStage || (files[stage.id]?.length ?? 0) > 0)
  const done = project?.stages.filter(stage => stage.status === 'done').length ?? 0
  const currentStage = project?.stages.find(stage => stage.id === project.currentStage)

  return (
    <div className={css.root}>
      <div className={css.header}>
        {projects.length > 1
          ? (
            <select
              className={css.select}
              aria-label={t('project.label')}
              value={current.root}
              onChange={(event) => { setSelected(event.target.value) }}
            >
              {projects.map(p => <option key={p.root} value={p.root}>{p.project?.name ?? p.folder}</option>)}
            </select>
          )
          : <span className={css.projectName}>{project?.name ?? current.folder}</span>}
        <Tooltip label={t('refresh')} side="bottom" delayMs={500}>
          <button type="button" className={css.iconButton} aria-label={t('refresh')} onClick={refresh}>
            <IconRefreshOutlineRegular />
          </button>
        </Tooltip>
      </div>

      {current.error !== undefined && (
        <div className={css.error}>{t('error.read', { path: joinPath(current.folder, 'aipm.json'), message: current.error })}</div>
      )}

      {project !== undefined && (
        <div className={css.summary}>
          <div className={css.summaryMeta}>
            {project.type !== undefined && <span className={css.typeChip}>{project.type}</span>}
            {project.updated !== undefined && <span>{t('project.updated', { time: project.updated })}</span>}
          </div>
          <div className={css.pipeline} aria-hidden="true">
            {project.stages.map(stage => (
              <span
                key={stage.id}
                className={`${css.pipeSeg} ${css[`pipe_${stage.status}`] ?? ''} ${stage.id === project.currentStage ? css.pipeCurrent : ''}`}
              />
            ))}
          </div>
          <div className={css.summaryText}>
            <span>{t('summary.done', { done: String(done), total: String(project.stages.length) })}</span>
            {currentStage !== undefined && <span className={css.summaryCurrent}>{t('summary.current', { stage: currentStage.name })}</span>}
          </div>
        </div>
      )}

      {project !== undefined && (
        <ol className={css.timeline}>
          {project.stages.map((stage, index) => {
            const stageFiles = files[stage.id] ?? []
            const expanded = isOpen(stage)
            const passed = stage.stations.filter(s => s.status === 'passed' || s.status === 'passed_pending').length
            const isCurrent = stage.id === project.currentStage
            return (
              <li
                key={stage.id}
                className={`${css.stage} ${css[`stage_${stage.status}`] ?? ''} ${isCurrent ? css.stageCurrent : ''}`}
                data-stage={stage.id}
              >
                <div className={css.rail} aria-hidden="true">
                  <span className={css.node}>{stage.status === 'done' ? '✓' : stageNumber(index)}</span>
                </div>
                <div className={css.stageMain}>
                  <button
                    type="button"
                    className={css.stageHead}
                    aria-expanded={expanded}
                    title={stage.note ?? (stage.status === 'unavailable' ? t('stage.unavailableHint') : undefined)}
                    onClick={() => { setOpen(prev => ({ ...prev, [stage.id]: !expanded })) }}
                  >
                    <span className={css.stageName}>
                      {stage.name}
                      {isCurrent && <span className={css.currentTag}>{t('current')}</span>}
                    </span>
                    {stage.stations.length > 0 && <span className={css.count}>{passed}/{stage.stations.length}</span>}
                    <span className={css.stageStatus}>{t(`stage.${stage.status}`)}</span>
                  </button>
                  <div className={css.stageSub}>
                    <SkillChips stage={stage} />
                  </div>
                  {stage.stations.length > 0 && (
                    <div className={css.bar} aria-hidden="true">
                      {stage.stations.map(station => <span key={station.id} className={css[`seg_${station.status}`]} />)}
                    </div>
                  )}
                  {expanded && (
                    <div className={css.stageBody}>
                      {stage.stations.length > 0 && (
                        <ul className={css.stations} aria-label={t('stations')}>
                          {stage.stations.map(station => (
                            <li key={station.id} className={css.station} title={station.note}>
                              <span className={`${css.dot} ${css[`dot_${station.status}`] ?? ''}`} />
                              <span className={css.stationName}>{station.id} {station.name}</span>
                              <span className={`${css.stationStatus} ${css[`st_${station.status}`] ?? ''}`}>{t(`station.${station.status}`)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className={css.filesLabel}>{t('deliverables')}</div>
                      {stageFiles.length === 0
                        ? <div className={css.muted}>{t('deliverables.none')}</div>
                        : (
                          <ul className={css.files}>
                            {stageFiles.map((entry) => {
                              const path = joinPath(current.root, stage.dir, entry.name)
                              return (
                                <li key={entry.name}>
                                  <button type="button" className={css.file} onClick={() => { openFile(path) }} title={path}>
                                    <FileTypeIcon kind={classifyFileType(entry.name)} size={16} />
                                    <span className={css.fileName}>{entry.name}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
