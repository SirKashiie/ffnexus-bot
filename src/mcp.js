// src/mcp.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let client = null;
let connecting = false;
const KEYWORDS_PATH = 'keywords.json';
const INCIDENT_KEYWORDS_PATH = 'incident_keywords.json';
const MCP_TIMEOUT_MS = 4000;

async function ensureClient() {
  if (client) return client;
  if (connecting) {
    await new Promise(r => setTimeout(r, 500));
    return client;
  }
  connecting = true;
  try {
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
    return client;
  } catch {
    client = null;
    return null;
  } finally {
    connecting = false;
  }
}

export async function getKeywordsFromMCP() {
  const c = await ensureClient();
  if (!c) return [];
  try {
    const res = await c.callTool('read_text_file', { path: KEYWORDS_PATH });
    const text = res?.content?.[0]?.text || '[]';
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch {
    await setKeywordsToMCP([]);
    return [];
  }
}

export async function setKeywordsToMCP(arr) {
  const c = await ensureClient();
  if (!c) return false;
  try {
    const text = JSON.stringify(arr || [], null, 2);
    await c.callTool('write_file', { path: KEYWORDS_PATH, content: text });
    return true;
  } catch {
    return false;
  }
}

export async function getIncidentKeywordsFromMCP() {
  const c = await ensureClient();
  if (!c) return [];
  try {
    const res = await c.callTool('read_text_file', { path: INCIDENT_KEYWORDS_PATH });
    const text = res?.content?.[0]?.text || '[]';
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch {
    await setIncidentKeywordsToMCP([]);
    return [];
  }
}

export async function setIncidentKeywordsToMCP(arr) {
  const c = await ensureClient();
  if (!c) return false;
  try {
    const text = JSON.stringify(arr || [], null, 2);
    await c.callTool('write_file', { path: INCIDENT_KEYWORDS_PATH, content: text });
    return true;
  } catch {
    return false;
  }
}
