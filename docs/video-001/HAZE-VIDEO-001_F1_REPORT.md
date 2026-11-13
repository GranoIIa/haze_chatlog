# HAZE-VIDEO-001: Relatório da fase F1 (Core)

Branch `feat/haze-video-f1` (a partir de `poc/haze-video-001`). Mesma máquina e navegadores da F0 (Chrome 149; só ele nos testes de F1). Status: **F1 PARCIAL**. O núcleo funciona e está testado; ficam lacunas listadas abaixo.

## Escopo da F1 × resultado
| Item do roadmap | Resultado | Evidência |
|---|---|---|
| Biblioteca de mídia (na sessão) | Feito (lista, metadados, adicionar à timeline) | `video-poc.spec` |
| Miniaturas | Feito, **só o 1º quadro do trecho** de cada clipe | `video-f1.spec` (zoom + miniatura) |
| Preview **com áudio** | Feito: o relógio de reprodução é o do `AudioContext`, então imagem e som andam juntos por construção | `video-f1.spec`: relógio avança, trechos agendados, pausa e fim automático. **Não verifiquei por ouvido nem por captura se o som sai alinhado à imagem**; o teste prova o agendamento, não a audição |
| Cursor e zoom | Zoom por controle deslizante (60 a 400); cursor por clique na régua e campo "ir para" | `video-f1.spec` |
| Cortar, dividir, reordenar | Cortar (campos ou bordas do bloco), dividir no cursor, reordenar por **botões e por arrasto próprio** (a lib não reordena trilha sequencial; o gesto passou a ser nosso) | `video-poc-extra.spec` (arrasto passou; era o item aberto da POC) |
| Volume e mudo | Volume por clipe e botão Silenciar (ícone no bloco). **Não há** fade nem ducking (F3) | `video-f1.spec`: clipe mudo fica em silêncio (RMS < 30), o outro continua audível |
| Exportar com progresso e cancelamento | Mantido da POC; cancelamento revalidado | `video-poc.spec` |
| **Mix de áudio em streaming** | Feito: janelas de 0,5 s, memória limitada; trecho sem áudio vira silêncio | Teste com A (440 Hz) + vídeo sem áudio + B (880 Hz): tons nos lugares certos, silêncio no buraco, duração 8 s |
| Erros e limites | Feito (4 GiB/arquivo, 3 h/vídeo, 2 h de montagem; mix em memória deixou de ser limite) | 2 testes unitários + `video-poc.spec` |
| Exportar em Worker | **Removido do escopo** na F0 (a página segue responsiva) | F0_REPORT |

## Medições (uma máquina, fontes sintéticas)
| Medida | F0 | F1 |
|---|---|---|
| 60 s de 1080p → 1080p30 | 38,3 s (1,57×) | **28,7 s (2,09×)** |
| 10 min 1080p → 720p30 | 247 s (2,43×); pico de heap JS 618 MB | **129,6 s (4,63×); pico 303 MB** |
| Memória em 5 exportações (heap JS, MB) | 10, 35, 39, 39, 37, 38 | 11, 22, 32, 33, 33, 31 (estável) |

A queda de memória (≈ 315 MB) é explicada pelo áudio em fluxo. **O ganho de tempo não devo atribuir só à mudança**: as duas rodadas não foram feitas em condições controladas (a máquina pode ter tido carga diferente), então trato como "não piorou e provavelmente melhorou".

## Gates (HEAD da F1)
| Gate | Resultado |
|---|---|
| BUILD / TYPESCRIPT | OK / limpo. Chunk do Video Studio: 892 KB (235 KB gzip) |
| UNIT | **401/401** (inclui tier 6: modelo e limites) |
| E2E (Playwright) | **54 aprovados, 12 reprovados, 4 ignorados** (70 testes). Os 12 reprovados são os mesmos que já falham na `main` limpa (ver QA_REPORT); os 4 ignorados são as medições da F0, que só rodam com `F0=1` |
| MEDIA_VALIDATION | OK em MP4/Chrome: cor, tom, duração, resolução, sincronia (troca de imagem e de tom em 1,52 s e 1,52 s), 44,1 kHz, trecho sem áudio, clipe mudo |
| PERFORMANCE | Medido (tabela). **Meta aprovada na F0 (≥ 1× em 1080p30) atendida** em 1080p; **4K de entrada ainda não** (0,52×, medido na F0, não repetido na F1) |
| REGRESSION | Nenhum teste que passava na `main` deixou de passar |
| LICENSE_COMPLIANCE | Sem dependência nova na F1 |

## Lacunas conhecidas (viram trabalho da F1.1 ou F2)
1. **Áudio do preview não verificado de ouvido**; sem teste automático de alinhamento imagem/som no preview.
2. Preview a partir de **vários clipes com áudio de taxas diferentes** não foi testado; seek durante a reprodução pausa em vez de continuar.
3. **Sem snap, sem atalhos de teclado, sem toque/acessibilidade** na timeline; o gesto de arrasto é só por mouse/ponteiro e não tem alternativa de teclado além dos botões.
4. Miniatura é estática (1 quadro); sem faixa de quadros nem forma de onda.
5. Biblioteca vive só na sessão (recarregar a página perde as mídias); persistência fica com o `.haze` da F2.
6. Só Chrome (e Edge na F0); Firefox/Safari não testados.
7. Cancelamento e memória medidos só pelo heap JS, não pela memória nativa do processo.
8. 4K de entrada continua abaixo do tempo real.
