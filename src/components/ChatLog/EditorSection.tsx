import React from 'react';

const STORAGE_KEY = 'haze-sections-v1';

/** Ordem das seções do painel do Editor RP (a mesma da tela). */
export const SECTION_IDS = [
  'fundo', 'resolucao', 'personagens', 'dialogos', 'camera', 'retoque',
  'rp', 'adesivos', 'tipografia', 'iluminacao', 'camadas', 'inspetor'
] as const;
/** Ids do painel do Editor RP, mais seções usadas em outras telas (ids únicos no documento). */
export type SectionId = typeof SECTION_IDS[number] | 'gif-dialogos';

const DEFAULT_OPEN: Partial<Record<SectionId, boolean>> = { fundo: true, personagens: true, dialogos: true };

/** Lê quais seções estavam abertas (cai no padrão se o armazenamento falhar). */
export const loadOpenSections = (): Record<string, boolean> => {
  const base: Record<string, boolean> = {};
  SECTION_IDS.forEach(id => { base[id] = !!DEFAULT_OPEN[id]; });
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      SECTION_IDS.forEach(id => { if (typeof raw[id] === 'boolean') base[id] = raw[id]; });
    }
  } catch (_) { /* usa o padrão */ }
  return base;
};

export const saveOpenSections = (open: Record<string, boolean>) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(open)); } catch (_) { /* sem armazenamento */ }
};

interface EditorSectionProps {
  id: SectionId;
  title: string;
  /** Resumo curto mostrado à direita do título (ex.: "1280×720px"). */
  badge?: React.ReactNode;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}

/**
 * Seção recolhível do painel do Editor RP. O conteúdo fica montado (só escondido) quando recolhido,
 * para não perder campos de arquivo nem referências. O visual do cartão interno é neutralizado
 * pelo CSS `.accordion-body` (index.css).
 */
export const EditorSection: React.FC<EditorSectionProps> = ({ id, title, badge, open, onToggle, children }) => (
  <section data-section={id} className="rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
    <h3 className="m-0">
      <button
        type="button"
        id={`sec-btn-${id}`}
        aria-expanded={open}
        aria-controls={`sec-${id}`}
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left rounded-2xl hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
          <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          {title}
        </span>
        {badge !== undefined && badge !== null && (
          <span className="text-[11px] font-mono text-slate-400 truncate">{badge}</span>
        )}
      </button>
    </h3>
    <div
      id={`sec-${id}`}
      role="region"
      aria-labelledby={`sec-btn-${id}`}
      hidden={!open}
      className="accordion-body px-4 pb-4 space-y-3"
    >
      {children}
    </div>
  </section>
);
