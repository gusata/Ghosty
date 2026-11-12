# Contexto: teste do endpoint Google UserInfo no navegador

- Objetivo: interpretar o teste de conectividade feito no computador de quem instalou o Edge Ghosty 1.0.10.
- Evidência: abrir `https://openidconnect.googleapis.com/v1/userinfo` no navegador retornou `invalid_request` / `Invalid Credentials`.
- Diagnóstico: o navegador alcançou o endpoint e recebeu uma resposta HTTP do Google. Sem o cabeçalho `Authorization: Bearer <access_token>`, a resposta de credencial inválida é esperada. Isso não confirma que a conexão do processo Edge Ghosty alcança o endpoint; o app ainda pode ser afetado por regra de firewall, proxy/VPN, ou diferença de rede.
- Alterações no produto: nenhuma.
- Validações: interpretação da resposta exibida e leitura prévia da chamada `.send()` em `src-tauri/src/google_workspace.rs`; nenhum teste/compilação executado.
- Próximos passos: testar o login do app via hotspot e conferir permissão de saída do Edge Ghosty no Firewall do Windows. Se falhar também em redes distintas, obter o detalhe interno do erro de transporte no app.
