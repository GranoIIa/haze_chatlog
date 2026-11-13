# HAZE-VIDEO-001: Arquitetura atual do Haze RP Studio

**Inventário em 2026-11-12.** HEAD real da `main` (`origin/main`): `8bf7493` ("fix(export-gif): corrigir resolução de mensagem DONE do worker…").
A `main` **avançou** em relação ao baseline da missão anterior (`537bcfc`): entraram GIF animado no Editor RP, a ponte GIF Lab → Editor RP e correções do export de GIF. A branch `feat/haze-ux-002-simple-mode-hardening` (`ba65d65`) **não está na `main`**; a POC desta missão sai da `main`, não dela.

## Stack
Vite 6 + React 18.3 + TypeScript 5.7 + Tailwind 3.4; cliente puro (sem servidor); Canvas 2D; `jszip` (único runtime além de React e lucide-react). Testes: runner próprio (`npm run test:e2e`, tiers em `tests/`) e Playwright (`npm run test:browser`, `tests-e2e/`, Chrome instalado, `vite preview :4173`).

## Mapa de componentes
| Área | Arquivos | Papel |
|---|---|---|
| Shell | `src/App.tsx`, `components/Navbar.tsx`, `types/index.ts` (`ActiveTab`) | Abas persistentes (todas montadas, as inativas ficam `hidden`) |
| Editor RP | `components/ChatLog/ChatLogView.tsx` (~125 KB), `EditorSection.tsx`, `panels/*` | Foto + chat + câmera/luz/camadas; Modo Simples/Avançado |
| Chat | `utils/chatParser.ts`, `chatRenderer.ts` (`renderChatText(ctx,W,H,scale,ChatStyle)`), `chatDetect.ts`, `chatStore.ts` | Parsing e desenho do chat. **`renderChatText` é puro sobre um contexto 2D: reutilizável em vídeo** |
| Câmera/luz | `utils/cameraFx.ts` (Bodycam, CCTV, Noir, efeitos de filme), `lighting.ts`, `photoFilters.ts`, `visualPresets.ts` | Presets cinematográficos; operam em canvas 2D |
| Camadas | `utils/canvasLayerRenderer.ts`, `layerStorage.ts`, `components/ChatLog/CanvasLayersSidebar.tsx` | Stickers/imagens/formas com transformação |
| GIF Lab | `components/GifLab/GifLabView.tsx` (~59 KB), `gifExport.ts`, `gifWorker.ts` (Worker), `utils/gif*.ts`, `videoSeek.ts` | Vídeo → quadros (via `<video>` + seek) → GIF em Worker |
| Projeto | `utils/projectFile.ts` | `.haze` = ZIP (JSZip); `PROJECT_SCHEMA_VERSION = 1`; importação trata o arquivo como não confiável (limites, mime sniff, `normalizeScene`) |
| Estado | `useState` local por view; histórico por view (debounce 500 ms no Editor); sem store global | Cada aba é autocontida |

## Pontos relevantes para vídeo
- **Decodificação hoje:** só `<video>` + `seekVideo` (GIF Lab). Não há WebCodecs, demux, nem codificação de vídeo/áudio no projeto. Exportação existente = PNG, GIF, `.haze`.
- **Workers:** apenas `gifWorker.ts`. Padrão `new Worker(new URL(...), { type: 'module' })` via Vite.
- **Persistência de mídia:** foto/camadas dentro do `.haze` (ZIP). Vídeo é grande demais para ir no ZIP; ver GDD (referência por arquivo + reimportar).
- **Design system:** tokens `haze-*` (Tailwind), componentes de botão/painel inline, ícones lucide. O Video Studio reutiliza as mesmas classes.
- **Convenção:** `data-testid` em controles testáveis; mensagens em PT-BR; `docs/<missão>/` para documentos.

## Pontos de integração (previstos)
1. **Aba nova** em `ActiveTab` + `Navbar` + `App` (feito na POC; carregada sob demanda com `React.lazy`).
2. **Chat sobre vídeo:** `renderChatText` (já reutilizado na POC).
3. **Presets RP:** `cameraFx.applyFilmEffects`/`drawCameraOverlay` operam em `CanvasRenderingContext2D` e servem como "efeito por clipe" (F2).
4. **`.haze`:** acrescentar `video` ao manifesto com `schemaVersion` 2 e migração 1→2 (ver TDD).
5. **Ponte** Video Studio → Editor RP (quadro atual como foto) e GIF Lab → Video Studio.

## Testes existentes e dependências
- Antes da POC na `main`: **387** testes unitários e **54** de navegador (valores medidos nesta missão).
- Dependências de runtime: `react`, `react-dom`, `lucide-react`, `jszip`. Qualquer biblioteca do Video Studio entra como nova dependência de runtime (ver ADR e QA).
