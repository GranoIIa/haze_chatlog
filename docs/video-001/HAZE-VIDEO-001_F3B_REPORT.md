# HAZE-VIDEO-001: Relatório F3b (multifaixa e keyframes)

Branch `feat/haze-video-f3b` (a partir de `feat/haze-video-f3`). Chrome 149 (suíte completa) e Edge (specs novos: 7/7). Status: **PARCIAL**. Entrega uma trilha de sobreposição com keyframes; **não** é um editor multifaixa genérico.

## O que foi feito
| Item | Situação | Evidência |
|---|---|---|
| **Trilha de sobreposição** (picture-in-picture) | Vídeos em posição livre no tempo, por cima do principal e por baixo dos textos. Adicionar pelo botão "Sobrepor" (a partir do cursor), arrastar e redimensionar o bloco na timeline (cortar entrada/saída), volume, remover. Até 50 camadas, empilhadas na ordem de criação | navegador: caixa azul de ~256×144 no canto só dentro do intervalo; resto do quadro continua o principal; arrasto do bloco muda o início |
| **Áudio das camadas** | Entra na mixagem da exportação e no preview, com o volume da camada | navegador: tom de 880 Hz só no intervalo da camada, tom do principal continua |
| **Keyframes** | Em cada camada: posição (x, y), escala e opacidade, **interpolação linear**; antes do primeiro e depois do último valem os extremos. Botão "Keyframe no cursor" grava os valores dos campos no instante do cursor; lista com remover | navegador: a caixa vai de x=0,25 a 0,75 e está no centro na metade do trajeto; opacidade 0→1 mostra mistura no meio; remover o último keyframe volta ao valor fixo |
| `.haze` | A timeline com camadas e keyframes vai e volta no projeto; mídias usadas só pela camada também ficam "a reconectar" | navegador: salvar → sessão nova → reconectar → keyframes presentes → exportação correta; unit |
| **Correção no preview** | O preview agora desenha **todas** as camadas ativas, inclusive o clipe de baixo durante uma transição (antes só desenhava o de cima, então a transição da F3 aparecia errada no preview) | — (corrigido sem teste de navegador próprio; o preview da camada tem) |

## Defeito encontrado pelos testes
Ao abrir um projeto cuja camada apontava para mídia ausente da lista, a camada **sobrevivia** sem aviso (o `spread` do objeto original sobrescrevia a lista filtrada). Corrigido em `videoProject.ts`; coberto por `T6_LAY_11`.

## Gates (HEAD da F3b)
| Gate | Resultado |
|---|---|
| BUILD / TYPESCRIPT | OK / limpo. Chunk do Video Studio: 924 KB (245 KB gzip) |
| UNIT | **433/433** (+11) |
| E2E | **70 aprovados, 12 reprovados, 7 ignorados** (89). Os 12 reprovados são os mesmos que já falham na `main` limpa; os 7 ignorados são medições da F0 (`F0=1`) |
| MEDIA_VALIDATION | OK: PiP, keyframes de posição e de opacidade, áudio da camada, projeto reaberto, validados no arquivo exportado com ffmpeg |
| PERFORMANCE | 1080p30, principal 20 s + camada 20 s: **6,5 s → 7,0 s** (+8%) com uma camada. **Não medi** várias camadas, nem camadas 4K |
| REGRESSION | Nenhum teste que passava deixou de passar (os 24 specs de vídeo anteriores seguem verdes) |
| LICENSE_COMPLIANCE | Sem dependência nova |

## O que NÃO foi feito (limites reais)
1. **Keyframes só nas camadas** e só nos 4 valores acima. Não há keyframes no vídeo principal, nos textos, no volume ou nos efeitos de câmera.
2. **Só interpolação linear** (sem easing, sem "segurar").
3. **Edição de keyframe por campos numéricos**: não há alças de arrasto no preview, nem losangos na timeline (o bloco só mostra a contagem ◆N), nem arrastar um keyframe no tempo. Para mudar um keyframe, grava-se outro no mesmo instante.
4. **Uma única trilha de sobreposição "plana"**: as camadas ficam na mesma linha da timeline (podem se sobrepor no tempo e se empilham pela ordem de criação); não há várias trilhas nomeadas, reordenar camadas, travar, silenciar ou ocultar uma trilha inteira.
5. As camadas **não têm** rotação, recorte, velocidade, fade, transição nem preset de câmera (esses recursos continuam só nos clipes da trilha principal).
6. **Sem múltiplas trilhas de ÁUDIO** (música, narração) nem ducking.
7. A duração total passa a ser o maior entre o fim do principal e o fim de qualquer camada; a trilha principal vazia com só camadas exporta, mas fundo preto.
8. Preview: cada tick decodifica um quadro por camada ativa nos decodificadores do preview; **desempenho com várias camadas não foi medido**. Firefox/Safari continuam sem teste.
