# HAZE-VIDEO-001: Relatório da fase F4 (Storytelling)

Branch `feat/haze-video-f4` (a partir de `feat/haze-video-f3b`). Chrome 149 (suíte completa) e Edge (4 specs de F4: 4/4). Status: **F4 PARCIAL**.

## Escopo × resultado
| Item | Situação | Evidência |
|---|---|---|
| **Templates** | **7 modelos** (Documentário, Reportagem, Registro policial, Trailer de personagem, Divulgação de empresa, Cena de facção, Entrevista). Cada um define cenas (obrigatórias/opcionais), fusão entre cenas, entrada/saída graduais, preset de câmera por cena, limite de duração por cena (trailer) e textos de exemplo **entre colchetes** (`[NOME DO PERSONAGEM]`). Aplicar monta uma **timeline comum**: editável e **desfazível** | unit: 10 testes (catálogo, aplicação, cenas puladas, obrigatórias, cortes do trailer, chat em sequência, mídia curtíssima, ida e volta); navegador: Documentário e Registro policial exportados e medidos |
| **Fluxo guiado (Modo Simples)** | **Importar → Cortar → Texto → Visual → Exportar.** Vídeos importados entram sozinhos; cortar por campos início/fim, subir/descer/remover cena; título e chat linha a linha; visual (Original/Bodycam/CCTV/Noir), fusão entre cenas e entrada/saída graduais para todas as cenas; destino e exportar. Alterna com o Avançado e **lembra a escolha** | navegador: fluxo completo até o arquivo (854×480, 24 fps, duração 4,5 s, HUD de bodycam, < 10 MB) |
| **Presets Discord/fórum** | `Discord / chat (até 10 MB)` 854×480@24; `Fórum / leve (até 25 MB)` 1280×720@30; `Alta qualidade` 1080p30. O bitrate é calculado para **caber no tamanho** (90% do orçamento menos 96 kbps de áudio); se o vídeo for longo demais para o tamanho, **avisa e não exporta**; se o arquivo sair acima do alvo, **avisa** | navegador: vídeo de 3 min: **9,05 MB** no preset Discord (alvo 10 MB) contra **23,9 MB** no personalizado 480p24; unit do cálculo |
| **Montagem narrativa** | Atendida **pelos modelos** (ordem das cenas, fusões, textos de abertura/encerramento). **Não há** roteiro/storyboard, importação de roteiro nem biblioteca de cenas | — |
| **Textos editáveis** | Selecionar um texto (lista ou bloco da timeline) abre o editor: texto, início, duração, tamanho e cor. Editar o texto desfaz a entrada linha a linha | navegador (Documentário: troca do título e Desfazer em 2 passos) |

## Defeitos achados pelos testes durante a fase
1. O chat do **Registro policial** nascia no mesmo canto do HUD da bodycam e se sobrepunha a ele. Movido para baixo do HUD.
2. Com mídia curta (4 s) as 3 falas do chat ficavam fora do vídeo (a 3ª entrava depois do fim). Agora o intervalo entre falas se **aperta** (mínimo 0,5 s) para caberem todas; unit `T6_TPL_06b`.
3. Um teste existente do projeto (`T5_THEME_02`) reprovou uma classe de cor fora do tema (`text-emerald-300`); troquei pelo token do tema.
Dois testes meus também tinham expectativa errada (Desfazer exige 2 passos depois de editar texto; instante dentro da fusão) e foram corrigidos.

## Gates (HEAD da F4)
| Gate | Resultado |
|---|---|
| BUILD / TYPESCRIPT | OK / limpo. Chunk do Video Studio: 947 KB (252 KB gzip) |
| UNIT | **444/444** (+11) |
| E2E | **76 aprovados, 12 reprovados, 7 ignorados** (95). Os 12 reprovados são os mesmos que já falham na `main` limpa; os 7 ignorados são medições da F0 (`F0=1`) |
| MEDIA_VALIDATION | OK: documentário (duração 6,2 s, entrada/saída graduais, título), policial (HUD e chat), simples (dimensões, fps, duração, tamanho), preset Discord (tamanho) |
| REGRESSION | Nenhum teste que passava deixou de passar; o **Avançado continua o modo padrão**, então os specs anteriores seguem válidos |
| LICENSE_COMPLIANCE | Sem dependência nova |

## O que NÃO foi feito / limites
1. **Salvar os próprios modelos**: não dá para transformar uma montagem em modelo nem compartilhar um modelo. "Editável" vale para o **resultado** da aplicação, não para a definição do modelo.
2. Modelos **não foram testados com gravações reais de jogo**, só com vídeos sintéticos; os textos de exemplo são genéricos e em português. Uma cena = um vídeo (não há várias mídias por cena nem escolha de trecho; o corte fino fica no Avançado ou nos campos do Simples).
3. **Modo Simples é intencionalmente menor**: não tem timeline, sobreposição, keyframes, legendas SRT, velocidade, preset de câmera por cena nem reordenar por arrasto. O visual e a fusão valem para todas as cenas.
4. **O Avançado é o padrão** (decisão de compatibilidade com os testes e fluxos das fases anteriores). Se o produto quiser Simples como padrão, é uma mudança de uma linha, mas exige rever os specs.
5. **Presets de destino**: os limites de tamanho (10 MB e 25 MB) são metas **definidas por mim** como exemplos; as regras reais do Discord e de cada fórum mudam e **não foram verificadas**. Só formato horizontal. O bitrate é um **alvo**: uma medição (3 min) ficou 9,5% abaixo do alvo; conteúdo diferente pode variar, por isso há o aviso de "acima do alvo" (sem nova tentativa automática).
5b. Editor de texto sem posição (x, y) e sem arrastar no preview.
6. Firefox/Safari continuam sem teste; o Simples e os modelos só foram exercitados em Chrome e Edge.
