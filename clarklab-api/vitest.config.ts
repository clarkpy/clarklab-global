import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    include: ['integration.test.ts', 'src/**/*.test.ts'],
  },
})
