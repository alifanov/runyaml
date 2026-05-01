import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DagViewer } from '@/components/DagViewer';
import type { NodeStatusMap, PipelineDoc } from '@/lib/dag-layout';

export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({
    where: { id },
    include: { nodes: { orderBy: { createdAt: 'asc' } } },
  });

  if (!run) notFound();

  const pipeline = run.pipeline as unknown as PipelineDoc;
  const statuses: NodeStatusMap = {};
  for (const n of run.nodes) {
    statuses[n.nodeId] = n.status;
  }

  return (
    <div>
      <div className="run-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 18 }}>
            <code>{trimPath(run.pipelinePath)}</code>{' '}
            <span className={`status-pill status-${run.status}`}>{run.status}</span>
          </h1>
          <div className="run-meta">
            started {run.startedAt.toISOString()}
            {run.finishedAt && ` · finished ${run.finishedAt.toISOString()}`}
          </div>
        </div>
      </div>

      {run.message && <div className="run-message">{run.message}</div>}

      <div className="section-h">Execution graph</div>
      <div className="graph-pane">
        <DagViewer pipeline={pipeline} statuses={statuses} />
      </div>

      <div className="section-h">Nodes</div>
      <div className="nodes-list">
        {(pipeline.nodes ?? []).map((pn) => {
          const nr = run.nodes.find((n) => n.nodeId === pn.id);
          const status = nr?.status ?? 'pending';
          return (
            <div key={pn.id} className="node-card">
              <div className="node-card-header">
                <span className="node-id">{pn.id}</span>
                <span className={`status-pill status-${status}`}>{status}</span>
              </div>
              {nr?.error && <pre className="node-error">{nr.error}</pre>}
              {nr?.output != null && nr.output !== '' && (
                <pre className="node-output">{nr.output}</pre>
              )}
              {!nr?.output && !nr?.error && status === 'pending' && (
                <pre className="node-output subtle">(not started)</pre>
              )}
            </div>
          );
        })}
      </div>

      {run.error && (
        <>
          <div className="section-h">Run error</div>
          <pre className="node-error" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            {run.error}
          </pre>
        </>
      )}
    </div>
  );
}

function trimPath(p: string): string {
  return p.split('/').slice(-3).join('/');
}
