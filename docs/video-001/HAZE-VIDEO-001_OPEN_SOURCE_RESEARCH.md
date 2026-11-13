# HAZE-VIDEO-001: Pesquisa open source

**Data da avaliação:** 2026-11-12. Fontes: API do GitHub (metadados, árvore de arquivos, `package.json`, README, LICENSE), `npm view`, e **execução real** para as duas bibliotecas usadas na POC.

## Nível de evidência (leia antes das notas)
- **[T] Testado na POC** (código rodando, com testes): `mediabunny` 1.65.2 e `@xzdarcy/react-timeline-editor` 1.0.0.
- **[L] Leitura** (metadados, README, estrutura, tamanho do código, dependências; **nada foi executado**): os demais. Notas de [L] são **estimativas** e não substituem um teste. Isso vale especialmente para o desempenho de OpenReel, FreeCut, OpenCut e Omniclip: **não medi**.
- Estrelas não entram em nenhuma nota.

## Matriz ponderada
Pesos: React/TS 15 · Funcionalidades reutilizáveis 15 · Arquitetura 15 · Exportação 15 · Desempenho 15 · Licença 10 · Manutenção 10 · DX 5. Notas 0 a 10; "exportação" fica em 5 (neutro) quando o item não exporta. Reprodutível com `node docs/video-001/score-matrix.mjs`.

| Candidato | Papel | Nota | Evid. |
|---|---|---:|:-:|
| **mediabunny** | leitura, decodificação, codificação, mux | **8,90** | T |
| FreeCut (adaptar) | editor completo | 7,50 | L |
| wavesurfer.js | forma de onda | 7,40 | L |
| OpenReel (adaptar) | editor completo | 7,00 | L |
| Remotion | composição React | 7,00 | L |
| react-timeline-editor | UI de timeline | 6,45 | T |
| Fabric.js | overlays editáveis | 5,95 | L |
| FFmpeg.wasm | fallback de mídia | 5,90 | L |
| Omniclip | editor completo | 5,75 | L |
| OpenCut | editor completo | 5,10 | L |

A nota **não decide sozinha**: papéis diferentes não competem entre si (mediabunny e uma timeline são peças, FreeCut é um produto). A decisão está no ADR e se apoia no custo de integração e na POC.

## Fichas

### mediabunny: **ADOTAR** [T]
Repo `Vanilagy/mediabunny`, versão npm 1.65.2 (publicada, atividade em 2026-11-12). **MPL-2.0** (copyleft por arquivo: usar sem modificar como dependência é livre; modificações nos arquivos da biblioteca devem ser publicadas). Sem dependências de runtime próprias. TypeScript nativo, API de alto nível: `Input`/`BlobSource` (lê do `File` sem carregar tudo), `CanvasSink` e `AudioBufferSink` (decodificação por iteração, com pré-decodificação limitada), `Output`+`Mp4OutputFormat`/`WebMOutputFormat`+`CanvasSource`/`AudioBufferSource` (WebCodecs, com contrapressão via `await add()`), `getFirstEncodableVideoCodec` para detectar suporte. **Na POC:** abriu MP4 H.264/AAC, decodificou quadro a quadro, codificou MP4 H.264+AAC válido (ffprobe/ffmpeg). Limites: depende de WebCodecs do navegador (codec e GPU variam); H.264 e AAC dependem de o navegador oferecer o encoder. Pacotes opcionais `@mediabunny/aac-encoder` (MPL-2.0) etc. cobrem navegadores sem AAC. Tamanho: bundle do Video Studio com a lib = 885 KB (233 KB gzip), junto da timeline.
Custo de integração: baixo (feito). Risco: MPL e dependência de um mantenedor principal (1290 de ~1465 contribuições humanas).

### @xzdarcy/react-timeline-editor: **ADOTAR COM RESSALVAS** [T]
**MIT**; dependências MIT/ISC (`interactjs`, `react-virtualized`, `@xzdarcy/timeline-engine` ISC). Peer `react >=18` (compatível com o Haze). Último commit **2026-01-25**; 42 issues abertas, entre elas "undo/redo" e "seleção múltipla" (a lib **não** oferece, o Haze precisa ter, e a POC já tem undo no modelo). Funcionou na POC: linhas, ações arrastáveis e redimensionáveis, cursor, zoom por `scaleWidth`, renderização customizada (`getActionRender`). Atritos reais: os tipos `TimelineRow`/`TimelineEffect` **não são reexportados** (importa-se de `@xzdarcy/timeline-engine`); a lib move/redimensiona livremente e o app precisa reinterpretar o resultado (na POC a trilha é sequencial, então o arrasto vira "reordenar"); parte das issues está em chinês. Não testei: snap entre clipes, muitas faixas, 100+ clipes, teclado/acessibilidade, toque.
Risco: manutenção lenta e API presa a um modelo de "ações em linhas". Mitigação: o **modelo é do Haze** (`src/video/timeline.ts`); a lib é só a casca visual e pode ser trocada sem tocar no modelo, no preview nem no exportador.

### FreeCut: **DESCARTAR como base; estudar** [L]
`walterlow/freecut`, MIT, commit `5ceeeb38` (2026-10-29). Editor multifaixa muito completo (sequências, ripple/rolling/slip/slide, keyframes, transições, WebGPU/WebCodecs/OPFS, mediabunny 1.54). **React 19**, zustand, TanStack Router, ~20 pacotes Radix. Código: **1869 arquivos, ~12,7 MB** em `src/` (timeline 2,9 MB, preview 1,4 MB, export 207 KB). Acoplamento alto a router, stores e workspace em disco (File System Access/OPFS); o Haze é React 18 sem store global. Adaptar uma parte exigiria arrastar stores e tipos. Valor para o Haze: **referência de arquitetura** (modelo de itens, transições, rate-stretch, exportação em Worker) e fonte de ideias de teste. Reuso de código: não recomendado.

### OpenReel: **ESTUDAR; reuso pontual improvável** [L]
`Augani/openreel-video`, MIT, commit `367d7e90` (2026-10-17), `v1.0.0-alpha.17` (alfa). Monorepo pnpm (`apps/web`, `desktop`, `cloud`, `studio`; `packages/core`, `ui`, `agent-*`…). `packages/core` (**private**, não publicado): 340 arquivos, 3,5 MB; `export` 88 KB, `timeline` 51 KB, depende de mediabunny. Também traz `@ffmpeg/core*` e um assistente de IA. Para reutilizar o `core` seria preciso **vendorizar** (copiar) um pacote privado de um projeto em alfa, com superfície de IA que o Haze não quer. Valor: comparar modelo de projeto e exportação com a nossa; confirma que **mediabunny + WebCodecs é a rota que dois editores independentes escolheram**.

### OpenCut: **DESCARTAR** [L]
`OpenCut-app/OpenCut`, MIT, último commit 2026-09-24. A árvore atual é `apps/` + `crates/` + `Cargo.toml` (Rust) e release de ffmpeg nativo: o projeto migrou para stack nativa/híbrida. Inspeção só de estrutura; não avaliei versões antigas em TS. Não serve como base de um editor 100% navegador em React 18.

### Omniclip: **DESCARTAR como base** [L]
`omni-media/omniclip`, MIT, último commit na branch padrão **2025-08-07** (mais de 15 meses). pixi.js 7, ffmpeg.wasm, wavesurfer, gl-transitions. Bom catálogo de ideias (transições GL), mas parado e com motor gráfico próprio (Pixi) concorrente do Canvas do Haze.

### FFmpeg.wasm: **RESERVA (não adotar agora)** [L]
Wrapper `@ffmpeg/ffmpeg` 0.12.15 (MIT, 72 KB). O **núcleo** `@ffmpeg/core` 0.12.10 é **GPL-2.0-or-later**, **64,7 MB** descompactado: obrigações de GPL para a distribuição do binário e peso de download inadequado para o caminho principal. Roda em Worker, sem aceleração por hardware e mais lento que o nativo (não medi). Só considerar para um formato que o navegador não decodifica (ex.: ProRes/AVI antigos), sempre sob demanda e opcional. Não incluído na POC.

### wavesurfer.js: **ADOTAR NA F3 (se necessário)** [L]
`katspaugh/wavesurfer.js` 8.1.0, BSD-3-Clause, ativo (2026-11-12). Forma de onda e regiões prontas. Alternativa leve: desenhar picos com `AudioBufferSink` + canvas (poucas dezenas de linhas, sem dependência). Decidir na F3 comparando custo; não entra na F1.

### Fabric.js: **DESCARTAR** [L]
MIT, 7.4.0, 22 MB no npm. Seria um **segundo motor de canvas** ao lado do `canvasLayerRenderer`/`chatRenderer` do Haze, que já fazem texto, camadas e transformações (`drawLayerHandles`, `hitTest*`). Não acrescenta valor suficiente.

### Remotion: **DESCARTAR para incorporação; consultar como referência** [L]
Licença **própria** ("Remotion License"), não OSI: grátis para indivíduos, empresas com até 3 funcionários e ONGs; proibido copiar/modificar para vender derivado; **licença paga** acima disso. O Haze é um produto de estúdio com intenção de distribuição, o que cria incerteza jurídica, e a renderização web do Remotion é de outro paradigma (composição React, render headless). Boa referência para **templates declarativos** (F4), sem incorporar código.

## Compatibilidade e riscos transversais
- **Navegadores:** WebCodecs de **codificação** é maduro em Chromium (Chrome/Edge); Safari e Firefox variam por versão e codec. A POC só foi testada em **Chrome 149**. A cadeia de decisão para fallback WebM/VP9/Opus está no exportador e **não foi exercitada** (Chrome tem H.264).
- **Licenças novas na árvore de dependências** (verificado no `package-lock`): todas MIT/ISC/MPL-2.0, **nenhuma GPL/AGPL**. Detalhe no QA.
