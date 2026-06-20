'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '../lib/store';
import { getTwinConnection } from '../lib/twin-stream';
import type { TwinChainStep } from '@/lib/studio-simulation-hub';
import { ArrowRight } from 'lucide-react';

export function TwinChainPanel() {
  const simulating = useStudio((s) => s.simulating);
  const [steps, setSteps] = useState<TwinChainStep[]>([]);

  useEffect(() => {
    if (!simulating) {
      setSteps([]);
      return;
    }
    return getTwinConnection().subscribe((live) => {
      if (live.lastChain?.steps.length) setSteps(live.lastChain.steps);
    });
  }, [simulating]);

  if (!simulating || !steps.length) return null;

  return (
    <div className="absolute bottom-20 z-10 ltr:left-3 rtl:right-3 max-w-md rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 p-2 shadow-lg backdrop-blur">
      <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[var(--studio-muted)]">Twin chain</div>
      <div className="flex flex-wrap items-center gap-1">
        {steps.map((s, i) => (
          <span key={`${s.nodeId}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="h-3 w-3 text-[var(--studio-muted)]" />}
            <span className="rounded bg-[var(--studio-bg)] px-1.5 py-0.5 text-[9px] text-[var(--studio-text)]" title={s.detail}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
