import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({
  resolve: { alias: [
    { find: 'lightcode-factory-backend/client', replacement: resolve('packages/backend/src/client/index.ts') },
    { find: 'lightcode-factory-backend/types', replacement: resolve('packages/backend/src/types.ts') },
    { find: /^lightcode-factory-backend$/, replacement: resolve('packages/backend/src/index.ts') },
  ] },
  test: { include: ['packages/*/tests/**/*.spec.{ts,tsx}'], maxWorkers: 2 },
})
