# Contexto: OAuth Google em produção para usuários

- **Objetivo:** esclarecer se usuários finais precisarão configurar Client ID ou Client Secret para conectar Google no Edge Ghosty em produção.
- **Conclusão:** não. O publicador configura o cliente OAuth no build/release; cada usuário escolhe uma conta e concede os escopos pelo navegador. Durante desenvolvimento, o projeto em Testing limita o acesso aos test users. Para distribuição externa pública, o projeto deve sair de Testing e concluir as verificações Google necessárias para os escopos usados.
- **Arquivos tocados:** este snapshot.
- **Validações:** requisitos conferidos na documentação oficial Google para status de apps OAuth, escopos Gmail e verificação de escopos restritos.
- **Problemas conhecidos:** `gmail.modify` é restrito. Apps publicados sem verificação podem exibir alertas e ficar sujeitos ao limite de usuários; administradores Google Workspace ainda podem bloquear o app.
- **Próximos passos:** preparar o projeto OAuth de produção, publicar a tela de consentimento como External/In production e enviar o pedido de verificação do escopo Gmail antes da distribuição ampla.
