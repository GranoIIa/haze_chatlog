# HAZE-VIDEO-001: Relatório da fase F0

Aprovação do responsável: Alternativa A + F0 (2026-11-12). Máquina: Windows 11, 16 threads lógicas, Chrome 149 e Edge (mesmo motor Chromium), ffmpeg 8.1.2 para gerar as fontes. **Fontes sintéticas** (`testsrc2` + seno), não gravações reais de jogo. Medidas em `tests-e2e/video-f0.spec.ts` (`F0=1 npx playwright test video-f0`; não roda no gate normal).

## Resultados
| Medição | Resultado |
|---|---|
| **4K** (3840×2160, 20 s) → 1080p30 | 38,6 s (0,52× o tempo real, ou seja, 1,9× mais lento que o vídeo). Importar: 0,2 s. Heap JS 60 MB |
| **1080p** (60 s) → 1080p30 | 38,3 s Chrome (1,57× tempo real) · 33,7 s Edge (1,78×) |
| **Longo**: 10 min 1080p → 720p30 | 247 s (2,43× tempo real; 18000 quadros; saída de 212 MB); pico de heap JS amostrado **618 MB** (inclui o mix de áudio de ~230 MB e o arquivo de saída em memória) |
| **Memória**: 5 exportações seguidas (720p, 10 s) | heap JS (MB) após 0..5: 10, 35, 39, 39, 37, 38. **Estável depois da primeira** (sem tendência de crescimento nesta amostra; só mede heap JS, não memória nativa do encoder) |
| **Responsividade** durante export 1080p (20 s) | maior tarefa longa **93 ms** (só 1 acima de 50 ms); intervalo entre quadros da UI p95 43 ms, máx 115 ms. **A página não congela** exportando na thread principal |
| **Outro navegador** | Edge: os 6 testes do Video Studio passaram, inclusive a validação do arquivo. É o **mesmo motor** do Chrome, então prova pouco sobre Firefox/Safari |

Leitura: no 4K e no 1080p o tempo é do **encoder H.264** via WebCodecs; no 10 min, 221 s dos 247 s foram do encoder. Observação: a divisão decodificar/codificar do instrumento é aproximada (as duas etapas rodam em paralelo e a espera por contrapressão cai em "codificar"); no 4K isso pode esconder custo de decodificação.

## Decisões da F0
1. **Worker de exportação: não é requisito da F1.** A página manteve tarefas curtas e quadros de UI regulares exportando na thread principal. Fica como otimização (F3) se medirmos jank em máquinas fracas.
2. **Limites implementados** (`src/video/limits.ts`, 2 testes): 4 GiB por arquivo, 3 h por mídia, 2 h de montagem, mix de áudio em memória até 1,5 GB (≈ 1,5 h). Mensagens em PT-BR. O limite de áudio é o que força o **mix em streaming** na F1 para durações maiores.
3. **Mix de áudio em streaming continua sendo trabalho da F1** (10 min já usa ~230 MB só de PCM).
4. **Meta de desempenho proposta para a F1 (sujeita a aprovação):** 1080p30 de qualquer montagem ≥ 1× o tempo real nesta máquina; em máquina fraca informar o tempo estimado antes de exportar. 4K de entrada → 1080p hoje ≈ 0,5×: **não atende a meta**; investigar decodificação por hardware/escala antes de prometer 4K.
5. **Política de navegadores proposta:** suportar Chrome e Edge atuais na F1; Firefox e Safari "melhor esforço" (detectar `VideoEncoder`/`AudioEncoder` e avisar, com fallback WebM).

## Não feito / ainda sem prova
- **Firefox e Safari:** não estão instalados aqui; nada testado. Mantém o risco do ADR.
- Fontes reais (gravação de jogo, VFR, rotação de celular), fontes sem áudio, 5.1, vídeo vertical.
- Hardware mais fraco e GPU diferente. Aceleração por hardware do encoder não foi controlada.
- Memória **nativa** (processo do navegador); só medi heap JS.
- Arrasto na timeline continua **em aberto** (decisão de UI da F1).

## Incidente de ambiente
O disco C: estava **100% cheio** (260 KB livres) quando as fontes de teste foram geradas; a primeira rodada do teste longo falhou com `No space left on device`. Apaguei apenas os arquivos temporários desta missão (~1 GB) e repeti com uma fonte menor (CRF 32). O disco continua com menos de 1 GB livre: **isso pode quebrar builds e exportações do usuário**, é um problema da máquina, não do código.
