/**
 * The project tab body: pick a project in the session's workspace, show its
 * build progress once it is handed off to a dev folder, list what is open for
 * the user, and show its six stages as a pipeline with their stations, owning
 * skills, and each stage directory's files.
 *
 * Projects are folders holding `aipm.json`. When the workspace root itself
 * holds one, the workspace is that single project. Files open through the tab's
 * `openResource` so the document preview tab renders Markdown and HTML. Each
 * Markdown deliverable is read once per size change to count its evidence tags.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTypeIcon, IconRefreshOutlineRegular, Tooltip, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readBuild, statusFilePath } from './build.ts'
import { PROJECT_CANVAS } from './canvas/model.ts'
import type { BuildView } from './build.ts'
import { BuildCard } from './BuildCard.tsx'
import { countEvidence } from './evidence.ts'
import type { EvidenceCounts } from './evidence.ts'
import { EvidenceBar } from './EvidenceBar.tsx'
import { discoverProjects } from './files.ts'
import type { FoundProject, ProjectFiles } from './files.ts'
import type { StarterResult } from './HeroStages.tsx'
import { PENDING_GROUPS, STAGES, isDeliverable, joinPath, openItems, pendingGroupOf, stageNameIn } from './model.ts'
import type { PendingGroup, PendingItem, Project, Stage, StageDefinition } from './model.ts'
import type {} from './locales.ts'
import css from './workbench.module.css'

/** Composer access the tab uses to hand an open item to the agent, and canvas creation. */
export interface ProjectActions {
  /** Put `text` into the Session's composer draft and focus it. */
  readonly ask: (sessionId: SessionId, text: string) => StarterResult
  /**
   * Make sure a canvas file exists, writing an empty canvas when it does not.
   * @param sessionId - authorizing Session.
   * @param path - absolute `.canvas` path inside the workspace.
   * @returns an error message, or `undefined` when the file is ready to open.
   */
  readonly ensureCanvas: (sessionId: SessionId, path: string) => Promise<string | undefined>
}

/** The body's composed props. */
export type ProjectBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & ProjectFiles
  & ProjectActions
  & PropsLocale<'aipmWorkbench'>

/** Reread interval while the tab is mounted; skills write files mid-turn. */
const POLL_MS = 4000

/** Open items shown before the list is expanded. */
const PENDING_PREVIEW = 5

/** Files per stage directory, keyed by stage id. */
type StageFiles = Record<string, readonly WorkspaceDirectoryEntry[]>

/** Evidence counts keyed by absolute file path. */
type FileEvidence = Record<string, EvidenceCounts>

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function basename(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
}

function stageNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function isMarkdown(name: string): boolean {
  return /\.(?:md|markdown)$/iu.test(name)
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

/** What an item says: its own text, or the fallback for a derived item without a note. */
function itemText(item: PendingItem, t: ProjectBodyProps['t']): string {
  if (item.text !== undefined) return item.text
  if (item.station === undefined) return t('pending.skippedNoNote')
  return item.kind === 'blocked' ? t('pending.blockedNoNote') : t('pending.passedNoNote')
}

/** The open-items list under the summary card. */
function PendingList({ items, project, onOpen, onAsk, t }: {
  readonly items: readonly PendingItem[]
  readonly project: Project
  readonly onOpen: (source: string) => void
  readonly onAsk: (text: string) => StarterResult
  readonly t: ProjectBodyProps['t']
}): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const ordered = PENDING_GROUPS.flatMap(group =>
    items.filter(item => pendingGroupOf(item.kind) === group).map(item => ({ group, item })))
  const shown = expanded ? ordered : ordered.slice(0, PENDING_PREVIEW)

  const stageName = (id: string | undefined): string | undefined => stageNameIn(project, id)
  const ask = (group: PendingGroup, item: PendingItem): void => {
    const where = [stageName(item.stage), item.station].filter(part => part !== undefined).join(' ')
    const lead = `${item.id ?? ''}${where === '' ? '' : t('pending.where', { where })}`
    const label = lead === '' ? itemText(item, t) : `${lead} ${itemText(item, t)}`
    const result = onAsk(t(`pending.starter.${group}`, { project: project.name, item: label }))
    setNotice(result === 'sent' ? t('pending.sent') : t(result === 'busy' ? 'hero.busy' : 'hero.unavailable'))
  }

  return (
    <section className={css.pending} aria-label={t('pending.title')}>
      <div className={css.pendingHead}>
        <span className={css.pendingTitle}>{t('pending.title')}</span>
        <span className={css.pendingCount}>{ordered.length}</span>
        {notice !== undefined && <span className={css.pendingNotice}>{notice}</span>}
      </div>
      <ul className={css.pendingList}>
        {shown.map(({ group, item }, index) => (
          <li key={item.key} className={`${css.pendingItem} ${css[`pending_${group}`] ?? ''}`}>
            {(index === 0 || shown[index - 1]?.group !== group) && <div className={css.pendingGroup}>{t(`pending.group.${group}`)}</div>}
            <div className={css.pendingRow}>
              <span className={css.pendingMark} aria-hidden="true" />
              <div className={css.pendingMain}>
                <div className={css.pendingText}>
                  {item.id !== undefined && <span className={css.pendingId}>{item.id}</span>}
                  {itemText(item, t)}
                </div>
                {item.recommend !== undefined && <div className={css.pendingRecommend}>{t('pending.recommend', { text: item.recommend })}</div>}
                <div className={css.pendingMeta}>
                  {item.kind !== 'decision' && item.kind !== 'blocked' && <span className={css.pendingKind}>{t(`pending.kind.${item.kind}`)}</span>}
                  {stageName(item.stage) !== undefined && <span>{stageName(item.stage)}{item.station === undefined ? '' : ` · ${item.station}`}</span>}
                  {item.source !== undefined && (
                    <button type="button" className={css.pendingSource} title={item.source} onClick={() => { onOpen(item.source ?? '') }}>
                      {basename(item.source)}
                    </button>
                  )}
                </div>
              </div>
              <button type="button" className={css.pendingAct} title={t('pending.actHint')} onClick={() => { ask(group, item) }}>
                {t('pending.act')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {ordered.length > PENDING_PREVIEW && (
        <button type="button" className={css.pendingMore} onClick={() => { setExpanded(value => !value) }}>
          {expanded ? t('pending.less') : t('pending.more', { count: String(ordered.length - PENDING_PREVIEW) })}
        </button>
      )}
    </section>
  )
}

/** The project tab body. */
export function ProjectBody({ useTabInfo, sessionId, useSessions, readText, list, ask, ensureCanvas, t }: ProjectBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const { signal } = tab
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const [projects, setProjects] = useState<readonly FoundProject[] | undefined>(undefined)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [files, setFiles] = useState<StageFiles>({})
  const [evidence, setEvidence] = useState<FileEvidence>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [buildRead, setBuildRead] = useState<{ readonly path: string; readonly view: BuildView } | undefined>(undefined)
  const [tick, setTick] = useState(0)
  const [canvasError, setCanvasError] = useState<string | undefined>(undefined)
  /** Counts per path with the file size they were read at; a size change rereads. */
  const evidenceCache = useRef(new Map<string, { readonly size: number | undefined; readonly counts: EvidenceCounts }>())

  const poll = useCallback(() => { setTick(value => value + 1) }, [])
  const refresh = useCallback(() => {
    evidenceCache.current.clear()
    poll()
  }, [poll])
  useEffect(() => tab.actions.bindCommands({ refresh }), [tab.actions, refresh])
  useEffect(() => {
    const timer = setInterval(poll, POLL_MS)
    return () => { clearInterval(timer) }
  }, [poll])

  // Discover projects: the workspace root itself, else its direct child folders.
  useEffect(() => {
    if (cwd === undefined || signal.aborted) return
    let cancelled = false
    void discoverProjects({ readText, list }, sessionId, cwd, signal).then((found) => {
      if (!cancelled) setProjects(found)
    })
    return () => { cancelled = true }
  }, [cwd, sessionId, signal, readText, list, tick])

  const current = useMemo(() => {
    if (projects === undefined || projects.length === 0) return undefined
    return projects.find(p => p.root === selected) ?? projects[0]
  }, [projects, selected])

  // List each stage directory of the current project and count evidence in its Markdown files.
  useEffect(() => {
    if (current?.project === undefined || signal.aborted) return
    const run = { cancelled: false }
    const cache = evidenceCache.current
    const countFile = async (path: string, size: number | undefined): Promise<readonly [string, EvidenceCounts] | undefined> => {
      const cached = cache.get(path)
      if (cached !== undefined && cached.size === size) return [path, cached.counts]
      const read = await readText(sessionId, path, signal)
      if (!read.ok) return undefined
      const counts = countEvidence(read.value)
      cache.set(path, { size, counts })
      return [path, counts]
    }
    const stageMap = current.project.stages
    void (async () => {
      const stages = await Promise.all(stageMap.map(async (stage) => {
        const result = await list(sessionId, joinPath(current.root, stage.dir), signal)
        const visible = result.ok
          ? result.value.filter(entry => entry.type === 'file' && isDeliverable(entry.name)).sort((a, b) => byName.compare(a.name, b.name))
          : []
        const counted = await Promise.all(visible.filter(entry => isMarkdown(entry.name))
          .map(entry => countFile(joinPath(current.root, stage.dir, entry.name), entry.size)))
        return { id: stage.id, visible, counted }
      }))
      if (run.cancelled) return
      setFiles(Object.fromEntries(stages.map(stage => [stage.id, stage.visible])))
      setEvidence(Object.fromEntries(stages.flatMap(stage => stage.counted.filter(entry => entry !== undefined))))
    })()
    return () => { run.cancelled = true }
  }, [current?.root, current?.project, sessionId, signal, readText, list, tick])

  // Read the project's MVP code repository: its status file and latest evidence.
  const buildPath = current?.project?.build?.path
  useEffect(() => {
    if (buildPath === undefined || signal.aborted) return
    let cancelled = false
    void readBuild({ readText, list }, sessionId, buildPath, signal).then((view) => {
      if (!cancelled) setBuildRead({ path: buildPath, view })
    })
    return () => { cancelled = true }
  }, [buildPath, sessionId, signal, readText, list, tick])

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
  const openCanvas = (): void => {
    const path = joinPath(current.root, PROJECT_CANVAS)
    setCanvasError(undefined)
    void ensureCanvas(sessionId, path).then((error) => {
      if (error === undefined) openFile(path)
      else setCanvasError(t('canvas.createFailed', { message: error }))
    })
  }
  const project = current.project
  const isOpen = (stage: Stage): boolean => open[stage.id] ?? (stage.id === project?.currentStage || (files[stage.id]?.length ?? 0) > 0)
  const done = project?.stages.filter(stage => stage.status === 'done').length ?? 0
  const currentStage = project?.stages.find(stage => stage.id === project.currentStage)
  const pending = project === undefined ? [] : openItems(project)
  const build = project?.build

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
        {project !== undefined && (
          <Tooltip label={t('canvas.openHint')} side="bottom" delayMs={500}>
            <button type="button" className={css.canvasButton} onClick={openCanvas}>{t('canvas.open')}</button>
          </Tooltip>
        )}
        <Tooltip label={t('refresh')} side="bottom" delayMs={500}>
          <button type="button" className={css.iconButton} aria-label={t('refresh')} onClick={refresh}>
            <IconRefreshOutlineRegular />
          </button>
        </Tooltip>
      </div>

      {canvasError !== undefined && <div className={css.error}>{canvasError}</div>}

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

      {project !== undefined && build !== undefined && (
        <BuildCard
          key={`build:${current.root}`}
          build={build}
          view={buildRead?.path === build.path ? buildRead.view : undefined}
          projectName={project.name}
          onAsk={text => ask(sessionId, text)}
          onOpenStatus={() => { openFile(statusFilePath(build.path)) }}
          t={t}
        />
      )}

      {project !== undefined && pending.length > 0 && (
        <PendingList
          key={current.root}
          items={pending}
          project={project}
          onOpen={(source) => { openFile(joinPath(current.root, source)) }}
          onAsk={text => ask(sessionId, text)}
          t={t}
        />
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
                              const counts = evidence[path]
                              return (
                                <li key={entry.name}>
                                  <button type="button" className={css.file} onClick={() => { openFile(path) }} title={path}>
                                    <FileTypeIcon kind={classifyFileType(entry.name)} size={16} />
                                    <span className={css.fileName}>{entry.name}</span>
                                    {counts !== undefined && <EvidenceBar counts={counts} variant="mini" t={t} />}
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
