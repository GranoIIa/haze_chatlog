# ADR HAZE-VIDEO-001: Seleção do motor do Video Studio

**Status:** PROPOSTO (aguarda aprovação do responsável). **Data:** 2026-11-12.

## Contexto
O Haze precisa de um editor de vídeo local (importar, cortar, dividir, reorganizar, áudio, chat sincronizado, exportar MP4) que reaproveite o Canvas e o chat do Editor RP. O projeto é React 18 + Tailwind, sem store global, com 4 dependências de runtime. Ver pesquisa e matriz em `OPEN_SOURCE_RESEARCH.md`.

## Alternativas
**A. Modular:** modelo de timeline próprio + `mediabunny` (I/O e codificação) + `react-timeline-editor` (UI) + compositor Canvas do Haze.
**B. Adaptação seletiva** de um editor existente (FreeCut ou OpenReel).

## Evidências
| Pergunta | A (executada) | B (analisada, **não executada**) |
|---|---|---|
| Gera MP4 real com clipes, áudio e chat sincronizados? | **Sim**, validado com ffprobe/ffmpeg (QA e POC_REPORT) | Não testado |
| Compatível com React 18 / sem store global? | Sim | FreeCut: React 19 + zustand + TanStack Router + Radix. OpenReel: monorepo pnpm, `core` privado |
| Tamanho do que se traz | ~0,9 MB de bundle sob demanda (233 KB gzip); modelo próprio: ~240 linhas | FreeCut: 12,7 MB / 1869 arquivos; OpenReel `core`: 3,5 MB / 340 arquivos |
| Licença | MIT/ISC + MPL-2.0 (mediabunny) | MIT, mas vendorizar código = manter fork |
| Risco de manutenção | Peças pequenas e trocáveis | Acompanhar upstream em alfa (OpenReel) ou reescrever integração a cada versão |
| Reuso do chat/presets do Haze | Direto (`renderChatText` rodou no export) | Exigiria adaptar o renderizador de overlays do editor |

## Decisão
Adotar a **Alternativa A**:
1. `mediabunny` é a única biblioteca de mídia (decodificação, codificação, mux). Dois editores independentes (FreeCut, OpenReel) escolheram a mesma base, o que reduz o risco da escolha.
2. O **modelo de timeline e o compositor são do Haze** (puros e testados); o preview e a exportação compartilham `composeFrame`.
3. `react-timeline-editor` é a **casca visual substituível**, isolada atrás do modelo. Se travar em requisitos da F3 (multifaixa com snap, keyframes), troca-se a UI sem tocar no modelo.
4. FreeCut e OpenReel ficam como **referência** de modelo de projeto, transições e testes; não se copia código.
5. FFmpeg.wasm **não** entra (núcleo GPL-2.0, 64,7 MB). Considerar só como plugin opcional e sob demanda, se um formato de importação exigir.
6. Video Studio carrega com `React.lazy` para não pesar nas outras abas.

## Consequências
- (+) Controle da arquitetura, testes unitários do modelo sem navegador, preview idêntico ao arquivo exportado.
- (+) Custo inicial pequeno (a POC inteira: ~830 linhas de código, 12 testes de modelo e testes de navegador).
- (−) Implementar nós mesmos: multifaixa com sobreposição, keyframes, transições, ripple/slip, e cache de miniaturas/waveforms (previsto em F3).
- (−) Dependência de WebCodecs: sem H.264/AAC no navegador cai para WebM; Safari/Firefox não testados.
- (−) `react-timeline-editor`: manutenção lenta; sem undo/seleção múltipla próprios.
- (−) `mediabunny` é MPL-2.0 (cuidado se um dia for modificado) e tem um mantenedor principal (1290 de ~1465 contribuições humanas no GitHub).

## O que NÃO foi provado (precisa de validação antes de aprovar a F1)
- Desempenho com fontes longas/4K e memória no pico. **Medido:** 60 s de 1080p30 exportam em 38,3 s (1,57× o tempo real, dominado pelo encoder H.264); a primeira versão levou 149 s por culpa do meu mix de áudio (corrigido). Uma medição, uma máquina; ver POC_REPORT.
- **Reordenar por arrasto** com `react-timeline-editor`: não funcionou em 2 tentativas (risco 3 do ADR já apareceu). A F1 precisa decidir: gesto próprio sobre a lib ou UI própria.
- Navegadores além do Chrome 149.
- O áudio do preview (a POC reproduz sem som; só a exportação mixa áudio).
- B não foi executada: a comparação por código é por leitura e metadados, não por teste.

## Critério para reverter a decisão
Reabrir se, na F1/F3: (a) a exportação de 1080p com 10+ clipes levar mais de 2× a duração do vídeo em máquina média (hoje: 0,64× em 1 clipe repetido, ver POC_REPORT), (b) a timeline de terceiros não suportar multifaixa com snap e ripple sem fork, ou (c) mudança de licença do mediabunny.
