import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 8899;
const ROOT = path.resolve('C:/Users/Vinicius/.gemini/antigravity/scratch/haze_chatlog');

// Textos de referência (Ground Truth)
const REF_A = "Atenção todas as unidades policiais da cidade de Los Santos. Temos uma perseguição em andamento na rodovia oeste em alta velocidade. O suspeito está conduzindo um veículo preto com vidros escuros e não obedeceu a ordem de parada. Solicitamos apoio imediato para realizar o cerco e bloqueio na próxima saída. Tenham cuidado pois o indivíduo pode estar armado.";
const REF_B = REF_A; // Mesmo texto, mixado com ruído rosa
const REF_C = "Central viatura quatro em código três pela rodovia norte. Copiei viatura quatro qual a localização do veículo suspeito? Passando pelo pedágio agora solicitamos bloqueio de pista imediato. Positivo viatura sete já está posicionando os espinhos na saída dois.";

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Whisper Benchmark Suite V2</title>
</head>
<body>
  <h1>Whisper Benchmark V2</h1>
  <div id="status">Pronto</div>
  <pre id="output"></pre>
  <script type="module">
    import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

    env.allowLocalModels = false;

    // Cálculo rigoroso de WER (Word Error Rate - Levenshtein sobre palavras)
    function calcWER(reference, hypothesis) {
      const clean = (s) => (s || '').toLowerCase()
        .replace(/[^a-zA-Z0-9\u00C0-\u00FF\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const refWords = clean(reference).split(' ').filter(Boolean);
      const hypWords = clean(hypothesis).split(' ').filter(Boolean);
      const N = refWords.length;
      if (N === 0) return { wer: hypWords.length ? 100 : 0, s: 0, d: 0, i: hypWords.length, n: 0, refNorm: '', hypNorm: '' };

      const dp = Array.from({ length: refWords.length + 1 }, () => Array(hypWords.length + 1).fill(0));
      for (let r = 0; r <= refWords.length; r++) dp[r][0] = r;
      for (let c = 0; c <= hypWords.length; c++) dp[0][c] = c;

      for (let r = 1; r <= refWords.length; r++) {
        for (let c = 1; c <= hypWords.length; c++) {
          if (refWords[r - 1] === hypWords[c - 1]) {
            dp[r][c] = dp[r - 1][c - 1];
          } else {
            dp[r][c] = 1 + Math.min(dp[r - 1][c - 1], dp[r - 1][c], dp[r][c - 1]);
          }
        }
      }

      let r = refWords.length, c = hypWords.length;
      let s = 0, d = 0, i = 0;
      while (r > 0 || c > 0) {
        if (r > 0 && c > 0 && refWords[r - 1] === hypWords[c - 1]) {
          r--; c--;
        } else if (r > 0 && c > 0 && dp[r][c] === dp[r - 1][c - 1] + 1) {
          s++; r--; c--;
        } else if (r > 0 && dp[r][c] === dp[r - 1][c] + 1) {
          d++; r--;
        } else if (c > 0 && dp[r][c] === dp[r][c - 1] + 1) {
          i++; c--;
        } else {
          break;
        }
      }

      const wer = Math.round(((s + d + i) / N) * 1000) / 10;
      return { wer, s, d, i, n: N, refNorm: refWords.join(' '), hypNorm: hypWords.join(' ') };
    }

    // Coleta evidência da GPU
    window.__checkGpu = async function() {
      if (!navigator.gpu) return { available: false, reason: 'navigator.gpu is undefined' };
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { available: false, reason: 'requestAdapter returned null' };
        const info = await adapter.requestAdapterInfo();
        return {
          available: true,
          vendor: info.vendor,
          architecture: info.architecture,
          device: info.device,
          description: info.description
        };
      } catch (e) {
        return { available: false, reason: String(e.message || e) };
      }
    };

    // Executa medição de uma configuração
    window.__measureConfig = async function(modelId, device, dtype, refA, refB, refC) {
      const log = (msg) => {
        document.getElementById('status').innerText = msg;
        console.log('[Spike]', msg);
      };

      const result = {
        modelId,
        device,
        dtype,
        loadTimeMs: 0,
        transcribe30sMs: 0,
        transcribe2minMs: 0,
        transcribeNoiseMs: 0,
        transcribeDialogMs: 0,
        peakHeapMb: 0,
        textA: '',
        textB: '',
        textC: '',
        werA: null,
        werB: null,
        werC: null,
        lastSentenceCaptured: false,
        error: null
      };

      const getHeap = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;

      try {
        log('Carregando pipeline ' + modelId + ' (' + device + ', ' + dtype + ')...');
        const t0Load = performance.now();
        const pipeOptions = { device, dtype };
        const transcriber = await pipeline('automatic-speech-recognition', modelId, pipeOptions);
        result.loadTimeMs = Math.round(performance.now() - t0Load);
        result.peakHeapMb = getHeap();

        const audioCtx = new AudioContext({ sampleRate: 16000 });
        const loadAudio = async (url) => {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(buf);
          return decoded.getChannelData(0);
        };

        // 1. Amostra A (31.7s) COM chunk_length_s: 30 para não perder o final
        log('Transcrevendo Amostra A (31.7s)...');
        const floatA = await loadAudio('/sample_pt_br_16k.wav');
        const t0A = performance.now();
        const outA = await transcriber(floatA, {
          language: 'portuguese',
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: true
        });
        result.transcribe30sMs = Math.round(performance.now() - t0A);
        result.textA = outA.text || '';
        result.werA = calcWER(refA, result.textA);
        result.lastSentenceCaptured = /armado/i.test(result.textA);
        result.peakHeapMb = Math.max(result.peakHeapMb, getHeap());

        // 2. Amostra B (31.7s com ruído de fundo)
        log('Transcrevendo Amostra B (Ruído)...');
        const floatB = await loadAudio('/sample_b_ruido_16k.wav');
        const t0B = performance.now();
        const outB = await transcriber(floatB, {
          language: 'portuguese',
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: true
        });
        result.transcribeNoiseMs = Math.round(performance.now() - t0B);
        result.textB = outB.text || '';
        result.werB = calcWER(refB, result.textB);
        result.peakHeapMb = Math.max(result.peakHeapMb, getHeap());

        // 3. Amostra C (25.4s diálogo entre 2 vozes)
        log('Transcrevendo Amostra C (Diálogo 2 vozes)...');
        const floatC = await loadAudio('/sample_c_dialogo_16k.wav');
        const t0C = performance.now();
        const outC = await transcriber(floatC, {
          language: 'portuguese',
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: true
        });
        result.transcribeDialogMs = Math.round(performance.now() - t0C);
        result.textC = outC.text || '';
        result.werC = calcWER(refC, result.textC);
        result.peakHeapMb = Math.max(result.peakHeapMb, getHeap());

        // 4. Amostra A Longa (2min 21s)
        log('Transcrevendo Áudio Longo (2m 21s)...');
        const floatLong = await loadAudio('/sample_pt_br_2min_16k.wav');
        const t0Long = performance.now();
        const outLong = await transcriber(floatLong, {
          language: 'portuguese',
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: true
        });
        result.transcribe2minMs = Math.round(performance.now() - t0Long);
        result.peakHeapMb = Math.max(result.peakHeapMb, getHeap());

        await audioCtx.close();
        log('Concluído com sucesso!');
      } catch (err) {
        console.error('Erro na medição:', err);
        result.error = String(err.message || err);
      }

      return result;
    };
  </script>
</body>
</html>`);
    return;
  }

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
  console.log(`Server listening on http://localhost:${PORT}`);

  // Inicia Chrome com GPU explícita e flags de WebGPU
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,WebGPU',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist'
    ]
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => typeof (window as any).__measureConfig === 'function', null, { timeout: 30000 });

  // 1. Diagnóstico e prova da GPU
  const gpuInfo = await page.evaluate(async () => await (window as any).__checkGpu());
  console.log('\n======================================================');
  console.log('EVIDÊNCIA DA GPU (WebGPU):', JSON.stringify(gpuInfo, null, 2));
  console.log('======================================================\n');

  const matrix = [
    { model: 'onnx-community/whisper-tiny', device: 'webgpu', dtype: 'q8', downloadMb: 41.5 },
    { model: 'onnx-community/whisper-tiny', device: 'webgpu', dtype: 'fp32', downloadMb: 149.0 },
    { model: 'onnx-community/whisper-tiny', device: 'wasm', dtype: 'q8', downloadMb: 41.5 },
    { model: 'onnx-community/whisper-base', device: 'webgpu', dtype: 'q8', downloadMb: 149.5 },
    { model: 'onnx-community/whisper-base', device: 'wasm', dtype: 'q8', downloadMb: 149.5 }
  ];

  const results: any[] = [];

  for (const item of matrix) {
    console.log(`\n>>> Executando: ${item.model} | ${item.device} | ${item.dtype}...`);
    const res = await page.evaluate(async (cfg: any) => {
      return await (window as any).__measureConfig(
        cfg.model,
        cfg.device,
        cfg.dtype,
        cfg.refA,
        cfg.refB,
        cfg.refC
      );
    }, { ...item, refA: REF_A, refB: REF_B, refC: REF_C });

    res.downloadMb = item.downloadMb;
    results.push(res);
    console.log(`Concluído ${item.model} (${item.device}/${item.dtype}):`, {
      loadTimeS: (res.loadTimeMs / 1000).toFixed(2),
      t30s: (res.transcribe30sMs / 1000).toFixed(2),
      t2min: (res.transcribe2minMs / 1000).toFixed(2),
      peakHeapMb: res.peakHeapMb,
      lastSentenceCaptured: res.lastSentenceCaptured,
      werA: res.werA ? `${res.werA.wer}% (S=${res.werA.s}, D=${res.werA.d}, I=${res.werA.i}, N=${res.werA.n})` : null,
      werB: res.werB ? `${res.werB.wer}%` : null,
      werC: res.werC ? `${res.werC.wer}%` : null,
      error: res.error
    });
  }

  fs.writeFileSync(
    path.join(ROOT, 'whisper-benchmark-v2-results.json'),
    JSON.stringify({ gpuInfo, results }, null, 2),
    'utf-8'
  );

  await browser.close();
  server.close();
  console.log('\nBenchmark V2 finalizado e salvo em whisper-benchmark-v2-results.json!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  server.close();
  process.exit(1);
});
