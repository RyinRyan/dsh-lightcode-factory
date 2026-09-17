/** Shared, version-pinned wire contract for the published DSH 0.1.5-rc.2 API. */
import { z } from 'zod'
import type { InvocationDescriptor, RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkflowPlatformSnapshot, WorkflowRunView, WorkflowStartRequest, WorkflowRunRequest, WorkflowReviewRequest } from './types.ts'
import { workflowRunSchema } from './spec.ts'

const definition = z.object({
  id: z.string(), name: z.string(), description: z.string(), version: z.string(),
  parameters: z.array(z.object({ name: z.string(), label: z.string(), required: z.boolean(), defaultValue: z.string().optional() })),
  nodes: z.array(z.object({ id: z.string(), name: z.string() })),
})
const snapshot: z.ZodType<WorkflowPlatformSnapshot> = z.object({ definitions: z.array(definition), runs: z.array(workflowRunSchema) })
const start: z.ZodType<WorkflowStartRequest> = z.object({ workflowId: z.string(), input: z.record(z.string(), z.string()).optional() })
const run: z.ZodType<WorkflowRunRequest> = z.object({ runId: z.string() })
const review: z.ZodType<WorkflowReviewRequest> = z.object({ runId: z.string(), decision: z.enum(['complete', 'cancel']) })

function route(method: string, result: z.ZodType, request?: z.ZodType): InvocationDescriptor {
  return {
    id: 'lightcode-factory-backend#workflowPlatform/' + method,
    service: 'lightcodeFactoryBackend', namespace: 'workflowPlatform', method,
    invocation: { kind: 'direct' },
    parameters: request ? [{ name: 'request', wire: 'request', source: 'json', codec: {
      mode: 'strict', typeSymbol: 'lightcode-factory-backend#' + method + 'Request', schema: request,
    } }] : [],
    result: { mode: 'strict', typeSymbol: 'lightcode-factory-backend#' + method + 'Result', schema: result },
  }
}

export interface WorkflowRemote {
  snapshot(): Promise<RemoteResult<WorkflowPlatformSnapshot>>
  start(request: WorkflowStartRequest): Promise<RemoteResult<WorkflowRunView>>
  cancel(request: WorkflowRunRequest): Promise<RemoteResult<WorkflowRunView>>
  review(request: WorkflowReviewRequest): Promise<RemoteResult<WorkflowRunView>>
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { workflowPlatform: WorkflowRemote }
}

export const workflowRemote: TypertRemoteContribution = {
  package: 'lightcode-factory-backend',
  descriptors: [route('snapshot', snapshot), route('start', workflowRunSchema, start), route('cancel', workflowRunSchema, run), route('review', workflowRunSchema, review)],
}
export default workflowRemote
