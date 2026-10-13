# Snapshot — Client OAuth Google do Edge Ghosty

## Objetivo

Permitir que usuários finais conectem Gmail, Agenda e Tarefas sem criar um Client ID no Google Cloud.

## Alterações realizadas

- Removido da Configuração o campo de Client ID e os links para criar cliente/ativar APIs no Google Cloud. A tela mantém apenas conectar, desconectar, atualizar e revogar a autorização da conta.
- O comando Tauri `google_auth_begin` passou a usar `EDGE_GHOSTY_GOOGLE_CLIENT_ID` compilado no app. O frontend recebe apenas o estado `configured`; builds sem a configuração deixam a conexão indisponível.
- `src-tauri/build.rs` valida e injeta a variável no binário; um build de release falha se ela estiver ausente ou inválida.
- O workflow de release Windows lê a variável de Actions `EDGE_GHOSTY_GOOGLE_CLIENT_ID`.
- Atualizados `docs/PRIVACIDADE.md` e o novo guia `docs/GOOGLE_OAUTH_SETUP.md`. A memória geral registra a decisão no item 87 do `AGENTS.md`.
- Client IDs antigos guardados em `localStorage` são removidos. Tokens Google existentes no Gerenciador de Credenciais continuam associados ao Client ID usado quando a conta foi conectada.

## Arquivos tocados nesta tarefa

- `.github/workflows/release-windows.yml`
- `AGENTS.md`
- `docs/GOOGLE_OAUTH_SETUP.md` (novo)
- `docs/PRIVACIDADE.md`
- `src-tauri/build.rs`
- `src-tauri/src/google_workspace.rs`
- `src/main.ts`
- `src/style.css`
- `docs/context/2026-10-13-edge-ghosty-google-oauth-client-do-app.md` (este snapshot)

## Validações

- Busca estática confirmou que a interface não oferece mais campo de Client ID nem links para o Google Cloud; o único Client ID do app vem do ambiente de build.
- Confirmado que o workflow injeta a variável uma vez e que o backend expõe `configured` para controlar a conexão.
- Nenhum build ou teste foi executado.

## Problemas conhecidos e dependências externas

- O Client ID OAuth do projeto publicador ainda precisa ser fornecido em `EDGE_GHOSTY_GOOGLE_CLIENT_ID`. Sem ele, builds de desenvolvimento mostram a conexão indisponível e builds de release falham deliberadamente.
- O publicador precisa manter o projeto Google Cloud, APIs, tela de consentimento e verificação aplicável. A verificação de `gmail.modify` pode ser exigida para distribuição pública.
- Os usuários finais ainda escolhem a conta Google e aprovam os escopos no navegador; esse consentimento é necessário para os dados das APIs.

## Próximos passos

1. Registrar ou localizar o cliente OAuth do tipo **App para computador** do Edge Ghosty.
2. Definir a variável de Actions `EDGE_GHOSTY_GOOGLE_CLIENT_ID` no repositório e a variável de ambiente correspondente ao fazer builds locais.
3. Completar a verificação do Google antes de publicar o uso público dos escopos que a exigirem.
