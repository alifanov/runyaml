'use client';

import { useState, type ReactNode } from 'react';

export function RunTabs({ tracing, graph }: { tracing: ReactNode; graph: ReactNode }) {
  const [tab, setTab] = useState<'tracing' | 'graph'>('tracing');

  return (
    <div>
      <div className="tabs">
        <button
          className={`tab ${tab === 'tracing' ? 'tab-active' : ''}`}
          onClick={() => setTab('tracing')}
          type="button"
        >
          Tracing
        </button>
        <button
          className={`tab ${tab === 'graph' ? 'tab-active' : ''}`}
          onClick={() => setTab('graph')}
          type="button"
        >
          Graph
        </button>
      </div>
      <div className="tab-panel">{tab === 'tracing' ? tracing : graph}</div>
    </div>
  );
}
