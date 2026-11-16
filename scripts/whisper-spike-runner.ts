import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 8899;
const ROOT = path.resolve('C:/Users/Vinicius/.gemini/antigravity/scratch/haze_chatlog');

// Servidor local simples para fornecer a página HTML e os arquivos WAV
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Whisper Spike Measurement</title>
</head>
<body>
  <h1>Whisper In-Browser Benchmark</h1>
  <div id="status">Iniciando...</div>
  <pre id="output"></pre>
  <script type="module">
    import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

    // Desativa modelos locais para garantir busca no HuggingFace Hub
    env.allowLocalModels = false;

    window.__runSpike = async function(modelId, device) {
      const results = {
        modelId,
        device,
        downloadFiles: {},
        totalDownloadBytes: 0,
        loadTimeMs: 0,
        transcribe30sTimeMs: 0,
        transcribe2minTimeMs: 0,
        transcription30sText: '',
        transcription2minText: '',
        peakHeapMb: 0,
        error: null
      };

      try {
        const updateStatus = (s) => {
          document.getElementById('status').innerText = s;
          console.log('[Spike Status]', s);
        };

        updateStatus('Baixando/inicializando ' + modelId + ' em ' + device + '...');
        const t0Load = performance.now();

        const progressCb = (p) => {
          if (p.file) {
            results.downloadFiles[p.file] = {
              loaded: p.loaded || 0,
              total: p.total || 0,
              status: p.status
            };
          }
        };

        // Opções de dtype: para webgpu q8 ou fp32; para wasm q8
        const pipeOptions = {
          device,
          progress_callback: progressCb
        };
        if (device === 'wasm') {
          pipeOptions.dtype = 'q8';
        }

        const transcriber = await pipeline('automatic-speech-recognition', modelId, pipeOptions);
        results.loadTimeMs = Math.round(performance.now() - t0Load);

        // Calcula total de bytes baixados
        let total = 0;
        for (const [file, info] of Object.entries(results.downloadFiles)) {
          total += info.total || info.loaded || 0;
        }
        results.totalDownloadBytes = total;

        const getHeap = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
        results.peakHeapMb = getHeap();

        // 1. Decodificar áudio de 30s
        updateStatus('Carregando áudio 30s...');
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        const res30 = await fetch('/sample_pt_br_16k.wav');
        const buf30 = await res30.arrayBuffer();
        const decoded30 = await audioCtx.decodeAudioData(buf30);
        const float30 = decoded30.getChannelData(0);

        // 2. Transcrever áudio de 30s
        updateStatus('Transcrevendo áudio 30s em ' + device + '...');
        const t0Trans30 = performance.now();
        const out30 = await transcriber(float30, {
          language: 'portuguese',
          task: 'transcribe',
          return_timestamps: true
        });
        results.transcribe30sTimeMs = Math.round(performance.now() - t0Trans30);
        results.transcription30sText = out30.text || '';
        results.peakHeapMb = Math.max(results.peakHeapMb, getHeap());

        // 3. Decodificar e transcrever áudio de 2min
        updateStatus('Carregando áudio 2min...');
        const res120 = await fetch('/sample_pt_br_2min_16k.wav');
        const buf120 = await res120.arrayBuffer();
        const decoded120 = await audioCtx.decodeAudioData(buf120);
        const float120 = decoded120.getChannelData(0);

        updateStatus('Transcrevendo áudio 2min em ' + device + '...');
        const t0Trans120 = performance.now();
        const out120 = await transcriber(float120, {
          language: 'portuguese',
          task: 'transcribe',
          return_timestamps: true
        });
        results.transcribe2minTimeMs = Math.round(performance.now() - t0Trans120);
        results.transcription2minText = out120.text || '';
        results.peakHeapMb = Math.max(results.peakHeapMb, getHeap());

        updateStatus('Concluído com sucesso!');
        await audioCtx.close();
      } catch (err) {
        console.error('Erro no spike:', err);
        results.error = String(err.message || err);
      }

      document.getElementById('output').innerText = JSON.stringify(results, null, 2);
      return results;
    };
  </script>
</body>
</html>`);
    return;
  }

  // Arquivos estáticos (WAVs)
  const filePath = path.join(ROOT, path.basename(url.pathname));
  if (fs.existsSync(filePath)) {
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

async function main() {
  await new Promise<void>((r) => server.listen(PORT, r));
  console.log(`Server listening at http://localhost:${PORT}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,WebGPU'
    ]
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => typeof (window as any).__runSpike === 'function', null, { timeout: 30000 });

  console.log('\n======================================================');
  console.log('SPIKE 1: Whisper-tiny com WebGPU');
  console.log('======================================================');
  const tinyWebGPU = await page.evaluate(async () => {
    return await (window as any).__runSpike('onnx-community/whisper-tiny', 'webgpu');
  });
  console.log('Resultado tiny WebGPU:', JSON.stringify(tinyWebGPU, null, 2));

  console.log('\n======================================================');
  console.log('SPIKE 2: Whisper-tiny com WASM');
  console.log('======================================================');
  const tinyWasm = await page.evaluate(async () => {
    return await (window as any).__runSpike('onnx-community/whisper-tiny', 'wasm');
  });
  console.log('Resultado tiny WASM:', JSON.stringify(tinyWasm, null, 2));

  // Salva resultado em arquivo
  fs.writeFileSync(
    path.join(ROOT, 'whisper-spike-results.json'),
    JSON.stringify({ tinyWebGPU, tinyWasm }, null, 2),
    'utf-8'
  );

  await browser.close();
  server.close();
  console.log('\nSpike finalizado com sucesso!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  server.close();
  process.exit(1);
});
