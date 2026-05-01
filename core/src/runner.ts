import { execSync } from 'node:child_process';

export type Step = {
  id: string;
  dependsOn?: string[];
  run?: string;
};

export type Pipeline = {
  steps?: Step[];
};

export function run(pipeline: Pipeline): void {
  const ordered = topoSort(pipeline.steps ?? []);
  const outputs = new Map<string, string>();

  for (const step of ordered) {
    if (step.run === undefined) continue;
    const cmd = interpolate(step.run, outputs);
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    outputs.set(step.id, stdout.replace(/\r?\n$/, ''));
    process.stdout.write(stdout);
  }
}

function interpolate(template: string, outputs: Map<string, string>): string {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, id: string) => {
    const value = outputs.get(id);
    if (value === undefined) {
      throw new Error(`reference to unknown or not-yet-run step: "${id}"`);
    }
    return value;
  });
}

function topoSort(steps: Step[]): Step[] {
  const byId = new Map<string, Step>();
  for (const step of steps) {
    if (byId.has(step.id)) {
      throw new Error(`duplicate step id: ${step.id}`);
    }
    byId.set(step.id, step);
  }

  const remaining = new Map<string, Set<string>>();
  for (const step of steps) {
    const deps = new Set(step.dependsOn ?? []);
    for (const dep of deps) {
      if (!byId.has(dep)) {
        throw new Error(`step "${step.id}" depends on unknown step "${dep}"`);
      }
    }
    remaining.set(step.id, deps);
  }

  const result: Step[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([id]) => id);

    if (ready.length === 0) {
      throw new Error(`cycle detected among steps: ${[...remaining.keys()].join(', ')}`);
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
