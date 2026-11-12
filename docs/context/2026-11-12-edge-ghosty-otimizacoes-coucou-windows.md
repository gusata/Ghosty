# 2026-11-12 — Otimizações de Windows inspiradas no Coucou (5 pontos)

## Objetivo
Aplicar os 5 pontos da pesquisa `docs/design/coucou-arquitetura-windows-2026-11-12.md`: poll do cursor, laço do Ghosty que dorme, argumentos do WebView2 e memória das janelas ocultas, correção de zoom, e janela hospedeira encolhida.

## Alterações
1. **Poll do cursor** (`src-tauri/src/island_host.rs`, novo): só Win32 (`GetWindowRect`, `IsWindowVisible`, `GetDpiForWindow`), sem `outer_position`/`is_visible`/`scale_factor` a cada tique (cada um era uma ida e volta à thread principal). 16 ms perto da ilha (240 px), 50 ms longe, 250 ms sem ilha visível, acordado na hora por `PollWake` quando o rect/layout muda. Longe, emite um único evento de saída. A margem de hover agora segue `barPosition` (antes ficava sempre centrada).
2. **Laço do Ghosty** (`src/pet-motion.ts`): `isAtRest()` + `sleepUntilNextBeat()`; o laço para quando nada se move e acorda na próxima piscada. `play()` e `annoy()` pedem quadro; `syncAppearance` não pede mais quadro a cada quadro (`applyMood`); `MutationObserver` em `data-skin/accessory/mood` e o `ResizeObserver` acordam o laço.
3. **WebView2**: os argumentos `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection` já são o padrão do wry 0.57 (`webview2/mod.rs:303`), sem mudança. Novo `SetMemoryUsageTargetLevel(LOW)` para `utility-popup` e `settings-window` ocultos (na inicialização e via `hide_auxiliary_window`/`hideAuxiliaryWindow()`), NORMAL antes de mostrar. Dependência nova: `webview2-com = "0.39"` (mesma do wry).
4. **Zoom**: `fit_webview_zoom` corrige o zoom quando o devicePixelRatio difere da escala da janela; roda antes do primeiro render de cada janela e a cada mudança de DPR (`matchMedia`). Teste de drop a partir do Explorer clássico **não feito** (precisa de arrasto manual).
5. **Janela encolhida**: `set_host_collapsed` encolhe a janela `main` para a ilha recolhida + 4 px, 420 ms depois de recolher; `setBodyPosition` usa `max(0px, calc((100% - w) * pos))` para o corpo não se mover; Rust translada os rects no mesmo lock. Volta ao tamanho cheio (e espera o `resize`, até 120 ms) antes de animar ou de mostrar toast/aprovação/bolinha/onboarding. `SHRINK_COLLAPSED_HOST` desliga.

Arquivos: `src-tauri/src/island_host.rs` (novo), `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src/main.ts`, `src/pet-motion.ts`, `AGENTS.md`, `THIRD_PARTY_NOTICES.md`.

## Validações
- `npm run build` ok; `cargo check` ok (único aviso pré-existente em `codex_hooks.rs:436`); `cargo test --lib island_host`: 4 testes novos passam (geometria da janela encolhida nas 4 bordas e várias posições; correção de zoom); `git diff --check` ok.
- Runtime (instância `tauri dev` do usuário, só leitura via Win32): janela `main` recolhida medida em 104×24 px em x=908 (antes 1100×420). Renderers do popup e das Configurações ocultos: 0–14 ms de CPU em 10 s, contra ~1,2–1,4 s/10 s do renderer auxiliar do build instalado 1.0.10.

## Problemas conhecidos
- O renderer da janela `main` gasta ~12–15% de um núcleo com a ilha recolhida e o mouse longe, **igual no build instalado antigo**: é anterior a estas mudanças e a causa não foi encontrada (não há rAF permanente em `main.ts`; pausar animações CSS infinitas no conteúdo recolhido não mudou o número e foi revertido). O processo de GPU do WebView2 (compartilhado pelos dois builds, mesma pasta de dados) estava em ~46%. Próximo passo: gravar um perfil no DevTools (Performance) do build de dev com a ilha recolhida.
- A mídia ainda é lida por um processo PowerShell a cada 1,5–8 s (`get_media_info`); o Coucou usa eventos do GSMTC.
- Com "Tamanho do texto" do Windows > 100%, a correção de zoom desfaz o aumento de texto dentro do Ghosty (troca consciente para manter o hitbox correto).

## Pendências de validação manual
Hover/clique abrindo a partir da janela encolhida (topo, base e **borda esquerda**, posições 0/50/100%); toast de conclusão, aprovação do Codex e bolinha Codex+mídia aparecendo sem corte; arrastar arquivo do Explorer clássico (Downloads/Documentos) sobre a barrinha; trocar de monitor com DPI diferente; o Ghosty piscando e reagindo normalmente depois de dormir.
