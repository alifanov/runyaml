import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const body = (await req.json()) as {
    pipelinePath?: string;
    pipeline?: unknown;
    message?: string;
    project?: string;
  };

  if (!body.pipelinePath || !body.pipeline) {
    return NextResponse.json({ error: 'pipelinePath and pipeline are required' }, { status: 400 });
  }

  const run = await prisma.workflowRun.create({
    data: {
      pipelinePath: body.pipelinePath,
      pipeline: body.pipeline as object,
      message: body.message ?? '',
      project: body.project ?? '',
    },
    select: { id: true },
  });

  return NextResponse.json(run, { status: 201 });
}

export async function GET() {
  const runs = await prisma.workflowRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
  });
  return NextResponse.json(runs);
}
