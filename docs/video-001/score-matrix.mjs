// Matriz ponderada da missão HAZE-VIDEO-001. Rode: node docs/video-001/score-matrix.mjs
// Pesos: React/TS 15, Reuso 15, Arquitetura 15, Exportação 15, Desempenho 15, Licença 10, Manutenção 10, DX 5.
const W = [15, 15, 15, 15, 15, 10, 10, 5];
const rows = [
  // [nome, papel, notas..., evidência: T=testado no POC, L=leitura de metadados/README/estrutura]
  ['mediabunny', 'mídia (leitura+codificação)', [9, 9, 9, 10, 8, 7, 10, 9], 'T'],
  ['react-timeline-editor', 'UI de timeline', [7, 7, 6, 5, 6, 10, 5, 6], 'T'],
  ['OpenReel (adaptar)', 'editor completo', [6, 7, 7, 8, 6, 10, 7, 4], 'L'],
  ['FreeCut (adaptar)', 'editor completo', [4, 8, 8, 9, 8, 10, 8, 3], 'L'],
  ['OpenCut', 'editor completo', [3, 4, 5, 5, 5, 10, 6, 4], 'L'],
  ['Omniclip', 'editor completo', [5, 6, 6, 6, 5, 10, 3, 5], 'L'],
  ['FFmpeg.wasm', 'fallback de mídia', [7, 6, 6, 8, 3, 4, 7, 6], 'L'],
  ['wavesurfer.js', 'forma de onda', [7, 6, 8, 5, 8, 9, 10, 8], 'L'],
  ['Fabric.js', 'overlays', [6, 3, 7, 3, 6, 10, 9, 6], 'L'],
  ['Remotion', 'composição React', [9, 6, 8, 7, 6, 3, 9, 8], 'L'],
];
for (const [n, role, s, ev] of rows) {
  const total = s.reduce((a, v, i) => a + v * W[i], 0) / 100;
  console.log(`${n.padEnd(24)} ${role.padEnd(30)} ${total.toFixed(2)}  [${ev}]`);
}
