# Memória do projeto Edge Ghosty

Leia este arquivo no início de toda conversa ou tarefa neste repositório. Ele descreve **somente o estado vigente**. A trilha completa de decisões (itens 1–89, inclusive os que foram revertidos) está em `docs/historico-decisoes.md`; consulte-a só quando precisar do porquê de algo.

## Regras de trabalho

- Ao concluir cada tarefa, crie um arquivo novo em `docs/context/` com data e identificador próprios (nunca sobrescreva). Registre objetivo, alterações, arquivos tocados, validações, problemas conhecidos e próximos passos.
- Atualize este arquivo apenas com decisões estruturais, **editando a seção afetada** em vez de acrescentar um item numerado. Se uma decisão substituir outra, reescreva o texto; o histórico fica nos snapshots.
- Antes de mudar a arquitetura, leia este arquivo e o snapshot mais recente em `docs/context/`.
- Codex: use `apply_patch` para editar arquivos.
- Se a compilação Rust falhar, peça a mensagem completa do Developer PowerShell e corrija a partir dela.

## Projeto

- Edge Ghosty: menu rápido na borda do Windows 10/11 x64, com o Ghosty como mascote interativo. Inspiração visual: notch/island do Coucou (port Windows), com identidade própria.
- Stack: Tauri 2, Rust, Vite, TypeScript sem framework, HTML/CSS, WebView2.
- Repositório canônico: `https://github.com/gusata/Ghosty` (`origin`). Identificador Tauri estável para preservar dados locais; preferências usam `edge-ghosty.*` (migradas de `edge-mochi.*`).
- Licenças de terceiros: `THIRD_PARTY_NOTICES.md` (animação e saudação adaptadas do Coucou, MIT).

## Ilha (janela `main`)

- Recolhida: barrinha discreta numa única borda (topo, base ou esquerda) e num único monitor; padrão topo/centro. Posição ao longo da borda configurável de 0 a 100%.
- Forma: superfície preta única com `border-radius` (14 px recolhida, 22 px expandida) e `overflow: hidden`; sem pseudo-elementos de orelha.
- Abertura: modo hover (padrão) ou clique. No hover, um atraso de intenção de 160 ms (`HOVER_OPEN_DELAY_MS`) evita abrir quando o cursor só atravessa a borda; arrastar arquivo abre na hora. Fechar usa `closeDelay`.
- Geometria: `expandedIslandSize()` em `src/main.ts` é a única fonte; escreve `--expanded-width/height` e `animateIsland` interpola inline a cada quadro (`src/anim.ts`: `Spring`/`Tracked`). `setBodyPosition` ancora pela porcentagem com `max(0px, calc((100% - tamanho) * posição))`, para o corpo ficar nos mesmos pixels da tela quando a janela muda de tamanho.
- Janela hospedeira: cheia (1100×420 nas bordas horizontais, 900×720 na vertical) enquanto aberta ou animando; 420 ms após recolher, encolhe para a ilha recolhida + 4 px (`set_host_collapsed` em `src-tauri/src/island_host.rs`, posição calculada pela mesma fórmula). Volta ao tamanho cheio antes de qualquer animação ou estado que precise de espaço (`HOST_BLOCKING_CLASSES`: aberta, toast de conclusão, aprovação pendente, bolinha Codex+mídia, onboarding). `SHRINK_COLLAPSED_HOST` em `src/main.ts` desliga o recurso.
- Click-through: polling nativo do cursor + `set_ignore_cursor_events` em `island_host.rs`, só com Win32 (`GetWindowRect`, `GetDpiForWindow`, sem idas à thread principal); 16 ms perto da ilha (240 px), 50 ms longe, 250 ms sem ilha visível; longe, a página recebe um único evento de saída. Margem de hover fixa de 14 px ao redor da barrinha, na posição configurada. Durante drag com botão pressionado, o hitbox acompanha o retângulo visível. Manter também `pointerenter`/`pointerleave` no `.island-body`; `setExpanded` é idempotente.
- Topo: `alwaysOnTop`, `SetWindowPos(HWND_TOPMOST, SWP_NOACTIVATE)`; reaplicar `set_skip_taskbar(true)` logo após cada `show()`.
- Navegação: três ícones no cabeçalho — Início, Pet, Painéis. Navegar troca só o conteúdo, preservando `.island-body` e a animação em curso.
- Orientação: bordas horizontais usam composição horizontal; a borda esquerda empilha cartões em uma coluna.

### Início (Home)

- Cartão principal com o Ghosty + cinco pílulas em **posição fixa** (Agora, Mídia, Codex, GitHub, Vercel); a ativa é marcada (`is-active`, `aria-pressed`), nunca removida.
- **Agora** é a visão geral única do dia: estado do Codex no cabeçalho (aprovação/atividade têm prioridade), saudação por horário e até duas linhas com dados reais (próximo compromisso, e-mails não lidos, mídia tocando, avisos, clima), cada uma levando ao destino. Ações em chips de 32 px: Foco, Bolso, Prancheta, Painéis.
- **Mídia**: arte da faixa como fundo desfocado do cartão inteiro, título/artista, progresso com busca, transporte centralizado, volume principal em coluna vertical; "Volume dos apps" anima um mixer (Core Audio por processo) dentro do cartão lateral sem mudar a geometria.
- **Codex**: estado e ticker efêmero (≤12 eventos em memória); métricas agregadas locais por 90 dias no popup.
- **GitHub/Vercel**: leitura opcional com tokens no Windows Credential Manager; Vercel atualiza a cada 5 min.

### Pet

- Ghosty grande e centralizado, Bolso (até 8 itens) e Personalizar. Foco e Bolso não se repetem como botões aqui (já estão na Home e no cartão do Bolso).
- Bolso: arquivos via drag-and-drop nativo do Tauri e textos; guarda caminho/texto no `localStorage`, nunca move ou apaga o original.

### Painéis

- Subabas E-mail, Agenda, Tarefas, Avisos, Clima (não há mais "Hoje": a visão geral é a Home › Agora). Até 960×380 nas bordas horizontais e 420×620 na vertical; conteúdo rola dentro da ilha.
- Google: OAuth Desktop + PKCE + loopback `127.0.0.1`, Client ID (e Client Secret opcional da credencial Desktop) injetados no build por `EDGE_GHOSTY_GOOGLE_CLIENT_ID`/`_SECRET`; tokens no Credential Manager; snapshot só em memória. Gmail lê apenas cabeçalhos (abrir, marcar lida, arquivar); Agenda somente leitura; Tarefas lista/cria/conclui. Avisos locais limitados a 50. Clima via Open-Meteo com cidade escolhida manualmente.
- Pausar na bandeja bloqueia refresh e validação de GitHub, Vercel, Google e clima (não suspende aprovações do Codex).

## Ghosty (personagem)

- Desenhado em Canvas 2D por `src/pet-motion.ts` (`PetMotionEngine`); o botão HTML só dá acessibilidade/clique. `src/anim.ts` cuida apenas da geometria da ilha.
- O laço de quadros dorme quando `isAtRest()` (nada se move) e acorda por timer na próxima piscada. Todo gatilho público de animação precisa chamar `requestFrame()` (ou passar por `play()`/`setState()`, que já chamam); não chame `requestFrame()` em código que roda a cada quadro.
- Seixo abstrato assimétrico, olhos em cápsula preta fosca sem reflexo, mãos invisíveis em repouso; sem orelhas, focinho ou bochechas. Boca só na ingestão (forma de caixa com fenda). Seis aparências, cinco acessórios.
- Estados/emotes inspirados no Coucou ligados a ações reais (foco, busca, Codex, arquivos); não criar gatilhos artificiais. Saudação de abertura de 4,6 s na primeira execução; movimento reduzido pula.

## Janelas auxiliares

- `utility-popup`: Foco, Bolso, personalização, prancheta, métricas do Codex e chat rápido. 400×500, arrastável pelo título, posição persistida e limitada ao monitor, `shadow: false`, sem borda CSS; fecha por botão, Escape ou perda de foco.
- Configurações: janela normal separada (aparece na barra de tarefas), abas Geral e Atalhos; inclui comprimento/espessura numéricos, posição na borda, monitor, sons (desligados por padrão), integrações e atualizações. Onboarding na primeira execução apresenta o Ghosty e o modo de abertura.

### Chat rápido

- `Ctrl + Shift + Espaço` (registrado só pela janela `main`) abre o chat centralizado 72 px acima da borda inferior; janela transparente, só bolhas, compositor e controles têm superfície; Ghosty Canvas no canto inferior esquerdo segue o mouse. `Ctrl + N` reinicia.
- Backend: `codex app-server` oculto sob demanda, `CODEX_HOME` isolado, OAuth ChatGPT; autenticado ⇔ `account/read` retorna conta não nula (`requiresOpenaiAuth: true` não nega login). Modelo padrão `gpt-6-luna`, esforço `low`, catálogo via `model/list`.
- Permissões: perfil `permissions: ":read-only"` (não combinar com `sandbox`), `approvalPolicy: "on-request"`, `shell_tool` habilitado, hooks desligados. Cada pedido é aprovado por ação; aprovação automática só por ativação explícita e dura até fechar/reiniciar a conversa. Transcrição limpa ao fechar.
- Popup não fecha ao perder foco com login pendente, resposta ativa ou permissão pendente.
- Sites: URL/domínio/alias/cache abrem direto via `open_targets`; nome desconhecido é resolvido num thread separado e guardado em cache (≤256, `localStorage`). Mensagem composta abre o site e envia só a continuação. Resposta concluída com exatamente um link HTTP(S) abre esse link.

## Codex (sessões locais)

- Ativado pelo usuário em Configurações; altera `hooks.json` só após prévia, confirmação, checagem de fingerprint e backup datado. Remove apenas handlers do Ghosty (reconhece o nome antigo).
- Fila local guarda eventos, nomes de ferramenta e tipo de subagente; nunca prompt, resposta ou resultados. Bolinhas animam durante tarefa; `Stop` faz o Ghosty saltar (aviso só com menu fechado).
- Só `PermissionRequest` é síncrono: espera até 570 s por escolha explícita no Ghosty; sem heartbeat/timeout, não decide e o Codex segue o fluxo normal. **Nunca aprovar automaticamente.** O hitbox inclui só os botões de aprovação visíveis.

## Design system (CSS)

- `src/style.css` define tokens em `:root`: escala tipográfica `--fs-xs` (11 px, piso para qualquer texto) até `--fs-2xl`; neutros `--n-950…--n-500`; texto `--text-1/2/3` (≥4,5:1); linhas `--line-1…4`; estados `--ok/--warn/--danger`; acentos `--codex*`, `--mint`, `--accent-now/media/codex/github/vercel`; `--focus`.
- Use tokens em vez de hex novos. Ícones: SVG de `src/ui/icons.ts` (`menuIcon`), não glifos Unicode (exceção: glifos de clima).
- Foco: regra global `:focus-visible` com `--focus`; não usar `outline: none`. Alvos clicáveis ≥32 px.
- O bloco "UI fundamentals" no fim do CSS consolida pílulas, chips, glance e badges; o restante do arquivo ainda tem regras em camadas — ao mexer num componente, prefira limpar a camada antiga.

## Estrutura do código

- `src/main.ts`: estado global, renderização por template string e bindings (ainda monolítico; extrair por área ao tocar nele).
- `src/types.ts`: formatos de dados compartilhados. `src/lib/format.ts`: formatação pura e `escapeHtml`. `src/ui/icons.ts`: ícones.
- `src/pet-motion.ts`, `src/launch-greeting.ts`, `src/anim.ts`, `src/sounds.ts` (Web Audio, opcional).
- `src-tauri/src/lib.rs`: volume/mídia/mixer, `open_targets` (`ShellExecuteW`), prancheta Win32, layout, popups. `island_host.rs`: poll do cursor/click-through, janela encolhida, `fit_webview_zoom` (corrige zoom quando o devicePixelRatio do WebView2 difere da escala; roda antes do primeiro render de cada janela) e memória baixa do WebView2 para popup/Configurações ocultos (`hide_auxiliary_window`; esconda essas janelas por `hideAuxiliaryWindow()` no frontend). Outros módulos: `credentials.rs`, `github.rs`, `vercel.rs`, `google_workspace.rs`, `weather.rs`, `tray.rs`, `codex_chat.rs`, `quick_chat_hotkey.rs`, `codex_hooks.rs` + `codex-hook.ps1`.
- `src-tauri/capabilities/default.json`: precisa de `core:event:default` e `core:window:default` para `main`, `utility-popup` e configurações.
- `src-tauri/src/main.rs`: `windows_subsystem = "windows"` em release (sem console).

## Release e atualizações

- Versão alinhada em `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `Cargo.lock` e `tauri.conf.json`; o workflow `.github/workflows/release-windows.yml` falha se divergir da tag `vX.Y.Z`. Versão atual dos manifests: 1.0.11 (release das otimizações de 2026-11-12).
- NSIS por usuário, sem admin, com VC++ runtime e bootstrapper do WebView2; desinstalação preserva dados.
- Updater Tauri assinado (`latest.json` em `gusata/Ghosty`), verifica ao iniciar e a cada 6 h; instalação explícita em Configurações › Atualizações. Chave privada só no segredo `TAURI_SIGNING_PRIVATE_KEY`, nunca no repositório.

## Ambiente

Windows 11 x64, WebView2 154, VS 2022 Build Tools, Rust stable MSVC, Node 24 / npm 11, Tauri 2.12. Compile Rust no Developer PowerShell do VS.

```powershell
npm run build                 # frontend
cargo check --manifest-path .\src-tauri\Cargo.toml
npm run tauri dev
```

## Pendências de validação conhecidas

Inspeção manual no runtime Windows ainda é necessária para: borda esquerda em todas as telas, chat (login, streaming, permissões, rolagem), Google OAuth com conta real, fallback de timeout das aprovações do Codex e a revisão de UI de 2026-11-06 (tipografia maior, pílulas fixas, Agora com dados reais, atraso de hover).
