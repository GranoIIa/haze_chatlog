# HAZE-VIDEO-001: Relatório da prova de conceito

**Branch:** `poc/haze-video-001` (a partir de `origin/main` = `8bf7493`). **Ambiente:** Windows 11, Node 25.5, Chrome 149 (headless, instalado), ffmpeg/ffprobe 8.1.2 (validação externa). Só Chrome.
**Alternativa testada:** A (mediabunny + react-timeline-editor + modelo/compositor do Haze). **Alternativa B (FreeCut/OpenReel) não foi executada**; a análise dela é por leitura (ver pesquisa).

## Escopo mínimo pedido × resultado
| # | Requisito | Resultado | Evidência |
|---|---|---|---|
| 1 | Importar dois vídeos | Passou | `video-poc.spec` (2 MP4 H.264/AAC gerados com ffmpeg) |
| 2 | Visualizar | Passou (quadro no canvas via `CanvasSink`) | preview usa o mesmo `composeFrame` do export; verificado indiretamente pelo arquivo final |
| 3 | Adicionar à timeline | Passou | 2 `clip-block`, duração 0:07.00 |
| 4 | Reorganizar | **Parcial:** por botões passou; **por arrasto NÃO comprovado** | teste de arrasto marcado `fixme` (2 tentativas sem reordenar) |
| 5 | Cortar início e fim | Passou | entrada 1 s / saída 3 s → duração 5,00 s |
| 6 | Dividir | Passou | divisão em t=3,5 → 3 clipes |
| 7 | Visualizar a montagem | Passou | preview em tempo arbitrário; reprodução por `requestAnimationFrame` (sem áudio) |
| 8 | Áudio | Passou **na exportação** (mix por clipe com volume); **o preview não tem áudio** | frequências 877,5 / 437,5 / 880 Hz nos 3 trechos |
| 9 | Chatlog do Haze | Passou | `renderChatText` desenha o chat no export |
| 10 | Posicionar em intervalo | Passou | chat só entre 2 s e 4 s: desvio-padrão da região 0,0 / 63,0 / 0,0 (antes/durante/depois) |
| 11 | Exportar MP4 funcional | Passou | ffprobe: `mov,mp4`, h264 1280×720 30 fps 150 quadros; aac 48 kHz estéreo; duração 5,013 s |

## Critérios técnicos
| Critério | Resultado |
|---|---|
| Sincronização A/V demonstrável | A troca de imagem (azul→vermelho) e de tom (880→440 Hz) ocorrem em 1,52 s e 1,52 s (alvo 1,5 s; resolução do teste 20 ms de áudio / 40 ms de vídeo) |
| Duração final | 5,013 s para 5,00 s planejados (+1 quadro, dentro do ±1 quadro) |
| Frames na ordem | Cor por tempo confere: azul 0,5/1,3 · vermelho 1,7/3,3 · azul 3,7/4,8 |
| Resolução | 1280×720 exata |
| Reprodução fora do navegador | `ffmpeg -i saida.mp4 -f null -` sem nenhum erro de decodificação |
| Vazamentos | Nenhum **identificado**; heap JS ~107 a 123 MB ao fim de 60 s de 1080p. **Não** medi 5 exportações seguidas nem tendência de memória (precisa da F0) |
| Cancelamento | Passou: cancelar interrompe, não gera arquivo, libera o botão e uma nova exportação funciona |
| Falhas com mensagem | Passou: arquivo corrompido vira `Não foi possível ler "corrompido.mp4"…`; biblioteca e timeline continuam |
| MP4 de verdade | Sim: H.264 + AAC gerados pelo **WebCodecs do Chrome**, não só reprodução. O fallback WebM está no código mas **nunca foi exercitado** (Chrome tem H.264) |

## Desempenho (única medição, 1 máquina; usar como ordem de grandeza)
Fonte 1080p30 `testsrc2` (30 s) usada 2× = 60 s, saída 1080p30, MP4. **Duas versões do exportador:**

| Versão | Total | Decodificar | Desenhar | Codificar | Áudio | Razão |
|---|---:|---:|---:|---:|---:|---:|
| v1: mix de áudio com um nó Web Audio por pacote | 149,0 s | 1,5 s | 0,2 s | 49,7 s | **96,4 s** | 0,40× (mais lento que o tempo real) |
| v2: mix direto de PCM + decodificação na largura da saída | **38,3 s** | 1,4 s | 0,1 s | **35,6 s** | 0,4 s | **1,57×** (mais rápido que o tempo real) |

O gargalo da v1 era **meu código de áudio** (milhares de `AudioBufferSourceNode`), não a biblioteca. Na v2 o tempo é dominado pelo **encoder H.264** (≈ 50 quadros/s a 1080p neste computador, via WebCodecs); decodificar e compor custam quase nada. A v1 também ampliava quadros reduzidos a 1280 px para 1080p; a v2 decodifica na largura da saída. Uma montagem de 5 s em 720p exporta em ~1,8 s. **Não medi:** 4K, fontes longas (10 a 30 min), vários clipes de fontes diferentes, hardware mais fraco, outros navegadores, nem a aceleração por GPU do encoder.

## Achados que mudam o plano
1. **Reordenar por arrasto não funcionou** com a trilha sequencial: a lib desloca o bloco livremente e o modelo recalcula a posição; em duas tentativas o resultado não mudou a ordem. É o risco "timeline de terceiros" do ADR **se materializando**: na F1 será preciso um gesto de reordenação próprio (ou outra UI). A POC mantém botões Antes/Depois.
2. **Preview sem áudio**: precisa de Web Audio sincronizado com o relógio do vídeo (F1).
3. **Áudio mixado inteiro em memória** (~23 MB/min). Para vídeos longos precisa virar streaming (F1).
4. **Exportação na thread principal**: o `await` por quadro mantém a UI utilizável, mas o ideal é Worker + `OffscreenCanvas` (F0/F1).
5. **Tamanho do bundle**: Video Studio = 885 KB (233 KB gzip) em chunk separado (`React.lazy`); o `index` das outras abas fica em 394 KB (116 KB gzip) e não paga esse custo.
6. Reamostragem de áudio em 44,1 kHz funciona (teste: tom 440 Hz preservado, duração ok), por interpolação linear (suficiente para a POC; trocar por filtro melhor se houver queixa de qualidade).

## Como reproduzir
```
git checkout poc/haze-video-001 && npm ci
npm run test:e2e                                  # inclui tier 6 (modelo)
npx playwright test tests-e2e/video-poc.spec.ts tests-e2e/video-poc-extra.spec.ts   # exige ffmpeg/ffprobe no PATH
node docs/video-001/score-matrix.mjs              # matriz ponderada
```
