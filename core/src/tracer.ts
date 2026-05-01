import type { Pipeline } from './runner.ts';

export type Tracer = {
  startRun(pipeline: Pipeline, context: { pipelinePath: string; message: string }): Promise<string>;
  startNode(runId: string, nodeId: string): Promise<void>;
  finishNode(
    runId: string,
    nodeId: string,
    result: { output?: string; error?: string },
  ): Promise<void>;
  finishRun(runId: string, result: { error?: string }): Promise<void>;
};

export function createHttpTracer(baseUrl: string): Tracer {
  const root = baseUrl.replace(/\/$/, '');

  async function request(path: string, method: string, body?: unknown): Promise<Response> {
    const res = await fetch(`${root}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`dashboard ${method} ${path} failed: ${res.status} ${text}`);
    }
    return res;
  }

  return {
    async startRun(pipeline, context) {
      const res = await request('/api/runs', 'POST', { pipeline, ...context });
      const json = (await res.json()) as { id: string };
      return json.id;
    },
    async startNode(runId, nodeId) {
      await request(`/api/runs/${runId}/nodes/${encodeURIComponent(nodeId)}`, 'POST', {
        status: 'running',
        startedAt: new Date().toISOString(),
      });
    },
    async finishNode(runId, nodeId, result) {
      await request(`/api/runs/${runId}/nodes/${encodeURIComponent(nodeId)}`, 'POST', {
        status: result.error ? 'failed' : 'completed',
        finishedAt: new Date().toISOString(),
        output: result.output ?? null,
        error: result.error ?? null,
      });
    },
    async finishRun(runId, result) {
      await request(`/api/runs/${runId}`, 'PATCH', {
        status: result.error ? 'failed' : 'completed',
        finishedAt: new Date().toISOString(),
        error: result.error ?? null,
      });
    },
  };
}
