# HAZE-VIDEO-001: Design técnico (TDD)

## Módulos (`src/video/`, isolados; só `VideoStudioView` toca React)
| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `timeline.ts` | Modelo não destrutivo, operações imutáveis, validação, `sanitizeTimeline`, histórico | nada (puro) |
| `mediaIO.ts` | `openMedia(File)`: `Input`+`BlobSource`, `CanvasSink` (máx. 1280 px), `AudioBufferSink`, erros em PT-BR | mediabunny |
| `compositor.ts` | `composeFrame(ctx,W,H,frame,timeline,t)`: letterbox + chats ativos via `renderChatText` | chatRenderer |
| `exporter.ts` | `exportTimeline`: escolhe MP4/WebM, mixa áudio, decodifica→compõe→codifica quadro a quadro, cancelamento | mediabunny, compositor |
| `components/VideoStudio/VideoStudioView.tsx` | UI: biblioteca, preview, timeline (react-timeline-editor), inspetor, exportar | tudo acima |

## Modelo
`Timeline { version: 1, clips: Clip[], overlays: ChatOverlay[] }`.
`Clip { id, mediaId, inPoint, outPoint, volume }` (duração = `outPoint - inPoint`; pontos **dentro da mídia original**; a mídia nunca é alterada). Trilha de vídeo **sequencial**: a posição vem da ordem (`layout`), então cortar/reordenar nunca deixa buraco nem sobreposição. `ChatOverlay { id, start, duration, text, x, y, fontSize }` em tempo absoluto, podem sobrepor-se.
Constantes: `MIN_CLIP = 0,1 s`, precisão 1 ms (`round3`), histórico de 100 passos. Operações: `addClip`, `trimClip` (limita à mídia e a `MIN_CLIP`, ignora NaN), `splitAt` (ignora a menos de `MIN_CLIP` da borda), `moveClip`, `removeClip`, `setClipVolume`, `add/update/removeOverlay`, `locate(t)`, `validate(tl, mídias)`, `sanitizeTimeline(raw)` (nunca lança, descarta inválidos, limites de 500 itens).

## Pipeline de exportação
1. Valida timeline e escolhe formato: MP4 (`avc`+`aac`) se `getFirstEncodableVideoCodec/AudioCodec` confirmar; senão WebM (`vp9`/`vp8` + `opus`); senão erro claro.
2. **Áudio:** `OfflineAudioContext` estéreo 48 kHz; cada buffer decodificado (`AudioBufferSink.buffers(in,out)`) vira um `AudioBufferSourceNode` com `start(when, offset, duration)` e ganho do clipe. O mix é enviado ao encoder em blocos de ~0,5 s, **intercalado** com os quadros (evita o muxer acumular uma trilha inteira esperando a outra).
3. **Vídeo:** para cada clipe, `CanvasSink.canvasesAtTimestamps(gerador)` (decodifica cada pacote uma vez, memória limitada) → `composeFrame` num `OffscreenCanvas` → `CanvasSource.add(t, 1/fps)` com `await` (contrapressão do encoder). Quadros: `ceil(duração × fps)`.
4. Cancelamento: `AbortSignal` checado por quadro e durante o mix → `output.cancel()` → `ExportCancelled`. Qualquer falha vira `ExportError` com mensagem; o `finally` não deixa o `Output` aberto.
5. Preview usa o mesmo `composeFrame` com `getCanvas(tempo)`; um contador de sequência descarta quadros atrasados.

## Limitações conhecidas da POC (viram requisitos de produção)
- **O áudio inteiro é mixado em memória** antes de codificar (≈ 23 MB por minuto estéreo 48 kHz em Float32). Aceitável para minutos; para vídeos longos o mix deve virar streaming por janelas.
- Uma só trilha de vídeo; sem sobreposição de vídeo, transições, keyframes, velocidade, efeitos por clipe, texto livre, legendas.
- Preview sem áudio. Sem miniaturas nem forma de onda.
- Escala ajusta por "contain" (faixas pretas); rotação do vídeo (metadado) não tratada.
- Exportação roda na thread principal (o `await` por quadro mantém a UI responsiva, mas não é Worker). Em produção: Worker + `OffscreenCanvas`.

## Integração com `.haze` (proposta, **não implementada**)
- `PROJECT_SCHEMA_VERSION` 1 → 2. Novo bloco opcional `video: Timeline` + `videoMedia: [{id,name,size,duration,width,height,fingerprint}]`.
- **Vídeos não vão dentro do ZIP** (tamanho). O projeto guarda metadados; ao abrir, o app pede para **reimportar** os arquivos e casa por nome+tamanho+duração (fingerprint). Mídia ausente = clipe marcado como "offline", nunca perda silenciosa.
- Migração 1→2 = acrescentar `video` vazio. Arquivos v2 em app v1: `parseProjectFile` já rejeita versão desconhecida com mensagem; ajustar para ignorar `video` desconhecido. `sanitizeTimeline` já cobre dados não confiáveis.
- Teste de compatibilidade obrigatório: abrir todos os `.haze` v1 de `tests/` e `tests-e2e/` após a mudança.

## Segurança e privacidade
Nenhum upload: leitura via `BlobSource` local, sem rede. Arquivos corrompidos → `MediaError`; limites: 500 itens por timeline no `sanitize`; falta limite de tamanho/duração por arquivo (F1).
