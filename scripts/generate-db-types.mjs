import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Hosted type generation is read-only; migrations require a separately reviewed target.
const args = process.env.SUPABASE_PROJECT_REF ? ['--project-id', process.env.SUPABASE_PROJECT_REF] : ['--local'];
const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'gen', 'types', 'typescript', ...args, '--schema', 'public'], { encoding: 'utf8', shell: false });
if (result.error || result.status !== 0 || !result.stdout.includes('export type Database')) {
  process.stderr.write(result.stderr || 'Database type generation failed.\n');
  process.exit(1);
}
writeFileSync('src/lib/supabase/database.types.ts', result.stdout);
