// src/mcp.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let client = null;
let connecting = false;
const KEYWORDS_PATH = 'keywords.json';
const MCP_TIMEOUT_MS = 4000; // tempo limite p/ conectar (4s)

// ===== Lazy init com timeout seguro =====
async function ensureClient() {
  if (client) return client;
  if (connecting) {
    // aguarda se já estiver inicializando
    await new Promise(r => setTimeout(r, 500));
    return client;
  }

  connecting = true;
  try {
    console.log('🔌 Iniciando MCP Filesystem...');
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
    });
    const c = new Client({
      name: 'discord-report-bot',
      version: '1.2.0',
      capabilities: { roots: { listChanged: true } },
    });

    const connectPromise = c.connect(transport);
    const timeoutPromise = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('MCP timeout')), MCP_TIMEOUT_MS)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    client = c;
    console.log('✅ MCP Filesystem conectado.');
    return client;
  } catch (err) {
    console.warn('⚠️  MCP falhou, fallback local ativado:', err.message);
    client = null;
    return null;
  } finally {
    connecting = false;
  }
}

// ===== Leitura e escrita segura =====
export async function getKeywordsFromMCP() {
  const c = await ensureClient();
  if (!c) {
    console.warn('MCP indisponível — retornando []');
    return [];
  }
  try {
    const res = await c.callTool('read_text_file', { path: KEYWORDS_PATH });
    const text = res?.content?.[0]?.text || '[]';
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.warn('MCP: falha ao ler keywords, criando arquivo vazio.', err.message);
    await setKeywordsToMCP([]);
    return [];
  }
}

export async function setKeywordsToMCP(arr) {
  const c = await ensureClient();
  if (!c) {
    console.warn('MCP indisponível — não salvando keywords.');
    return false;
  }
  try {
    const text = JSON.stringify(arr, null, 2);
    await c.callTool('write_file', { path: KEYWORDS_PATH, content: text });
    console.log('💾 Keywords salvas via MCP.');
    return true;
  } catch (err) {
    console.warn('MCP: falha ao salvar keywords.', err.message);
    return false;
  }
}
