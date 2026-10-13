# Painéis do Ghosty dentro da barra

## Objetivo

Levar Gmail, Agenda, Tarefas, avisos e clima para abas da própria ilha do Edge Ghosty, conforme a correção do usuário: os painéis devem ficar na barra, sem abrir uma janela separada.

## Alterações realizadas

- Adicionada a aba superior Painéis ao lado de Início e Pet.
- Os submenus Hoje, E-mail, Agenda, Tarefas, Avisos e Clima renderizam dentro do conteúdo da ilha.
- A geometria da ilha passa a reservar até 960×380 logical px nas bordas horizontais e 420×620 na orientação vertical, respeitando o tamanho do host.
- Os atalhos “Painéis” da Home e das Configurações levam à aba da barra. O caminho entre Configurações e a ilha usa sincronização por `localStorage` entre janelas.
- Atualizações do Google, do clima e das notificações redesenham o painel quando a aba Painéis está aberta.
- Uma janela utilitária antiga que tenha o modo Painéis persistido transfere a navegação para a aba da ilha e se oculta.
- Preservados os popups separados já existentes para Foco, Bolso, personalização, prancheta e chat.

## Arquivos tocados nesta tarefa

- `src/main.ts`
- `src/style.css`
- `AGENTS.md`
- `docs/context/2026-10-13-edge-ghosty-paineis-na-barra.md`

## Validações

- `npx tsc --noEmit`: passou.
- `git diff --check`: passou; Git reportou somente avisos de conversão LF/CRLF nos arquivos já modificados.
- `npm run build`: falhou dentro do sandbox ao iniciar o esbuild com `spawn EPERM`. Foi solicitada autorização para repetir o build fora do sandbox; resultado pendente.
- Não foi possível validar uma conta Google real sem Client ID de OAuth configurado pelo usuário no Google Cloud.

## Problemas conhecidos

- A compilação final ainda precisa ser concluída após a autorização de execução fora do sandbox.
- A validação da integração real depende do Client ID, das APIs Google habilitadas e do consentimento da conta.

## Próximos passos

- Concluir `npm run build` quando a autorização pendente for respondida.
- Depois do build, testar a navegação visual na ilha e, com OAuth configurado, conferir as ações reais dos painéis.
