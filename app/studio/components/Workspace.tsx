'use client';

import { useEffect, useState } from 'react';
import { Topbar } from './Topbar';
import { WorkspaceEditor } from './WorkspaceEditor';
import { SetupWizard } from './SetupWizard';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { RTL_LOCALES } from '../lib/i18n';
import { readShareFromHash } from '../lib/share';
import { Loader2 } from 'lucide-react';

export function Workspace() {
  const t = useT();
  const theme = useStudio((s) => s.theme);
  const locale = useStudio((s) => s.locale);
  const hydrate = useStudio((s) => s.hydrate);
  const loadDesign = useStudio((s) => s.loadDesign);
  const duplicateNode = useStudio((s) => s.duplicateNode);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const applyingFixes = useStudio((s) => s.applyingFixes);
  const generatingProject = useStudio((s) => s.generatingProject);
  const project = useStudio((s) => s.project);
  const [wizardOpen, setWizardOpen] = useState(false);
  const rtl = RTL_LOCALES.has(locale);

  const showEditor = project.setupComplete && !wizardOpen && !generatingProject;

  useEffect(() => {
    if (!project.setupComplete) setWizardOpen(true);
  }, [project.setupComplete]);

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
    const onKey = (e: KeyboardEvent) => {
      if (!showEditor) return;
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
  }, [duplicateNode, undo, redo, applyingFixes, showEditor]);

  return (
    <div
      data-studio-theme={theme}
      dir={rtl ? 'rtl' : 'ltr'}
      suppressHydrationWarning
      className="studio-root flex h-screen flex-col overflow-hidden"
    >
      <Topbar />

      <div className="relative flex min-h-0 flex-1">
        {showEditor ? (
          <WorkspaceEditor />
        ) : (
          <div className="relative min-h-0 flex-1 bg-[var(--studio-bg)]">
            {generatingProject && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-panel)] px-8 py-6 shadow-2xl">
                  <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                  <p className="text-sm font-semibold text-[var(--studio-text)]">{t('generatingProject')}</p>
                  <p className="max-w-xs text-center text-xs text-[var(--studio-muted)]">{t('generatingProjectHint')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {wizardOpen && <SetupWizard onComplete={() => setWizardOpen(false)} />}
    </div>
  );
}
