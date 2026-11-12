# HAZE-GIF-001 — Parecer final

**Status: PARTIAL.** O núcleo (pipeline, paleta, orçamento, perfis, Smart Export, testes) está implementado e testado; faltam validações que dependem de ambiente real e alguns itens do briefing (abaixo).

| Item | Resultado |
|---|---|
| Branch e commit | `feat/gif-hardening` — o SHA completo está no relatório da conversa (o commit final é o que contém estes documentos). Sem push, sem merge. |
| Problemas encontrados | 7 (BASELINE): duração 4% curta, paleta amostrada, buffer quadrático, fila sem limite (latente), sem controle de tamanho/cores, estados soltos, banner < mínimo oficial. |
| Alterações | Ver IMPLEMENTATION. |
| Testes | 373/373 unitários, 44/44 Playwright, tsc e build OK. |
| Desempenho | Tempo inalterado; GIF 13–17% maior no mesmo ajuste; PSNR +1,6 a +1,9 dB; duração corrigida. Pico de RAM real **não medido**. |
| Regressões | Nenhuma encontrada pelas suítes. Mudanças de comportamento intencionais listadas em IMPLEMENTATION. |

## Riscos residuais
| Risco | Classe |
|---|---|
| Limites "pesado/bloqueado" são política não validada em máquinas fracas | Média |
| Smart Export re-captura o vídeo a cada tentativa (lento em clipes longos; sem cache de quadros) | Média |
| Limites de plataforma podem mudar; avatar 10 MB vem de orientação de design, não de documentação de API | Baixa/Média |
| Só Chrome testado; `ctx.filter` ausente em alguns navegadores | Média |
| Conteúdo de teste sintético; GIFs reais de jogo podem comprimir diferente (estimativa de tamanho pode errar bastante — por isso o tamanho final é sempre medido) | Média |
| A escada do Smart Export não foi observada em execução real com mais de uma tentativa (só testes unitários da lógica) | Baixa |

## Pendências do briefing não concluídas
- Teste de navegador da UI "pesado" (confirmação) e "bloqueado".
- Medição de pico de RAM do worker; vídeos longos/grandes.
- Dithering e quadros diferenciais (redução de tamanho adicional).
- Cache de quadros para acelerar o Smart Export.
- Validação em Firefox/Safari e clipes reais de GTA/FiveM.
- Teste de fidelidade pixel-a-pixel entre preview e exportação (hoje coberto por geometria compartilhada e testes de posição em %, não por comparação de pixels).

## Veredito
Pode ser mesclado após revisão humana **se** aceitos os riscos acima; recomenda-se testar com 2–3 clipes reais e em um segundo navegador antes de divulgar.
