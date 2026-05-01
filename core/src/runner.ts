import { execSync } from 'node:child_process';
import type { Tracer } from './tracer.js';

export type Node = {
  id: string;
  depends_on?: string[];
  run?: string;
};

export type Pipeline = {
  nodes?: Node[];
};

export type RunOptions = {
  globals?: Record<string, string>;
  tracer?: Tracer;
  pipelinePath?: string;
  project?: string;
};

export async function run(pipeline: Pipeline, options: RunOptions = {}): Promise<void> {
  const globals = options.globals ?? {};
  const ordered = topoSort(pipeline.nodes ?? []);
  const outputs = new Map<string, string>();

  const runId = options.tracer
    ? await options.tracer.startRun(pipeline, {
        pipelinePath: options.pipelinePath ?? '',
        message: globals.ARGUMENTS ?? '',
        project: options.project ?? '',
      })
    : null;

  const total = ordered.filter((n) => n.run !== undefined).length;
  let idx = 0;

  let runError: Error | undefined;
  try {
    for (const node of ordered) {
      if (node.run === undefined) continue;

      idx += 1;
      const startedAt = Date.now();
      process.stderr.write(`\x1b[36m▶\x1b[0m [${idx}/${total}] \x1b[1m${node.id}\x1b[0m\n`);

      if (options.tracer && runId) {
        await safeTrace(() => options.tracer!.startNode(runId, node.id));
      }

      let stdout = '';
      try {
        const cmd = interpolate(node.run, outputs, globals);
        stdout = execSync(cmd, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'inherit'],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const ms = Date.now() - startedAt;
        process.stderr.write(`\x1b[31m✗\x1b[0m [${idx}/${total}] ${node.id} (${ms}ms)\n`);
        if (options.tracer && runId) {
          await safeTrace(() => options.tracer!.finishNode(runId, node.id, { error: message }));
        }
        throw err;
      }

      const captured = stdout.replace(/\r?\n$/, '');
      outputs.set(node.id, captured);
      process.stdout.write(stdout);

      const ms = Date.now() - startedAt;
      process.stderr.write(`\x1b[32m✓\x1b[0m [${idx}/${total}] ${node.id} (${ms}ms)\n`);

      if (options.tracer && runId) {
        await safeTrace(() => options.tracer!.finishNode(runId, node.id, { output: captured }));
      }
    }
  } catch (err) {
    runError = err instanceof Error ? err : new Error(String(err));
  } finally {
    // Always close out the run — never leave it stuck on "running",
    // even if a previous tracer call or the workflow itself threw.
    if (options.tracer && runId) {
      await safeTrace(() =>
        options.tracer!.finishRun(runId, runError ? { error: runError.message } : {}),
      );
    }
  }

  if (runError) throw runError;
}

async function safeTrace(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // Tracer failures are logged but never abort the workflow or mask the
    // underlying execution error.
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[runyaml] tracer error: ${message}\n`);
  }
}

function interpolate(
  template: string,
  outputs: Map<string, string>,
  globals: Record<string, string>,
): string {
  return template
    .replace(/\{\{\s*([\w-]+)\.output\s*\}\}/g, (_, id: string) => {
      const value = outputs.get(id);
      if (value === undefined) {
        throw new Error(`reference to unknown or not-yet-run node: "${id}"`);
      }
      return escapeForDoubleQuotes(value);
    })
    .replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, name: string) => {
      const value = globals[name];
      if (value === undefined) {
        throw new Error(`reference to unknown variable: "${name}"`);
      }
      return escapeForDoubleQuotes(value);
    });
}

// Escape a value so it can be safely interpolated inside a double-quoted
// shell string. Inside "..." the shell still expands $, `, \, and ".
// Workflows authored in this repo all wrap {{ }} in "..." (see AGENTS.md),
// so this prevents command substitution / variable expansion / quote-break
// from arbitrary AI-generated outputs.
function escapeForDoubleQuotes(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

function topoSort(nodes: Node[]): Node[] {
  const byId = new Map<string, Node>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      throw new Error(`duplicate node id: ${node.id}`);
    }
    byId.set(node.id, node);
  }

  const remaining = new Map<string, Set<string>>();
  for (const node of nodes) {
    const deps = new Set(node.depends_on ?? []);
    for (const dep of deps) {
      if (!byId.has(dep)) {
        throw new Error(`node "${node.id}" depends on unknown node "${dep}"`);
      }
    }
    remaining.set(node.id, deps);
  }

  const result: Node[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([id]) => id);

    if (ready.length === 0) {
      throw new Error(`cycle detected among nodes: ${[...remaining.keys()].join(', ')}`);
    }

    for (const id of ready) {
      result.push(byId.get(id)!);
      remaining.delete(id);
    }
    for (const deps of remaining.values()) {
      for (const id of ready) deps.delete(id);
    }
  }

  return result;
}
