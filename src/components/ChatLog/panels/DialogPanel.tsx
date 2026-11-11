import React, { useRef } from 'react';
import { Type } from 'lucide-react';
import type { Character } from '../../../types';
import { insertAtSelection, censorSelection, speechPrefix, EditResult } from '../../../utils/dialogEdit';

interface DialogPanelProps {
  /** Texto do chat. */
  value: string;
  onChange: (text: string) => void;
  characters: Character[];
  /** Personagem ativo (o primeiro da lista se nulo ou inexistente). */
  activeCharId: string | null;
  onActiveCharChange?: (id: string) => void;
  /** Permite ao pai acessar o textarea (atalhos, foco). */
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>;
  /** Mostra os personagens como botões para escolher o ativo (útil onde não há outro painel de personagens). */
  showCharacters?: boolean;
  /** data-testid do cartão (testes de ponta a ponta). */
  testId?: string;
}

const TONES: Array<[string, string, string, string]> = [
  ['Fala', 'normal', 'Fala normal', '#ffffff'],
  ['Sussurro', 'sussurrando', 'Sussurrando', '#94a3b8'],
  ['Grito', 'gritando', 'Gritando', '#ffffff'],
  ['Baixo', 'baixo', 'Falando baixo', '#cbd5e1'],
  ['Rádio', 'rádio', 'Fala no rádio', '#38bdf8'],
  ['Celular', 'celular', 'Ligação ou mensagem', '#f5c500']
];

/** Editor do chat: texto, tom de voz, marcadores de ação e censura. Usado no Editor RP e no GIF Lab. */
export const DialogPanel: React.FC<DialogPanelProps> = ({
  value, onChange, characters, activeCharId, onActiveCharChange, textareaRef, showCharacters, testId
}) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef ?? innerRef;
  const activeChar = characters.find(c => c.id === activeCharId) ?? characters[0];

  const selection = (): [number, number] => {
    const el = ref.current;
    return el ? [el.selectionStart, el.selectionEnd] : [value.length, value.length];
  };

  const apply = (r: EditResult) => {
    onChange(r.value);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
    });
  };

  const insert = (text: string, startOfLine = true) => {
    const [s, e] = selection();
    apply(insertAtSelection(value, s, e, text, startOfLine));
  };

  const marker = (label: string, text: () => string, tip: string, color: string) => (
    <button
      key={label}
      type="button"
      onClick={() => insert(text())}
      title={tip}
      style={{ color, borderColor: `${color}55` }}
      className="px-2 py-1.5 rounded-lg border bg-[#0B0E14] hover:bg-slate-800 text-[11px] font-semibold transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div data-testid={testId} className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-title text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5" /> Diálogos &amp; Ações
        </span>
        <span className="text-[10px] text-slate-500">* /me, &gt; /ame, $ din, (( ooc ))</span>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        aria-label="Texto do chat"
        className="w-full p-3 rounded-xl bg-[#0B0E14] border border-[#1E2638] text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-y"
        placeholder="Digite ou cole as falas do chat aqui..."
      />

      {showCharacters && characters.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Personagem ativo">
          {characters.map(c => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === activeChar?.id}
              onClick={() => onActiveCharChange?.(c.id)}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all"
              style={{
                color: c.color,
                borderColor: c.id === activeChar?.id ? c.color : `${c.color}40`,
                backgroundColor: `${c.color}${c.id === activeChar?.id ? '30' : '15'}`
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div>
        <span className="text-[11px] text-slate-400 block mb-1.5">
          Tom de voz · fala de <strong style={{ color: activeChar?.color }}>{activeChar?.name ?? 'Personagem'}</strong>
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {TONES.map(([label, tone, tip, color]) => (
            <button
              key={tone}
              type="button"
              onClick={() => insert(speechPrefix(activeChar?.name ?? '', tone))}
              title={`${tip} (“diz (${tone}):”)`}
              style={{ color, borderColor: `${color}55` }}
              className={`px-2 py-1.5 rounded-lg border bg-[#0B0E14] hover:bg-slate-800 text-[11px] transition-colors ${tone === 'gritando' ? 'font-extrabold' : 'font-semibold'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[11px] text-slate-400 block mb-1.5">Ações e marcadores</span>
        <div className="grid grid-cols-4 gap-1.5">
          {marker('* /me', () => `* ${activeChar?.name ?? 'Personagem'} `, 'Ação do personagem ativo', '#cc99ff')}
          {marker('> /ame', () => '> ', 'Ação sobre o personagem', '#cc99ff')}
          {marker('* /do', () => '* ', 'Ação do ambiente', '#cc99ff')}
          {marker('$ Item', () => '$ ', 'Item ou dinheiro', '#f5c500')}
          {marker('# Cel', () => '# ', 'Mensagem ou ligação', '#f5c500')}
          {marker('! Sis', () => '! ', 'Notificação do sistema', '#f87171')}
          {marker('(( OOC', () => '(( ', 'Fora do personagem', '#94a3b8')}
        </div>
        <button
          type="button"
          onClick={() => { const [s, e] = selection(); apply(censorSelection(value, s, e)); }}
          title="Selecione um trecho no editor e clique para censurar; sem seleção insere um marcador"
          className="mt-1.5 w-full px-2 py-1.5 rounded-lg border border-red-400/30 bg-red-950/40 hover:bg-red-900/50 text-red-300 text-[11px] font-semibold transition-colors"
        >
          ||Censurar seleção||
        </button>
      </div>
    </div>
  );
};
