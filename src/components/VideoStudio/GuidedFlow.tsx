import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp, ArrowDown, Trash2, Download, Upload, Plus, RefreshCw, LayoutTemplate, Video, MessageSquare
} from 'lucide-react';
import {
  addOverlay, clipDuration, makeId, moveClip, removeClip, removeOverlay, setClipCamera, setClipFades, setClipTransition, setLineStep,
  trimClip, totalDuration, Timeline
} from '../../video/timeline';
import { EXPORT_PRESETS, bitrateFor, findExportPreset, TEMPLATES, TemplateDef } from '../../video/templates';
import type { OpenedMedia } from '../../video/mediaIO';
import type { ExportResult } from '../../video/exporter';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const nowParts = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
};

export const SIMPLE_STEPS = [
  { id: 1, title: 'Modelo', desc: 'Escolha o modelo de vídeo' },
  { id: 2, title: 'Vídeos', desc: 'Importe e ordene suas cenas' },
  { id: 3, title: 'Chat/Texto', desc: 'Adicione textos e falas do chat' },
  { id: 4, title: 'Exportar', desc: 'Escolha o destino e exporte' },
] as const;

interface Props {
  tl: Timeline;
  mediaOf: (id: string) => OpenedMedia | undefined;
  apply: (f: (t: Timeline) => Timeline) => void;
  presetId: string;
  setPresetId: (id: string) => void;
  exporting: { phase: string; pct: number } | null;
  result: { r: ExportResult; url: string } | null;
  onExport: () => void;
  onCancel: () => void;
  onFiles: (files: FileList | null) => void;
  onReplaceClip?: (index: number, file: File) => void;
  onApplyTemplate?: (templateId: string) => void;
  currentStep: number;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Assistente de 4 passos do Modo Simples:
 * 1. Modelo (reaproveita modelos existentes e fluxo livre)
 * 2. Seus vídeos (importar cena 1/cena 2 opcional, ordenar, cortar e trocar)
 * 3. Texto do chat (título, chat sincronizado e estilo visual)
 * 4. Exportar (resumo e presets de destino)
 */
export const GuidedFlow: React.FC<Props> = ({
  tl,
  mediaOf,
  apply,
  presetId,
  setPresetId,
  exporting,
  result,
  onExport,
  onCancel,
  onFiles,
  onReplaceClip,
  onApplyTemplate,
  currentStep,
  setCurrentStep
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('none');
  const [title, setTitle] = useState('');
  const [titleDur, setTitleDur] = useState(3);
  const [chat, setChat] = useState('');
  const [step, setStep] = useState(1.5);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number>(0);

  const cardRef1 = useRef<HTMLDivElement>(null);
  const cardRef2 = useRef<HTMLDivElement>(null);
  const cardRef3 = useRef<HTMLDivElement>(null);
  const cardRef4 = useRef<HTMLDivElement>(null);

  const total = totalDuration(tl);
  const preset = findExportPreset(presetId) ?? EXPORT_PRESETS[0];
  const budget = preset.targetBytes ? bitrateFor(preset.targetBytes, Math.max(0.1, total)) : null;

  const input = 'w-16 px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs focus:ring-1 focus:ring-haze-accent outline-none';
  const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-haze-border bg-haze-panel hover:bg-haze-raised/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
  const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-haze-accent-fill text-haze-on-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm';
  const hasClips = tl.clips.length > 0;
  const cam = tl.clips[0]?.camera?.preset ?? 'none';
  const statusBadge = (done: boolean) => (
    <span className={`ml-2 text-[11px] font-semibold ${done ? 'text-haze-accent' : 'text-haze-faint'}`}>
      {done ? '✓' : 'pendente'}
    </span>
  );

  // Rolar suavemente até o cartão ativo quando o passo muda
  useEffect(() => {
    const refs = [null, cardRef1, cardRef2, cardRef3, cardRef4];
    refs[currentStep]?.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentStep]);

  const activeCardStyle = (stepNum: number) =>
    `rounded-xl border p-3 space-y-2.5 transition-all ${
      currentStep === stepNum
        ? 'border-haze-accent ring-1 ring-haze-accent/40 bg-haze-panel shadow-sm'
        : 'border-haze-border/70 bg-haze-panel/60'
    }`;

  const handleTriggerReplace = (index: number) => {
    replaceIndexRef.current = index;
    replaceInputRef.current?.click();
  };

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    if (id !== 'none' && onApplyTemplate) {
      onApplyTemplate(id);
    }
  };

  const activeTemplateDef = TEMPLATES.find(t => t.id === selectedTemplateId);

  return (
    <div className="h-full flex flex-col justify-between text-xs" data-testid="guided-flow">
      {/* 1. Cabeçalho com Lista Ordenada de Passos (<ol>) */}
      <div className="shrink-0 pb-2 border-b border-haze-border/50 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-white tracking-wide uppercase">Monte em 4 passos</h2>
          <span className="text-[11px] text-haze-muted" data-testid="simple-progress">
            {!hasClips ? 'Falta: importar ao menos um vídeo.' : `${tl.clips.length} cena(s) · ${fmt(total)}`}
          </span>
        </div>

        <ol className="grid grid-cols-4 gap-1 p-1 bg-haze-bg rounded-lg border border-haze-border" aria-label="Passos da montagem" data-testid="simple-steps">
          {SIMPLE_STEPS.map((s, idx) => {
            const num = idx + 1;
            const isActive = currentStep === num;
            const isCompleted = (num === 1) || (num === 2 && hasClips) || (num < currentStep);
            const isLocked = num > 2 && !hasClips;

            return (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  data-testid={`simple-step-${num}`}
                  aria-current={isActive ? 'step' : undefined}
                  disabled={isLocked}
                  onClick={() => !isLocked && setCurrentStep(num)}
                  className={`w-full flex flex-col items-center justify-center py-1.5 px-0.5 rounded-md text-[11px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-haze-accent ${
                    isActive
                      ? 'bg-haze-accent-fill text-haze-on-accent shadow-sm'
                      : isCompleted
                      ? 'text-haze-accent hover:bg-haze-panel'
                      : 'text-haze-muted/60 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span className="flex items-center gap-0.5">
                    {isCompleted && !isActive ? '✓' : num}
                  </span>
                  <span className="truncate text-[10px]">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Inputs de arquivo ocultos */}
      <input
        ref={fileInputRef}
        data-testid="video-file-input"
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={e => { void onFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && onReplaceClip) {
            onReplaceClip(replaceIndexRef.current, file);
          }
          e.target.value = '';
        }}
      />

      {/* 2. Corpo Rolável com os 4 Cartões de Passo */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2 pr-1">
        {/* Passo 1: Modelo */}
        <div ref={cardRef1} className={activeCardStyle(1)} data-testid="simple-step-card-1">
          <div className="flex items-center justify-between font-semibold text-white">
            <span className="flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5 text-haze-accent" /> 1. Modelo de montagem
            </span>
            {statusBadge(true)}
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-haze-muted block">Escolha o formato ou use edição livre:</label>
            <select
              data-testid="simple-template-select"
              className="w-full px-2 py-1.5 rounded-md bg-haze-bg border border-haze-border text-xs text-white"
              value={selectedTemplateId}
              onChange={e => handleTemplateChange(e.target.value)}
            >
              <option value="none">Sem modelo (Edição livre)</option>
              {TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-haze-faint leading-tight">
              {activeTemplateDef ? activeTemplateDef.description : 'Montagem livre com suas próprias cenas e textos.'}
            </p>
          </div>
        </div>

        {/* Passo 2: Seus vídeos */}
        <div ref={cardRef2} className={activeCardStyle(2)} data-testid="simple-step-card-2">
          <div className="flex items-center justify-between font-semibold text-white" data-testid="step-cut">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-haze-accent" /> 2. Seus vídeos
            </span>
            {statusBadge(hasClips)}
          </div>

          <div data-testid="video-library" className="space-y-2">
            {!hasClips && (
              <div className="space-y-2">
                <p className="text-haze-muted text-xs leading-relaxed">
                  Importe vídeos para começar. O primeiro vídeo será sua cena principal.
                </p>
                <div data-testid="simple-step2-hint" className="text-[11px] text-amber-300 bg-amber-400/10 p-2 rounded-md border border-amber-400/20">
                  Importe ao menos um vídeo para continuar.
                </div>
                <button
                  type="button"
                  className={primary}
                  data-testid="simple-import-scene-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" /> Importar cena 1
                </button>
              </div>
            )}

            {hasClips && (
              <div className="space-y-2">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <button
                  type="button"
                  className={btn}
                  data-testid="simple-import-scene-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="w-3.5 h-3.5" /> {tl.clips.length === 1 ? 'Importar cena 2 (opcional)' : 'Adicionar outra cena'}
                </button>
                {tl.clips.length === 1 && (
                  <span className="text-[10px] text-haze-faint">Cena 2 é opcional</span>
                )}
              </div>

              <ul className="space-y-2 list-none m-0 p-0">
              {tl.clips.map((c, i) => {
                const m = mediaOf(c.mediaId);
                return (
                  <li key={c.id} className="rounded-lg border border-haze-border/60 bg-haze-bg/40 p-2 space-y-1.5 list-none" data-testid={`simple-clip-${i}`}>
                    <div className="flex items-center justify-between font-medium">
                      <span className="truncate flex-1 text-white">
                        {i + 1}. {m?.ref.name ?? 'mídia offline'} <span className="text-haze-muted">({fmt(clipDuration(c))})</span>
                      </span>
                      <button
                        type="button"
                        aria-label="Trocar vídeo"
                        title="Trocar vídeo"
                        className="text-haze-muted hover:text-white p-1 ml-1"
                        data-testid={`simple-replace-${i}`}
                        onClick={() => handleTriggerReplace(i)}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>

                    {m && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-haze-border/40">
                        <span className="text-[11px] text-haze-muted">início</span>
                        <input
                          data-testid={`simple-in-${i}`}
                          type="number"
                          step="0.1"
                          min="0"
                          className={input}
                          defaultValue={c.inPoint}
                          key={`i-${c.id}-${c.inPoint}`}
                          onBlur={e => apply(x => trimClip(x, c.id, { inPoint: +e.target.value }, m.ref.duration))}
                        />
                        <span className="text-[11px] text-haze-muted">fim</span>
                        <input
                          data-testid={`simple-out-${i}`}
                          type="number"
                          step="0.1"
                          min="0"
                          className={input}
                          defaultValue={c.outPoint}
                          key={`o-${c.id}-${c.outPoint}`}
                          onBlur={e => apply(x => trimClip(x, c.id, { outPoint: +e.target.value }, m.ref.duration))}
                        />
                        <button aria-label="Subir" className={btn} disabled={i === 0} data-testid={`simple-up-${i}`} onClick={() => apply(x => moveClip(x, c.id, i - 1))}>
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button aria-label="Descer" className={btn} disabled={i === tl.clips.length - 1} data-testid={`simple-down-${i}`} onClick={() => apply(x => moveClip(x, c.id, i + 1))}>
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button aria-label="Remover cena" className={btn} data-testid={`simple-remove-${i}`} onClick={() => apply(x => removeClip(x, c.id))}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              </ul>
            </div>
          )}
          </div>
        </div>

        {/* Passo 3: Texto do chat e estilo visual */}
        <div ref={cardRef3} className={activeCardStyle(3)} data-testid="simple-step-card-3">
          <div className="flex items-center justify-between font-semibold text-white" data-testid="step-text">
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-haze-accent" /> 3. Texto do chat & Visual
            </span>
            {statusBadge(tl.overlays.length > 0)}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                data-testid="simple-title"
                placeholder="Título (opcional)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="flex-1 min-w-[7rem] px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs"
              />
              <span className="text-[11px] text-haze-muted">por</span>
              <input
                data-testid="simple-title-dur"
                type="number"
                min="1"
                step="0.5"
                className={input}
                value={titleDur}
                onChange={e => setTitleDur(+e.target.value)}
              />
              <span className="text-[11px] text-haze-muted">s</span>
              <button
                className={btn}
                data-testid="simple-title-add"
                disabled={!title.trim() || !hasClips}
                onClick={() => {
                  apply(x => addOverlay(x, { text: title.trim(), kind: 'text', start: 0.5, duration: titleDur, y: 300, fontSize: 44, align: 'center' }));
                  setTitle('');
                }}
              >
                Adicionar título
              </button>
            </div>

            <textarea
              data-testid="simple-chat"
              rows={3}
              placeholder={'Chat do servidor, uma fala por linha\nEx.: Ana diz: Precisamos conversar.'}
              value={chat}
              onChange={e => setChat(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md bg-haze-bg border border-haze-border text-xs leading-normal"
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-haze-muted">uma linha a cada</span>
              <input
                data-testid="simple-chat-step"
                type="number"
                min="0"
                step="0.5"
                className={input}
                value={step}
                onChange={e => setStep(Math.max(0, +e.target.value))}
              />
              <span className="text-[11px] text-haze-muted">s</span>
              <button
                className={btn}
                data-testid="simple-chat-add"
                disabled={!chat.trim() || !hasClips}
                onClick={() => {
                  const id = makeId('chat');
                  apply(x => {
                    const n = addOverlay(x, { text: chat.trim(), start: 1, duration: Math.max(2, chat.trim().split('\n').length * (step || 1) + 3) }, id);
                    return step > 0 ? setLineStep(n, id, step) : n;
                  });
                  setChat('');
                }}
              >
                Adicionar chat
              </button>
            </div>

            {tl.overlays.length > 0 && (
              <ul className="space-y-1 bg-haze-bg/40 p-1.5 rounded-md border border-haze-border/50" data-testid="simple-overlays">
                {tl.overlays.map((o, i) => (
                  <li key={o.id} className="flex items-center gap-1.5 text-[11px]">
                    <span className="truncate flex-1 text-white">{fmt(o.start)} · {o.text.replace(/\n/g, ' / ')}</span>
                    <button
                      aria-label="Remover texto"
                      data-testid={`simple-overlay-remove-${i}`}
                      className="text-haze-muted hover:text-white p-0.5"
                      onClick={() => apply(x => removeOverlay(x, o.id))}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Sub-seção de visual para preservar testids existentes */}
            <div className="pt-2 border-t border-haze-border/40 space-y-2" data-testid="step-visual">
              <div className="font-semibold text-white flex items-center justify-between">
                <span>Estilo visual & câmera</span>
                {statusBadge(hasClips && cam !== 'none')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([['none', 'Original'], ['bodycam', 'Bodycam'], ['cctv', 'CCTV'], ['noir', 'Noir']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    data-testid={`simple-visual-${id}`}
                    disabled={!hasClips}
                    aria-pressed={cam === id}
                    className={`${btn} ${cam === id ? 'border-haze-accent bg-haze-accent/10 text-white' : ''}`}
                    onClick={() => apply(x => x.clips.reduce((t, c) => setClipCamera(t, c.id, id, nowParts()), x))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-haze-muted">
                <span>entre cenas</span>
                <select
                  data-testid="simple-transition"
                  disabled={tl.clips.length < 2}
                  className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs text-white"
                  value={tl.clips[1]?.transition?.duration ?? 0}
                  onChange={e => apply(x => x.clips.slice(1).reduce((t, c) => setClipTransition(t, c.id, +e.target.value), x))}
                >
                  <option value={0}>corte seco</option>
                  <option value={0.5}>fusão 0,5 s</option>
                  <option value={1}>fusão 1 s</option>
                </select>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    data-testid="simple-fade"
                    type="checkbox"
                    disabled={!hasClips}
                    checked={(tl.clips[0]?.fadeIn ?? 0) > 0}
                    onChange={e => apply(x => {
                      const v = e.target.checked ? 1 : 0;
                      const first = x.clips[0], last = x.clips[x.clips.length - 1];
                      return first && last ? setClipFades(setClipFades(x, first.id, { fadeIn: v }), last.id, { fadeOut: v }) : x;
                    })}
                  />
                  <span>entrada e saída graduais</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Passo 4: Exportar */}
        <div ref={cardRef4} className={activeCardStyle(4)} data-testid="simple-step-card-4">
          <div className="flex items-center justify-between font-semibold text-white" data-testid="step-export">
            <span className="flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-haze-accent" /> 4. Exportar vídeo
            </span>
            {statusBadge(Boolean(result))}
          </div>

          <div className="space-y-2">
            <p className="text-haze-muted text-xs leading-relaxed">
              Escolha as configurações de destino na coluna da direita ou configure abaixo:
            </p>
            <select
              data-testid="simple-preset"
              className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs text-white"
              value={presetId}
              onChange={e => setPresetId(e.target.value)}
            >
              {EXPORT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <div className="text-haze-muted text-[11px]" data-testid="simple-preset-note">
              {preset.note}{budget ? ` Orçamento de vídeo: ~${Math.round(budget.videoBps / 1000)} kbps para ${fmt(total)}.` : ''}
            </div>
            {budget && !budget.ok && (
              <div role="alert" data-testid="simple-preset-warn" className="text-amber-300 text-[11px]">
                {budget.message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Rodapé Fixo com Botões "Voltar" e "Próximo: <nome>" */}
      <div className="shrink-0 pt-2 border-t border-haze-border/50 flex items-center justify-between gap-2" data-testid="simple-footer">
        <button
          type="button"
          data-testid="simple-back"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep(c => Math.max(1, c - 1))}
          className={btn}
        >
          ← Voltar{currentStep > 1 ? `: ${SIMPLE_STEPS[currentStep - 2].title}` : ''}
        </button>

        <button
          type="button"
          data-testid="simple-next"
          disabled={(currentStep === 2 && !hasClips) || currentStep === 4}
          title={currentStep === 2 && !hasClips ? 'Importe ao menos um vídeo para continuar.' : undefined}
          onClick={() => setCurrentStep(c => Math.min(4, c + 1))}
          className={primary}
        >
          Próximo{currentStep < 4 ? `: ${SIMPLE_STEPS[currentStep].title}` : ''} →
        </button>
      </div>
    </div>
  );
};
