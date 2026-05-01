import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parse } from 'yaml';
import { run, type Pipeline } from './runner.ts';
import { createHttpTracer } from './tracer.ts';

loadDotEnv();

const file = process.argv[2];
const message = process.argv.slice(3).join(' ');

if (!file) {
  console.error('usage: runyaml <path-to-yaml> [message]');
  process.exit(1);
}

const dashboardUrl = process.env.RUNYAML_DASHBOARD_URL?.trim();
if (!dashboardUrl) {
  console.error(
    'RUNYAML_DASHBOARD_URL is not set. Add it to .env (see .env.example) or export it before running. Start the dashboard with `pnpm web:up`.',
  );
  process.exit(1);
}

const userCwd = process.env.INIT_CWD ?? process.cwd();
const pipelinePath = resolve(userCwd, file);
const pipeline = parse(readFileSync(pipelinePath, 'utf8')) as Pipeline;
const tracer = createHttpTracer(dashboardUrl);

await run(pipeline, {
  globals: { ARGUMENTS: message, USER_MESSAGE: message },
  tracer,
  pipelinePath,
});

function loadDotEnv(): void {
  // Walk up from the user's cwd looking for .env. Don't override pre-existing env.
  let dir = process.env.INIT_CWD ?? process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const text = readFileSync(candidate, 'utf8');
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
