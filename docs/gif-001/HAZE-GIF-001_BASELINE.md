# HAZE-GIF-001 — Baseline (estado inicial)

**HEAD real inventariado:** `83b3c1c40b24a522bb259d3f0064b43ede9ea8ad` (branch `feat/batch-zip-persistence`, que contém `78eaeff`, o baseline citado no briefing, como ancestral).
**Branch de trabalho:** `feat/gif-hardening` (criada a partir desse HEAD). Nada foi enviado ao remoto nem mesclado na `main`.
**Ambiente das medições:** Chrome 149.0.7827.201 (headless, Windows 11), vídeo de teste gerado no próprio navegador (WebM 1280×720, ~4 s, conteúdo sintético: gradiente + retângulos animados + texto). Script: `scripts/gif-bench.mjs`; dados brutos: `bench-baseline.json`.

## Como o pipeline funcionava
1. `GifLabView.generateGif` posiciona o vídeo (`videoSeek.ts`), desenha o quadro num canvas, lê `getImageData` e **transfere o buffer** (zero-copy) ao worker.
2. `gifWorker.ts` codifica cada quadro na hora (paleta → índices → LZW) e acumula só o GIF final.
3. Não havia espera pelo worker: o thread principal enviava todos os quadros sem limite de fila.

## Medições do baseline (1280×720 de entrada, 3 s de clipe)
| Configuração | Tempo | GIF | Quadros | Duração real | Fila máx. | PSNR* |
|---|---|---|---|---|---|---|
| 480×270, 12 FPS | 5,0 s | 0,52 MB | 36 | **2,88 s** | 1–2 | 36,3 dB |
| 1280×720, 12 FPS | 5,0 s | 1,96 MB | 36 | **2,88 s** | 2 | 37,2 dB |
| 1920×1080, 12 FPS | 5,5 s | 3,38 MB | 36 | **2,88 s** | 2 | 36,2 dB |
| 1080×1080, 20 FPS | 8,6 s | 2,86 MB | 60 | 3,00 s | 2 | n/a (recorte) |

\* PSNR do quadro do meio do GIF contra o próprio vídeo desenhado no mesmo tamanho (só quando a proporção coincide). Conteúdo sintético suave: serve para **comparar antes/depois**, não como qualidade absoluta.
Pico de heap do thread principal (`performance.memory`): 25–43 MB. O heap do worker **não é mensurável** por esta via (limitação registrada).

## Achados (com evidência)
| # | Achado | Evidência | Gravidade |
|---|---|---|---|
| 1 | **Duração errada:** o atraso de cada quadro era arredondado (12 FPS → 8 cs). O GIF rodava ~4% mais rápido. | 36 quadros a 12 FPS deveriam durar 3,00 s e duravam 2,88 s (decodificador independente do Chrome). | Média |
| 2 | **Paleta não é NeuQuant:** eram 256 pixels amostrados em posições fixas; cores dominantes (texto) podiam ficar fora. | Leitura de `gifEncoder.ts` (`buildColormap`); PSNR ~36 dB. | Média |
| 3 | **Buffer de saída com crescimento linear** (+64 KB por vez): cada crescimento copia o buffer inteiro (custo quadrático em GIFs grandes). | Leitura de `DynamicUint8Buffer.ensureCapacity`. Não medido em GIF grande. | Baixa/Média |
| 4 | **Sem backpressure:** fila de quadros sem limite no worker. | Código. Nas medições a fila ficou ≤ 2 quadros (o worker acompanha o seek); o risco é teórico em máquinas lentas/quadros grandes (8 MB por quadro a 1080p). | Baixa (latente) |
| 5 | **Sem controle de cores nem de tamanho final:** impossível reduzir tamanho de forma previsível; nenhuma verificação de limite. | Código. | Alta p/ o objetivo Smart Export |
| 6 | **Estados soltos** (`selectedPreset`, `cropMode`, `outSize`, `fitMode`, `targetWidth`, `fps`, `speed`): escolher resolução personalizada zerava o preset sem aviso. | Código (`applyPreset`/`setOutSize`). | Média |
| 7 | **Banner 540 px** abaixo do mínimo 680×240 informado na Central de Ajuda do Discord. | Fonte oficial (ver DESIGN). | Baixa |

## O que já estava correto (não reimplementado)
- Seek tipado com retry e aborto claro (`videoSeek.ts`) — evidência: testes anteriores e este benchmark sem falhas de seek.
- Transferência zero-copy do buffer ao worker.
- `ABORT` no worker e `terminate()` no cancelamento.
- Sincronização de texto/estilo com o Editor RP (`chatStore`) — mantida.

## Limitações do baseline
Apenas Chrome; vídeo sintético (não clipes reais de jogo); sem medição de RAM do worker; tempos incluem a captura em tempo real do vídeo de teste só na preparação (não na conversão).
