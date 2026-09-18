import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Runtime from '../src/index.ts'
import FactoryStorage from '../../storage-sqlite/src/index.ts'
import type { WorkflowRegistration } from 'lightcode-factory-contracts/workflow'
import { workflowRunSchema } from 'lightcode-factory-contracts/schema'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lightcode-runtime-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  await ctx.plugin(FactoryStorage, { databasePath: join(root, 'factory.sqlite3') })
  await ctx.plugin(Typert)
  const fiber = ctx.plugin(Runtime, { maxConcurrentRuns: 1 })
  await fiber
  return { ctx, fiber, runtime: ctx.lightcodeFactoryRuntime }
}

const node = { id: 'report', name: 'Report' }
function workflow(execute: WorkflowRegistration['execute']): WorkflowRegistration {
  return { id: 'report', version: '1.0.0', name: 'Report', description: 'An independent business workflow',
    parameters: [{ name: 'subject', label: 'Subject', required: true }], nodes: [node], execute }
}

describe('Factory workflow protocol', () => {
  it('cancels an admission when its plugin unloads during the initial write', async () => {
    const { runtime } = await setup()
    const execute = vi.fn(async () => {})
    const dispose = runtime.registerWorkflow(workflow(execute))
    const admission = runtime.start({ workflowId: 'report', input: { subject: 'test' } })
    await dispose()
    expect((await admission).status).toBe('cancelled')
    expect(execute).not.toHaveBeenCalled()
    expect(await runtime.catalog()).toEqual([])
  })

  it('accepts a new business result without core changes, persists it and removes disposed registrations', async () => {
    const { ctx, runtime, fiber } = await setup()
    const plugin = ctx.plugin({ inject: ['lightcodeFactoryRuntime'], apply(ctx: Context) {
      ctx.effect(() => ctx.lightcodeFactoryRuntime.registerWorkflow(workflow(async (context) => {
        await context.node(node, async (task) => {
          await Promise.all([task.log('first'), task.log('second')])
          return { subject: context.input.subject ?? '', findings: [{ severity: 'low', line: 12 }], score: 98 }
        })
      })), 'test report workflow')
    } })
    await plugin
    await expect(runtime.start({ workflowId: 'report' })).rejects.toThrow('Required parameter')
    const run = await runtime.start({ workflowId: 'report', input: { subject: 'Example' } })
    await vi.waitFor(async () =>{  expect((await runtime.listRuns({ limit: 100 })).runs[0]?.status).toBe('review') })
    const result = (await runtime.listRuns({ limit: 100 })).runs[0]
    expect(result?.nodes[0]?.output).toEqual({ subject: 'Example', findings: [{ severity: 'low', line: 12 }], score: 98 })
    expect(result?.nodes[0]?.observations.map(event => event.detail)).toEqual(['first', 'second'])
    expect(result?.workflowVersion).toBe('1.0.0')
    expect(result?.events.map(event => event.type)).toMatchInlineSnapshot(`
      [
        "run.queued",
        "run.started",
        "node.started",
        "node.completed",
        "run.review",
      ]
    `)
    await runtime.review({ runId: run.id, decision: 'complete' })
    await plugin.dispose()
    expect(await runtime.catalog()).toEqual([])
    await fiber.dispose()
    await ctx.plugin(Runtime)
    expect((await ctx.lightcodeFactoryRuntime.listRuns({ limit: 100 })).runs[0]?.status).toBe('completed')
    expect((await ctx.lightcodeFactoryRuntime.listRuns({ limit: 100 })).runs[0]?.nodes[0]?.output).toEqual(result?.nodes[0]?.output)
  })

  it('keeps cancellation terminal when a non-cooperative node returns late', async () => {
    const { runtime } = await setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const dispose = runtime.registerWorkflow(workflow(async (context) => {
      await context.node(node, async () => { await gate; return { late: true } })
    }))
    const run = await runtime.start({ workflowId: 'report', input: { subject: 'test' } })
    await vi.waitFor(async () =>{  expect((await runtime.listRuns({ limit: 100 })).runs[0]?.nodes[0]?.status).toBe('running') })
    await runtime.cancel({ runId: run.id })
    release()
    await dispose()
    expect((await runtime.listRuns({ limit: 100 })).runs[0]?.status).toBe('cancelled')
    expect((await runtime.listRuns({ limit: 100 })).runs[0]?.nodes[0]?.output).toBeUndefined()
    expect((await runtime.listRuns({ limit: 100 })).runs[0]?.events.some(event => event.type === 'node.completed')).toBe(false)
  })

  it('does not turn a swallowed node error into successful review', async () => {
    const { runtime } = await setup()
    runtime.registerWorkflow(workflow(async (context) => {
      try { await context.node(node, () => Promise.reject(new Error('Business failure'))) }
      catch (error) { void error /* Deliberately simulate a plugin swallowing failure. */ }
    }))
    await runtime.start({ workflowId: 'report', input: { subject: 'test' } })
    await vi.waitFor(async () =>{  expect((await runtime.listRuns({ limit: 100 })).runs[0]?.status).toBe('failed') })
    expect((await runtime.listRuns({ limit: 100 })).runs[0]?.error).toBe('Business failure')
  })

  it('rejects non-JSON node output and unknown input fields', async () => {
    const { runtime } = await setup()
    runtime.registerWorkflow(workflow(async (context) => { await context.node(node, async () => ({ score: Infinity })) }))
    await expect(runtime.start({ workflowId: 'report', input: { unexpected: 'x' } })).rejects.toThrow('Unknown parameter')
    await runtime.start({ workflowId: 'report', input: { subject: 'test' } })
    await vi.waitFor(async () =>{  expect((await runtime.listRuns({ limit: 100 })).runs[0]?.status).toBe('failed') })
  })

  it('rejects pre-0.3 aggregates and malformed cursors', async () => {
    expect(() => workflowRunSchema.parse({ id: 'old' })).toThrow()
    const { runtime } = await setup()
    await expect(runtime.listRuns({ cursor: 'not-a-cursor' })).rejects.toThrow('Invalid run cursor')
  })
})
