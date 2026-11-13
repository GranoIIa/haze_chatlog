import React, { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { TEMPLATES, findTemplate } from '../../video/templates';
import type { OpenedMedia } from '../../video/mediaIO';

/**
 * Escolha de modelo + vídeo de cada cena. Aplicar monta uma timeline comum (editável e desfazível);
 * os textos de exemplo entram entre colchetes para o jogador trocar.
 */
export const TemplatesPanel: React.FC<{
  library: OpenedMedia[];
  hasContent: boolean;
  onApply: (templateId: string, picks: Record<string, string | undefined>) => string[];
}> = ({ library, hasContent, onApply }) => {
  const [tplId, setTplId] = useState<string>(TEMPLATES[0].id);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const def = findTemplate(tplId)!;
  const sel = 'px-2 py-1 rounded-md bg-haze-bg border border-haze-border text-xs w-full';

  return (
    <div className="space-y-2 text-xs" data-testid="templates-panel">
      <div className="font-semibold flex items-center gap-1"><LayoutTemplate className="w-3.5 h-3.5" /> Começar de um modelo</div>
      <div className="grid grid-cols-1 gap-1">
        {TEMPLATES.map(t => (
          <button key={t.id} data-testid={`tpl-${t.id}`} onClick={() => { setTplId(t.id); setErrors([]); }}
            className={`text-left px-2 py-1.5 rounded-lg border ${t.id === tplId ? 'border-haze-accent bg-haze-accent/10' : 'border-haze-border hover:bg-haze-raised/40'}`}>
            <div className="font-semibold">{t.name}</div>
            <div className="text-haze-muted">{t.description}</div>
          </button>
        ))}
      </div>
      <div className="space-y-1.5 border-t border-haze-border pt-2">
        <div className="text-haze-muted">Escolha o vídeo de cada cena (cenas vazias são puladas):</div>
        {def.slots.map(s => (
          <label key={s.id} className="block">
            <span className="font-medium">{s.label}{s.required ? ' *' : ''}</span>
            <span className="text-haze-faint"> · {s.hint}{s.camera ? ` · câmera ${s.camera}` : ''}{s.maxSeconds ? ` · até ${s.maxSeconds} s` : ''}</span>
            <select data-testid={`tpl-slot-${s.id}`} className={sel} value={picks[`${tplId}:${s.id}`] ?? ''}
              onChange={e => setPicks(p => ({ ...p, [`${tplId}:${s.id}`]: e.target.value }))}>
              <option value="">(nenhum)</option>
              {library.map(m => <option key={m.ref.id} value={m.ref.id}>{m.ref.name}</option>)}
            </select>
          </label>
        ))}
        {!library.length && <div className="text-haze-faint">Importe vídeos primeiro para escolher as cenas.</div>}
      </div>
      {errors.length > 0 && <div role="alert" data-testid="tpl-errors" className="text-red-300">{errors.join(' ')}</div>}
      <button data-testid="tpl-apply" disabled={!library.length}
        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-haze-accent-fill text-haze-on-accent disabled:opacity-40"
        onClick={() => {
          const mine: Record<string, string | undefined> = {};
          for (const s of def.slots) mine[s.id] = picks[`${tplId}:${s.id}`] || undefined;
          setErrors(onApply(tplId, mine));
        }}>
        Aplicar modelo
      </button>
      {hasContent && <div className="text-haze-faint">Isto substitui a montagem atual. Dá para voltar com Desfazer.</div>}
    </div>
  );
};
