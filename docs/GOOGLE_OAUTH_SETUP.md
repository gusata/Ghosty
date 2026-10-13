# Configurar o OAuth Google do Edge Ghosty

Os usuários do Edge Ghosty conectam a conta pelo botão **Conectar Google**. Eles não precisam criar um projeto ou Client ID no Google Cloud. O publicador registra um cliente OAuth de aplicativo para computador uma vez; o app abre o consentimento Google no navegador e usa PKCE com retorno por loopback.

## Configuração do publicador

1. Use um projeto Google Cloud pertencente ao publicador do Edge Ghosty.
2. Configure a tela de consentimento e ative Gmail API, Google Calendar API e Google Tasks API.
3. Registre um cliente OAuth do tipo **App para computador**.
4. Revise as permissões solicitadas em `src-tauri/src/google_workspace.rs`. O Ghosty atualmente pede `gmail.modify`, `calendar.readonly` e `tasks`, além de `openid email profile`.
5. Conclua a verificação do Google necessária para publicar o app com esses escopos. `gmail.modify` é classificado pelo Google como escopo restrito.
6. Configure o Client ID como `EDGE_GHOSTY_GOOGLE_CLIENT_ID`. Se o token endpoint responder `client_secret is missing`, confirme primeiro que a credencial é do tipo **App para computador** e configure também o valor `client_secret` dela como `EDGE_GHOSTY_GOOGLE_CLIENT_SECRET`. No JSON baixado do cliente Desktop, o valor fica em `installed.client_secret`; não use credenciais cujo JSON tenha a chave raiz `web`. O fluxo nativo do Google trata o segredo como opcional; ele não deve ser um segredo de cliente Web.
7. No GitHub, crie a variável de Actions `EDGE_GHOSTY_GOOGLE_CLIENT_ID` e, somente se necessário, o secret `EDGE_GHOSTY_GOOGLE_CLIENT_SECRET`. O workflow Windows de release injeta ambos no build. Client ID e Client Secret ficam incorporados no app nativo; não coloque tokens de usuário nessas configurações.

Para build local no PowerShell, defina o mesmo valor antes de compilar:

```powershell
$env:EDGE_GHOSTY_GOOGLE_CLIENT_ID = "000000000000-example.apps.googleusercontent.com"
# Opcional: use o client_secret da credencial Desktop se o endpoint exigir.
# $env:EDGE_GHOSTY_GOOGLE_CLIENT_SECRET = "client-secret-do-cliente-desktop"
npm run build:windows
```

O build de release falha com uma mensagem clara se a variável estiver ausente ou inválida. Builds de desenvolvimento sem ela continuam iniciando, mas mostram a conexão Google como indisponível.

## O que o usuário autoriza

O usuário escolhe uma conta Google e aprova os escopos na tela oficial do Google. O ID do cliente não dá ao Ghosty acesso aos dados por si só; cada conta precisa conceder as permissões. As credenciais e tokens permanecem no Gerenciador de Credenciais do Windows, conforme descrito em `docs/PRIVACIDADE.md`.

Referências oficiais:

- [OAuth 2.0 para acessar APIs do Google](https://developers.google.com/identity/protocols/oauth2)
- [Escopos da Gmail API](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Verificação de escopos restritos](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
