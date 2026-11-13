/**
 * Haze Video Studio (POC): leitura de mídia com mediabunny (WebCodecs).
 * O arquivo nunca sai do navegador; só o que o decodificador pede é lido do Blob.
 */
import { Input, BlobSource, ALL_FORMATS, CanvasSink, AudioBufferSink } from 'mediabunny';
import type { MediaRef } from './timeline';

export class MediaError extends Error {
  constructor(message: string) { super(message); this.name = 'MediaError'; }
}

export interface OpenedMedia {
  ref: MediaRef;
  file: File;
  input: Input<BlobSource>;
  video: CanvasSink | null;
  /** Cria um decodificador de quadros na largura pedida (a exportação usa a largura da saída, não a do preview). */
  makeVideoSink(width: number): CanvasSink;
  audio: AudioBufferSink | null;
  dispose(): void;
}

export async function openMedia(file: File, id: string): Promise<OpenedMedia> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const vt = await input.getPrimaryVideoTrack();
    const at = await input.getPrimaryAudioTrack();
    if (!vt) throw new MediaError(`"${file.name}" não tem faixa de vídeo que este navegador consiga ler.`);
    if (!(await vt.canDecode())) {
      throw new MediaError(`Este navegador não consegue decodificar o vídeo de "${file.name}" (codec não suportado).`);
    }
    const duration = await input.computeDuration();
    if (!(duration > 0)) throw new MediaError(`"${file.name}" parece vazio ou corrompido (duração zero).`);
    const hasAudio = !!at && (await at.canDecode());
    return {
      ref: { id, name: file.name, duration, width: vt.displayWidth, height: vt.displayHeight, hasAudio },
      file,
      input,
      // Quadros já saem reduzidos para o tamanho de trabalho (máx. 1280 de largura) para poupar memória.
      video: new CanvasSink(vt, { width: Math.min(vt.displayWidth, 1280), poolSize: 2 }),
      makeVideoSink: (width: number) => new CanvasSink(vt, { width: Math.min(vt.displayWidth, Math.max(2, Math.round(width))), poolSize: 2 }),
      audio: hasAudio && at ? new AudioBufferSink(at) : null,
      dispose() { try { input.dispose(); } catch { /* já liberado */ } }
    };
  } catch (e) {
    try { input.dispose(); } catch { /* ignore */ }
    if (e instanceof MediaError) throw e;
    throw new MediaError(`Não foi possível ler "${file.name}": ${(e as Error)?.message || 'arquivo inválido ou corrompido'}.`);
  }
}
