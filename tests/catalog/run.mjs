import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const output = mkdtempSync(path.join(tmpdir(), 'hack26-d2-tests-'));
try {
  const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'commonjs', '--rootDir', path.join(root, 'src'), '--outDir', output,
    path.join(root, 'src/modules/catalog/contracts.ts'), path.join(root, 'src/modules/catalog/pricing.ts')], { stdio: 'inherit', cwd: root });
  if (compile.status !== 0) process.exitCode = compile.status || 1;
  else {
    const tests = spawnSync(process.execPath, ['--test', path.join(directory, 'pricing.test.mjs')], { stdio: 'inherit', env: { ...process.env, D2_TEST_OUTPUT: path.join(output, 'modules/catalog') }, cwd: root });
    process.exitCode = tests.status ?? 1;
  }
} finally {
  if (path.dirname(output) !== path.resolve(tmpdir()) || !path.basename(output).startsWith('hack26-d2-tests-')) throw new Error('Unsafe test cleanup path');
  rmSync(output, { recursive: true, force: true });
}
