import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
await mkdir('.verification', { recursive: true });
await build({ entryPoints: ['tests/fixture-plugin.ts'], outfile: '.verification/fixture.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node24' });
await writeFile('.verification/fixture.patch.yml', [
  '# Test-only: deterministic model, known script, isolated home.',
  '- id: agent-default-model',
  '  config: { provider: factory-test, model: mock }',
  '- id: sandbox-policy',
  '  config: { mode: danger-full-access }',
  '- id: approval',
  '  config: { policy: never }',
  '- insert:',
  '    - id: lightcode-test-model',
  '      name: ' + JSON.stringify(pathToFileURL(resolve('.verification/fixture.js')).href),
].join('\n') + '\n');
