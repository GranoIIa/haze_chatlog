# HAZE-VIDEO-001: Roadmap e estimativa

Estimativas em **dias de um desenvolvedor focado**, com faixa (otimista a pessimista). Baseadas na POC (que levou uma sessão) e em risco conhecido; **são estimativas, não compromissos**. Cada fase só fecha com os gates da seção "Quality Gates".

| Fase | Escopo | Estimativa | Critérios de aceite (resumo) |
|---|---|---|---|
| **F0 (pré-requisitos)** | Decisões do ADR aprovadas; medir desempenho com vídeos reais (1080p/4K, 10 a 30 min) e Firefox/Safari/Edge; limites de arquivo; Worker para exportar | 3 a 5 | Medição publicada; decisão de suportar ou não Safari/Firefox |
| **VIDEO-F1 Core** | Biblioteca persistente na sessão, miniaturas, preview **com áudio** (Web Audio), cursor/zoom, cortar/dividir/reordenar polidos, volume/mudo, exportar em Worker com progresso e cancelamento, mix de áudio em streaming, erros e limites | 8 a 14 | Montagem de 3+ clipes exporta com duração ±1 quadro, A/V sincronizado ≤ 40 ms, sem vazamento (memória estável em 5 exportações), cancelamento libera tudo |
| **VIDEO-F2 Integração RP** | Chat com estilo completo (personagens, tons, cores), texto livre, presets de câmera por clipe (Bodycam/CCTV/Noir), overlays, `.haze` v2 com migração e reimport de mídia | 8 a 12 | `.haze` v1 abrem; v2 ida e volta preserva a timeline; preset aplicado igual ao do Editor RP (cor média) |
| **VIDEO-F3 Avançado** | Multifaixa com sobreposição, snap, keyframes, transições, velocidade, áudio (fade, ducking, waveform), legendas (SRT) | 15 a 25 | Testes de sobreposição e limites; transição sem quadro duplicado; waveform correta |
| **VIDEO-F4 Storytelling** | Templates editáveis, fluxo guiado (modo Simples), presets Discord/fórum | 6 a 10 | Template aberto, editado e exportado sem perda; presets respeitam limites de tamanho do destino |
| **Total** | | **40 a 66 dias** | |

## Riscos que movem a estimativa
1. **Desempenho com fontes grandes** (decodificação 4K, mix de áudio): pode exigir Worker + janelas de áudio já na F1. Maior fonte de variação.
2. **Compatibilidade de navegador:** só Chrome 149 foi testado. Firefox/Safari podem exigir `@mediabunny/aac-encoder` ou limitar a WebM.
3. **Timeline de terceiros:** se `react-timeline-editor` não aguentar multifaixa com snap/ripple, a F3 inclui construir a UI própria (+5 a 10 dias).
4. **`.haze` com vídeos:** o reimport por fingerprint tem casos chatos (renomeado, recodificado).
5. **Rotação/metadados de vídeo de celular** e VFR (taxa variável): não tratados na POC.

## Quality Gates propostos (por fase)
`BUILD` (`tsc && vite build`) · `TYPESCRIPT` (`tsc --noEmit` limpo) · `UNIT` (`npm run test:e2e`, inclui tier 6) · `E2E` (Playwright, inclui `video-poc.spec.ts` e os specs existentes) · `MEDIA_VALIDATION` (ffprobe/ffmpeg no arquivo exportado: codec, resolução, fps, duração, cor por tempo, frequência de áudio por tempo, troca simultânea A/V) · `PERFORMANCE` (tempo de exportação e memória em 3 tamanhos; limite por fase) · `REGRESSION` (suíte atual completa + abrir `.haze` v1 + PNG/GIF) · `LICENSE_COMPLIANCE` (varredura do `package-lock`: bloquear GPL/AGPL/licença própria; revisar MPL).

## Pedido de aprovação
Aprovar (1) o ADR, (2) a F0 antes da F1, e (3) a política de navegadores suportados. Nada além da POC foi implementado.
