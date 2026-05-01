import { execSync } from 'node:child_process';

export type Node = {
  id: string;
  depends_on?: string[];
  run?: string;
};

export type Pipeline = {
  nodes?: Node[];
};

export function run(pipeline: Pipeline): void {
  const ordered = topoSort(pipeline.nodes ?? []);
  const outputs = new Map<string, string>();

  for (const node of ordered) {
    if (node.run === undefined) continue;
    const cmd = interpolate(node.run, outputs);
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    outputs.set(node.id, stdout.replace(/\r?\n$/, ''));
    process.stdout.write(stdout);
  }
}

function interpolate(template: string, outputs: Map<string, string>): string {
  return template.replace(/\{\{\s*([\w-]+)\.output\s*\}\}/g, (_, id: string) => {
    const value = outputs.get(id);
    if (value === undefined) {
      throw new Error(`reference to unknown or not-yet-run node: "${id}"`);
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
