# 2026-11-06 — Travamentos: thread principal e Canvas

## Objetivo

Investigar por que o app "trava muito", mesmo fora de uma ação pesada, e corrigir as causas.

## Diagnóstico

1. **Comandos síncronos na thread principal.** No Tauri 2, um `#[tauri::command]` sem `async` roda na thread principal. `get_media_info` abre um `powershell.exe` com WinRT a cada 4 s (1,5 s com a vista Mídia aberta), e o processo leva de centenas de ms a mais de 1 s. Durante esse tempo a janela inteira congela: eventos de janela, IPC e animação. O mesmo vale para `seek_media_position`, `reg.exe` (autostart), I/O do `drain_codex_events` (a cada 300 ms) e os `quick_chat_*`, que esperam o RPC do app-server por até 60 s.
2. **Canvas do Ghosty sempre a 60 fps.** `PetMotionEngine.renderFrame` agenda o próximo quadro sem condição, então desenhava mesmo com a ilha recolhida e o personagem recortado, e ainda forçava DPR mínimo de 2.
3. **Modo dev.** Ele só soma: o Rust sai sem otimização e o Vite serve módulos sem bundle. Não é a causa principal.

## Alterações

- `src-tauri/src/lib.rs`, `codex_hooks.rs`, `codex_chat.rs`: comandos que bloqueiam passaram a `#[tauri::command(async)]` e agora rodam no pool do runtime, fora da thread principal. São eles: volume e mixer, mídia (info, controle, busca), `open_targets`, `run_shortcut`, `pocket_file_metadata`, autostart, todos os de hooks do Codex e todos os `quick_chat_*`. O COM de áudio continua iniciando por chamada com `CoInitializeEx`.
- `src/pet-motion.ts`: um `IntersectionObserver` no canvas pausa o loop de quadros quando ele sai de vista (o recorte por overflow do ancestral conta) e retoma quando volta. DPR limitado entre 1,5 e 2.
- `src/main.ts`: com nada tocando, a mídia é consultada a cada 8 s em vez de 4 s; tocando, continua 4 s; com a vista Mídia aberta, 1,5 s.

## Validações

- `cargo check` passou. O aviso de `unused_mut` em `codex_hooks.rs:436` já existia antes.
- `npx tsc --noEmit` e `npm run build` passaram.
- A sensação de fluidez no runtime ainda precisa ser confirmada pelo usuário, depois que o `tauri dev` recompilar o Rust.

## Próximos passos

- Substituir o PowerShell de `get_media_info`/`seek_media_position` por WinRT nativo em Rust (`windows` com `Media_Control`), de preferência com uma sessão persistente e eventos de mudança no lugar do polling.
- Medir no build de release (`npm run tauri build`) para separar o custo do modo dev.
