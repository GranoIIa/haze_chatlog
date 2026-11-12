# HAZE-GIF-001 — Alterações realizadas

| Arquivo | Alteração | Motivo (achado) |
|---|---|---|
| `src/utils/gifPalette.ts` (novo) | Paleta median-cut com número de cores configurável | #2, #5 |
| `src/utils/gifEncoder.ts` | Usa a nova paleta, `maxColors`, `bytesWritten`, tabela local de tamanho variável, buffer ×1,5 | #2, #3, #5 |
| `src/components/GifLab/gifWorker.ts` | `colors`, `maxBytes`, `PROGRESS.bytes`, `ERROR code=OUTPUT_LIMIT` | #4, #5 |
| `src/types/index.ts` | Campos novos do protocolo do worker | — |
| `src/utils/gifBudget.ts` (novo) | Estimativa de custo, níveis, sugestões, atrasos acumulados, `formatBytes` | #1, #4, #5 |
| `src/utils/gifSettings.ts` (novo) | Modelo único, perfis/níveis, escada do Smart Export | #5, #6, #7 |
| `src/components/GifLab/gifExport.ts` (novo) | Pipeline com backpressure, cancelamento, limite de bytes | #4 |
| `src/components/GifLab/GifLabView.tsx` | Estados soltos → `GifSettings`; painel de perfil/qualidade/alvo/cores; resumo de custo; Smart Export com tentativas; resultado com tamanho medido | #5, #6 |
| `scripts/gif-bench.mjs` (novo) | Benchmark em Chrome real (não é teste) | evidências |
| `tests/tier5-editor/test_gif_pipeline.ts` (novo) | 19 testes unitários | cobertura |
| `tests-e2e/gif.spec.ts` | +6 testes de navegador | cobertura |

## Comportamentos preservados
Chat/Canvas/`.haze` intocados; todos os 7 testes anteriores do GIF Lab seguem passando; sincronização de texto e estilo igual; `Converter Vídeo para GIF`, `Concluído!`, `Cancelar Conversão` mantidos.

## Mudanças de comportamento (intencionais)
- Duração do GIF agora fiel ao FPS (antes ~4% mais rápido em 12 FPS).
- GIFs ~13–17% maiores no mesmo ajuste (paleta melhor) — compensável com "Cores" ou Smart Export.
- "Presets Discord" viraram "Perfil de exportação"; Banner passou de 540 para 680 px.
- Largura do GIF ganhou um controle deslizante (64–1280).
- Ajustar a resolução à mão agora mantém o perfil (marcado "ajustado") em vez de zerá-lo.

## Não alterado (decisão)
Contrato de documento compartilhado com o Editor RP: sem evidência de necessidade, `chatStore` basta (rule 7 do briefing).
