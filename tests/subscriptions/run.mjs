// Uses the installed TypeScript compiler and Node's test runner; no package edits.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url));
import { spawnSync } from 'node:child_process';
const root = path.resolve(directory, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'hack26-d3-tests-'));
try {
  const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--skipLibCheck', '--target', 'es2020', '--module', 'commonjs', '--outDir', output,
    ...['contracts', 'errors', 'validation', 'lifecycle', 'service'].map(name => path.join(root, `src/modules/subscriptions/${name}.ts`))], { stdio: 'inherit', cwd: root });
  if (compile.status !== 0) process.exitCode = compile.status || 1;
  else {
    // Node has no Next bundler. Disable only Next's import guard in the isolated
    // compiled test output, never in application source. All domain code runs.
    const guard = path.join(output, 'node_modules/server-only');
    mkdirSync(guard, { recursive: true });
    writeFileSync(path.join(guard, 'index.js'), '// Test-only server environment marker.\n');
    const tests = spawnSync(process.execPath, ['--test', path.join(directory, 'domain.test.mjs'), path.join(directory, 'service.test.mjs')], { stdio: 'inherit', env: { ...process.env, D3_TEST_OUTPUT: output }, cwd: root });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  if (path.dirname(output) !== path.resolve(tmpdir()) || !path.basename(output).startsWith('hack26-d3-tests-')) throw new Error('Unsafe test cleanup path');
  rmSync(output, { recursive: true, force: true });
}
