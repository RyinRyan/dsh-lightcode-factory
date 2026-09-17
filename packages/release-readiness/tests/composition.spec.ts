import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Backend from '../../backend/src/index.ts'
import * as ReleaseReadiness from '../src/index.ts'

describe('Release readiness workflow', () => {
  let root: string
  let ctx: Context

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lightcode-release-readiness-'))
    ctx = new Context()
  })

  afterEach(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })

  async function loadThroughLoader(): Promise<void> {
    await ctx.plugin(Storage)
    await ctx.plugin(JsonStorage, { root: join(root, 'database') })
    await ctx.plugin(Domain, { backend: 'json' })
    await ctx.plugin(Typert)
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: factory-backend',
      '  name: factory-backend',
      '- id: release-readiness',
      '  name: release-readiness',
    ].join('\n'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['factory-backend', Backend], ['release-readiness', ReleaseReadiness],
    ])
    ctx.loader.internal = { version: 'v2', async import(moduleName: string) {
      if (!modules.has(moduleName)) throw new Error('Unexpected plugin: ' + moduleName)
      return modules.get(moduleName)
    } } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
  }

  async function loadBackend(): Promise<void> {
    await ctx.plugin(Storage)
    await ctx.plugin(JsonStorage, { root: join(root, 'database') })
    await ctx.plugin(Domain, { backend: 'json' })
    await ctx.plugin(Typert)
    await ctx.plugin(Backend)
  }

  it('loads through the real Loader and completes the normal review path', async () => {
    await loadThroughLoader()

    const definition = ctx.lightcodeFactoryBackend.snapshot().definitions[0]
    expect(definition?.id).toBe('release-readiness')
    expect(definition?.parameters.map(value => value.name)).toEqual(['project', 'version', 'riskNotes'])
    expect(definition?.parameters.find(value => value.name === 'riskNotes')?.label).toContain('不得包含凭据')
    expect(definition?.nodes.map(value => value.id)).toEqual(['normalize-input', 'assess-risk', 'build-checklist'])
    const run = await ctx.lightcodeFactoryBackend.start({ workflowId: 'release-readiness', input: {
      project: '  billing-core  ', version: '2.4.0-rc.1',
      riskNotes: '包含数据迁移\n需要回滚预案',
    } })
    await vi.waitFor(() => {
      const task = ctx.lightcodeFactoryBackend.snapshot().runs.find(value => value.id === run.id)
      expect({ status: task?.status, error: task?.error }).toEqual({ status: 'review', error: undefined })
    })
    const task = ctx.lightcodeFactoryBackend.snapshot().runs.find(value => value.id === run.id)
    expect(task?.nodes.map(value => value.id)).toEqual(['normalize-input', 'assess-risk', 'build-checklist'])
    expect(task?.nodes.map(value => value.status)).toEqual(['completed', 'completed', 'completed'])
    expect(task?.nodes[0]?.output).toMatchObject({
      project: 'billing-core', version: '2.4.0-rc.1', riskNoteCount: 2,
    })
    expect(task?.nodes[1]?.output).toMatchObject({ level: 'high', consideredNotes: 2 })
    expect(task?.nodes[2]?.output).toMatchObject({
      summary: { project: 'billing-core', version: '2.4.0-rc.1', riskLevel: 'high' },
    })
    const observations = task?.nodes.flatMap(value => value.observations) ?? []
    expect(observations.map(value => value.kind)).toEqual([
      'log', 'release.input', 'log', 'release.risk', 'log', 'release.checklist',
    ])
    expect(task?.events.map(value => value.type)).toEqual([
      'run.queued', 'run.started',
      'node.started', 'node.completed',
      'node.started', 'node.completed',
      'node.started', 'node.completed',
      'run.review',
    ])
    expect(task?.events.filter(value => value.type === 'node.started').map(value => value.nodeId)).toEqual([
      'normalize-input', 'assess-risk', 'build-checklist',
    ])
    await ctx.lightcodeFactoryBackend.review({ runId: run.id, decision: 'complete' })
    expect(ctx.lightcodeFactoryBackend.snapshot().runs.find(value => value.id === run.id)?.status).toBe('completed')
  }, 30000)

  it('rejects structural input errors and records business validation as a failed run', async () => {
    await loadThroughLoader()
    await expect(ctx.lightcodeFactoryBackend.start({ workflowId: 'release-readiness' })).rejects.toThrow('Required parameter')
    await expect(ctx.lightcodeFactoryBackend.start({ workflowId: 'release-readiness', input: {
      project: 'demo', version: '1.0.0', unexpected: 'x',
    } })).rejects.toThrow('Unknown parameter')

    const invalid = await ctx.lightcodeFactoryBackend.start({ workflowId: 'release-readiness', input: {
      project: 'billing-core', version: 'latest', riskNotes: '',
    } })
    await vi.waitFor(() => {
      const failed = ctx.lightcodeFactoryBackend.snapshot().runs.find(value => value.id === invalid.id)
      expect(failed?.status).toBe('failed')
    })
    const failed = ctx.lightcodeFactoryBackend.snapshot().runs.find(value => value.id === invalid.id)
    expect(failed?.nodes.map(value => value.status)).toEqual(['failed', 'pending', 'pending'])
    expect(failed?.events.some(value => value.type === 'run.review')).toBe(false)
  }, 30000)

  it('unregisters through the public Cordis plugin lifecycle', async () => {
    await loadBackend()
    const plugin = ctx.plugin(ReleaseReadiness)
    await plugin
    expect(ctx.lightcodeFactoryBackend.snapshot().definitions.map(value => value.id)).toEqual(['release-readiness'])
    await plugin.dispose()
    expect(ctx.lightcodeFactoryBackend.snapshot().definitions).toEqual([])
  }, 30000)
})
