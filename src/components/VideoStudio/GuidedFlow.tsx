import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Download } from 'lucide-react';
import {
  addOverlay, clipDuration, makeId, moveClip, removeClip, removeOverlay, setClipCamera, setClipFades, setClipTransition, setLineStep,
  trimClip, totalDuration, Timeline
} from '../../video/timeline';
import { EXPORT_PRESETS, bitrateFor, findExportPreset } from '../../video/templates';
import type { OpenedMedia } from '../../video/mediaIO';
import type { ExportResult } from '../../video/exporter';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const nowParts = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
};

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
}

/** Fluxo guiado: Vídeos → Cortar → Texto → Visual → Exportar. Só o que já está testado nas fases anteriores. */
export const GuidedFlow: React.FC<Props> = ({ tl, mediaOf, apply, presetId, setPresetId, exporting, result, onExport, onCancel }) => {
  const [title, setTitle] = useState('');
  const [titleDur, setTitleDur] = useState(3);
  const [chat, setChat] = useState('');
  const [step, setStep] = useState(1.5);
  const total = totalDuration(tl);
  const preset = findExportPreset(presetId) ?? EXPORT_PRESETS[0];
  const budget = preset.targetBytes ? bitrateFor(preset.targetBytes, Math.max(0.1, total)) : null;
  const input = 'w-16 px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs';
  const btn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-haze-border bg-haze-panel hover:bg-haze-raised/40 disabled:opacity-40 disabled:cursor-not-allowed';
  const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-haze-accent-fill text-haze-on-accent disabled:opacity-40 disabled:cursor-not-allowed';
  const hasClips = tl.clips.length > 0;
  const cam = tl.clips[0]?.camera?.preset ?? 'none';
  const status = (done: boolean) => <span className={`ml-2 text-[11px] ${done ? 'text-haze-accent' : 'text-haze-faint'}`}>{done ? '✓' : 'pendente'}</span>;
  const box = 'rounded-lg border border-haze-border p-2 space-y-2';

  return (
    <div className="space-y-3 text-xs" data-testid="guided-flow">
      <div className="text-haze-muted" data-testid="simple-progress">
        {!hasClips ? 'Falta: importar ao menos um vídeo.' : `${tl.clips.length} cena(s) · ${fmt(total)} no total. Siga os passos abaixo.`}
      </div>

      <div className={box} data-testid="step-cut">
        <div className="font-semibold">2. Cortar e ordenar{status(hasClips)}</div>
        {!hasClips && <div className="text-haze-muted">Importe vídeos na coluna da esquerda: eles entram aqui sozinhos.</div>}
        {tl.clips.map((c, i) => {
          const m = mediaOf(c.mediaId);
          return (
            <div key={c.id} className="rounded-md border border-haze-border/60 p-1.5 space-y-1" data-testid={`simple-clip-${i}`}>
              <div className="truncate font-medium">{i + 1}. {m?.ref.name ?? 'mídia offline'} <span className="text-haze-muted">({fmt(clipDuration(c))})</span></div>
              {m && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  início <input data-testid={`simple-in-${i}`} type="number" step="0.1" min="0" className={input} defaultValue={c.inPoint} key={`i-${c.id}-${c.inPoint}`}
                    onBlur={e => apply(x => trimClip(x, c.id, { inPoint: +e.target.value }, m.ref.duration))} />
                  fim <input data-testid={`simple-out-${i}`} type="number" step="0.1" min="0" className={input} defaultValue={c.outPoint} key={`o-${c.id}-${c.outPoint}`}
                    onBlur={e => apply(x => trimClip(x, c.id, { outPoint: +e.target.value }, m.ref.duration))} />
                  <button aria-label="Subir" className={btn} disabled={i === 0} data-testid={`simple-up-${i}`} onClick={() => apply(x => moveClip(x, c.id, i - 1))}><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button aria-label="Descer" className={btn} disabled={i === tl.clips.length - 1} data-testid={`simple-down-${i}`} onClick={() => apply(x => moveClip(x, c.id, i + 1))}><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button aria-label="Remover cena" className={btn} data-testid={`simple-remove-${i}`} onClick={() => apply(x => removeClip(x, c.id))}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={box} data-testid="step-text">
        <div className="font-semibold">3. Adicionar texto{status(tl.overlays.length > 0)}</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input data-testid="simple-title" placeholder="Título (opcional)" value={title} onChange={e => setTitle(e.target.value)}
            className="flex-1 min-w-[8rem] px-2 py-1 rounded-md bg-haze-bg border border-haze-border" />
          por <input data-testid="simple-title-dur" type="number" min="1" step="0.5" className={input} value={titleDur} onChange={e => setTitleDur(+e.target.value)} /> s
          <button className={btn} data-testid="simple-title-add" disabled={!title.trim() || !hasClips}
            onClick={() => { apply(x => addOverlay(x, { text: title.trim(), kind: 'text', start: 0.5, duration: titleDur, y: 300, fontSize: 44, align: 'center' })); setTitle(''); }}>Adicionar título</button>
        </div>
        <textarea data-testid="simple-chat" rows={3} placeholder={'Chat do servidor, uma fala por linha\nEx.: Ana diz: Precisamos conversar.'} value={chat} onChange={e => setChat(e.target.value)}
          className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border" />
        <div className="flex items-center gap-1.5">
          uma linha a cada <input data-testid="simple-chat-step" type="number" min="0" step="0.5" className={input} value={step} onChange={e => setStep(Math.max(0, +e.target.value))} /> s
          <button className={btn} data-testid="simple-chat-add" disabled={!chat.trim() || !hasClips}
            onClick={() => { const id = makeId('chat'); apply(x => { const n = addOverlay(x, { text: chat.trim(), start: 1, duration: Math.max(2, chat.trim().split('\n').length * (step || 1) + 3) }, id); return step > 0 ? setLineStep(n, id, step) : n; }); setChat(''); }}>Adicionar chat</button>
        </div>
        {tl.overlays.length > 0 && (
          <ul className="space-y-1" data-testid="simple-overlays">
            {tl.overlays.map((o, i) => (
              <li key={o.id} className="flex items-center gap-2"><span className="truncate flex-1">{fmt(o.start)} · {o.text.replace(/\n/g, ' / ')}</span>
                <button aria-label="Remover texto" data-testid={`simple-overlay-remove-${i}`} className="text-haze-muted hover:text-white" onClick={() => apply(x => removeOverlay(x, o.id))}><Trash2 className="w-3.5 h-3.5" /></button></li>
            ))}
          </ul>
        )}
      </div>

      <div className={box} data-testid="step-visual">
        <div className="font-semibold">4. Escolher o visual{status(hasClips && cam !== 'none')}</div>
        <div className="flex flex-wrap gap-1.5">
          {([['none', 'Original'], ['bodycam', 'Bodycam'], ['cctv', 'CCTV'], ['noir', 'Noir']] as const).map(([id, label]) => (
            <button key={id} data-testid={`simple-visual-${id}`} disabled={!hasClips} aria-pressed={cam === id}
              className={`${btn} ${cam === id ? 'border-haze-accent bg-haze-accent/10' : ''}`}
              onClick={() => apply(x => x.clips.reduce((t, c) => setClipCamera(t, c.id, id, nowParts()), x))}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          entre cenas
          <select data-testid="simple-transition" disabled={tl.clips.length < 2} className="px-2 py-1 rounded-md bg-haze-bg border border-haze-border"
            value={tl.clips[1]?.transition?.duration ?? 0}
            onChange={e => apply(x => x.clips.slice(1).reduce((t, c) => setClipTransition(t, c.id, +e.target.value), x))}>
            <option value={0}>corte seco</option><option value={0.5}>fusão 0,5 s</option><option value={1}>fusão 1 s</option>
          </select>
          <label className="flex items-center gap-1"><input data-testid="simple-fade" type="checkbox" disabled={!hasClips} checked={(tl.clips[0]?.fadeIn ?? 0) > 0}
            onChange={e => apply(x => {
              const v = e.target.checked ? 1 : 0;
              const first = x.clips[0], last = x.clips[x.clips.length - 1];
              return first && last ? setClipFades(setClipFades(x, first.id, { fadeIn: v }), last.id, { fadeOut: v }) : x;
            })} /> entrada e saída graduais</label>
        </div>
      </div>

      <div className={box} data-testid="step-export">
        <div className="font-semibold">5. Exportar</div>
        <select data-testid="simple-preset" className="w-full px-2 py-1 rounded-md bg-haze-bg border border-haze-border" value={presetId} onChange={e => setPresetId(e.target.value)}>
          {EXPORT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <div className="text-haze-muted" data-testid="simple-preset-note">{preset.note}{budget ? ` Orçamento de vídeo: ~${Math.round(budget.videoBps / 1000)} kbps para ${fmt(total)}.` : ''}</div>
        {budget && !budget.ok && <div role="alert" data-testid="simple-preset-warn" className="text-amber-300">{budget.message}</div>}
        {!exporting
          ? <button className={primary} data-testid="simple-export" disabled={!hasClips} onClick={onExport}>Exportar vídeo</button>
          : <button className={btn} data-testid="export-cancel" onClick={onCancel}>Cancelar</button>}
        {exporting && <div className="text-haze-muted" data-testid="export-status" role="status">{exporting.phase}… {exporting.pct}%</div>}
        {result && (
          <div className="space-y-1" data-testid="export-result">
            <div data-testid="export-info">{result.r.ext.toUpperCase()} · {result.r.videoCodec}{result.r.audioCodec ? ` + ${result.r.audioCodec}` : ''} · {result.r.width}×{result.r.height} · {result.r.fps} fps · {result.r.frames} quadros · {(result.r.blob.size / 1024).toFixed(0)} KB · {(result.r.elapsedMs / 1000).toFixed(1)} s</div>
            <a data-testid="export-download" className={`${primary} no-underline`} href={result.url} download={`haze-video.${result.r.ext}`}><Download className="w-4 h-4" /> Baixar</a>
          </div>
        )}
      </div>
    </div>
  );
};
