import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node, not jsdom: these exercise Firestore rules against the emulator,
    // not React.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The rules tests share one emulator project and clear Firestore between
    // cases, so they cannot run in parallel with each other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
