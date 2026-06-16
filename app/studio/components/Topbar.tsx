'use client';

import { useRef, useState } from 'react';
import StudioLogo from './StudioLogo';
import { useStudio } from '../lib/store';
import { useT } from './hooks';
import { STUDIO_LOCALES, LOCALE_LABELS, type StudioLocale } from '../lib/i18n';
import { importMapFile } from '../lib/import-map';
import { exportDesignPdf } from '../lib/export-pdf';
import { ReportsModal } from './ReportsModal';
import { ShareModal } from './ShareModal';
import type { DesignFile } from '../lib/store';
import {
  FilePlus2, FolderOpen, Trash2, Play, Square, Moon, Sun, Languages,
  Map as MapIcon, Eye, EyeOff, FileDown, Loader2, FileBarChart2, Share2, FileJson, Upload,
} from 'lucide-react';

export function Topbar() {
  const t = useT();
  const locale = useStudio((s) => s.locale);
  const setLocale = useStudio((s) => s.setLocale);
  const theme = useStudio((s) => s.theme);
  const toggleTheme = useStudio((s) => s.toggleTheme);
  const clear = useStudio((s) => s.clear);
  const loadSample = useStudio((s) => s.loadSample);
  const designName = useStudio((s) => s.designName);
  const simulating = useStudio((s) => s.simulating);
  const toggleSimulation = useStudio((s) => s.toggleSimulation);
  const showDeclarations = useStudio((s) => s.showDeclarations);
  const toggleDeclarations = useStudio((s) => s.toggleDeclarations);
  const map = useStudio((s) => s.map);
  const setMap = useStudio((s) => s.setMap);
  const clearMap = useStudio((s) => s.clearMap);
  const loadDesign = useStudio((s) => s.loadDesign);

  const [langOpen, setLangOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  const btn = 'flex items-center gap-1.5 rounded-lg border border-[var(--studio-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--studio-text)] hover:bg-[var(--studio-hover)] transition';

  const handleMapFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { src, width, height } = await importMapFile(file);
      setMap(src, width, height);
    } catch {
      /* ignore unreadable file */
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { nodes, edges, designName } = useStudio.getState();
      await exportDesignPdf({ designName, nodes, edges });
    } finally {
      setExporting(false);
    }
  };

  const exportJson = () => {
    const file = useStudio.getState().serialize();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(file.designName || 'usmart-studio').replace(/[^\w-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as DesignFile;
      if (parsed && parsed.version === 1) loadDesign(parsed);
    } catch {
      /* invalid file */
    }
  };

  return (
    <header className="flex items-center gap-3 border-b border-[var(--studio-border)] bg-[var(--studio-panel)] px-3 py-2">
      <StudioLogo size="compact" />
      {designName && (
        <span className="hidden truncate text-sm font-medium text-[var(--studio-muted)] md:block max-w-[180px]">/ {designName}</span>
      )}

      <div className="ms-auto flex items-center gap-1.5">
        <button className={btn} onClick={clear}>
          <FilePlus2 className="h-3.5 w-3.5" />
          <span className="hidden 2xl:inline">{t('newDesign')}</span>
        </button>
        <button className={btn} onClick={loadSample}>
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="hidden 2xl:inline">{t('sample')}</span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            void handleMapFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button className={btn} onClick={() => (map ? clearMap() : fileRef.current?.click())}>
          <MapIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{map ? t('removeMap') : t('importMap')}</span>
        </button>

        <button
          className={`${btn} ${showDeclarations ? '!border-amber-400/50 !text-amber-500' : ''}`}
          onClick={toggleDeclarations}
          title={t('declarations')}
        >
          {showDeclarations ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="hidden xl:inline">{t('declarations')}</span>
        </button>

        <button className={btn} onClick={() => setReportsOpen(true)}>
          <FileBarChart2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{t('reports')}</span>
        </button>

        <button className={btn} onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          <span className="hidden lg:inline">{t('exportPdf')}</span>
        </button>

        <input
          ref={jsonRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void importJson(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button className={btn} onClick={() => jsonRef.current?.click()} title={t('importJson')}>
          <Upload className="h-3.5 w-3.5" />
        </button>
        <button className={btn} onClick={exportJson} title={t('exportJson')}>
          <FileJson className="h-3.5 w-3.5" />
        </button>

        <button className={btn} onClick={() => setShareOpen(true)}>
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{t('share')}</span>
        </button>

        <button
          onClick={toggleSimulation}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${simulating ? 'bg-red-500 hover:bg-red-400' : 'bg-emerald-500 hover:bg-emerald-400'}`}
        >
          {simulating ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{simulating ? t('stop') : t('simulate')}</span>
        </button>

        <div className="relative">
          <button className={btn} onClick={() => setLangOpen((o) => !o)} aria-label={t('language')}>
            <Languages className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{LOCALE_LABELS[locale]}</span>
          </button>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
              <div className="absolute z-20 mt-1 ltr:right-0 rtl:left-0 w-32 overflow-hidden rounded-lg border border-[var(--studio-border)] bg-[var(--studio-panel)] shadow-xl">
                {STUDIO_LOCALES.map((l: StudioLocale) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLocale(l);
                      setLangOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-start text-xs hover:bg-[var(--studio-hover)] ${l === locale ? 'text-cyan-400 font-semibold' : 'text-[var(--studio-text)]'}`}
                  >
                    {LOCALE_LABELS[l]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button className={btn} onClick={toggleTheme} aria-label={t('theme')}>
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>

      {reportsOpen && <ReportsModal onClose={() => setReportsOpen(false)} />}
      {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
    </header>
  );
}
