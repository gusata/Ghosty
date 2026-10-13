# Contexto: corrigir o version check da release 1.0.10

- **Objetivo:** corrigir o erro do workflow em que a tag `v1.0.10` não correspondia à versão dos manifests.
- **Alterações realizadas:** alinhados a `1.0.10` os metadados de versão de package.json, package-lock.json (raiz e package), Cargo.toml, Cargo.lock e tauri.conf.json.
- **Arquivos tocados:** `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, `AGENTS.md`.
- **Validações:** valores dos seis campos conferidos por leitura; compilação, workflow e script de release não executados.
- **Problemas conhecidos:** `v1.0.10` já existe e aponta para o commit `76dfca17ca924fa4d43e68286af7ccf4eb84ac15` na `feat/email`, antes deste bump. `origin/main` ainda aponta para a publicação `v1.0.9`.
- **Próximos passos:** commitar e enviar o bump na `feat/email`, integrar a branch em `main` e então mover/enviar a tag `v1.0.10` para o commit já integrado para refazer a execução do workflow.
