import type { Pipeline } from './runner.js';

export type Tracer = {
  startRun(
    pipeline: Pipeline,
    context: { pipelinePath: string; message: string; project: string },
  ): Promise<string>;
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
    const headers: Record<string, string> = { connection: 'close' };
    if (body) headers['content-type'] = 'application/json';

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${root}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`dashboard ${method} ${path} failed: ${res.status} ${text}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        // Retry on transient network errors (socket closed, ECONNRESET, etc.)
        const cause = (err as { cause?: { code?: string } }).cause;
        const code = cause?.code;
        if (code === 'UND_ERR_SOCKET' || code === 'ECONNRESET' || code === 'ECONNREFUSED') {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
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
