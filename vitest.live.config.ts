import { defineConfig } from 'vitest/config';

/**
 * Tests against the real third-party services the bot talks to. They need the
 * network and can fail for reasons outside this repository, so `npm test` and CI
 * leave them out; run them with `npm run test:live`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    testTimeout: 20_000,
    // One file at a time, so the services see this the way they would see the bot.
    fileParallelism: false,
  },
});
