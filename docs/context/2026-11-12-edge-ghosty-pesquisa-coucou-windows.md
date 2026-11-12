# 2026-11-12 — Pesquisa: arquitetura e otimizações do Coucou no Windows

## Objetivo
Pesquisa profunda de como o Coucou funciona, como é construído e como é otimizado para Windows, para orientar o Edge Ghosty.

## Alterações
- Novo relatório: `docs/design/coucou-arquitetura-windows-2026-11-12.md`.
- Nenhum código do app alterado.

## Fonte
Clone novo de `Louis-CFM/coucou` no commit `7da7b45` (2026-11-12, app Windows 0.5.9), feito no scratchpad da sessão. O clone local `C:\Users\gustavo.sanches\Documents\coucou` (`0aae11b`) está desatualizado.

## Validações
Apenas leitura de código; nada foi executado nem medido em runtime.

## Problemas conhecidos / próximos passos
Candidatos de otimização identificados no Ghosty (detalhes na seção 8 do relatório):
1. Poll do cursor em `src-tauri/src/lib.rs` roda a 16 ms para sempre; portar o `PollGate` (Condvar, 4 Hz recolhida, 50 ms com cursor longe, zona de 420 px).
2. `src/pet-motion.ts` pede quadro continuamente enquanto visível; fazer o rAF dormir em repouso.
3. `additionalBrowserArgs` e `SetMemoryUsageTargetLevel(LOW)` para janelas ocultas.
4. Correção de zoom DPR × escala (`fit_zoom`).
5. Testar drop a partir do Explorer clássico.
