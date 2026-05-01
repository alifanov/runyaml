import Link from 'next/link';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const runs = await prisma.workflowRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      project: true,
      pipelinePath: true,
      message: true,
      status: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (runs.length === 0) {
    return (
      <div className="empty">
        No workflow runs yet. Run <code>pnpm runyaml &lt;path.yaml&gt;</code> with{' '}
        <code>RUNYAML_DASHBOARD_URL</code> set to see them here.
      </div>
    );
  }

  return (
    <table className="runs-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Project</th>
          <th>Pipeline</th>
          <th>Message</th>
          <th>Status</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/runs/${r.id}`}>{formatTime(r.startedAt)}</Link>
            </td>
            <td>
              {r.project ? (
                <span className="project-tag">{r.project}</span>
              ) : (
                <span className="subtle">—</span>
              )}
            </td>
            <td>
              <code>{trimPath(r.pipelinePath)}</code>
            </td>
            <td className="subtle">{r.message || '—'}</td>
            <td>
              <span className={`status-pill status-${r.status}`}>{r.status}</span>
            </td>
            <td>{formatDuration(r.startedAt, r.finishedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function trimPath(p: string): string {
  const parts = p.split('/');
  return parts.slice(-3).join('/');
}

function formatDuration(start: Date, end: Date | null): string {
  if (!end) return '…';
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}
