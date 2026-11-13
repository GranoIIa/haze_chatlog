/** Limites de segurança do Video Studio (F0). Puro, para ser testado sem navegador. */
export const MAX_FILE_BYTES = 4 * 1024 ** 3;     // 4 GiB por arquivo importado
export const MAX_MEDIA_SECONDS = 3 * 3600;        // 3 h por mídia
export const MAX_TIMELINE_SECONDS = 2 * 3600;     // 2 h de montagem
export const MAX_AUDIO_MIX_BYTES = 1.5 * 1024 ** 3; // mix PCM em memória (Float32 estéreo 48 kHz)

/** Bytes do mix de áudio inteiro em memória para uma duração (s). */
export const audioMixBytes = (seconds: number): number => Math.ceil(seconds * 48000) * 2 * 4;

/** Devolve uma mensagem de erro em PT-BR, ou null se estiver dentro dos limites. */
export function checkImportLimits(name: string, sizeBytes: number, seconds?: number): string | null {
  const gb = (n: number) => (n / 1024 ** 3).toFixed(1);
  if (sizeBytes > MAX_FILE_BYTES) return `"${name}" tem ${gb(sizeBytes)} GB; o limite é ${gb(MAX_FILE_BYTES)} GB por arquivo.`;
  if (seconds !== undefined && seconds > MAX_MEDIA_SECONDS) return `"${name}" dura ${(seconds / 3600).toFixed(1)} h; o limite é ${MAX_MEDIA_SECONDS / 3600} h por vídeo.`;
  return null;
}

export function checkExportLimits(totalSeconds: number): string | null {
  if (totalSeconds > MAX_TIMELINE_SECONDS) return `A montagem dura ${(totalSeconds / 3600).toFixed(1)} h; o limite de exportação é ${MAX_TIMELINE_SECONDS / 3600} h.`;
  if (audioMixBytes(totalSeconds) > MAX_AUDIO_MIX_BYTES) return 'A montagem é longa demais para mixar o áudio na memória deste navegador.';
  return null;
}
