'use client';

import { useEffect, useState } from 'react';
import { Topbar } from './Topbar';
import { Palette } from './Palette';
import { Canvas } from './Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { ValidationPanel } from './ValidationPanel';
import { QualityIndex } from './QualityIndex';
import { ProjectPanel } from './ProjectPanel';
import { BusMonitor } from './BusMonitor';
import { SimulationHud } from './SimulationHud';
import { TwinChainPanel } from './TwinChainPanel';
import { SetupWizard } from './SetupWizard';
import { useStudio } from '../lib/store';
import { useAnalysis, useT, SimulationProvider } from './hooks';
import { RTL_LOCALES } from '../lib/i18n';
import { readShareFromHash } from '../lib/share';
import { SlidersHorizontal, ShieldCheck, Gauge, Building2, PanelLeft, Loader2 } from 'lucide-react';

type Tab = 'properties' | 'validation' | 'quality' | 'project';

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
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const applyingFixes = useStudio((s) => s.applyingFixes);
  const generatingProject = useStudio((s) => s.generatingProject);
  const project = useStudio((s) => s.project);
  const { issues } = useAnalysis();
  const [tab, setTab] = useState<Tab>('validation');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const experienceMode = useStudio((s) => s.experienceMode);
  const rtl = RTL_LOCALES.has(locale);
  const clientMode = experienceMode === 'client';

  useEffect(() => {
    if (clientMode) setTab('properties');
  }, [clientMode]);

  useEffect(() => {
    if (!project.setupComplete) setWizardOpen(true);
  }, [project.setupComplete]);

  // Load shared design or autosave; show wizard when setup is incomplete.
  useEffect(() => {
    const shared = readShareFromHash();
    if (shared) {
      loadDesign(shared);
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      hydrate();
    }
    const p = useStudio.getState().project;
    if (!p.setupComplete) setWizardOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) setTab('properties');
  }, [selectedId]);

  const selectedWallId = useStudio((s) => s.selectedWallId);
  const selectedRoomId = useStudio((s) => s.selectedRoomId);
  useEffect(() => {
    if (selectedRoomId || selectedWallId) setTab('properties');
  }, [selectedRoomId, selectedWallId]);

  const selectedOpeningId = useStudio((s) => s.selectedOpeningId);
  useEffect(() => {
    if (selectedOpeningId) setTab('properties');
  }, [selectedOpeningId]);

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
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!applyingFixes) undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!applyingFixes) redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duplicateNode, undo, redo, applyingFixes]);

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;

  const tabs: { key: Tab; label: string; icon: typeof Gauge; badge?: number }[] = clientMode
    ? [{ key: 'properties', label: t('properties'), icon: SlidersHorizontal }]
    : [
        { key: 'validation', label: t('validation'), icon: ShieldCheck, badge: issues.length },
        { key: 'quality', label: t('quality'), icon: Gauge },
        { key: 'properties', label: t('properties'), icon: SlidersHorizontal },
        { key: 'project', label: t('project'), icon: Building2 },
      ];

  return (
    <div
      data-studio-theme={theme}
      dir={rtl ? 'rtl' : 'ltr'}
      suppressHydrationWarning
      className="studio-root flex h-screen flex-col overflow-hidden"
    >
      <Topbar />

      <div className="flex min-h-0 flex-1">
        {!clientMode && (
          <aside className="hidden w-[260px] flex-shrink-0 border-e border-[var(--studio-border)] bg-[var(--studio-panel)] md:block">
            <Palette />
          </aside>
        )}

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-[var(--studio-border)] bg-[var(--studio-panel)] px-2 py-1.5 md:hidden">
            {!clientMode && (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--studio-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--studio-text)]"
              >
                <PanelLeft className="h-4 w-4" />
                {t('palette')}
              </button>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            <SimulationProvider>
              <Canvas />
              <SimulationHud />
            </SimulationProvider>
            {generatingProject && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] px-8 py-6 shadow-2xl">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                  <p className="text-sm font-semibold text-[var(--studio-text)]">{t('generatingProject')}</p>
                  <p className="max-w-xs text-center text-xs text-[var(--studio-muted)]">{t('generatingProjectHint')}</p>
                </div>
              </div>
            )}
            <TwinChainPanel />
            {!clientMode && <BusMonitor />}
            <div className="absolute bottom-3 ltr:right-3 rtl:left-3 z-10 flex gap-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-panel)]/90 px-3 py-1.5 text-[11px] text-[var(--studio-muted)] backdrop-blur pointer-events-none">
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
          </div>
        </main>

        {paletteOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/50" aria-label={t('close')} onClick={() => setPaletteOpen(false)} />
            <aside className="absolute inset-y-0 flex w-[min(100%,280px)] flex-col bg-[var(--studio-panel)] shadow-xl ltr:left-0 ltr:border-e rtl:right-0 rtl:border-s border-[var(--studio-border)]">
              <Palette />
            </aside>
          </div>
        )}

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
            {!clientMode && tab === 'validation' && <ValidationPanel />}
            {!clientMode && tab === 'quality' && <QualityIndex />}
            {!clientMode && tab === 'project' && <ProjectPanel />}
          </div>
        </aside>
      </div>

      {wizardOpen && <SetupWizard onComplete={() => setWizardOpen(false)} />}
    </div>
  );
}
