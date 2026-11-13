import React, { useEffect, useState } from 'react';
import { VISUAL_PRESETS } from '../../../utils/visualPresets';
import { renderVisualThumb } from '../../../utils/visualThumb';
import { DialogPanel } from './DialogPanel';
import type { Character } from '../../../types';

interface SimplePanelProps {
  hasPhoto: boolean;
  /** URL da foto (para as miniaturas dos visuais). */
  photoSrc: string | null;
  onPickPhoto: () => void;
  text: string;
  onText: (t: string) => void;
  visualId: string | null;
  onVisual: (id: string) => void;
  onExport: () => void;
  onExportChat: () => void;
  onCopy: () => void;
  isGif?: boolean;
  onExportGif?: () => void;
  isExportingGif?: boolean;
  gifExportProgress?: number;
  /** Cartão de personagens (mesmo do Modo Avançado). */
  charactersCard: React.ReactNode;
  characters: Character[];
  activeCharId: string | null;
  onActiveCharChange: (id: string) => void;
  onDetect: () => void;
  onPasteText: (pasted: string) => void;
  detectNote: string;
}

const Step: React.FC<{ n: number; title: string; done?: boolean; children: React.ReactNode }> = ({ n, title, done, children }) => (
  <section className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3">
    <h3 className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-haze-text">
      <span aria-hidden className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${done ? 'bg-haze-accent-fill text-haze-on-accent' : 'bg-haze-raised text-haze-soft'}`}>{done ? '✓' : n}</span>
      {title}
    </h3>
    {children}
  </section>
);

/** Miniaturas dos visuais aplicados à foto do jogador (vazio sem foto ou se a imagem falhar). */
const useVisualThumbs = (photoSrc: string | null): Record<string, string> => {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    setThumbs({});
    if (!photoSrc) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const next: Record<string, string> = {};
        for (const v of VISUAL_PRESETS) next[v.id] = renderVisualThumb(img, v);
        setThumbs(next);
      } catch { /* sem miniaturas: os botões continuam funcionando só com texto */ }
    };
    img.src = photoSrc;
    return () => { cancelled = true; };
  }, [photoSrc]);
  return thumbs;
};

/** Modo Simples: foto → chat → visual → exportar. O resto do editor fica no Modo Avançado. */
export const SimplePanel: React.FC<SimplePanelProps> = ({
  hasPhoto, photoSrc, onPickPhoto, text, onText, visualId, onVisual, onExport, onExportChat, onCopy,
  isGif, onExportGif, isExportingGif, gifExportProgress,
  charactersCard, characters, activeCharId, onActiveCharChange, onDetect, onPasteText, detectNote
}) => {
  const thumbs = useVisualThumbs(photoSrc);
  return (
  <div className="space-y-4" data-testid="simple-panel">
    <Step n={1} title="Sua foto" done={hasPhoto}>
      <button
        type="button"
        onClick={onPickPhoto}
        className="w-full py-3 rounded-xl border-2 border-dashed border-haze-border-strong text-xs text-haze-soft hover:border-haze-accent/60 hover:text-haze-text transition-colors"
      >
        {hasPhoto ? 'Trocar a foto' : 'Escolher o print (ou arraste/cole com Ctrl+V)'}
      </button>
    </Step>

    <Step n={2} title="Cole o chat do servidor" done={text.trim().length > 0}>
      {charactersCard}
      <DialogPanel
        testId="simple-dialog"
        textareaTestId="simple-chat"
        value={text}
        onChange={onText}
        characters={characters}
        activeCharId={activeCharId}
        onActiveCharChange={onActiveCharChange}
        onPasteText={onPasteText}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onDetect}
          title="Cria os personagens que aparecem como “Nome diz:” no texto"
          className="px-2.5 py-1.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40">
          Detectar personagens
        </button>
        <p role="status" data-testid="detect-note" className="text-[11px] text-haze-muted m-0">{detectNote}</p>
      </div>
      <p className="text-xs text-haze-faint">Para mudar fonte, cores e posição do texto, use o Modo Avançado.</p>
    </Step>

    <Step n={3} title="Escolha um visual" done={!!visualId && visualId !== 'original'}>
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Visual">
        {VISUAL_PRESETS.map(v => (
          <button
            key={v.id}
            type="button"
            aria-pressed={visualId === v.id}
            onClick={() => onVisual(v.id)}
            title={v.hint}
            className={`p-2 rounded-lg border text-left text-xs transition-colors ${
              visualId === v.id ? 'bg-haze-accent/15 border-haze-accent/60 text-haze-accent' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
            }`}
          >
            {thumbs[v.id] && (
              <img src={thumbs[v.id]} alt="" data-testid={`visual-thumb-${v.id}`} className="w-full aspect-video object-cover rounded-md mb-1.5" />
            )}
            <div className="font-semibold">{v.label}</div>
            <div className="text-[11px] text-haze-muted">{v.hint}</div>
          </button>
        ))}
      </div>
    </Step>

    <Step n={4} title="Salvar">
      <div className="grid grid-cols-1 gap-1.5">
        {isGif && onExportGif && (
          <button
            type="button"
            onClick={onExportGif}
            disabled={isExportingGif}
            className="py-2.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-purple-500/20 transition-all disabled:opacity-50"
          >
            {isExportingGif ? `Gerando GIF animado (${gifExportProgress}%)...` : '🎬 Baixar GIF Animado Editado'}
          </button>
        )}
        <button type="button" onClick={onExport}
          className="py-2 rounded-lg text-xs font-bold bg-haze-accent-fill hover:bg-haze-accent-fill-hover text-haze-on-accent">
          Baixar imagem (PNG)
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onCopy}
            className="py-2 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40">
            Copiar imagem
          </button>
          <button type="button" onClick={onExportChat}
            title="Só o texto, com fundo transparente, para editar no Photopea"
            className="py-2 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40">
            Só o chat (Photopea)
          </button>
        </div>
      </div>
    </Step>
  </div>
  );
};
