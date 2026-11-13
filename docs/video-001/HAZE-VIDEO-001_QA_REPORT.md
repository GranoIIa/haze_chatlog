# HAZE-VIDEO-001: Relatório de QA

**Ambiente:** Windows 11, Node 25.5.0, Chrome 149 (headless), ffmpeg/ffprobe 8.1.2. **Só Chrome.** HEAD testado: `4973be6` (branch `poc/haze-video-001`, base `origin/main` = `8bf7493`).

## Quality Gates
| Gate | Resultado | Evidência |
|---|---|---|
| `BUILD` | **OK** | `npm run build` (`tsc && vite build`) |
| `TYPESCRIPT` | **OK** | `npx tsc --noEmit` limpo |
| `UNIT` | **OK: 399/399** | `npm run test:e2e`. Baseline da `main`: 387; +12 novos (tier 6, modelo da timeline) |
| `E2E` | **48 aprovados, 12 reprovados, 1 ignorado** (61 testes) | `npx playwright test`. **Os 12 reprovados são pré-existentes na `main`** (abaixo). 1 ignorado = arrasto (`fixme`, em aberto) |
| `MEDIA_VALIDATION` | **OK** (Chrome, MP4) | ffprobe/ffmpeg no arquivo baixado: codec, resolução, fps, duração, quadros, cor por tempo, tom por tempo, troca simultânea A/V, decodificação sem erro |
| `PERFORMANCE` | **Medido, sem limite aprovado** | 60 s de 1080p30 em 38,3 s (1,57× tempo real). Uma medição; ver POC_REPORT. Sem meta formal ainda |
| `REGRESSION` | **Sem regressão introduzida**; falhas pré-existentes na `main` | Os mesmos 12 testes falham na `main` limpa (`8bf7493`, rodada própria só dos 2 specs: 12 reprovados, 20 aprovados). Nenhum teste que passava na `main` deixou de passar |
| `LICENSE_COMPLIANCE` | **OK** | Abaixo |

### Os 12 testes que já falham na `main` (não são desta missão)
`editor.spec.ts` (8) e `project-batch.spec.ts` (4): `strict mode violation`, o seletor casa **dois botões** ("Salvar projeto .haze", "Copiar imagem", "Baixar só o chat"…), um de cada modo da interface. Reproduzido numa cópia limpa de `origin/main`, sem nenhuma alteração minha. **Causa não investigada** (fora do escopo); a branch `feat/haze-ux-002-simple-mode-hardening` tinha 67/67 verdes, então a causa provável está nos 3 commits recentes da `main` (GIF animado e ponte Editor RP) ou em testes que não os acompanharam (hipótese, não verificada). Recomendo corrigir à parte, antes de qualquer merge.

## Cobertura nova
**Unitários (12, `tests/tier6-video/test_video_timeline.ts`):** sequência e soma, corte com ripple, limites do corte (mídia, duração mínima, NaN), divisão, bordas da divisão, reordenação, `locate` com corte/divisão, histórico (desfazer/refazer, ação sem efeito), janela do chat, validação, `sanitizeTimeline` com lixo, 500 clipes.
**Navegador (7; 6 passam, 1 ignorado):**
1. Montagem completa → exportação → validação externa (cor, tom, duração, resolução, chat, sincronia): **passa**.
2. Cancelar exportação (1080p60, 24 s) → sem arquivo, botão liberado, nova exportação ok: **passa**.
3. Arquivo corrompido → mensagem clara, biblioteca intacta: **passa**.
4. Timeline vazia → exportar desabilitado: **passa**.
5. Fonte de áudio 44,1 kHz → tom e duração preservados: **passa**.
6. Desempenho 60 s de 1080p: **passa** (mede, só falha acima de 280 s).
7. **Arrastar clipe reordena a trilha: IGNORADO (`fixme`).** Falha real em 2 tentativas; reordenar só está provado pelos botões.

## O que NÃO foi testado
- Navegadores além do Chrome 149 (Firefox, Safari, Edge); fallback WebM nunca exercitado.
- Fontes 4K, longas (10 a 30 min), VFR, com rotação de celular, sem áudio, com 5.1, ou codecs raros.
- Memória ao longo de várias exportações; tendência de vazamento; arquivos acima de 2 GB.
- Preview com áudio (não existe); sincronia do preview.
- Arrasto, snap, zoom, teclado e toque na timeline; muitos clipes (100+) na UI.
- Chat com personagens/tons/cores, presets de câmera no vídeo, `.haze` com vídeo (não implementados).
- Comparação de qualidade visual (só cor média e variação em regiões).
- Alternativa B (nenhum código de FreeCut/OpenReel foi executado).

## Impacto nas dependências (novas, runtime)
| Pacote | Versão | Licença |
|---|---|---|
| `mediabunny` | 1.65.2 | **MPL-2.0** (copyleft por arquivo; sem modificar = sem obrigação de publicar código) |
| `@xzdarcy/react-timeline-editor` | 1.0.0 | MIT |
| `@xzdarcy/timeline-engine` | 1.0.0 | ISC |
| `interactjs`, `@interactjs/types`, `react-virtualized`, `@types/react-virtualized`, `clsx`, `dom-helpers`, `framework-utils`, `prop-types`, `react-is`, `react-lifecycles-compat`, `@babel/runtime` | vários | MIT |
| `@types/dom-webcodecs`, `@types/dom-mediacapture-transform` | 0.1.x | MIT (tipos) |
Total: 16 pacotes novos no `package-lock`, **nenhum GPL/AGPL ou licença própria** (verificado no `package-lock.json`). Pendência: ao distribuir o app, manter os avisos de licença (MIT/ISC/MPL) e o texto da MPL-2.0 para o mediabunny.
Bundle: chunk `VideoStudioView` = **885 KB (233 KB gzip)** carregado sob demanda; chunk `index` = 394 KB (116 KB gzip). Não medi o `index` na `main` para comparar.
