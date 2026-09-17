import { z } from 'zod'
import type { DomainSpec, DomainTableSpec } from '@deepseek-ai/dsh-storage-domain'
import type { WorkflowRunView } from './types.ts'


/** Runtime schema for one persisted workflow run. */
export const workflowRunSchema = z.object({
  id: z.string(), workflowId: z.string(), name: z.string(),
  workflowVersion: z.string().optional(), input: z.record(z.string(), z.string()).optional(),
  status: z.enum(['queued', 'running', 'review', 'completed', 'cancelled', 'failed']),
  createdAt: z.string(), updatedAt: z.string(), currentNodeId: z.string().optional(), error: z.string().optional(),
  nodes: z.array(z.object({
    id: z.string(), name: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'cancelled', 'failed']),
    observations: z.array(z.object({
      at: z.string(),
      kind: z.string(),
      title: z.string(),
      detail: z.string(),
      callId: z.string().optional(), sessionId: z.string().optional(),
    })).default([]),
    startedAt: z.string().optional(), finishedAt: z.string().optional(), output: z.json().optional(), error: z.string().optional(),
  })),
  events: z.array(z.object({
    sequence: z.number().int().positive(), at: z.string(), type: z.string(), message: z.string(), nodeId: z.string().optional(),
  })),
})

/** Domain declaration owned exclusively by the workflow platform runtime. */
const runs: DomainTableSpec<string, WorkflowRunView> = { valueSchema: workflowRunSchema as z.ZodType<WorkflowRunView> }
/** Version-one task storage domain; optional fields preserve older Demo records. */
export const workflowPlatformDomain = {
  name: 'workflow_platform',
  version: 1,
  tables: { runs },
} satisfies DomainSpec
