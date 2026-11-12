# HAZE-UX-002 — Baseline

**SHA inicial:** `537bcfcc64091ab54c296685f4ab10781831acba` (`Modo Simples: miniaturas dos Visuais com a foto do jogador`).
**Inventário do HEAD da `main`:** após `git fetch`, `origin/main` = `537bcfc`, idêntico ao baseline do briefing. Nenhuma alteração posterior para preservar.
**Branch de trabalho:** `feat/haze-ux-002-simple-mode-hardening` (criada a partir de `537bcfc`). Nada foi enviado ao remoto nem mesclado na `main`.
**Ambiente:** Windows 11, Node 25.5.0, Chrome 149.0.7827.201 (headless, instalado no computador).

## Testes no baseline
| Suíte | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run build` | OK |
| `npm run test:e2e` (unitários) | 383 / 383 |
| `npm run test:browser` (Playwright) | 54 / 54 |

## Como o baseline funcionava
- **Detecção (`chatDetect.ts`):** usava `parseChatLine` (PT-BR) mais um regex `says|shouts|whispers`, sem noção de confiança: qualquer nome aceito era cadastrado direto, sem revisão e sem desfazer. Nomes como "Policial #12" entravam automaticamente.
- **Miniaturas (`visualThumb.ts` + hook dentro de `SimplePanel`):** a foto original (até 4K) era desenhada 8 vezes, uma por visual; 320×180 fixo (16:9) mesmo para foto em retrato; sem escurecimento da cena; as 8 renderizações rodavam sincronicamente num único `onload`; sem cache (alternar Simples↔Avançado remontava o painel e regenerava tudo); sem controle de versão além do `cancelled` do efeito.
- **Visual ativo:** estado local `visualId`: não refletia desfazer, abrir projeto nem edição no Modo Avançado.

## Achados (com evidência)
| # | Achado | Evidência |
|---|---|---|
| 1 | Nome ambíguo ("Policial #12", "desconhecido", "SISTEMA") virava personagem sem revisão | leitura do código; testes novos `T5_DET_13/22` |
| 2 | Sem como corrigir/ignorar nome detectado; sem desfazer | UI inexistente |
| 3 | Miniatura em 16:9 para foto retrato; ignorava enquadramento e escurecimento da cena | teste `a miniatura segue a proporção do quadro de saída`; no primeiro ensaio de fidelidade a cor média da miniatura (133,153,174) divergia do preview (81,90,105) |
| 4 | Sem cache: alternar modo regenera | teste `…reaproveita o cache` |
| 5 | Visual selecionado some ao abrir projeto/desfazer | teste `reabrir um projeto…` |
| 6 | Desempenho do baseline (8 miniaturas, sem cache) | `bench-thumbs-before.json`, resumo no QA_REPORT |
