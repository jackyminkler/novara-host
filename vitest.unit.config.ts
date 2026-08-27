import { defineConfig } from 'vitest/config'

// Unit tests for pure modules. Separate from vitest.config.ts because those
// cases need the Firestore emulator running and these deliberately need
// nothing at all.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
