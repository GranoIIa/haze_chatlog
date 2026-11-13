# HAZE-VIDEO-001: Design do produto (GDD)

## Visão
Video Studio é a terceira aba do Haze RP Studio: **montar um vídeo de Roleplay sem sair do navegador e sem enviar arquivos para ninguém**. Não é um clone de editor genérico. O diferencial é o que o Haze já sabe fazer: chat de servidor desenhado com a aparência do GTA, presets de câmera (Bodycam, CCTV, Noir), e projetos editáveis. Ferramenta narrativa neutra, para qualquer comunidade RP.

## Quem usa e para quê
| Perfil | Exemplo | O que precisa |
|---|---|---|
| Policial | Compilar bodycams com data/unidade e diálogo | Cortar, juntar, chat sincronizado, preset Bodycam |
| Jornalista | Reportagem Weazel News | Manchete e rodapé, transições, entrevista |
| Civil/empresa | Anúncio imobiliário, vídeo promocional | Texto, música, exportar para fórum/Discord |
| Facção/grupo | Trailer, documentário, cena | Montagem narrativa, chat sobre as cenas |

## Layout (aba **Editor RP | GIF Lab | Video Studio**)
- **Esquerda:** biblioteca (mídia, texto/chat, presets, efeitos, transições, áudio, legendas; na POC: mídia e chat).
- **Centro:** preview com controles (reproduzir, quadro a quadro, ir para o tempo), proporção da saída.
- **Direita:** inspetor (propriedades do clipe, volume, transformação; keyframes depois) e exportar.
- **Baixo:** timeline (régua, trilhas, playhead, zoom, seleção, dividir, mover, waveform depois).
Mesmo design system `haze-*`; nada de copiar a identidade de outros editores.

## Dois modos
- **Simples (guiado):** Importar → Cortar → Adicionar texto → Escolher visual → Exportar. Uma trilha, sem jargão, visual por preset.
- **Avançado:** timeline multifaixa, sobreposição, keyframes, velocidade, áudio avançado.
Regra: **não mostrar controle que ainda não funciona**. Cada fase só libera o que está testado.

## Recursos de RP
- **Chat sincronizado:** linhas com tempo, duração, posição e estilo; mesmo texto do Editor RP (`/me`, `(baixo)`, cores). Exemplo: 00:02 "Ramon Mendoza diz: Precisamos conversar." / 00:05 "/me retira o celular do bolso." / 00:08 "Hector Alvarez diz (baixo): Entendi."
- **Presets visuais por clipe:** Bodycam, CCTV, Dashcam, Weazel News, FLIR, Noir, efeitos de filme (reuso de `cameraFx`).
- **Templates editáveis e não destrutivos:** documentário, reportagem, registro policial, trailer de personagem, divulgação de empresa, cena de facção, entrevista.

## O que a POC entrega hoje (e só isso)
Importar vídeos MP4 (e o que o navegador decodificar), biblioteca, uma trilha sequencial, cortar (entrada/saída), dividir no cursor, reordenar (botões; o arrasto na timeline tem teste próprio, ver QA), volume por clipe, chat por intervalo, desfazer/refazer, preview, exportar **MP4 H.264+AAC** (ou WebM), cancelar, mensagens de erro em PT-BR. **Não há:** áudio no preview, miniaturas, forma de onda, texto livre, presets de câmera no vídeo, `.haze`, multifaixa, transições, keyframes, legendas, modo Simples.

## Requisitos não funcionais
Processamento local; nenhum upload; arquivos longos não são carregados inteiros em memória (decodificação por iteração); cancelamento sempre disponível; falha de arquivo não derruba a sessão; GIF Lab, Editor RP e `.haze` v1 **sem regressão**.
