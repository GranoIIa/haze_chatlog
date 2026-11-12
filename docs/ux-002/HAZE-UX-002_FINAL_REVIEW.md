# HAZE-UX-002 — Revisão final

| Item | Informação |
|---|---|
| Baseline | `537bcfcc64091ab54c296685f4ab10781831acba` (= `origin/main` no momento do inventário) |
| Branch | `feat/haze-ux-002-simple-mode-hardening`; HEAD do código `450cbfd` (a documentação entra em commit seguinte) |
| Arquivos modificados | Ver IMPLEMENTATION.md: 15 arquivos no diff de código (+1541 / −185), sem tocar em Modo Avançado, GIF Lab, `.haze` ou `parseChatLine` |
| Problemas corrigidos | Nomes ambíguos cadastrados sem revisão; sem corrigir/ignorar/desfazer; miniatura 16:9 para retrato; miniatura sem escurecimento (cor divergia do preview); sem cache ao alternar modo; visual ativo perdido ao abrir projeto/desfazer; nome original reperguntado após correção |
| Testes | tsc limpo; build OK; unitários 407/407 (baseline 383); Playwright 67/67 (baseline 54); 0 ignorados |
| Desempenho | Sem ganho no primeiro carregamento (tempo +4–15%, tarefa longa e heap iguais); geração total 145–224 ms; cache e não regenerar ao digitar comprovados por teste. Ver QA_REPORT |
| Regressões | Nenhuma nos testes existentes (todos os 383 + 54 anteriores seguem aprovados) |
| Riscos residuais | **P2:** carregar foto 4K bloqueia a thread principal ~1,4 s (pré-existente, fora do escopo). **P2:** só Chrome testado. **P3:** hover/foco de pré-visualização não implementado (decisão justificada). **P3:** fidelidade medida por cor média em imagens sólidas. **P3:** frases de narração iniciadas por maiúscula podem virar personagem automático (há "Desfazer detecção") |
| Status | **PARTIAL** |

## Critérios de aceite
| Critério | Situação |
|---|---|
| Detecção não cria personagens indevidos nos casos testados | Atendido (casos de sistema, OOC, ações, `:` sem verbo, malformadas; ambíguos vão para revisão) |
| Formatos atuais continuam | Atendido (testes antigos `T5_DET_01–05` e e2e antigos passam) |
| Personagens detectados podem ser corrigidos | Atendido (revisão com edição, ignorar, desfazer) |
| Miniaturas usam a foto atual | Atendido (teste de troca rápida de foto) |
| Troca de foto sem resultado obsoleto | Atendido (chave por foto/enquadramento + descarte; teste unitário e de navegador) |
| Geração não compromete a responsividade | **Parcial:** a geração em si não cria tarefa longa extra, mas o carregamento da foto 4K bloqueia ~1,4 s (igual ao baseline) |
| Aplicar visual pode ser desfeito | Atendido |
| Modo Avançado funcional | Atendido (suíte completa aprovada) |
| Preview e exportação preservam a aparência | Atendido por cor média (miniatura × preview ≤ 8, preview × PNG ≤ 4) em 3 visuais com imagem sólida |
| Testes relevantes passam | Atendido |
| Documentação atualizada | Atendido |

**Por que PARTIAL e não PASS:** o critério de responsividade não foi melhorado (só preservado), a fidelidade foi medida de forma grosseira, só Chrome foi testado e a pré-visualização por hover não existe. Nada foi enviado ao remoto; o merge fica sob autorização.
