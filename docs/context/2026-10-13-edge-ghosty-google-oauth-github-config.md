# Contexto: cadastro do OAuth Google no GitHub Actions

- **Objetivo:** explicar quais valores OAuth Google o publicador deve cadastrar no GitHub para builds do Edge Ghosty.
- **Alterações realizadas:** nenhuma alteração no código; identificados os nomes de Actions variable/secret consumidos pelo workflow atual.
- **Arquivos tocados:** este snapshot.
- **Validações:** conferidos `.github/workflows/release-windows.yml`, `src-tauri/build.rs` e a documentação oficial do GitHub Actions sobre variáveis e secrets.
- **Problemas conhecidos:** um novo instalador precisa ser compilado depois de cadastrar/alterar os valores. O segredo opcional deve vir de credencial OAuth **Desktop app**, não de credencial Web.
- **Próximos passos:** cadastrar `EDGE_GHOSTY_GOOGLE_CLIENT_ID` como repository variable e `EDGE_GHOSTY_GOOGLE_CLIENT_SECRET` como repository secret, e gerar novo build/release.
