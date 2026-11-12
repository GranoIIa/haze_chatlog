# HAZE-UX-002 — Relatório de QA

**Ambiente:** Windows 11, Node 25.5.0, Chrome 149.0.7827.201 (headless). Só Chrome foi testado.
**Quality gates** (HEAD `450cbfd`):

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo (~3,8 s) |
| `npm run build` | OK (~4,3 s) |
| `npm run test:e2e` (unitários) | **407 executados, 407 aprovados, 0 reprovados, 0 ignorados** (baseline: 383) |
| `npm run test:browser` (Playwright) | **67 aprovados, 0 reprovados, 0 ignorados** em 2 min 53 s (baseline: 54) |
| `npm ci` | **não executado**: `node_modules` existente foi reutilizado; `package.json` e `package-lock.json` não mudaram |

## Cobertura nova
- **Unitários (24):** 7 formatos do briefing; acentos, hífen, apóstrofo, partículas, "Jr."; timestamps e prefixos de rádio; sistema/OOC/ações/comandos; `:` sem verbo; linhas malformadas; verbo dentro da fala; perfis e verbos personalizados; níveis de confiança; deduplicação (caixa e espaços); colagens consecutivas; log de 30 mil linhas (48 ms); geometria, chave, LRU, tarefa incremental, descarte de resultado obsoleto, falha isolada, cessão entre miniaturas; `inferVisual`.
- **Playwright (13 novos):** colar e detectar; revisão (corrigir, adicionar, ignorar, não reperguntar); desfazer detecção; perfil persistente; troca rápida de foto sem miniatura antiga; cache e ausência de regeneração ao digitar; sem foto/remover foto; proporção retrato; visual ativo derivado; **fidelidade miniatura × preview × PNG** para `crime`, `sunset` e `vintage`; desfazer; reabrir `.haze`.
- **Fidelidade:** foto sintética 480×270 sólida (110,140,170), chat vazio; cor média de miniatura × preview com tolerância de 8 por canal (JPEG 70% reduzido) e preview × PNG com 4 (mesmo desenho, escala 2×). O visual também precisa diferir do original em mais de 3. Imagens determinísticas, mas **sólidas**: não exercitam a comparação espacial (bordas, vinheta).

## Falsos positivos e negativos conhecidos
| Tipo | Caso | Comportamento |
|---|---|---|
| FP (vai para revisão, não é cadastrado) | Frase solta como "eu acho que ele diz: tudo bem" | nome em minúsculas → revisão |
| FP | Nome de coisa em maiúscula + verbo ("Central diz:") | nome genérico → revisão |
| FP possível (cadastrado) | Frase de narração iniciada por maiúscula antes de "diz:" até 5 palavras ("Ontem Ana diz: …") | tratada como nome inequívoco; o usuário remove com "Desfazer detecção" |
| FN | Servidor com outro verbo ("comenta:", "responde:") | só no perfil Personalizado |
| FN | Fala sem `:` ("Ana Lima diz oi") ou nomes com mais de 5 palavras/40 caracteres | não detectada |
| FN | Nomes em alfabetos não latinos | rejeitados (exige letra latina) |

## Desempenho das miniaturas (Chrome 149, mediana de 3, fotos sintéticas com ruído)
Fonte: `bench-thumbs-before.json` (baseline `537bcfc`) e `bench-thumbs-after.json`.

| Foto | Pronto antes → depois (ms) | Geração depois (ms) | Maior tarefa longa antes → depois (ms) | Heap retido antes → depois (MB) |
|---|---|---|---|---|
| 1280×720 | 361 → 423 | 145 | 188 → 180 | 9,4 → 10,3 |
| 1920×1080 | 606 → 696 | 157 | 373 → 383 | 18,4 → 19,2 |
| 2560×1440 | 886 → 1011 | 149 | 614 → 625 | 30,4 → 31,3 |
| 3840×2160 | 1902 → 1998 | 224 | 1378 → 1361 | 47,0 → 48,6 |
| 1080×1920 | 627 → 694 | 160 | 380 → 381 | 18,4 → 21,4 |

**Leitura honesta:** não houve ganho de tempo nem de responsividade. O tempo até as miniaturas aparecerem ficou 4–15% **maior** (a geração cede a vez entre miniaturas), e a maior tarefa longa e o heap são praticamente iguais. A geração em si custa 145–224 ms; o bloqueio de até ~1,4 s a 4K acontece **ao carregar a foto** (decodificação + preview) e é igual nas duas versões. Os ganhos reais desta fase são de **corretude e custo repetido** (sem miniaturas de foto antiga, cache ao alternar modo, sem regenerar ao digitar), não de velocidade do primeiro carregamento. Limitações: fotos sintéticas (PNG decodifica diferente de screenshot real), só Chrome, 3 repetições, `performance.memory` é aproximado.

## Limitações
- Não há teste de navegador para `ImageDecoder`/Firefox/Safari.
- A comparação de fidelidade usa cor média, não pixel a pixel.
- O hover/foco de pré-visualização não existe (decisão registrada no DESIGN).
- Uma verificação visual manual foi feita por captura de tela em 1440 px e 390 px (lista de revisão, miniaturas e resumo de exportação renderizados sem sobreposição). Não houve teste em aparelho real.
