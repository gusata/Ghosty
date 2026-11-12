# Coucou no Windows: como funciona, como é feito e como é otimizado

Data: 2026-11-12. Fonte: clone de `https://github.com/Louis-CFM/coucou` no commit `7da7b45` (2026-11-12), app Windows/Linux versão **0.5.9** (`windows/`). O clone antigo em `C:\Users\gustavo.sanches\Documents\coucou` (`0aae11b`, 2026-10-02) está defasado em ~6 semanas e não deve mais ser usado como referência.

Tudo aqui foi lido no código-fonte, não medido em runtime. Valores numéricos (ms, px, Hz) são os constantes do código.

---

## 1. Visão geral do projeto

| Parte | Tecnologia | Papel |
|---|---|---|
| `NotchBuddy/` | Swift 6 + SwiftUI, macOS 15+ | App original. O Mochi vive no notch do MacBook (`NSPanel` borderless + `.nonactivatingPanel`). |
| `windows/` | **Tauri 2 + Rust + TypeScript sem framework** (Vite 6, alvo `chrome110`) | Port para Windows 10/11 e Linux. Mesmo código para os dois; o que difere fica em `src-tauri/src/platform/{windows,linux}.rs`. |
| `windows/hook/` | Rust, binário separado `coucou-hook.exe` | Relay que os agentes (Claude Code, Codex, Gemini CLI…) executam em cada hook. |
| `android/`, iOS no Mac | Kotlin / Swift | Companion do telefone. |

O port Windows **não reinventa** o comportamento: ele é declaradamente uma tradução 1:1 do Swift. Exemplos:
- `src/island/fsm.ts`: "port of IslandStateMachine.swift".
- `src/core/anim.ts`: `Spring` reproduz `.spring(response:dampingFraction:)` do SwiftUI (ω₀ = 2π/response, ζ = damping), integrado com sub-passos de 1/240 s.
- `src/mochi/engine.ts` (1 376 linhas): "direct port of BotEngine.swift to Canvas 2D. Same constants, same tweens, same easings, same particles."
- `src/core/layout.ts`: "ported from IslandTypes.swift"; valores em px lógicos idênticos aos pontos do Mac.
- Traduções: o Windows lê o `Localizable.xcstrings` do Mac convertido para `strings.json` + `extra.json` só para o que existe fora do Mac.
- Os 29 sons são os WAV do app Mac, copiados no build por um plugin do Vite (`SOUNDS_DIR` único).

Escala do port hoje: ~107 mil linhas em `windows/` (incluindo i18n), `src/style.css` com 3 774 linhas, `island.ts` com 1 584, `lib.rs` com 1 194. Muitas funcionalidades novas (Flow/ditado com Parakeet via sherpa-onnx, Notetaker com WASAPI loopback, Outlook via COM, WhatsApp via GOWA, link com Android via TLS/mDNS).

---

## 2. A janela da ilha (o coração do port)

### 2.1 Configuração estática (`tauri.conf.json`)

```json
"label": "island", "width": 240, "height": 6,
"resizable": false, "decorations": false, "transparent": true, "shadow": false,
"alwaysOnTop": true, "skipTaskbar": true, "focus": false, "visible": true,
"dragDropEnabled": false,
"additionalBrowserArgs": "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required"
```

Pontos não óbvios:
- **Nasce com 240×6** (a "wake strip" invisível), não no tamanho do painel.
- **`focus: false` + `visible: true`**: a janela nunca é "re-mostrada". O código explica que o `tao` reexibe janelas ocultas com `SW_SHOW`, o que **rouba o foco** do que o usuário estiver digitando. Por isso a ilha (e o Mochi no desktop) **nunca são ocultadas — só movidas/redimensionadas** (o Mochi do desktop é "estacionado" fora da tela).
- **`dragDropEnabled: false`** de propósito (ver 2.6).
- `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`: corta UIs "fora do processo" do Edge e a checagem SmartScreen do WebView2 — menos processos/trabalho para um overlay que só carrega conteúdo local. `--autoplay-policy=no-user-gesture-required` deixa os sons tocarem sem gesto.
- CSP restrita: `default-src 'self'; script-src 'self'`; `withGlobalTauri: false`.

### 2.2 Dois tamanhos de janela, não um

`island.rs`:
- **Painel cheio**: 720×320 lógicos (o maior layout de vista, igual ao `NSPanel` do Mac). A ilha é desenhada dentro dele, colada no topo e centralizada.
- **Recolhida**: a janela **encolhe para o tamanho da ilha fechada** (o que ela mostra: Mochi, hora, uso do plano, música) ou para a faixa de 240×6 se a ilha fechada não mostra nada.

Fluxo (`island.ts › updateWindowCollapsed`): ao entrar em `hidden`, espera **420 ms** (a animação de fechamento é de 340 ms) e chama `set_collapsed(true, w, h)`. Ao sair de `hidden`, chama `set_collapsed(false)` **antes** de animar a abertura (a janela cresce primeiro, depois a forma anima dentro dela).

`apply_geometry` (Rust): converte lógico→físico com o `scale_factor` do monitor, centraliza no monitor, **desce pelo `work_area` se houver barra de tarefas no topo** (`top_inset_from`, limitado a 0–200 px; barra auto-oculta não move nada), chama `set_size` duas vezes (antes e depois de posicionar, porque trocar de monitor pode reescalar) e, se `inner_size()` não bater com o pedido, loga e tenta de novo.

### 2.3 Click-through: polling nativo com "portão" (PollGate)

É o mesmo princípio do Edge Ghosty (`GetCursorPos` + `set_ignore_cursor_events`), mas com várias camadas de economia:

1. **Thread única estacionada num `Condvar`** (`PollGate`). Recolhida, a thread não roda o loop de 60 Hz: acorda a cada **250 ms** só para checar se o cursor está sobre a janela recolhida (`wake_if_hovered`); se estiver, desliga o click-through e emite `closed-hover`. Comentário: *"a hidden island costs literally nothing"*.
2. **Aberta**: tick de **16 ms**; se o cursor está a mais de **420 px** da janela (`NEAR_ZONE`), cai para **50 ms** e a página recebe **um único** evento "saiu", depois silêncio até voltar. *"A cursor working in another app costs neither messages nor island frames."*
3. **Ignora movimento < 1 px** (não emite nada).
4. **O retângulo da forma é empurrado pelo frontend** (`set_island_rect`) e a decisão de click-through acontece **no mesmo tick da leitura do cursor**, em Rust. Comentário: *"an IPC round trip here loses clicks"*. O frontend só reenvia o rect se mudou > 0,5 px.
5. **`ignoring: AtomicBool` espelha o estado da janela**: só chama o SO quando a decisão muda.
6. **Margem de 14 px** (`HIT_MARGIN`) — *"wider than the macOS 6 pt because a click must never be swallowed"*.
7. **Corrida evitada**: a mudança de flag é feita sob o lock do portão e só se ele ainda estiver aberto, para que um tick atrasado não torne a ilha fechada click-through depois de `set_collapsed` (aí nada mais a acordaria).
8. **Monitores** são reverificados a cada 30 ticks (~0,5 s) aproveitando o loop; mudança emite `screen-changed` → o frontend corrige zoom e reposiciona.

### 2.4 Estilos Win32 da janela

`platform/windows.rs`:
- `make_non_activating`: `WS_EX_NOACTIVATE` (clique não rouba foco) + `WS_EX_TOOLWINDOW` e remove `WS_EX_APPWINDOW` (`overlay_bits`) → fora da barra de tarefas **e** do Alt+Tab, inclusive substitutos de taskbar.
- `set_activating(true/false)`: remove `WS_EX_NOACTIVATE` **só enquanto** um campo de texto precisa do teclado (chat) e o recoloca depois.
- `set_click_through`: chama `set_ignore_cursor_events` e, como o `tao` **reconstrói o estilo estendido e apaga os bits de overlay** ao fazer isso, reaplica `overlay_bits` logo depois via `run_on_main_thread`. (O Ghosty resolve o sintoma parecido reaplicando `set_skip_taskbar(true)` após `show()` e `set_always_on_top` a cada troca.)

### 2.5 DPI e zoom do WebView2

Problema real (issue #346): o `devicePixelRatio` do WebView2 pode divergir do `scale_factor` da janela (escala de texto do Windows, monitores com DPI diferente), e o painel 720×320 fica cortado.

Solução (`calculate_zoom_correction` + comando `fit_zoom`): se a diferença for > 2 %, aplica `webview.set_zoom(zoom * scale/dpr)` (limitado a 0,25–4). O `main.ts` faz isso **antes de criar a ilha** e espera até 500 ms o DPR atualizar, porque os canvases dimensionam o bitmap pelo DPR uma única vez. Depois observa `matchMedia('(resolution: Xdppx)')` (re-registrando a cada mudança) e `screen-changed`.

Canvases usam `dpr = min(2, devicePixelRatio)` e só realocam o bitmap quando tamanho ou DPR mudam.

### 2.6 Arrastar arquivos (a parte mais "Windows" do port)

Dois problemas e duas soluções:
- `WS_EX_TRANSPARENT` (que é o click-through) **esconde a janela de `WindowFromPoint`**, então o OLE não acha alvo de drop. Solução: enquanto o **botão esquerdo está pressionado** (`GetAsyncKeyState(VK_LBUTTON)`) com o cursor sobre a janela, o painel inteiro aceita o mouse.
- O drop target do `wry` fica nas janelas filhas, mas as janelas mais internas pertencem ao `msedgewebview2.exe`; arrastos do **Explorer clássico** (Downloads, Documentos) nunca chegavam ("no drop"). Solução (`webview_drop.rs`): `dragDropEnabled: false`, a página aceita o drag HTML5 e devolve os `File` via `chrome.webview.postMessageWithAdditionalObjects`; o Rust escuta `WebMessageReceived` (`ICoreWebView2WebMessageReceivedEventArgs2::AdditionalObjects` → `ICoreWebView2File::Path`) e recupera o caminho real.
- Na janela de configurações (que usa o drop do wry) acontece o inverso: o WebView2 registra seu próprio alvo em `Chrome_RenderWidgetHostHWND` e recusa tudo; o Coucou faz `RevokeDragDrop` nela a cada vez que um botão é pressionado (barato e idempotente).

---

## 3. Frontend: máquina de estados, animação e laço de quadros

### 3.1 FSM (`island/fsm.ts`)

Estados: `hidden` → `petit` (compacto, "espia") → `home` (aberto) e `coucou` (saudação).
- Hover em `hidden` só leva a `petit`: *"a PC has no notch, so the pointer lands on it far more often than on a Mac's"*. Abrir exige clique, ou "Open on hover" (desligado por padrão) com **500 ms** de repouso (`hoverOpenDelay`).
- `petit → hidden` após **60 s**; `home → petit` após o auto-close (**15 s** padrão), com barra de contagem regressiva; fechar após hover tem graça de **0,6 s**.
- `pinned`: um pedido de permissão ou pergunta **nunca fecha** por saída do mouse.
- Saudação: volta a `petit` 0,6 s após terminar, ou 10 s se o mouse estiver em cima.

### 3.2 Animação

- Abrir/crescer: mola (`response 0,5`, `damping 0,72`), sub-passos de 1/240 s para não instabilizar com quadro perdido.
- Fechar/encolher: curva `cubic-bezier(.45,0,.2,1)` em **340 ms**, sem overshoot (`Tracked.curveTowards`).
- `applyGeometry` escreve `width`, `height` e `border-radius: 0 0 r r` inline a cada quadro (cantos 14 px recolhida, 22 px expandida). `will-change: width, height, transform` no corpo.
- Transição entre telas: saída ~160 ms, entrada 300 ms (escala 0,97→1) — já documentado em `coucou-menus-2026-10-08.md`.

### 3.3 O laço de quadros para sozinho

`Island.frame` roda **um único `requestAnimationFrame`** para tudo (geometria, Mochi, saudação, upload, mini-bots, vistas) e **se desliga** quando nada se move (`this.running = false`; `ensureRunning()` religa sob demanda). Regras:
- Fechada: só continua enquanto a geometria está assentando ou o Mochi da ilha fechada está se movendo / "acordado".
- Aberta: continua enquanto mola/curva animam, o Mochi não assentou, há saudação, `engine.busy`, upload ou uma vista pede `tick`.
- Há um comentário de bug corrigido: antes, `engine.busy` (sempre verdadeiro para estados com animação em loop: respirar, z's do sono…) mantinha a ilha **oculta** queimando quadros. Agora, oculta, só a geometria conta.
- Vida na ilha fechada: um `setTimeout` a cada **2,5–6 s** faz o Mochi piscar ou olhar, liga o laço por **700 ms** e dorme de novo.
- `dt` limitado a 50 ms.

### 3.4 Mochi

Canvas 2D desenhado por `engine.ts` (port do `BotEngine.swift`), com estados, emotes, partículas, dança a 112 BPM com Spotify, morph para "caixa" ao receber arquivo. Guarda-roupa com 1 158 linhas de roupas em código. Ícones do app também são gerados em código (`scripts/gen-icons.mjs`).

---

## 4. Otimizações específicas de Windows (resumo)

| Técnica | Onde | Efeito |
|---|---|---|
| Janela encolhe para a ilha fechada / faixa 240×6 | `island.rs`, `island.ts` | Área mínima sobre a tela; nada para compor/hit-testar. |
| Poll estacionado em `Condvar`, 4 Hz quando recolhida, 60 Hz aberta, 20 Hz com cursor longe | `island.rs` | CPU ~zero com a ilha fechada. |
| Evento "cursor" só perto da ilha (420 px) e só se moveu ≥ 1 px | `island.rs` | Sem IPC nem quadros enquanto o usuário trabalha em outro app. |
| Click-through decidido em Rust no mesmo tick | `island.rs` | Sem cliques perdidos por latência de IPC. |
| Só chama o SO quando o flag muda | `PollGate.ignoring` | Evita `SetWindowLongPtr` a 60 Hz. |
| rAF único que se desliga | `island.ts` | GPU/CPU zero em repouso. |
| `SetMemoryUsageTargetLevel(LOW)` nas janelas ocultas | `webview_memory.rs` (PR #1022) | WebView2 devolve memória enquanto a janela não está visível; NORMAL ao mostrar. |
| Janelas secundárias criadas **antes** da ilha e depois só mostradas/ocultadas | `create_settings_window` | Contorno de bug: WebView2 criado depois vinha em branco (e falha 0x80070578, #775 — recria no main thread). |
| Janela do hub só anima canvases quando visível (evento `hub-visible`) | `lib.rs`, `hub/hero.ts` | Corrige loop de animação mantendo um núcleo ocupado com a janela fechada (#792). |
| Nunca `show()`/`hide()` na ilha e no Mochi do desktop; mover para fora da tela | `desktop.rs` | Não rouba foco. |
| Mochi do desktop dormindo após 2 min: sem poll de cursor, poucos fps; quadrado transparente de 120 px pega o 1º movimento para acordá-lo | README | |
| Spotify/mídia por eventos do `GlobalSystemMediaTransportControlsSessionManager` (`SessionsChanged`, `MediaPropertiesChanged`, `PlaybackInfoChanged`); volume via `IAudioSessionManager2`/`ISimpleAudioVolume` | `spotify.rs` | Nada de polling; uma thread espera eventos só enquanto a pílula está ativa. |
| GitHub: 5 min, 1 min com CI rodando, imediato ao abrir com dado > 1 min; nada com pílula desligada ou pausa | README | |
| Outlook via COM só se `OUTLOOK.EXE` estiver rodando (checa a tabela de processos antes) | `platform/windows.rs` | Outlook fechado não custa nada. |
| `CREATE_NO_WINDOW` em todo processo auxiliar | `no_console` | Sem console piscando. |
| `windows_subsystem = "windows"` em release | `main.rs` | Sem console. |
| Hook relay com orçamento de 300 ms para conectar | `hook/src/main.rs` | Agente nunca é bloqueado. |

---

## 5. Integração com agentes (hooks)

- `coucou-hook.exe` é copiado para `%LOCALAPPDATA%\Coucou\bin\` na inicialização e comunica por **named pipe** `\\.\pipe\coucou-<SID>`.
- Segurança: SID no nome (o namespace de pipes é global da máquina), `first_pipe_instance(true)` no servidor (recusa servir em cima de um pipe de outro), e o relay verifica que o processo servidor pertence ao mesmo usuário antes de enviar qualquer coisa. Payload máximo 1 MiB; campos grandes (`tool_response`, `tool_output`, `transcript_path`) descartados; strings truncadas em 2 000 caracteres (exceto diffs, até 256 KB/512 KB).
- **Nunca bloquear o agente**: 300 ms para conectar; eventos sem resposta têm orçamento total de 2 s; só `PermissionRequest` espera. O servidor só começa a espera longa depois que a ilha **confirma que o cartão está na tela** (`ACK_TIMEOUT` 800 ms); senão desiste em segundos. Decisão: servidor 108 s < relay 110 s. Sem clique → nenhuma decisão, o agente pergunta no terminal. O relay também vigia o processo pai a cada 100 ms e sai se ele morrer.
- O servidor escreve só `allow`/`deny` ou `{"answers":…}`; traduzir para o JSON de cada agente é responsabilidade única do relay (`reply.rs`, `normalize.rs` mapeiam `BeforeTool`, `preToolUse` etc.).
- Instalação em `settings.json`/`hooks.json`: mostra diff exato, faz backup datado, só escreve após clique, remove apenas suas entradas. Comandos de hook escritos para o shell de cada agente (Git Bash para Claude Code, PowerShell para Gemini/Copilot, `cmd /C` para Codex).
- "Open terminal": sobe a árvore de processos a partir do PID do cliente do pipe (`GetNamedPipeClientProcessId` + ToolHelp) até achar o terminal/editor e traz a janela para frente (`AttachThreadInput`/`SetForegroundWindow`).

O Edge Ghosty segue a mesma filosofia (só `PermissionRequest` síncrono, nunca aprovar sozinho, backup datado), mas usa um script PowerShell em vez de um executável dedicado.

---

## 6. Atalhos globais e o problema do AltGr

No Windows, `Ctrl+Alt` **é** `AltGr`. Um atalho global `Ctrl+Alt+E` engoliria o `€` em teclados europeus. O Coucou:
- escolheu padrões testados contra o AltGr de FR, DE, ES, IT, PT e **ABNT2** (por isso setas em vez de `[ ]`, `S` em vez de `M`);
- em runtime, para cada layout instalado (`GetKeyboardLayoutList`), usa `ToUnicodeEx` para perguntar se a combinação digita um caractere; se digitar, **não registra** e mostra "Types 'ą'" nas configurações;
- usa `RegisterHotKey` (plugin `global-shortcut`), detecta combinações já em uso por outro app ("In use") e solta os próprios atalhos enquanto grava um novo.

Relevante para o Ghosty: `Ctrl+Shift+Espaço` não sofre com AltGr, mas qualquer atalho futuro com `Ctrl+Alt` deve passar por essa checagem (o usuário está em ABNT2).

---

## 7. Distribuição

- NSIS por usuário (sem admin) + MSI por máquina; idiomas EN/FR; hooks NSIS próprios.
- **Sem assinatura de código**: README ensina a passar pelo SmartScreen; houve falso positivo do Defender (`Wacatac.H!ml`) revisado pela Microsoft.
- Atualização própria (não usa o updater do Tauri): pede consentimento ~30 s após o 1º launch; consulta a API de releases a cada 6 h; baixa o instalador seguindo redirecionamentos só para domínios do GitHub e **verifica o SHA-256 que o GitHub publica** (`digest` do asset) antes de rodar `setup.exe /P /UPDATE /R` ou `msiexec … /passive`.
- Chaves no Windows Credential Manager (crate `keyring`); a interface só pode perguntar se a chave existe.
- Log em `%LOCALAPPDATA%\Coucou\coucou.log`; sem telemetria.

---

## 8. Comparação direta com o Edge Ghosty e o que vale trazer

Lido em `src-tauri/src/lib.rs` (`spawn_cursor_poll`) e `src/pet-motion.ts` do Ghosty.

| Aspecto | Coucou | Edge Ghosty hoje | Sugestão |
|---|---|---|---|
| Poll do cursor | Estacionado (Condvar) quando recolhida; 4 Hz/60 Hz/20 Hz | `sleep(16)` **para sempre**, itera todas as janelas, chama `is_visible()`/`outer_position()` a cada tick | **Maior ganho fácil**: portão + 4 Hz quando recolhida + 50 ms com cursor longe. |
| Emissão de eventos de cursor | Só perto (420 px) e com movimento ≥ 1 px | Emite ao mover ≥ 1 px em qualquer lugar da tela, e reemite a cada 100 ms se `inside` | Adotar a zona de proximidade. |
| `set_always_on_top` | Só no `apply_geometry` | Chamado a cada troca de click-through | Pode sair do caminho quente. |
| Tamanho da janela | Encolhe para a ilha fechada | Dimensões estáveis (decisão deliberada do Ghosty para animação suave) | Opcional: encolher só depois de 420 ms em `hidden`, como o Coucou. Ganha área clicável e composição, mas toca na geometria — avaliar com cuidado na borda esquerda. |
| Laço de animação do pet | Para quando nada se move; Mochi fechado acorda 700 ms a cada 2,5–6 s | `renderFrame` pede novo quadro sempre que visível (`!document.hidden && onScreen`) | Parar o rAF em repouso e acordar por timer — economia contínua de GPU/CPU. |
| Memória do WebView2 | `SetMemoryUsageTargetLevel(LOW)` em janelas ocultas | Não usa | Aplicar ao `utility-popup` e às Configurações quando ocultos (precisa `webview2-com` com `ICoreWebView2_19`). |
| Desajuste DPR × escala | `fit_zoom` antes de criar a UI | Não tratado | Útil com "Tamanho do texto" do Windows > 100 %. |
| Drop do Explorer clássico | `postMessageWithAdditionalObjects` | Drag-and-drop nativo do Tauri | Testar arrasto a partir de Downloads/Documentos; se falhar, portar `webview_drop.rs`. |
| Foco ao mostrar janelas | Nunca `show()` a ilha; move para fora da tela | `show()` + reaplica `skip_taskbar` | Considerar se aparecer roubo de foco. |
| Estilos Win32 | `WS_EX_NOACTIVATE` + `WS_EX_TOOLWINDOW` reaplicados após cada `set_ignore_cursor_events` | `SWP_NOACTIVATE` + `skip_taskbar` | Garante fora do Alt+Tab também. |
| Barra de tarefas no topo | Desce pelo `work_area` | — | Relevante para borda topo. |
| Browser args | Desliga `msWebOOUI`, `msPdfOOUI`, `msSmartScreenProtection` | — | Copiar (trivial). |
| Mídia | Eventos GSMTC, zero polling | — | Conferir se a pílula Mídia faz polling. |
| Atalhos | Checagem AltGr por layout | Um atalho sem Alt | Só se forem adicionados atalhos `Ctrl+Alt`. |

Ordem sugerida, do maior ganho por esforço: (1) portão no poll do cursor + zona de proximidade; (2) rAF do Ghosty que dorme; (3) `browser args` e `SetMemoryUsageTargetLevel`; (4) `fit_zoom`; (5) encolher a janela recolhida.

## Licença

Código MIT; `LICENSE-ASSETS.md` reserva nome, Mochi, ícones, sons e imagens. Portar técnicas e código de infraestrutura (poll, zoom, drop, memória) é compatível com MIT desde que registrado em `THIRD_PARTY_NOTICES.md`; não copiar sons, desenhos ou o nome.

## Arquivos de referência (commit `7da7b45`)

- `windows/src-tauri/tauri.conf.json`, `Cargo.toml`
- `windows/src-tauri/src/island.rs` — geometria, PollGate, click-through, zoom
- `windows/src-tauri/src/platform/windows.rs` — estilos Win32, cursor, SID, AltGr
- `windows/src-tauri/src/lib.rs` — `set_collapsed`, `set_island_rect`, `fit_zoom`, criação de janelas
- `windows/src-tauri/src/webview_drop.rs`, `webview_memory.rs`, `pipe.rs`, `desktop.rs`, `spotify.rs`, `shortcuts.rs`
- `windows/hook/src/main.rs`, `win.rs`
- `windows/src/island/fsm.ts`, `island/island.ts`, `core/anim.ts`, `core/layout.ts`, `mochi/engine.ts`, `main.ts`
- `windows/README.md` (seção "What's different from the Mac version"), `CHANGELOG.md`
