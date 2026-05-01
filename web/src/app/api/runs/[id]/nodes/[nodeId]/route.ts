import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Body = {
  status?: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  output?: string | null;
  error?: string | null;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const body = (await req.json()) as Body;

  const data = {
    status: body.status,
    startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : undefined,
    output: body.output ?? undefined,
    error: body.error ?? undefined,
  };

  const node = await prisma.nodeRun.upsert({
    where: { runId_nodeId: { runId: id, nodeId } },
    create: { runId: id, nodeId, ...data, status: data.status ?? 'pending' },
    update: data,
  });

  return NextResponse.json(node);
}
