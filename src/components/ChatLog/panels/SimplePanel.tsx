import React from 'react';
import { VISUAL_PRESETS } from '../../../utils/visualPresets';
import { IMPORT_PROFILES, type ImportProfile } from '../../../utils/chatDetect';
import type { ThumbFrame } from '../../../utils/visualThumb';
import { useVisualThumbs } from '../useVisualThumbs';
import type { CharacterDetection } from '../useCharacterDetection';
import { DialogPanel } from './DialogPanel';
import type { Character } from '../../../types';

interface SimplePanelProps {
  hasPhoto: boolean;
  /** URL da foto e enquadramento atual (para as miniaturas dos visuais). */
  photoSrc: string | null;
  frame: ThumbFrame;
  onPickPhoto: () => void;
  text: string;
  onText: (t: string) => void;
  visualId: string | null;
  onVisual: (id: string) => void;
  onExport: () => void;
  onExportChat: () => void;
  onCopy: () => void;
  /** Cartão de personagens (mesmo do Modo Avançado). */
  charactersCard: React.ReactNode;
  characters: Character[];
  activeCharId: string | null;
  onActiveCharChange: (id: string) => void;
  detection: CharacterDetection;
}

const Step: React.FC<{ n: number; title: string; done?: boolean; status?: string; children: React.ReactNode }> = ({ n, title, done, status, children }) => (
  <section className="p-4 rounded-2xl bg-haze-panel border border-haze-border shadow-md space-y-3" aria-label={`Passo ${n}: ${title}`}>
    <h3 className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-haze-text">
      <span aria-hidden className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold ${done ? 'bg-haze-accent-fill text-haze-on-accent' : 'bg-haze-raised text-haze-soft'}`}>{done ? '✓' : n}</span>
      <span>{title}</span>
      {status && <span className="ml-auto normal-case tracking-normal font-normal text-[11px] text-haze-muted">{status}</span>}
    </h3>
    {children}
  </section>
);

const btn = 'px-2.5 py-1.5 rounded-lg text-xs border border-haze-border text-haze-soft hover:border-haze-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-haze-accent';

/** Modo Simples: foto → chat → visual → exportar. O resto do editor fica no Modo Avançado. */
export const SimplePanel: React.FC<SimplePanelProps> = ({
  hasPhoto, photoSrc, frame, onPickPhoto, text, onText, visualId, onVisual, onExport, onExportChat, onCopy,
  charactersCard, characters, activeCharId, onActiveCharChange, detection
}) => {
  const { thumbs, status: thumbStatus } = useVisualThumbs(photoSrc, frame);
  const hasText = text.trim().length > 0;
  const current = VISUAL_PRESETS.find(v => v.id === visualId);
  const missing = [!hasPhoto && 'uma foto', !hasText && 'o chat'].filter(Boolean) as string[];

  return (
    <div className="space-y-4" data-testid="simple-panel">
      <p role="status" data-testid="simple-progress" className="m-0 text-xs text-haze-muted">
        {missing.length === 0 ? 'Tudo pronto: escolha um visual (opcional) e salve.' : `Falta: ${missing.join(' e ')}.`}
      </p>

      <Step n={1} title="Sua foto" done={hasPhoto} status={hasPhoto ? 'carregada' : 'obrigatório'}>
        <button type="button" onClick={onPickPhoto}
          className="w-full py-3 rounded-xl border-2 border-dashed border-haze-border-strong text-xs text-haze-soft hover:border-haze-accent/60 hover:text-haze-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-haze-accent">
          {hasPhoto ? 'Trocar a foto' : 'Escolher o print (ou arraste/cole com Ctrl+V)'}
        </button>
      </Step>

      <Step n={2} title="Cole o chat do servidor" done={hasText} status={hasText ? `${characters.length} personagem(ns)` : 'obrigatório'}>
        {charactersCard}
        <DialogPanel
          testId="simple-dialog"
          textareaTestId="simple-chat"
          value={text}
          onChange={onText}
          characters={characters}
          activeCharId={activeCharId}
          onActiveCharChange={onActiveCharChange}
          onPasteText={detection.run}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => detection.run(text)} className={btn}
            title="Procura quem fala no texto (“Nome diz:”) e adiciona os personagens">
            Detectar personagens
          </button>
          {detection.canUndo && (
            <button type="button" onClick={detection.undo} className={btn}>Desfazer detecção</button>
          )}
          <p role="status" data-testid="detect-note" className="text-[11px] text-haze-muted m-0">{detection.note}</p>
        </div>

        {detection.pending.length > 0 && (
          <div data-testid="detect-review" role="group" aria-label="Revisar nomes encontrados"
            className="p-3 rounded-xl border border-haze-border bg-haze-field space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-haze-text">Confirme estes nomes ({detection.pending.length})</span>
              <button type="button" onClick={detection.acceptAll} className={btn}>Adicionar todos</button>
            </div>
            {detection.pending.map(p => {
              const key = p.name.toLocaleLowerCase('pt-BR');
              return (
                <div key={key} className="flex flex-wrap items-center gap-1.5">
                  <input type="text" value={p.draft} aria-label={`Nome para “${p.name}”`}
                    onChange={(e) => detection.setDraft(key.replace(/\s+/g, ' '), e.target.value)}
                    className="flex-1 min-w-[8rem] px-2 py-1 rounded-lg bg-haze-panel border border-haze-border text-xs text-haze-text" />
                  <span className="text-[11px] text-haze-faint">{p.reason ?? 'confira'} · {p.count}×</span>
                  <button type="button" onClick={() => detection.accept(key)} className={btn} aria-label={`Adicionar ${p.draft}`}>Adicionar</button>
                  <button type="button" onClick={() => detection.ignore(key)} className={btn} aria-label={`Ignorar ${p.name}`}>Ignorar</button>
                </div>
              );
            })}
          </div>
        )}

        <details className="text-xs text-haze-muted">
          <summary className="cursor-pointer select-none">Formato do chat: {IMPORT_PROFILES.find(p => p.id === detection.profile)?.label}</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              <span>Formato</span>
              <select value={detection.profile} aria-label="Formato do chat"
                onChange={(e) => detection.setProfile(e.target.value as ImportProfile)}
                className="px-2 py-1 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text">
                {IMPORT_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label} — {p.hint}</option>)}
              </select>
            </label>
            {detection.profile === 'custom' && (
              <label className="flex items-center gap-2">
                <span>Verbos</span>
                <input type="text" value={detection.customVerbs} aria-label="Verbos de fala personalizados"
                  onChange={(e) => detection.setCustomVerbs(e.target.value)} placeholder="diz, fala, comenta"
                  className="flex-1 px-2 py-1 rounded-lg bg-haze-field border border-haze-border text-xs text-haze-text" />
              </label>
            )}
          </div>
        </details>
        <p className="text-xs text-haze-faint m-0">Para mudar fonte, cores e posição do texto, use o Modo Avançado.</p>
      </Step>

      <Step n={3} title="Escolha um visual" done={!!visualId && visualId !== 'original'} status={current ? current.label : 'opcional'}>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Visual">
          {VISUAL_PRESETS.map(v => (
            <button key={v.id} type="button" aria-pressed={visualId === v.id} onClick={() => onVisual(v.id)} title={v.hint}
              className={`p-2 rounded-lg border text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-haze-accent ${
                visualId === v.id ? 'bg-haze-accent/15 border-haze-accent/60 text-haze-accent' : 'border-haze-border text-haze-soft hover:border-haze-accent/30'
              }`}>
              {thumbs[v.id] ? (
                <img src={thumbs[v.id]} alt="" data-testid={`visual-thumb-${v.id}`} className="w-full object-cover rounded-md mb-1.5"
                  style={{ aspectRatio: `${frame.w || 16} / ${frame.h || 9}` }} />
              ) : hasPhoto && thumbStatus === 'loading' ? (
                <div aria-hidden className="w-full rounded-md mb-1.5 bg-haze-raised animate-pulse" style={{ aspectRatio: `${frame.w || 16} / ${frame.h || 9}` }} />
              ) : null}
              <div className="font-semibold">{v.label}</div>
              <div className="text-[11px] text-haze-muted">{v.hint}</div>
            </button>
          ))}
        </div>
        <p role="status" data-testid="thumb-status" className="text-[11px] text-haze-faint m-0">
          {hasPhoto && thumbStatus === 'error' ? 'Não foi possível gerar as miniaturas; os visuais continuam funcionando.' : ''}
          {hasPhoto && thumbStatus === 'loading' ? 'Preparando miniaturas…' : ''}
        </p>
        <p className="text-[11px] text-haze-faint m-0">
          Um visual troca câmera, iluminação e retoque de cor. Texto, personagens, camadas e a foto não mudam. Dá para desfazer (Ctrl+Z).
        </p>
      </Step>

      <Step n={4} title="Salvar" status={hasPhoto && hasText ? 'pronto' : undefined}>
        <p className="text-[11px] text-haze-muted m-0" data-testid="export-info">
          Será exportado: PNG {frame.w > 0 ? `${frame.w}×${frame.h}` : 'da cena'}, com o visual “{current?.label ?? 'Original'}” e o chat.
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          <button type="button" onClick={onExport}
            className="py-2 rounded-lg text-xs font-bold bg-haze-accent-fill hover:bg-haze-accent-fill-hover text-haze-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-haze-accent">
            Baixar imagem (PNG)
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={onCopy} className={`py-2 ${btn}`}>Copiar imagem</button>
            <button type="button" onClick={onExportChat} title="Só o texto, com fundo transparente, para editar no Photopea" className={`py-2 ${btn}`}>
              Só o chat (Photopea)
            </button>
          </div>
        </div>
      </Step>
    </div>
  );
};
