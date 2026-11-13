# HAZE-VIDEO-001: Relatório da fase F2 (Integração RP)

Branch `feat/haze-video-f2` (a partir de `feat/haze-video-f1`). Chrome 149 (testes completos) e Edge (F1+F2: 9/9). Status: **F2 PARCIAL**.

## Escopo × resultado
| Item | Resultado | Evidência |
|---|---|---|
| **Chat com estilo do Editor RP** | O chat usa o mesmo `renderChatText`/`parseChatLine` (cores, `/me`, tom baixo). **Novo:** as linhas podem **entrar uma a uma** (campo "uma linha a cada (s)") | unit `T6_F2_04`; navegador: 2ª e 3ª linha entram nos instantes certos no arquivo exportado |
| **Texto livre** (título/legenda) | Feito: texto com contorno e cor escolhida, em intervalo definido | navegador: pixels vermelhos só dentro da janela (antes/durante/depois) |
| **Presets de câmera por clipe** | Bodycam, CCTV e Noir, usando **as mesmas funções** do Editor RP (`applyFilmEffects`, `drawCameraOverlay`). O **relógio do HUD avança com o vídeo** (data/hora iniciais editáveis; vira o dia à meia-noite) | navegador: HUD presente só no clipe com preset, relógio muda entre 0,5 s e 2,5 s e fica igual dentro do mesmo segundo; unit `T6_F2_02` |
| **Overlays** | Chat e texto livre são overlays em tempo absoluto (podem se sobrepor), com arrasto e redimensionamento pela lib | F1/F2 specs |
| **Projeto `.haze` com vídeo** | Feito (ver abaixo) | unit `T6_F2_06 a 09`; navegador: salvar → sessão nova → abrir → reconectar → exportar |
| **Reimport de mídia** | Mídias do projeto ficam **offline** (clipe marcado "(offline)"); reconecta-se importando os mesmos arquivos (nome + tamanho + duração ±50 ms); **exportar é bloqueado** com mensagem até reconectar tudo | navegador |
| Dashcam, Weazel News, FLIR | **Não feito**: o Editor RP só tem Bodycam, CCTV e Noir; os outros três não existem como preset no código atual | `utils/cameraFx.ts` |

## Formato `.haze` v2 (compatibilidade)
- `PROJECT_SCHEMA_VERSION` passou de 1 para **2** (versão máxima que o app abre). Projetos de **cena (Editor RP) continuam sendo gravados como v1** (`SCENE_SCHEMA_VERSION = 1`), então versões antigas do app seguem abrindo-os. Mudei **um** teste existente (`T5_PROJ_05`) para comparar com `SCENE_SCHEMA_VERSION`, porque a constante que ele lia passou a significar "máximo aceito".
- Projeto de vídeo = ZIP com `manifest.json` `{ format:'haze-project', schemaVersion:2, kind:'video', video:{ timeline, media } }`. **Sem os vídeos dentro** (o arquivo de teste tem menos de 20 KB). `media` guarda nome, tamanho, duração, dimensões e se tem áudio.
- Abrir um projeto de vídeo no **Editor RP** dá `Este é um projeto do Video Studio. Abra-o na aba Video Studio.`; abrir um projeto de cena no Video Studio dá `Este é um projeto do Editor RP… Abra-o na aba Editor RP.` Versão futura (3+) é recusada com mensagem; manifesto, tamanho e campos são tratados como não confiáveis (`sanitizeTimeline`, limites).
- Os campos novos da timeline (`camera`, `kind`, `color`, `lineOffsets`) são opcionais: **timelines da POC/F1 continuam válidas** (testado em `T6_F2_05`).
- **Não migrei nada de v1 para v2**: o que existe é compatibilidade (v1 de cena segue v1). Não há ainda um projeto único que contenha foto+chat **e** vídeo.

## Desempenho do preset
Fonte 1080p, 20 s, saída 1080p30: **18,6 s sem preset → 21,7 s com CCTV** (+17%; o tempo de desenho foi de 0,1 s para 0,7 s e o de codificação subiu junto). O CCTV é o preset mais pesado (P&B + realce + vinheta + granulado). Com CCTV, essa montagem exporta em 0,92× o tempo real, **abaixo da meta de 1× da F0 em 1080p30** nesta máquina e com esta fonte (a linha de base desta mesma fonte já foi só 1,07×; a medição de 2,09× da F1 usou outra fonte). Os efeitos criam um canvas temporário por quadro: otimizar (reaproveitar canvas) é trabalho da F3.

## Gates (HEAD da F2)
| Gate | Resultado |
|---|---|
| BUILD / TYPESCRIPT | OK / limpo. Chunk do Video Studio: 905 KB (239 KB gzip) |
| UNIT | **410/410** (+9 novos: câmera, relógio, linha a linha, sanitização, projeto ida e volta, compatibilidade, hostil, reconexão) |
| E2E | **58 aprovados, 12 reprovados, 5 ignorados** (75). Os 12 reprovados são os mesmos que já falham na `main` limpa; os 5 ignorados são medições da F0 (`F0=1`) |
| MEDIA_VALIDATION | OK: HUD, relógio, texto, linhas em sequência e projeto reaberto validados no arquivo exportado (ffmpeg) |
| REGRESSION | Nenhum teste que passava na `main` deixou de passar. **Ressalva:** 4 dos 12 testes que já falham na `main` são exatamente os de abrir/salvar projeto `.haze` do Editor RP (`project-batch.spec`), então **a abertura de projetos de cena v1 não pôde ser reconfirmada no navegador**; ela está coberta pelos testes unitários de `projectFile` (todos aprovados, incluindo leitura de v1 e rejeição de versão futura) |
| LICENSE_COMPLIANCE | Sem dependência nova na F2 (usa `jszip`, já existente) |

## Lacunas conhecidas
1. **Paridade com o Editor RP só por construção** (mesmas funções); **não comparei** pixels do Video Studio com a exportação do Editor RP.
2. Presets **Dashcam, Weazel News e FLIR** não existem no app; Weazel/Noir "cinematográfico" além do Noir atual exigiria criar o HUD (decisão de produto).
3. Chat **sem personagens/nomes coloridos por personagem** (o Editor RP colore por tipo de linha; a lista de personagens não foi levada ao vídeo) e sem editar o estilo (fonte, fundo, contorno) por overlay.
4. Preset aplicado por **clipe**, não por trecho de timeline; sem ajuste de intensidade.
5. Projeto de vídeo e projeto de cena são **arquivos separados**; não há "enviar quadro do vídeo para o Editor RP" nem abrir projeto de cena como camada do vídeo.
6. Reconexão por nome+tamanho: renomear o arquivo exige tratar como mídia nova.
7. Firefox/Safari continuam sem teste; cancelamento/memória só pelo heap JS.
