'use client';

import { useEffect, useState } from 'react';
import { Topbar } from './Topbar';
import { Palette } from './Palette';
import { Canvas } from './Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { ValidationPanel } from './ValidationPanel';
import { QualityIndex } from './QualityIndex';
import { BusMonitor } from './BusMonitor';
import { useStudio } from '../lib/store';
import { useAnalysis, useT } from './hooks';
import { RTL_LOCALES } from '../lib/i18n';
import { readShareFromHash } from '../lib/share';
import { SlidersHorizontal, ShieldCheck, Gauge } from 'lucide-react';

type Tab = 'properties' | 'validation' | 'quality';

export function Workspace() {
  const t = useT();
  const theme = useStudio((s) => s.theme);
  const locale = useStudio((s) => s.locale);
  const selectedId = useStudio((s) => s.selectedNodeId);
  const nodeCount = useStudio((s) => s.nodes.length);
  const edgeCount = useStudio((s) => s.edges.length);
  const hydrate = useStudio((s) => s.hydrate);
  const loadDesign = useStudio((s) => s.loadDesign);
  const duplicateNode = useStudio((s) => s.duplicateNode);
  const { issues } = useAnalysis();
  const [tab, setTab] = useState<Tab>('validation');
  const rtl = RTL_LOCALES.has(locale);

  // Jump to properties when the user selects a node.
  useEffect(() => {
    if (selectedId) setTab('properties');
  }, [selectedId]);

  // Load a shared design from the URL hash, otherwise restore the autosave.
  useEffect(() => {
    const shared = readShareFromHash();
    if (shared) {
      loadDesign(shared);
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      hydrate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (ignored while typing in form fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const id = useStudio.getState().selectedNodeId;
        if (id) duplicateNode(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duplicateNode]);

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;

  const tabs: { key: Tab; label: string; icon: typeof Gauge; badge?: number }[] = [
    { key: 'validation', label: t('validation'), icon: ShieldCheck, badge: issues.length },
    { key: 'quality', label: t('quality'), icon: Gauge },
    { key: 'properties', label: t('properties'), icon: SlidersHorizontal },
  ];

  return (
    <div
      data-studio-theme={theme}
      dir={rtl ? 'rtl' : 'ltr'}
      className="studio-root flex h-screen flex-col overflow-hidden"
    >
      <Topbar />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] flex-shrink-0 border-e border-[var(--studio-border)] bg-[var(--studio-panel)] md:block">
          <Palette />
        </aside>

        <main className="relative min-w-0 flex-1">
          <Canvas />
          <BusMonitor />
          <div className="absolute bottom-3 ltr:left-3 rtl:right-3 z-10 flex gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-panel)]/90 px-3 py-1.5 text-[11px] text-[var(--studio-muted)] backdrop-blur">
            <span>{nodeCount} {t('nodes')}</span>
            <span className="opacity-40">·</span>
            <span>{edgeCount} {t('connections')}</span>
            {criticalCount > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span className="font-semibold text-red-400">{criticalCount} {t('critical')}</span>
              </>
            )}
          </div>
        </main>

        <aside className="hidden w-[330px] flex-shrink-0 border-s border-[var(--studio-border)] bg-[var(--studio-panel)] lg:flex lg:flex-col">
          <div className="flex border-b border-[var(--studio-border)]">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-semibold transition
                  ${tab === tb.key ? 'border-b-2 border-cyan-400 text-cyan-400' : 'text-[var(--studio-muted)] hover:text-[var(--studio-text)]'}`}
              >
                <tb.icon className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{tb.label}</span>
                {tb.badge ? (
                  <span className="rounded-full bg-[var(--studio-hover)] px-1.5 text-[9px]">{tb.badge}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'properties' && <PropertiesPanel />}
            {tab === 'validation' && <ValidationPanel />}
            {tab === 'quality' && <QualityIndex />}
          </div>
        </aside>
      </div>
    </div>
  );
}
