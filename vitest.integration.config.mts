import { defineConfig } from 'vitest/config';
import base from './vitest.config.mts';

export default defineConfig({ ...base, test: { ...base.test, include: ['tests/integration/live/**/*.test.ts'], exclude: [], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000 } });
