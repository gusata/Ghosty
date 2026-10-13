# Snapshot — Painéis Google do Edge Ghosty

## Objetivo

Implementar os painéis pedidos para o Ghosty, priorizando Gmail, Google Agenda e Google Tarefas, com notificações, clima, animações e reações do mascote.

## Alterações realizadas

- O popup **Painéis** agora reúne Agora, E-mail, Agenda, Tarefas, Notificações e Clima; a Home ganhou o acesso direto.
- Gmail consulta até seis mensagens não lidas e somente os cabeçalhos de remetente/assunto. O usuário pode abrir, marcar como lida ou arquivar, com confirmação antes de arquivar.
- Agenda mostra até doze compromissos dos próximos 14 dias, incluindo local e links de reunião quando fornecidos pelo Google.
- Tarefas lista até 30 pendências, permite adicionar tarefa à primeira lista do Google Tarefas e concluir itens. A interface atualiza na hora.
- OAuth Desktop usa PKCE, navegador externo e callback loopback em `127.0.0.1`. O token fica no Gerenciador de Credenciais do Windows; o Client ID público fica nas preferências locais.
- Gmail usa `gmail.modify`, Agenda usa `calendar.readonly` e Tarefas usa `tasks`. O Ghosty não baixa nem envia o corpo de e-mails.
- Notificações locais resumem mensagens novas, compromissos próximos, tarefas com prazo e mudanças de clima. O limite é 50 registros. Erros e reações temporárias do Ghosty são propagados entre janelas por eventos Tauri, sem gravar esses detalhes temporários em `localStorage`.
- O clima usa busca manual de cidade e Open-Meteo; não lê localização automática.
- Configurações ganhou a aba **Painéis**, com instruções de Client ID e ativação das APIs.
- Atualizada a documentação de privacidade e a memória operacional em `AGENTS.md` (item 85).

## Arquivos tocados

- `src/main.ts`
- `src/style.css`
- `src-tauri/src/lib.rs`
- `src-tauri/src/google_workspace.rs` (novo)
- `src-tauri/src/weather.rs` (novo)
- `docs/PRIVACIDADE.md`
- `AGENTS.md`
- `docs/context/2026-10-13-edge-ghosty-paineis-google.md` (este snapshot)

Arquivos preexistentes e não relacionados, como `debug.log` e os dois snapshots Hitodama de hoje, foram preservados.

## Validações

- `npx tsc --noEmit` — passou.
- `cargo check --manifest-path .\src-tauri\Cargo.toml` — passou; permaneceu somente um aviso anterior de variável não mutável em `src-tauri/src/codex_hooks.rs`.
- `npm run build` — passou; TypeScript e Vite geraram o bundle de produção.
- `git diff --check` — passou; Git apenas avisou sobre a normalização de LF para CRLF no Windows.
- Não foi iniciada uma conta Google real durante esta tarefa porque o Client ID OAuth do usuário não estava disponível.

## Problemas conhecidos e dependências externas

- Para ativar uma conta, é necessário informar o Client ID de um app OAuth do tipo **App para computador**, ativar Gmail API, Google Calendar API e Google Tasks API e consentir as permissões. Se o app estiver em teste, a conta precisa constar como usuário de teste. O Google pode mostrar a tela de app não verificado; distribuição pública com escopos sensíveis/restritos pode exigir análise e verificação do OAuth.
- Gmail mostra apenas mensagens não lidas da caixa de entrada. Criar e enviar mensagens não faz parte do painel. `gmail.modify` é necessário para marcar e arquivar e também concede capacidade que o Ghosty não usa.
- Desconectar remove o token local; revogar a concessão no provedor é feito na página de permissões da Conta Google.
- Open-Meteo só retorna previsão depois que o usuário escolher uma cidade. O uso de rede depende da disponibilidade de Google e Open-Meteo.

## Próximos passos

1. Abrir Configurações → Painéis, informar um Client ID de computador e conectar a conta Google.
2. Escolher uma cidade no painel Clima.
3. Ajustar quantidade de itens, filtros de e-mail ou listas de tarefas conforme o uso real.
