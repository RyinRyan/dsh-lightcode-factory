/** Browser-side observable state and command facade for workflow workflows. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import workflowRemote from '../remote.ts'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkflowPlatformSnapshot, WorkflowRunView } from '../types.ts'

/** Latest board snapshot with the polling transport state. */
export interface WorkflowPlatformClientSnapshot extends WorkflowPlatformSnapshot { readonly phase: 'loading' | 'ready' | 'error'; readonly error: string | null }
/** External-store interface consumed by browser snapshot hooks. */
export interface WorkflowPlatformSource { getSnapshot(): WorkflowPlatformClientSnapshot; subscribe(listener: () => void): () => void }
/** Browser facade for backend-owned task state. */
export interface IWorkflowPlatformClient {
  readonly state: WorkflowPlatformSource
  /** Fetch a snapshot and publish either its data or the transport error.
   * @returns Completion of the refresh and subscriber notification.
   */
  refresh(): Promise<void>
  /** Submit a task and refresh board state.
   * @param workflowId - installed workflow identifier.
   * @param input - values for declared text fields.
   * @returns Created task; rejects on a backend error.
   */
  start(workflowId: string, input?: Readonly<Record<string, string>>): Promise<WorkflowRunView>
  /** Request cancellation and refresh board state.
   * @param runId - persisted task identifier.
   * @returns Cancelled task; rejects on a backend error.
   */
  cancel(runId: string): Promise<WorkflowRunView>
  /** Submit a human decision and refresh board state.
   * @param runId - review-pending task identifier.
   * @param decision - approve completion or cancel.
   * @returns Terminal task; rejects on a backend error.
   */
  review(runId: string, decision: 'complete' | 'cancel'): Promise<WorkflowRunView>
}

declare module '@deepseek-ai/cordis' { interface Context { workflowPlatformClient: IWorkflowPlatformClient } }
type RemoteWorkflowPlatform = TypertClientRemote['workflowPlatform']

class WorkflowPlatformClient extends Service implements IWorkflowPlatformClient, WorkflowPlatformSource {
  readonly state: WorkflowPlatformSource = this
  private value: WorkflowPlatformClientSnapshot = { definitions: [], runs: [], phase: 'loading', error: null }
  private readonly listeners = new Set<() => void>()
  constructor(ctx: Context, private readonly remote: RemoteWorkflowPlatform) { super(ctx, 'workflowPlatformClient') }
  getSnapshot(): WorkflowPlatformClientSnapshot { return this.value }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  async refresh(): Promise<void> {
    const result = await this.remote.snapshot()
    this.value = result.ok ? { ...result.value, phase: 'ready', error: null } : { ...this.value, phase: 'error', error: result.error.message }
    this.notify()
  }
  async start(workflowId: string, input?: Readonly<Record<string, string>>): Promise<WorkflowRunView> {
    const result = await this.remote.start({ workflowId, ...(input === undefined ? {} : { input }) })
    if (!result.ok) throw new Error(result.error.message)
    await this.refresh()
    return result.value
  }
  async cancel(runId: string): Promise<WorkflowRunView> {
    const result = await this.remote.cancel({ runId })
    if (!result.ok) throw new Error(result.error.message)
    await this.refresh()
    return result.value
  }
  async review(runId: string, decision: 'complete' | 'cancel'): Promise<WorkflowRunView> { const result = await this.remote.review({ runId, decision }); if (!result.ok) throw new Error(result.error.message); await this.refresh(); return result.value }
  private notify(): void { for (const listener of this.listeners) listener() }
}

export const name = 'lightcode-factory-backend-client'
export const inject = ['remote']

/** Start a reconnect-tolerant polling projection for the workflow board. */
export async function apply(ctx: Context): Promise<void> {
  // The installed plugin owns its transport contribution; DSH's assembly stays untouched.
  await ctx.remote.$mount(workflowRemote)
  await ctx.inject(['remote.workflowPlatform'], (bound) => {
    const service = new WorkflowPlatformClient(bound, bound.remote.workflowPlatform)
    void service.refresh()
    const interval = setInterval(() => { void service.refresh() }, 750)
    bound.effect(() => () => { clearInterval(interval) }, 'workflow-platform-client: polling')
  })
}
