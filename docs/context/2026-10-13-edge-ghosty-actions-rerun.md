# Contexto: repetir a execução do workflow Windows

- **Objetivo:** orientar a repetição do workflow de release após configurar a variável OAuth do repositório.
- **Alterações realizadas:** nenhuma no código; a execução pode ser repetida pela interface Actions.
- **Arquivos tocados:** este snapshot.
- **Validações:** procedimento conferido na documentação oficial do GitHub Actions para reexecutar jobs com falha.
- **Problemas conhecidos:** a reexecução usa o mesmo commit e a mesma referência/tag da execução original; exige permissão de escrita no repositório.
- **Próximos passos:** abrir Actions, selecionar o run falho da release Windows e usar `Re-run jobs` → `Re-run failed jobs`.
