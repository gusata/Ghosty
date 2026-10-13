# Contexto: suporte ao Client Secret OAuth Google

- **Objetivo:** diagnosticar a mensagem `client_secret is missing` após o consentimento Google e permitir que a configuração OAuth do Edge Ghosty envie o valor opcional da credencial Desktop.
- **Alterações realizadas:** adicionada a variável opcional `EDGE_GHOSTY_GOOGLE_CLIENT_SECRET` no build; o OAuth inclui o campo na troca do código de autorização e na renovação de tokens quando configurado; o workflow Windows recebe esse valor como GitHub Actions Secret; atualizadas as instruções de configuração e a memória do projeto.
- **Arquivos tocados:** `src-tauri/build.rs`, `src-tauri/src/google_workspace.rs`, `.github/workflows/release-windows.yml`, `docs/GOOGLE_OAUTH_SETUP.md`, `AGENTS.md`.
- **Validações:** inspeção do fluxo e dos diffs; testes e compilação não executados.
- **Problemas conhecidos:** Client Secret não deve ser confundido com o segredo de um cliente Web; credenciais desktop são públicas por natureza e não podem manter segredo no binário distribuído. Confirmar no Google Cloud que o OAuth client é do tipo **Desktop app**.
- **Próximos passos:** configurar `EDGE_GHOSTY_GOOGLE_CLIENT_SECRET` com o valor `client_secret` do cliente Desktop, reiniciar/recompilar o app e repetir a conexão Google.
