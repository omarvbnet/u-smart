'use client';

import { useState } from 'react';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { COMMAND_EXAMPLES } from '../lib/nl/design-commands';
import { MessageSquare, Send, Sparkles } from 'lucide-react';

export function DesignAssistantPanel() {
  const t = useT();
  const [input, setInput] = useState('');
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const execute = useStudio((s) => s.executeDesignCommand);
  const open = useStudio((s) => s.assistantOpen);
  const setOpen = useStudio((s) => s.setAssistantOpen);
  const experienceMode = useStudio((s) => s.experienceMode);

  if (experienceMode === 'client') return null;

  const run = () => {
    const q = input.trim();
    if (!q) return;
    const result = execute(q);
    setLog((prev) => [{ ok: result.ok, text: result.message }, ...prev].slice(0, 8));
    setInput('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute bottom-16 z-20 flex items-center gap-2 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/95 px-3 py-2 text-xs font-semibold text-[var(--studio-text)] shadow-lg backdrop-blur ltr:right-3 rtl:left-3"
      >
        <Sparkles className="h-4 w-4 text-cyan-400" />
        {t('designAssistant')}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-16 z-20 flex w-[min(100%,340px)] flex-col rounded-xl border border-[var(--studio-border)] bg-[var(--studio-panel)]/98 shadow-xl backdrop-blur ltr:right-3 rtl:left-3">
      <div className="flex items-center justify-between border-b border-[var(--studio-border)] px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--studio-text)]">
          <MessageSquare className="h-4 w-4 text-cyan-400" />
          {t('designAssistant')}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-[var(--studio-muted)] hover:text-[var(--studio-text)]">
          {t('close')}
        </button>
      </div>
      <div className="max-h-32 overflow-y-auto px-3 py-2 text-[10px]">
        {log.length === 0 && <p className="text-[var(--studio-muted)]">{t('assistantHint')}</p>}
        {log.map((l, i) => (
          <p key={i} className={l.ok ? 'text-emerald-400' : 'text-orange-400'}>{l.text}</p>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {COMMAND_EXAMPLES.slice(0, 3).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setInput(ex)}
            className="rounded-md bg-[var(--studio-hover)] px-2 py-0.5 text-[9px] text-[var(--studio-muted)] hover:text-[var(--studio-text)]"
          >
            {ex}
          </button>
        ))}
      </div>
      <div className="flex gap-2 border-t border-[var(--studio-border)] p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder={t('assistantPlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-bg)] px-2 py-1.5 text-xs text-[var(--studio-text)] outline-none focus:border-cyan-400"
        />
        <button type="button" onClick={run} className="rounded-lg bg-cyan-500 px-2.5 py-1.5 text-white">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
