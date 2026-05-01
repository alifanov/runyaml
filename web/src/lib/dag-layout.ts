import dagre from '@dagrejs/dagre';
import type { Edge, Node as FlowNode } from '@xyflow/react';

export type PipelineNode = {
  id: string;
  depends_on?: string[];
  run?: string;
};

export type PipelineDoc = {
  nodes?: PipelineNode[];
};

export type NodeStatusMap = Record<string, 'pending' | 'running' | 'completed' | 'failed'>;

const NODE_W = 180;
const NODE_H = 56;

export function pipelineToFlow(
  pipeline: PipelineDoc,
  statuses: NodeStatusMap = {},
): { nodes: FlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 56 });
  g.setDefaultEdgeLabel(() => ({}));

  const pipelineNodes = pipeline.nodes ?? [];
  for (const n of pipelineNodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  const edges: Edge[] = [];
  for (const n of pipelineNodes) {
    for (const dep of n.depends_on ?? []) {
      g.setEdge(dep, n.id);
      edges.push({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        animated: statuses[n.id] === 'running',
      });
    }
  }

  dagre.layout(g);

  const nodes: FlowNode[] = pipelineNodes.map((n) => {
    const layout = g.node(n.id);
    return {
      id: n.id,
      type: 'dag',
      position: { x: layout.x - NODE_W / 2, y: layout.y - NODE_H / 2 },
      data: { label: n.id, status: statuses[n.id] ?? 'pending' },
    };
  });

  return { nodes, edges };
}
