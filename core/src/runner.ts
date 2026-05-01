import { execSync } from 'node:child_process';
import type { Tracer } from './tracer.ts';

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
};

export async function run(pipeline: Pipeline, options: RunOptions = {}): Promise<void> {
  const globals = options.globals ?? {};
  const ordered = topoSort(pipeline.nodes ?? []);
  const outputs = new Map<string, string>();

  const runId = options.tracer
    ? await options.tracer.startRun(pipeline, {
        pipelinePath: options.pipelinePath ?? '',
        message: globals.ARGUMENTS ?? '',
      })
    : null;

  try {
    for (const node of ordered) {
      if (node.run === undefined) continue;

      if (options.tracer && runId) {
        await options.tracer.startNode(runId, node.id);
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
        if (options.tracer && runId) {
          await options.tracer.finishNode(runId, node.id, { error: message });
          await options.tracer.finishRun(runId, { error: message });
        }
        throw err;
      }

      const captured = stdout.replace(/\r?\n$/, '');
      outputs.set(node.id, captured);
      process.stdout.write(stdout);

      if (options.tracer && runId) {
        await options.tracer.finishNode(runId, node.id, { output: captured });
      }
    }

    if (options.tracer && runId) {
      await options.tracer.finishRun(runId, {});
    }
  } catch (err) {
    throw err;
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
      return value;
    })
    .replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, name: string) => {
      const value = globals[name];
      if (value === undefined) {
        throw new Error(`reference to unknown variable: "${name}"`);
      }
      return value;
    });
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
