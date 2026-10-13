# Pesquisa pública: hitodama.in

## Objetivo

Levantar o que está publicamente disponível sobre `https://hitodama.in/`, incluindo produto, preço, privacidade, licenciamento e sinais externos de reputação.

## Alterações realizadas

- Pesquisadas a página principal, as políticas de privacidade e reembolso e fontes públicas externas.
- Registrado que o produto é apresentado como assistente de voz para Windows 10/11, com ditado, perguntas sobre a tela, pesquisa, rotinas e ações no computador.
- Registrados o preço anunciado de US$ 9 / ₹499, a edição Founders de compra única e a futura edição por assinatura, além dos requisitos de microfone, internet e chave própria da Gemini API.
- Resumido o fluxo de dados divulgado: conteúdo de voz, conversas, memórias, capturas de tela e contexto de apps/tarefas podem ir ao Google; localização aproximada é consultada para o clima; recursos opcionais usam Tavily e M-Lab. O fornecedor declara que os dados de uso ficam locais e que seu site é contactado para licenciamento.
- Registrados os dados de conta/licença declarados pelo site, a janela de verificação online e os termos de reembolso.
- Cruzadas as declarações sobre Gemini com os termos e a documentação oficiais do Google. Encontrada pouca cobertura independente e sinais automatizados de reputação contraditórios, sem base suficiente para concluir que o domínio seja malicioso ou seguro.

## Arquivos tocados

- `docs/context/2026-10-13-hitodama-site-publico.md` — este snapshot.

## Validações

- Consultas web executadas em 13/10/2026; páginas primárias e documentos oficiais do Google usados para confirmar declarações de privacidade e cobrança.
- A leitura direta do domínio retornou 403 na ferramenta de navegação; o conteúdo da página principal e das políticas foi consultado por resultados indexados.
- Nenhum instalador foi baixado ou executado, e o binário não foi auditado.

## Problemas conhecidos

- O conteúdo do site foi obtido de páginas indexadas e pode não refletir alterações recentes.
- As alegações de segurança, armazenamento local e ausência de telemetria são declarações do fornecedor; não foram verificadas no código ou no executável.
- Os verificadores externos encontrados têm dados escassos e resultados conflitantes.

## Próximos passos

- Se solicitado, auditar o instalador fornecido pelo usuário: assinatura Authenticode, hash, metadados e análise estática/dinâmica em ambiente isolado.
- Se solicitado, verificar a entidade comercial e procurar cobertura independente mais ampla.
