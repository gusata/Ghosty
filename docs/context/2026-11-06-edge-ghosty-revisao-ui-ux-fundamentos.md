# 2026-11-06 — Revisão de UI/UX: fundamentos

## Objetivo

Aplicar todos os pontos da análise de UI/UX e de organização do projeto: legibilidade, tokens, hover acidental, pílulas que mudavam de lugar, ícones, alvos de clique, foco de teclado, Home "Agora" genérica, camada duplicada de navegação, botões repetidos no Pet, CSS legado de geometria, arquivos sobrando no repositório, AGENTS.md inchado e o `main.ts` monolítico.

## Alterações

- **Tipografia**: escala `--fs-xs` (11 px, piso) a `--fs-2xl` (24 px) em `:root`; 499 declarações convertidas (7–10 → 11, 11 → 12, 12 → 13, 13–14 → 14, 15–17 → 16, 18–21 → 20, 22–25 → 24; ≥27 px inalterado). O tracking das legendas em caixa alta caiu de .12–.16em para .08em.
- **Cores**: tokens neutros (`--n-*`), de texto (`--text-1/2/3`, com o mais escuro elevado para ≥4,5:1), de linha (`--line-*`), de estado (`--ok/--warn/--danger`) e de acento (`--codex*`, `--mint`, `--accent-*`, `--focus`). 649 ocorrências de hex foram trocadas por tokens; continuam ~700 hex soltos (tons com alfa e cores pontuais), a migrar quando cada componente for tocado.
- **Foco**: regra global `:focus-visible` e remoção de 12 `outline: none/0`.
- **Hover**: atraso de intenção de 160 ms (`HOVER_OPEN_DELAY_MS`, `requestHoverOpen`/`cancelHoverOpen`) no `pointerenter` e no polling nativo; o arraste de arquivos continua abrindo na hora.
- **Home**: cinco pílulas em posição fixa, com estado ativo (`is-active`, `aria-pressed`) e ícones SVG. "Agora" mostra o estado no cabeçalho, uma saudação por horário e até duas linhas com dados reais (agenda, e-mails, mídia, avisos, clima), clicáveis. As ações viraram chips de 32 px com ícone.
- **Painéis**: a subaba "Hoje" foi removida porque duplicava a Home › Agora. O padrão passa a ser E-mail; preferências salvas como `overview` voltam para E-mail via `readChoice`. Subabas com ícones SVG e grade de 5 colunas. O CSS morto da visão geral foi removido.
- **Pet**: removidos "Abrir Bolso" e "Iniciar Foco", que repetiam a Home e o cartão do Bolso.
- **Badges** com 17 px de altura para caber o texto de 11 px.
- **Geometria**: o primeiro bloco CSS com tamanhos fixos legados (360×650 e 760×280) perdeu largura e altura; sobra uma única regra que lê `--expanded-width/height`.
- **Módulos**: `src/types.ts` (49 tipos), `src/lib/format.ts` (formatação pura e `escapeHtml`), `src/ui/icons.ts` (`menuIcon` e 11 ícones novos). `main.ts` caiu de 6.470 para ~6.350 linhas.
- **Repositório**: `debug.log` saiu do versionamento e `*.log` foi para o `.gitignore`. Os dois arquivos de notices viraram um só, `THIRD_PARTY_NOTICES.md`.
- **Memória**: `AGENTS.md` foi reescrito como estado vigente por área; o texto integral anterior está em `docs/historico-decisoes.md`.

## Arquivos tocados

`src/main.ts`, `src/style.css`, `src/types.ts` (novo), `src/lib/format.ts` (novo), `src/ui/icons.ts` (novo), `AGENTS.md`, `docs/historico-decisoes.md` (novo), `THIRD_PARTY_NOTICES.md`, `THIRD-PARTY-NOTICES.md` (removido), `debug.log` (removido), `.gitignore`.

## Validações

- `npx tsc --noEmit` sem erros.
- `npm run build` passou.
- Rust não foi alterado; `cargo check` não foi executado.
- Inspeção visual no runtime **não** foi feita nesta tarefa. Havia uma instância `tauri dev` do usuário rodando, que deve recarregar o frontend por HMR.

## Riscos e problemas conhecidos

- Com o texto maior, cartões de altura fixa (Home 150 px, previsão do clima, mixer e listas do Bolso) podem cortar conteúdo ou passar a usar reticências. Conferir nas três bordas e no breakpoint de 650 px.
- As pílulas agora ocupam duas linhas (2 + 3) na horizontal e cinco linhas na vertical; conferir a altura mínima de 32 px na borda esquerda.
- `.icon-button` fora do cabeçalho continua com 27 px. As abas do cabeçalho já eram de 32 px pela cascata (a análise inicial apontou 25 px olhando uma camada antiga).

## Próximos passos

1. Inspecionar no Windows: Home (Agora com e sem Google/mídia, Mídia com mixer), Pet, Painéis e popups, nas bordas topo, base e esquerda.
2. Continuar quebrando o `main.ts` por área (ilha/geometria, Home, Painéis, chat, integrações), extraindo estado para um store.
3. Migrar os hex restantes e enxugar as camadas antigas de CSS por componente.
