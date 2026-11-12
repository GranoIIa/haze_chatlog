# HAZE-UX-002 — Decisões de projeto

## Detecção de personagens (fase A)
- **Duas etapas separadas** em `src/utils/chatDetect.ts`: `extractSpeaker` isola o nome (regra por perfil); `classify` decide a confiança (`sure` ou `review`). Cor/tipo da linha continua em `parseChatLine` (inalterado).
- **Só existe nome quando há verbo de fala antes do `:`** (`diz/grita/sussurra/fala`, `says/shouts/whispers/yells/screams`). Texto qualquer antes de `:` nunca vira nome. A regra olha só o início da linha (120 caracteres): custo previsível em logs grandes.
- **Rejeitados sempre:** sistema/servidor/admin/staff/aviso/OOC/você/you…, nomes com mais de 40 caracteres ou 5 palavras, sem letras, com `:()[]{}<>|\/`, e linhas que começam por `/me /do /ooc … * > $ ! # ((`.
- **Confiança:** *inequívoco* = palavras iniciadas por maiúscula, só letras/hífen/apóstrofo/ponto (partículas "de/da/von…" permitidas). *Revisão* = contém número, começa com minúscula, TUDO EM MAIÚSCULAS ou é genérico ("Desconhecido", "Central", "Policial"…).
- **Perfis:** Automático (PT+EN), FiveM PT-BR, GTA World EN, Personalizado. O personalizado aceita **só uma lista de verbos** (letras, até 12), nunca regex do usuário. É opcional, fica num `<details>` ("Formato do chat") e persiste em `localStorage` (`haze-import-profile-v1`).
- **Fluxo:** colar → inequívocos entram sozinhos (nota + botão **Desfazer detecção**); ambíguos aparecem numa lista discreta com nome editável, *Adicionar*, *Ignorar* e *Adicionar todos*. A lista só aparece quando há ambiguidade, então nada atrasa o fluxo simples. Nomes ignorados ou corrigidos não são perguntados de novo.
- Estado em `useCharacterDetection` (hook), deixando `ChatLogView` quase intocado.
- **API anterior preservada:** `detectSpeakers` e `newCharactersFor` continuam exportadas.

## Miniaturas (fases B/C)
- **Fidelidade:** mesma ordem do preview (enquadramento → ajuste de cor → efeitos de filme → escurecimento → luz → HUD da câmera), no **enquadramento e proporção do quadro de saída**. Diferenças aceitas: resolução de 480 px; HUD da bodycam sem o nome do oficial; sem camadas nem chat (não fazem parte do visual).
- **Identidade/versão:** chave = foto + saída + modo + pan + zoom + escurecimento. O hook só devolve miniaturas da chave atual (nunca de foto antiga) e cancela a tarefa anterior.
- **Desempenho:** a foto grande é reduzida **uma vez** para uma base do tamanho da miniatura; cada visual parte da base; geração **incremental** (uma por tarefa ociosa, `requestIdleCallback` com fallback `setTimeout`); cache LRU de 4 conjuntos (só Data URLs); foto grande e canvases liberados ao terminar; falha de um visual não derruba os outros.
- **Não implementado (justificado):** Web Worker, OffscreenCanvas e `createImageBitmap`. A geração total leva 145–224 ms nas medições (ver QA_REPORT) e a tarefa longa de ~1,4 s a 4K ocorre ao carregar a própria foto, igual no baseline. Um Worker não resolveria isso e aumentaria a complexidade.
- **Pré-visualização temporária ao passar o mouse:** *avaliada e não implementada.* Exigiria sobrescrever o estado de renderização do preview por hover/foco, com risco de vazar para exportação e histórico. Mitigação: a miniatura já mostra o efeito sobre a foto atual, aplicar é um clique e **Ctrl+Z desfaz**; o painel informa o que um visual substitui (câmera, luz e retoque de cor; texto, personagens, camadas e foto não mudam).
- **Visual ativo derivado do estado** (`inferVisual`): vale ao abrir projeto, desfazer e editar no Avançado (combinação personalizada = nenhum botão marcado).

## UX (fase D)
Linha de progresso ("Falta: uma foto e o chat" / "Tudo pronto"), selo de estado em cada passo, estados de carregamento e de erro das miniaturas, resumo do que será exportado (formato, dimensões e visual), foco visível por teclado e rótulos acessíveis nos controles de revisão.
