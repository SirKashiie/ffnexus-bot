# Discord Report Bot — n8n + Apify + MCP (versão sem nativos)

**Pronto para rodar** (sem dependência nativa/Visual Studio). Armazena mensagens em `data/messages.jsonl`.

## Passos rápidos (Windows)
1. Instale Node 20 LTS (recomendado) ou use NVM (`nvm use 20.17.0`).
2. `npm i`
3. `cp .env.example .env` e preencha.
4. `npm run register`
5. (em outro terminal) `npm run mcp`
6. `npm run dev`

## O que faz
- Lê 2 servidores (ou canais específicos) e espelha msgs relevantes no 3º servidor.
- Filtro de ruído (bom dia, kkk, emojis) + filtro de palavras-chave (MCP).
- `/report` com janela (15m, 1h, 6h, 24h), **prévia** + **Confirmar**.
- Resumo via n8n, histórico no Apify, senha opcional para relatório completo.

## Pastas
- `src/` — código-fonte
- `scripts/` — automações para Windows
- `data/` — armazenamento (keywords.json e messages.jsonl)
