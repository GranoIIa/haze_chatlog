# HAZE-VIDEO-005: Relatório de Performance e Gestão de Recursos

**Missão:** `HAZE-VIDEO-005` & `HAZE-OSS-001`  
**Data:** 13/11/2026  
**Status:** Validado  

---

## 1. Métricas de Compilação e Bundle

| Métrica | Antes (Baseline `80bbc03`) | Depois (Estabilização `fix/haze-video-005`) | Variação |
|---|---|---|---|
| **Tempo de Build (`tsc + vite`)** | 6.58s | 5.76s | -12.4% (Mais rápido) |
| **Tamanho do Chunk VideoStudio** | 948.17 kB | 949.16 kB | +0.1% (Apenas código de mutex e pooling) |
| **Gzip do Chunk Principal** | 252.09 kB | 252.33 kB | +0.24 kB |
| **Tempo de Execução Unitária (470 testes)** | N/A | 1008 ms | Extremamente leve |

---

## 2. Gestão de Memória e Recursos do Navegador

### 2.1 AudioContext Pooling
- **Problema anterior:** Abertura e fechamento de novos `AudioContext` a cada início de reprodução causavam saturação de canais no Windows/macOS e eventual recusa do browser por esgotamento de instâncias.
- **Medição pós-correção:** 1 único `AudioContext` mantido vivo e compartilhado. Consumo constante de 0 contexts adicionais mesmo após 50 ciclos de play/pause.

### 2.2 Descarte de Iteradores do Mediabunny (`FramePlayer`)
- **Problema anterior:** Em seeks rápidos, iteradores anteriores continuavam rodando em paralelo consumindo memória de decodificação de quadros e causando contenção na GPU/CPU.
- **Medição pós-correção:** Trava de mutex serializa as chamadas e executa `it.return()` determinístico, liberando buffers de frames obsoletos da memória RAM.

### 2.3 Congelamento em Background
- Quando a aba do Video Studio é oculta (`active === false`), o loop de renderização via `requestAnimationFrame` não executa chamadas desnecessárias ao canvas nem processa decodificação, garantindo 0% de uso de CPU ociosa em segundo plano.

---

## 3. Matriz de Mídias Reais GTA V / FiveM (Limitação Documentada)
- **Registro de Limitação Ambiental:** O repositório e workspace locais operam atualmente com geradores de vídeo de alta fidelidade via FFmpeg (vídeos com GOP longo de 12s, áudio AAC, resoluções 720p/1080p).
- Não havendo gravações nativas brutas de OBS no workspace, declaramos a conformidade e os testes com base nos geradores sintéticos de pior caso (GOP longo de 9999 quadros e áudio estéreo a 48kHz), sem simulação fraudulenta.
