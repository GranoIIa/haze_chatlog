# HAZE-VIDEO-005: Plano Técnico de Correção e Estabilização

**Missão:** `HAZE-VIDEO-005` & `HAZE-OSS-001`  
**Baseline de Referência:** `80bbc0362c01cd1d616b85cdfd3b93e8d6c33f37`  
**Branch:** `fix/haze-video-005-stabilization`  
**Status:** Executado & Homologado

---

## 1. Escopo de Problemas e Prioridades

| ID | Prioridade | Domínio | Descrição | Status |
|---|---|---|---|---|
| **P0-1** | P0 (Crítico) | Sessão / UI | Perda total de projeto e mídias ao trocar de aba no `App.tsx` | Resolvido |
| **P0-2** | P0 (Crítico) | Playback | Colisão de iteradores no Mediabunny durante seeks e ticks rápidos no `FramePlayer` | Resolvido |
| **P1-1** | P1 (Alto) | Áudio | Esgotamento de `AudioContext` no browser e glitch do playhead para `0:00` | Resolvido |
| **P1-2** | P1 (Alto) | Persistência | Reconexão frágil de mídias offline no `.haze` e rejeição de arquivos renomeados | Resolvido |
| **P2-1** | P2 (Médio) | Inteligência | Auditoria de licenças e pesquisa de componentes OSS para aceleração | Resolvido |

---

## 2. Soluções de Engenharia Implementadas

### P0-1: Preservação de Sessão entre Abas (`src/App.tsx`, `src/components/VideoStudio/VideoStudioView.tsx`)
- **Causa-raiz:** O `<VideoStudioView />` era montado/desmontado condicionalmente com `activeTab === 'video'`.
- **Correção:** Montagem persistente no DOM com classes CSS dinâmicas (`block` / `hidden`) e passagem da prop `active={activeTab === 'video'}`.
- **Ciclo de Vida:** Adicionado hook de suspensão imediata que desativa `requestAnimationFrame`, limpa canais de áudio e pausa a reprodução ao sair da aba, mantendo intactos em memória: timeline, mídias abertas (`mediaRef`), histórico e camadas PiP.

### P0-2: Mutex e Serialização no `FramePlayer` (`src/video/framePlayer.ts`)
- **Causa-raiz:** Múltiplas chamadas concorrentes a `sink.canvases(s)` corrompiam o estado interno do WebCodecs durante scrubbing agressivo.
- **Correção:** Fila de operações assíncronas serializadas por `key` (`pendingOp`). Se uma operação estiver pendente, as requisições aguardam ordenadamente, e geradores obsoletos são cancelados deterministicamente com `it.return()`.

### P1-1: Singleton de AudioContext e Relógio Monotônico (`src/video/previewAudio.ts`)
- **Causa-raiz:** `new AudioContext()` e `close()` a cada play/stop/seek atingiam o limite de instâncias de hardware dos navegadores. `ctx.currentTime` retornava 0 durante o `resume()`, fazendo o playhead saltar para `0:00`.
- **Correção:** Singleton compartilhado persistente (`PreviewAudio.getSharedContext()`), resolução assíncrona prévia do `resume()`, captura segura de `baseCtx` e cálculo de tempo garantido monotônico (`baseT + Math.max(0, elapsed)`).

### P1-2: Tolerância Ampliada e Relink de Renomeados (`src/video/videoProject.ts`)
- **Causa-raiz:** Tolerância estrita de 50ms falhava em variações de container e exigia nomes idênticos.
- **Correção:** Tolerância de duração ampliada para ±150ms e suporte a `allowRenamed=true` para relink explícito de arquivos com nomes diferentes mas mesmo tamanho e duração.
