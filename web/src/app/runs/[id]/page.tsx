import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { DagViewer } from '@/components/DagViewer';
import { RunTabs } from '@/components/RunTabs';
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

  const tracing = (
    <div className="nodes-list">
      {(pipeline.nodes ?? []).map((pn, idx) => {
        const nr = run.nodes.find((n) => n.nodeId === pn.id);
        const status = nr?.status ?? 'pending';
        const duration = nr?.startedAt && nr?.finishedAt
          ? formatDuration(nr.startedAt, nr.finishedAt)
          : null;
        const output = nr?.output ?? '';
        const outputBytes = new TextEncoder().encode(output).length;
        const outputLines = output ? output.split('\n').length : 0;
        return (
          <div key={pn.id} className="node-card">
            <div className="node-card-header">
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span className="subtle" style={{ fontSize: 11 }}>#{idx + 1}</span>
                <span className="node-id">{pn.id}</span>
                {pn.depends_on && pn.depends_on.length > 0 && (
                  <span className="subtle" style={{ fontSize: 11 }}>
                    ← {pn.depends_on.join(', ')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                {duration && <span className="subtle" style={{ fontSize: 11 }}>{duration}</span>}
                <span className={`status-pill status-${status}`}>{status}</span>
              </div>
            </div>

            {pn.run && (
              <div className="node-section">
                <div className="node-section-h">Command</div>
                <pre className="node-code">{pn.run}</pre>
              </div>
            )}

            <div className="node-section">
              <div className="node-section-h">
                Output (stdout)
                {nr?.output != null && (
                  <span className="subtle" style={{ marginLeft: 8, fontSize: 11 }}>
                    {outputBytes} bytes · {outputLines} line{outputLines === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {nr?.output != null && nr.output !== '' ? (
                <pre className="node-output">{nr.output}</pre>
              ) : (
                <pre className="node-output node-output-empty">
                  {status === 'pending' ? '(not started)' : '(empty)'}
                </pre>
              )}
            </div>

            {nr?.error && (
              <div className="node-section">
                <div className="node-section-h">Error</div>
                <pre className="node-error">{nr.error}</pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const graph = (
    <div className="graph-pane">
      <DagViewer pipeline={pipeline} statuses={statuses} />
    </div>
  );

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
            {run.finishedAt && ` · ${formatDuration(run.startedAt, run.finishedAt)}`}
          </div>
        </div>
      </div>

      {run.message && (
        <>
          <div className="section-h">CLI message ({'{{ ARGUMENTS }}'})</div>
          <div className="run-message">{run.message}</div>
        </>
      )}

      <RunTabs tracing={tracing} graph={graph} />

      {run.error && (
        <>
          <div className="section-h">Run error</div>
          <pre
            className="node-error"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
          >
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

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}
