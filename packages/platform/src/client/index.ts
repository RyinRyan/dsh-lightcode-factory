/** Browser plugin registrations for the workflow board. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'lightcode-factory-backend/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { WorkflowPlatformIcon, WorkflowPlatformPanel, type WorkflowPlatformInjected } from './WorkflowPlatformPanel.tsx'
import { en, NS, type WorkflowPlatformKey, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { workflowPlatform: WorkflowPlatformKey } }
const PANEL_ID = 'workflow-platform' as MainPanelId
export const name = 'lightcode-factory-platform'
export const inject = ['slots', 'locale', 'workflowPlatformClient']

/** Register the board as a global panel once its target slots are declared. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'lightcode-factory-platform: dictionaries')
  const label = ctx.locale.bind(NS)('icon.label')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: (): WorkflowPlatformInjected => ({
      hooks: { workflowSnapshot: ctx.workflowPlatformClient.state },
      refresh: () => ctx.workflowPlatformClient.refresh(),
      start: (workflowId, input) => ctx.workflowPlatformClient.start(workflowId, input),
      cancel: runId => ctx.workflowPlatformClient.cancel(runId),
      review: (runId, decision) => ctx.workflowPlatformClient.review(runId, decision),
    }),
  }, WorkflowPlatformPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label, locale: NS }, WorkflowPlatformIcon))
}
