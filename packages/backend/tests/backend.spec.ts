import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Backend from '../src/index.ts'
import type { WorkflowRegistration } from '../src/runtime-types.ts'
import { workflowRunSchema } from '../src/spec.ts'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lightcode-backend-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  await ctx.plugin(Storage)
  await ctx.plugin(JsonStorage, { root })
  await ctx.plugin(Domain, { backend: 'json' })
  await ctx.plugin(Typert)
  const fiber = ctx.plugin(Backend, { maxConcurrentRuns: 1 })
  await fiber
  return { ctx, fiber, backend: ctx.lightcodeFactoryBackend }
}

const node = { id: 'report', name: 'Report' }
function workflow(execute: WorkflowRegistration['execute']): WorkflowRegistration {
  return { id: 'report', version: '1.0.0', name: 'Report', description: 'An independent business workflow',
    parameters: [{ name: 'subject', label: 'Subject', required: true }], nodes: [node], execute }
}

describe('Factory workflow protocol', () => {
  it('cancels an admission when its plugin unloads during the initial write', async () => {
    const { backend } = await setup()
    const execute = vi.fn(async () => {})
    const dispose = backend.registerWorkflow(workflow(execute))
    const admission = backend.start({ workflowId: 'report', input: { subject: 'test' } })
    await dispose()
    expect((await admission).status).toBe('cancelled')
    expect(execute).not.toHaveBeenCalled()
    expect(backend.snapshot().definitions).toEqual([])
  })

  it('accepts a new business result without core changes, persists it and removes disposed registrations', async () => {
    const { ctx, backend, fiber } = await setup()
    const plugin = ctx.plugin({ inject: ['lightcodeFactoryBackend'], apply(ctx: Context) {
      ctx.effect(() => ctx.lightcodeFactoryBackend.registerWorkflow(workflow(async (context) => {
        await context.node(node, async (task) => {
          await Promise.all([task.log('first'), task.log('second')])
          return { subject: context.input.subject ?? '', findings: [{ severity: 'low', line: 12 }], score: 98 }
        })
      })), 'test report workflow')
    } })
    await plugin
    await expect(backend.start({ workflowId: 'report' })).rejects.toThrow('Required parameter')
    const run = await backend.start({ workflowId: 'report', input: { subject: 'Example' } })
    await vi.waitFor(() =>{  expect(backend.snapshot().runs[0]?.status).toBe('review') })
    const result = backend.snapshot().runs[0]
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
    await backend.review({ runId: run.id, decision: 'complete' })
    await plugin.dispose()
    expect(backend.snapshot().definitions).toEqual([])
    await fiber.dispose()
    await ctx.plugin(Backend)
    expect(ctx.lightcodeFactoryBackend.snapshot().runs[0]?.status).toBe('completed')
    expect(ctx.lightcodeFactoryBackend.snapshot().runs[0]?.nodes[0]?.output).toEqual(result?.nodes[0]?.output)
  })

  it('keeps cancellation terminal when a non-cooperative node returns late', async () => {
    const { backend } = await setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const dispose = backend.registerWorkflow(workflow(async (context) => {
      await context.node(node, async () => { await gate; return { late: true } })
    }))
    const run = await backend.start({ workflowId: 'report', input: { subject: 'test' } })
    await vi.waitFor(() =>{  expect(backend.snapshot().runs[0]?.nodes[0]?.status).toBe('running') })
    await backend.cancel({ runId: run.id })
    release()
    await dispose()
    expect(backend.snapshot().runs[0]?.status).toBe('cancelled')
    expect(backend.snapshot().runs[0]?.nodes[0]?.output).toBeUndefined()
    expect(backend.snapshot().runs[0]?.events.some(event => event.type === 'node.completed')).toBe(false)
  })

  it('does not turn a swallowed node error into successful review', async () => {
    const { backend } = await setup()
    backend.registerWorkflow(workflow(async (context) => {
      try { await context.node(node, () => Promise.reject(new Error('Business failure'))) }
      catch (error) { void error /* Deliberately simulate a plugin swallowing failure. */ }
    }))
    await backend.start({ workflowId: 'report', input: { subject: 'test' } })
    await vi.waitFor(() =>{  expect(backend.snapshot().runs[0]?.status).toBe('failed') })
    expect(backend.snapshot().runs[0]?.error).toBe('Business failure')
  })

  it('rejects non-JSON node output and unknown input fields', async () => {
    const { backend } = await setup()
    backend.registerWorkflow(workflow(async (context) => { await context.node(node, async () => ({ score: Infinity })) }))
    await expect(backend.start({ workflowId: 'report', input: { unexpected: 'x' } })).rejects.toThrow('Unknown parameter')
    await backend.start({ workflowId: 'report', input: { subject: 'test' } })
    await vi.waitFor(() =>{  expect(backend.snapshot().runs[0]?.status).toBe('failed') })
  })

  it('reads old demo records without changing their output', () => {
    const old = { id: 'old', workflowId: 'morning-script-demo', name: 'Old task', status: 'completed',
      createdAt: '2026-09-15', updatedAt: '2026-09-15', events: [],
      nodes: [{ id: 'greeting', name: 'Greeting', runner: 'builtin.greeting', status: 'completed',
        output: { kind: 'greeting', text: 'hello', quote: 'q', author: 'a', currentTime: 'now' } }],
    }
    const restored = workflowRunSchema.parse(old)
    expect(restored.nodes[0]?.output).toEqual(old.nodes[0]?.output)
    expect(restored.nodes[0]?.observations).toEqual([])
  })
})
