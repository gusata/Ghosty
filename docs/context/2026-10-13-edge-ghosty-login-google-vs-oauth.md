# Snapshot — Login Google e OAuth dos Painéis

## Objetivo

Esclarecer se os Painéis Google do Edge Ghosty podem usar apenas um login Google no lugar da autorização OAuth das APIs.

## Alterações realizadas

- Nenhum fluxo ou código do produto foi alterado.
- Confirmado que os Painéis já abrem o login Google no navegador usando OAuth 2.0 com PKCE e callback loopback.
- O escopo `openid email profile` identifica a conta; os escopos de Gmail, Agenda e Tarefas autorizam o acesso às respectivas APIs. Um login apenas de identidade não fornece esses acessos.
- Simplificar a configuração para usuários pode envolver incluir o Client ID OAuth de desktop do aplicativo, mantendo o consentimento OAuth e a configuração/verificação exigida pelo Google.

## Arquivos tocados

- `docs/context/2026-10-13-edge-ghosty-login-google-vs-oauth.md` (este snapshot)

## Validações

- Inspecionados o snapshot dos Painéis Google e `src-tauri/src/google_workspace.rs`.
- Consultada a documentação oficial do Google sobre OAuth para APIs e classificação de escopos Gmail.
- Nenhum teste foi executado; não houve alteração de implementação.

## Problemas conhecidos

- O fluxo atual pede que o usuário configure um Client ID OAuth de desktop.
- `gmail.modify` é um escopo restrito segundo a documentação do Gmail; publicação do aplicativo pode exigir verificação adicional do Google.

## Próximos passos

- Se a meta for remover a configuração manual do Client ID, registrar e configurar o cliente OAuth de desktop do Edge Ghosty e planejar a verificação dos escopos.
- Manter o consentimento explícito para as permissões das APIs; login de identidade sozinho não permite carregar os dados dos painéis.
