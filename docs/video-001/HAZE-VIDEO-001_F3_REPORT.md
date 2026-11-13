# HAZE-VIDEO-001: Relatório da fase F3 (Avançado)

Branch `feat/haze-video-f3` (a partir de `feat/haze-video-f2`). Chrome 149 (suíte completa) e Edge (specs da F3: 5/5). Status: **F3 PARCIAL, cerca de metade do escopo do roadmap**. Escolhi o subconjunto de maior valor e menor risco arquitetural; o resto está listado como **não feito**.

## Feito × não feito
| Item do roadmap | Situação | Evidência |
|---|---|---|
| **Transições** | **Feito**: fusão (crossfade) entre clipes consecutivos, 0 a 5 s, limitada à metade do clipe mais curto. Funde **imagem e som**. Cada camada mantém seu preset de câmera | navegador: só vermelho em 1,5 s, mistura em 3,5 s, só azul em 5 s; os dois tons presentes durante a fusão; duração 6 s para 7 s de clipes |
| **Controle de velocidade** | **Feito**: 0,25× a 4× por clipe. **Muda o tom** (sem esticar o tempo) | navegador: 2× → clipe dura metade e 440 Hz vira 880 Hz |
| **Áudio: fade** | **Feito**: entrada/saída graduais por clipe (imagem vem do preto, som sobe) | navegador: 0,05 s quase preto, 0,5 s no meio da rampa, 2 s pleno; RMS do som cai nas pontas |
| **Áudio: forma de onda** | **Feito**: picos por mídia (1200 colunas, decodificação em fluxo, pulada acima de 30 min) desenhados no bloco do clipe, só do trecho visível | navegador: canvas com pixels; unit `sliceBars` |
| **Legendas (SRT)** | **Feito**: importa `.srt` (BOM, CRLF, tags, ponto ou vírgula nos ms), vira texto centralizado embaixo no tempo do arquivo; blocos inválidos são ignorados e avisados; limite de 5000 falas e 2 MB | navegador: cada fala só no seu intervalo; unit `parseSrt` incluindo entradas hostis |
| **Snap** | **Parcial**: o texto/chat gruda nas bordas de clipes e de outros textos (até 0,12 s) ao ser arrastado. A lógica é pura e testada; **o gesto de arrastar com snap não foi testado no navegador**. Clipes de vídeo não precisam de snap (trilha sequencial) | unit `T6_F3_08` |
| **Keyframes** | **NÃO feito** | |
| **Multifaixa com sobreposição** (várias trilhas de vídeo, picture-in-picture) | **NÃO feito**. A única sobreposição é a das transições na trilha principal | |
| **Áudio avançado: ducking** (baixar música sob a fala) | **NÃO feito**; também não há trilha de áudio/música separada | |

## O que mudou por baixo
- `clipDuration` agora é `(saída − entrada) / velocidade`; `locate`, divisão e corte passaram a respeitar a velocidade (a divisão distribui entrada gradual e transição para a 1ª metade e a saída gradual para a 2ª).
- `layout` calcula sobreposições; `activeLayers(t)` devolve 1 ou 2 camadas com opacidade. O compositor (usado pelo preview e pela exportação) desenha camadas; com duas camadas, cada uma passa por um canvas auxiliar para o preset de uma não afetar a outra.
- Exportação: um decodificador **por clipe** e passo fixo por quadro de saída; o áudio em janelas só é entregue quando nenhum clipe futuro pode escrever nela (a transição faz o clipe seguinte começar antes).
- O áudio do preview ganhou um ganho por clipe com rampas (fade/transição) e `playbackRate` (velocidade).
- Formato: campos novos opcionais na timeline (`speed`, `fadeIn`, `fadeOut`, `transition`, `align`); timelines antigas seguem válidas e o projeto `.haze` guarda tudo (ida e volta testada).

## Desempenho (máquina com muita variação entre rodadas)
- Transição 1080p30: **sem custo mensurável** (2 × 20 s: 10,5 s em corte seco vs 10,0 s com fusão de 2 s).
- O mesmo teste "60 s de 1080p → 1080p30" deu 38,3 s (F0), 28,7 s (F1) e **19,1 s** nesta fase, **sem mudança de código que explique isso**: a máquina varia muito entre rodadas (carga de fundo). **Não tomar esses tempos como ganho entre versões**; só a comparação dentro da mesma rodada vale.

## Gates (HEAD da F3)
| Gate | Resultado |
|---|---|
| BUILD / TYPESCRIPT | OK / limpo. Chunk do Video Studio: 914 KB (243 KB gzip) |
| UNIT | **422/422** (+12 novos) |
| E2E | **63 aprovados, 12 reprovados, 6 ignorados** (81). Os 12 reprovados são os mesmos que já falham na `main` limpa; os 6 ignorados são medições da F0 (`F0=1`) |
| MEDIA_VALIDATION | OK: transição, velocidade, fades e legendas validados no arquivo exportado (ffmpeg: cor por tempo, energia de frequência por Goertzel, RMS, duração) |
| REGRESSION | Nenhum teste que passava deixou de passar; os 16 specs de vídeo das fases anteriores seguem verdes depois da refatoração do exportador |
| LICENSE_COMPLIANCE | Sem dependência nova na F3 |

## Lacunas e riscos
1. **Velocidade muda o tom** (sem time-stretch); para fala isso soa estranho em velocidades extremas. Esticar o tempo sem mudar o tom exigiria um algoritmo próprio (WSOLA/phase vocoder) ou biblioteca.
2. **Preview do áudio com velocidade/transição foi verificado só por agendamento** (testes mostram "trechos agendados"); **não verifiquei de ouvido**. O `duration` do `AudioBufferSourceNode.start` com `playbackRate ≠ 1` está em tempo de mídia pela especificação, mas não foi comprovado por medição.
3. Transição limitada a fusão (sem cortes em wipe/slide/zoom) e só entre clipes **vizinhos** na trilha; mudar a ordem recalcula as sobreposições.
4. A transição exige que o clipe seguinte tenha duração suficiente; com clipes muito curtos a fusão é reduzida automaticamente (sem aviso na tela).
5. Legendas: texto simples centralizado; sem estilo por fala, sem posicionamento, sem importar `.vtt`/`.ass`.
6. Forma de onda calculada com decodificação completa do áudio (1 vez por mídia); para mídias longas (até 30 min) pode levar segundos em segundo plano; **não medi o tempo**.
7. Snap de texto sem teste de gesto no navegador. Firefox/Safari seguem sem teste.
