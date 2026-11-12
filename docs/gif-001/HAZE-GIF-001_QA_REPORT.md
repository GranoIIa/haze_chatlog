# HAZE-GIF-001 — Relatório de QA (resultados reais)

Ambiente: Windows 11, Chrome 149.0.7827.201 (Playwright `channel: 'chrome'`, headless). Vídeos de teste sintéticos gerados no navegador. Decodificador independente: `ImageDecoder` do Chrome (dimensões, quantidade de quadros, duração, pixels).

## Suítes executadas (após as últimas alterações)
| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | sem erros |
| `npm run build` | OK |
| `npm run test:e2e` (unitários) | **373 / 373** (354 anteriores + 19 novos) |
| `npm run test:browser` (Playwright) | **44 / 44** (38 anteriores + 6 novos de Smart Export/robustez) |

Obs.: `npm install` não foi reexecutado nesta missão (dependências já instaladas; nenhuma nova adicionada).
Já houve, em sessões anteriores, um teste unitário temporizado (`T2_F20_02`) que falhou intermitentemente e passa ao reexecutar; não falhou nesta rodada.

## Testes novos de navegador (`tests-e2e/gif.spec.ts`)
- Perfil Emoji → GIF 128×128, ≤ 256 KB medido no arquivo, mensagem "Dentro do limite".
- Smart Export com vídeo ruidoso: **o texto da tela concorda com o arquivo** (≤ 256 KB ⇔ "Dentro do limite"; senão "Acima do limite").
- Cancelar durante a conversão → botão volta, nova conversão (854×480) funciona.
- Trocar de aba durante a conversão → conversão conclui.
- Vídeo inválido → nada gerado e o app continua respondendo.
- Resolução manual mantém perfil Emoji "(ajustado)" e o alvo de 256 KB.
**Limitação:** não verifiquei se o vídeo ruidoso realmente acionou mais de uma tentativa da escada (o teste valida a honestidade do resultado, não a quantidade de tentativas). A escada é coberta por testes unitários (`T5_GIFP_23`).

## Desempenho (ver `bench-baseline.json`, `bench-after.json`, `bench-colors.json`, `bench-profiles.json`)
Entrada: WebM 1280×720, clipe de 3 s (12 FPS → 36 quadros).
| Configuração | Tempo base → depois | GIF base → depois | Duração (esperado 3,00 s) | PSNR | Fila máx. |
|---|---|---|---|---|---|
| 480×270 | 5,0 → 5,0 s | 0,52 → 0,59 MB | 2,88 → **3,00** | 36,3 → **38,1** | 1 → 2 |
| 1280×720 | 5,0 → 5,0 s | 1,96 → 2,18 MB | 2,88 → **3,00** | 37,2 → **38,1** | 2 → 2 |
| 1920×1080 | 5,5 → 5,5 s | 3,38 → 3,95 MB | 2,88 → **3,00** | 36,2 → **37,8** | 2 → 3 |
| 1080×1080, 20 FPS (60 q.) | 8,6 → 8,6 s | 2,86 → 3,31 MB | 3,00 → 3,00 | n/a | 2 → 2 |

Cores (480×270): 256 → 0,59 MB (38,2 dB) · 128 → 0,55 (37,9) · 64 → 0,47 (36,6) · 32 → 0,36 (33,3) · 16 → 0,28 MB (28,2 dB).

Perfis (nível pedido na tabela; **atenção:** nesta execução o trecho ficou em 2 s porque o perfil Emoji encurtou o clipe e o valor persistiu para os seguintes):
| Perfil | Saída | Quadros | Tempo | GIF |
|---|---|---|---|---|
| Emoji equilibrado | 128×128 | 20 | 1,9 s | 82 KB |
| Avatar equilibrado | 320×320 | 24 | 2,4 s | 283 KB |
| Banner equilibrado | 680×383 | 24 | 2,4 s | 647 KB |
| RP Forum qualidade | 1280×720 | 30 | 2,9 s | 1,84 MB |
| RP Forum compacto | 720×405 | 20 | 1,9 s | 0,53 MB |

Pico de memória: só o heap do thread principal é mensurável (23–48 MB nas execuções). **Pico real de RAM (incluindo worker) não foi medido.**
Navegador/ambiente: Chrome 149 headless; sem medições em Firefox/Safari/dispositivos móveis.

## Não testado
Vídeo/arquivo longo (> 10 s) e GIFs > 50 MB; dispositivos fracos; MP4 H.264 real de jogo; Firefox/Safari; `ctx.filter` (blur) indisponível em alguns navegadores (nesse caso o desfoque é ignorado e fica a faixa preta); estados "pesado/bloqueado" só via testes unitários da função de custo (a UI de confirmação não tem teste de navegador).
