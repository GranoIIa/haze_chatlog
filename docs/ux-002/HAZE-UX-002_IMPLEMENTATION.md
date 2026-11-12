# HAZE-UX-002 — Implementação

| Arquivo | Mudança | Justificativa |
|---|---|---|
| `src/utils/chatDetect.ts` | Reescrito: perfis, `extractSpeaker`, `classify`, `detectCandidates`, `planDetection`, `makeCharacters`; API antiga mantida | Fase A |
| `src/components/ChatLog/useCharacterDetection.ts` (novo) | Detecção automática + revisão + desfazer + ignorados + perfil persistido | A.3 |
| `src/components/ChatLog/panels/SimplePanel.tsx` | Progresso, selos, lista de revisão, formato do chat, estados das miniaturas, resumo de exportação | A.3, B, D |
| `src/utils/visualThumb.ts` | `thumbSize`, `thumbKey`, `ThumbCache` LRU, `runThumbJob` (incremental/cancelável), base reduzida, escurecimento | B/C |
| `src/components/ChatLog/useVisualThumbs.ts` (novo) | Hook com versão por chave, cache e telemetria `window.__hazeThumbStats` | B.4/C |
| `src/utils/visualPresets.ts` | `inferVisual` | Visual ativo derivado |
| `src/components/ChatLog/ChatLogView.tsx` | Usa o hook de detecção; passa `frame` e `detection`; remove o estado `visualId` | Integração |
| `scripts/thumb-bench.mjs`, `docs/ux-002/bench-thumbs-*.json` | Benchmark | C |
| `tests/tier5-editor/test_chat_detect.ts`, `test_visual_thumb.ts`, `test_visual_presets.ts`, `tests-e2e/simple-mode-ux2.spec.ts` | Testes | E |

**Não alterados:** `parseChatLine`/`chatParser.ts`, Modo Avançado, GIF Lab, formato `.haze`, exportação.

**Defeitos achados pelos próprios testes durante o trabalho:**
1. Corrigir um nome na revisão e colar de novo reperguntava o nome original. Agora o original fica resolvido.
2. A miniatura ignorava o escurecimento da cena. Agora ele é aplicado e entra na chave do cache.
