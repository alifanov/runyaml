'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { pipelineToFlow, type NodeStatusMap, type PipelineDoc } from '@/lib/dag-layout';

function DagNode({ data }: NodeProps) {
  const status = (data as { status?: string }).status ?? 'pending';
  const label = (data as { label?: string }).label ?? '';
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div className={`dag-node ${status}`}>{label}</div>
      <Handle type="source" position={Position.Right} />
    </>
  );
}

const nodeTypes: NodeTypes = { dag: DagNode };

export function DagViewer({
  pipeline,
  statuses,
}: {
  pipeline: PipelineDoc;
  statuses: NodeStatusMap;
}) {
  const { nodes, edges } = useMemo(() => pipelineToFlow(pipeline, statuses), [pipeline, statuses]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
