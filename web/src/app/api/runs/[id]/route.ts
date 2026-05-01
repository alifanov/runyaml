import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.workflowRun.findUnique({
    where: { id },
    include: { nodes: { orderBy: { createdAt: 'asc' } } },
  });
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(run);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as {
    status?: 'running' | 'completed' | 'failed';
    finishedAt?: string;
    error?: string | null;
  };

  const run = await prisma.workflowRun.update({
    where: { id },
    data: {
      status: body.status,
      finishedAt: body.finishedAt ? new Date(body.finishedAt) : undefined,
      error: body.error ?? undefined,
    },
  });

  return NextResponse.json(run);
}
