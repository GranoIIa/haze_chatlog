/**
 * Edição de texto do chat (inserir tom de voz, marcadores e censura na posição do cursor).
 * Funções puras: recebem o texto e a seleção e devolvem o novo texto e onde deixar o cursor.
 */

export interface EditResult {
  value: string;
  selStart: number;
  selEnd: number;
}

/**
 * Insere `text` na seleção (substituindo-a). Com `startOfLine`, se o cursor estiver no meio
 * de uma linha, começa uma linha nova antes do texto.
 */
export function insertAtSelection(
  value: string,
  selStart: number,
  selEnd: number,
  text: string,
  startOfLine = true
): EditResult {
  const s = Math.max(0, Math.min(selStart, value.length));
  const e = Math.max(s, Math.min(selEnd, value.length));
  const ins = startOfLine && s > 0 && value[s - 1] !== '\n' ? '\n' + text : text;
  const next = value.slice(0, s) + ins + value.slice(e);
  const caret = s + ins.length;
  return { value: next, selStart: caret, selEnd: caret };
}

/** Linha de fala do personagem com o tom escolhido (normal, sussurrando, gritando, baixo, rádio, celular). Em tom normal, não inclui "(normal)". */
export const speechPrefix = (name: string, tone: string) => {
  const speaker = name || 'Personagem';
  if (!tone || tone.toLowerCase() === 'normal') {
    return `${speaker} diz: `;
  }
  return `${speaker} diz (${tone}): `;
};

/** Censura: envolve a seleção em ||...||; sem seleção, insere um marcador editável. */
export function censorSelection(value: string, selStart: number, selEnd: number): EditResult {
  const s = Math.max(0, Math.min(selStart, value.length));
  const e = Math.max(s, Math.min(selEnd, value.length));
  if (s !== e) {
    const next = value.slice(0, s) + '||' + value.slice(s, e) + '||' + value.slice(e);
    const caret = e + 4;
    return { value: next, selStart: caret, selEnd: caret };
  }
  return insertAtSelection(value, s, e, '||CENSURADO|| ', false);
}
