import { useCallback, useRef, useState } from 'react';
import type { Character } from '../../types';
import { planDetection, makeCharacters, nameKey, type Candidate, type ImportProfile } from '../../utils/chatDetect';

const PROFILE_KEY = 'haze-import-profile-v1';

const loadPrefs = (): { profile: ImportProfile; verbs: string } => {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    const profile = ['auto', 'fivem-pt', 'gtaw-en', 'custom'].includes(raw.profile) ? raw.profile : 'auto';
    return { profile, verbs: typeof raw.verbs === 'string' ? raw.verbs.slice(0, 200) : '' };
  } catch { return { profile: 'auto', verbs: '' }; }
};

export interface PendingName extends Candidate { draft: string }

/**
 * Detecção de personagens do Modo Simples.
 * Nomes inequívocos entram sozinhos (com "Desfazer"); os ambíguos ficam numa lista para confirmar, corrigir ou ignorar.
 */
export function useCharacterDetection(characters: Character[], setCharacters: (c: Character[]) => void) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [pending, setPending] = useState<PendingName[]>([]);
  const [note, setNote] = useState('');
  const [lastAdded, setLastAdded] = useState<string[]>([]);
  const ignored = useRef<Set<string>>(new Set());

  const savePrefs = (next: { profile: ImportProfile; verbs: string }) => {
    setPrefs(next);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  };

  const run = useCallback((text: string) => {
    const plan = planDetection(text, characters, { profile: prefs.profile, customVerbs: prefs.verbs, ignored: ignored.current });
    const added = makeCharacters(plan.auto.map(c => c.name), characters);
    if (added.length) setCharacters([...characters, ...added]);
    setLastAdded(added.map(c => c.id));
    // pendentes anteriores continuam, sem repetir o que já foi decidido
    const known = new Set([...characters, ...added].map(c => nameKey(c.name)));
    setPending(prev => {
      const keep = prev.filter(p => !known.has(nameKey(p.draft)));
      const seen = new Set(keep.map(p => nameKey(p.name)));
      return [...keep, ...plan.review.filter(c => !seen.has(nameKey(c.name))).map(c => ({ ...c, draft: c.name }))];
    });
    if (plan.total === 0) setNote('Nenhuma fala encontrada. Use linhas como “Nome diz: …” ou escolha o formato do chat.');
    else if (added.length === 0 && plan.review.length === 0) setNote(`Os ${plan.total} personagem(ns) do texto já estão na lista.`);
    else if (added.length) setNote(`${added.length} personagem(ns) adicionado(s): ${added.map(c => c.name).join(', ')}.`);
    else setNote('');
  }, [characters, setCharacters, prefs]);

  const undo = () => {
    if (lastAdded.length === 0) return;
    const gone = characters.filter(c => lastAdded.includes(c.id));
    gone.forEach(c => ignored.current.add(nameKey(c.name)));
    setCharacters(characters.filter(c => !lastAdded.includes(c.id)));
    setLastAdded([]);
    setNote('Personagens detectados removidos.');
  };

  const setDraft = (key: string, draft: string) =>
    setPending(p => p.map(x => (nameKey(x.name) === key ? { ...x, draft: draft.slice(0, 60) } : x)));

  const accept = (key: string) => {
    const item = pending.find(p => nameKey(p.name) === key);
    if (!item) return;
    const added = makeCharacters([item.draft], characters);
    if (added.length) setCharacters([...characters, ...added]);
    ignored.current.add(key); // o nome original (antes da correção) está resolvido: não perguntar de novo
    setPending(p => p.filter(x => nameKey(x.name) !== key));
    setNote(added.length ? `“${added[0].name}” adicionado.` : 'Esse nome já está na lista.');
  };

  const ignore = (key: string) => {
    ignored.current.add(key);
    setPending(p => p.filter(x => nameKey(x.name) !== key));
  };

  const acceptAll = () => {
    const added = makeCharacters(pending.map(p => p.draft), characters);
    if (added.length) setCharacters([...characters, ...added]);
    pending.forEach(p => ignored.current.add(nameKey(p.name)));
    setPending([]);
    setNote(`${added.length} personagem(ns) adicionado(s).`);
  };

  return {
    profile: prefs.profile, customVerbs: prefs.verbs,
    setProfile: (profile: ImportProfile) => savePrefs({ ...prefs, profile }),
    setCustomVerbs: (verbs: string) => savePrefs({ ...prefs, verbs: verbs.slice(0, 200) }),
    pending, note, canUndo: lastAdded.length > 0,
    run, undo, setDraft, accept, ignore, acceptAll
  };
}

export type CharacterDetection = ReturnType<typeof useCharacterDetection>;
