/** Test-only provider. Never included in any published package. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse, toolCallResponse } from './mock-adapter.ts'
export const inject = ['llm', 'tools']
class InstalledFixtureAdapter extends MockAdapter {
  private turns = new Map<string, number>()
  constructor() { super([]) }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    options.signal?.throwIfAborted()
    if (options.purpose) {
      yield* textResponse('Factory verification')
      return
    }
    const session = String(options.sessionId ?? 'default')
    const turn = this.turns.get(session) ?? 0
    this.turns.set(session, turn + 1)
    yield* turn === 0
      ? toolCallResponse('installed-demo-tool', 'factory_test_numbers', {})
      : textResponse('The tool returned the numbers.\n```javascript\nconsole.log(JSON.stringify({ sum: [2,3,5,7,11].reduce((a,b)=>a+b,0) }))\n```')
  }
}
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['factory-test'], new InstalledFixtureAdapter())
  ctx.tools.register(defineTool({
    name: 'factory_test_numbers', description: 'Return fixed test numbers', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => '[2,3,5,7,11]',
  }))
}
