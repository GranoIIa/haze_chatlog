# HAZE-GIF-001 — Decisões de projeto

## 1. Orçamento de processamento (`src/utils/gifBudget.ts`)
**Princípio:** bytes acumulados processados ≠ pico de RAM. O pipeline é em fluxo, então o pico depende do tamanho do quadro e dos quadros em trânsito; só o arquivo final cresce com a quantidade de quadros.

`pico ≈ (MAX_INFLIGHT + 1 leitura + 1 canvas + 1 camada do chat) × (w·h·4) + (w·h índices + 0,5 MB) + 2,5 × GIF estimado`

| Constante | Valor | Justificativa |
|---|---|---|
| `MAX_INFLIGHT` | 3 | Fila observada no benchmark: ≤ 2 (≤ 3 após o backpressure). 3 permite sobrepor captura e codificação sem crescer. |
| `SECONDS_PER_FRAME` | 0,14 s | Medido: ~5 s para 36 quadros (seek + desenho + codificação) neste ambiente. Varia com codec/máquina. |
| bytes/pixel-quadro | 0,132 × (px/(480·270))^-0,32 | Ajuste sobre 4 medições (480p, 720p, 1080p, 1080²) com o encoder novo; fator de cores medido: 128→0,93, 64→0,79, 32→0,60, 16→0,48 do tamanho a 256 cores (o modelo usa (log2(c)/8)^0,9). **É estimativa; o tamanho real é sempre medido.** |

**Limites (política do produto, não limites do navegador):**
| | pesado (pede confirmação) | bloqueado |
|---|---|---|
| Pico estimado | 300 MB | 1 GiB |
| Quadros | 600 | 3000 |
| GIF estimado | 50 MB | 300 MB |

São escolhas conservadoras para manter a aba bem abaixo do que desktops comuns toleram; **não foram validadas em dispositivos fracos** (ver FINAL_REVIEW). Proteção em tempo de execução independente da estimativa: o worker interrompe se o GIF passar de 400 MB.

## 2. Pipeline (`gifExport.ts`)
- Backpressure por confirmação: o worker responde `PROGRESS` (com `bytes`) por quadro codificado; a captura só envia se `enviados − codificados < 3`.
- Cancelamento: `AbortSignal` → `worker.terminate()` + canvases zerados; resultado tipado `done | aborted | too-large`.
- `maxBytes`: o worker devolve `ERROR code=OUTPUT_LIMIT` assim que o arquivo passa do limite (economiza tempo no Smart Export).
- Atrasos acumulados (`gifDelaysCs`): a soma acompanha o tempo real; mínimo 2 cs.

## 3. Encoder
- Paleta por quadro via **median-cut** sobre histograma RGB555 (`gifPalette.ts`), com `colors` 2–256 (tabela local de 2^bits, código LZW mínimo = bits).
- Buffer de saída com crescimento ×1,5.
- Não implementado: dithering e quadros diferenciais (candidatos a redução de tamanho; ver pendências).

## 4. Modelo único de configurações (`gifSettings.ts`)
`GifSettings = { profile, quality, frame (width+crop | size+fit), fps, speed, colors, tweaked }`.
- Escolher perfil aplica enquadramento/FPS/cores do nível atual.
- Ajuste manual muda só o valor pedido, mantém o perfil e o alvo e marca "ajustado" (resolve o item 6 do baseline).
- "Personalizado" não impõe valores nem alvo.
- O preview e a exportação usam a mesma geometria (`computeGifFrame`); exceção documentada: "Contain + desfoque" é mostrado como Contain no preview (o desfoque só aparece no arquivo).

## 5. Perfis e limites de plataforma (verificados em 2026-11-11; podem mudar)
| Perfil | Alvo | Fonte |
|---|---|---|
| Discord Emoji | 256 KiB | https://docs.discord.com/developers/resources/emoji |
| Discord Avatar | 10 MB (orientação; avatar por servidor: 8 MB) | https://discord.com/blog/discord-profile-tips-from-design-professionals · Central de Ajuda |
| Discord Banner | 10 MB, mínimo 680×240 | https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles |
| RP Forum | sem alvo (cada fórum define o seu) | — |

Divergência registrada: o blog do Discord cita mínimo 600×240 para banner e a Central de Ajuda, 680×240; adotei 680. Avatar: o limite de 10 MB vem de orientação de design, não de documentação de API. Estes valores são **dados** em `GIF_PROFILES`, com fonte e data.

## 6. Smart Export
Escada de redução por nível (cada passo mais leve, respeitando pisos): Qualidade (cores ≥128, escala ≥90%, FPS ≥10) · Equilibrado (≥64, ≥75%, ≥8) · Compacto (≥32, ≥50%, ≥6). Máx. 6 tentativas; cada tentativa re-captura o vídeo (sem cache de quadros). Se a escada acabar sem alcançar o alvo, a última tentativa gera o arquivo **sem limite** e o app informa o tamanho medido e que o alvo não foi cumprido.
