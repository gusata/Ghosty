# Contexto: falha de conexão ao confirmar perfil Google

- Objetivo: diagnosticar o erro visto após a pessoa escolher a conta Google na versão 1.0.10.
- Alterações no produto: nenhuma. A inspeção encontrou o fluxo de troca do código por tokens e, em seguida, uma chamada HTTP para `https://openidconnect.googleapis.com/v1/userinfo`; a mensagem exibida vem de uma falha ao enviar essa chamada.
- Arquivos do produto inspecionados: `src-tauri/src/google_workspace.rs` e `src-tauri/Cargo.toml`.
- Validações: leitura do fluxo e das dependências; nenhuma compilação ou teste executado.
- Problema conhecido: o texto apresentado não contém a causa de transporte (por exemplo DNS, proxy, firewall ou TLS), e não há acesso ao computador/rede da pessoa para distingui-las.
- Próximos passos: abrir `https://openidconnect.googleapis.com/v1/userinfo` no navegador do computador afetado. Uma resposta JSON de erro/401 sem autenticação confirma que o host foi alcançado. Se nem abrir, verificar conectividade, VPN/proxy e permitir o Edge Ghosty no Firewall do Windows; testar outra rede, como hotspot, ajuda a isolar bloqueio de rede. Se abrir no navegador mas continuar falhando no app, recolher diagnóstico detalhado do erro no cliente Rust.
